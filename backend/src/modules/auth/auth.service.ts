import {
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
} from "../../common/errors/app-error.js";
import { MS_PER_DAY } from "../../common/constants.js";
import { addDays } from "../../common/utils/time.js";
import { hashToken, newSecretToken } from "../../common/utils/tokens.js";
import type { AppConfig } from "../../config/env.js";
import type { ActivitiesRepository } from "../activities/activities.repository.js";
import { withoutSecret, type UsersRepository } from "../users/users.repository.js";
import type { User } from "../users/users.types.js";
import type { InvitesRepository } from "./invites.repository.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password.js";
import type { SessionsRepository } from "./sessions.repository.js";

export interface ClientMeta {
    ip: string;
    userAgent: string;
}

export interface IssuedSession {
    user: User;
    token: string;
    expiresAt: Date;
}

export interface Authenticated {
    user: User;
    tokenHash: string;
    // Set when the cookie must be re-issued
    renewedUntil: Date | null;
}

interface Deps {
    users: UsersRepository;
    sessions: SessionsRepository;
    invites: InvitesRepository;
    activities: ActivitiesRepository;
    config: AppConfig["auth"];
    now?: () => Date;
}

const INVALID_LOGIN = "Email or password is incorrect";
const MAX_LOGIN_FAILURES = 10;
const LOCK_MS = 15 * 60_000;
const INVALID_INVITE = "This invitation link is invalid or has expired. Ask an admin to send a new one.";

export class AuthService {
    private readonly now: () => Date;

    constructor(private readonly deps: Deps) {
        this.now = deps.now ?? (() => new Date());
    }

    async login(email: string, password: string, meta: ClientMeta): Promise<IssuedSession> {
        const user = await this.deps.users.findByEmail(email);
        const now = this.now();
        if (user?.lockedUntil && user.lockedUntil > now) {
            const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
            throw new AppError(
                `Too many failed sign-ins. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
                429,
                "ACCOUNT_LOCKED",
            );
        }
        const valid = user?.passwordHash
            ? await verifyPassword(user.passwordHash, password)
            : await burnPasswordCheck(password);
        if (user && !valid) {
            await this.deps.users.recordFailedLogin(user.id, MAX_LOGIN_FAILURES, new Date(now.getTime() + LOCK_MS));
        }
        if (!user || !valid) throw new UnauthorizedError(INVALID_LOGIN);
        if (user.status === "disabled")
            throw new ForbiddenError("This account is disabled. Ask an admin to enable it.");

        const at = this.now();
        await this.deps.users.recordLogin(user.id, at);
        await this.deps.activities.record({ actor: { type: "user", userId: user.id }, action: "auth.login" });
        return this.issueSession({ ...withoutSecret(user), lastLoginAt: at }, meta);
    }

    // Cookie -> user; extends the session after half its lifetime.
    async authenticate(token: string): Promise<Authenticated | null> {
        const now = this.now();
        const tokenHash = hashToken(token);
        const session = await this.deps.sessions.findActive(tokenHash, now);
        if (!session) return null;

        const user = await this.deps.users.findById(session.userId.toHexString());
        if (!user || user.status !== "active") {
            await this.deps.sessions.deleteByHash(tokenHash);
            return null;
        }

        const ttlMs = this.deps.config.sessionTtlDays * MS_PER_DAY;
        let renewedUntil: Date | null = null;
        if (session.expiresAt.getTime() - now.getTime() < ttlMs / 2) {
            renewedUntil = new Date(now.getTime() + ttlMs);
            await this.deps.sessions.extend(session._id, renewedUntil);
        }
        return { user: withoutSecret(user), tokenHash, renewedUntil };
    }

    logout(tokenHash: string): Promise<void> {
        return this.deps.sessions.deleteByHash(tokenHash);
    }

    async inviteDetails(token: string): Promise<{ name: string; email: string; expiresAt: Date }> {
        const invite = await this.deps.invites.findUsable(hashToken(token), this.now());
        const user = invite ? await this.deps.users.findById(invite.userId.toHexString()) : null;
        if (!invite || !user || user.status !== "invited") throw new NotFoundError(INVALID_INVITE);
        return { name: user.name, email: user.email, expiresAt: invite.expiresAt };
    }

    async acceptInvite(token: string, password: string, meta: ClientMeta): Promise<IssuedSession> {
        const now = this.now();
        const invite = await this.deps.invites.findUsable(hashToken(token), now);
        const user = invite ? await this.deps.users.findById(invite.userId.toHexString()) : null;
        if (!invite || !user || user.status !== "invited") throw new NotFoundError(INVALID_INVITE);
        if (!(await this.deps.invites.claim(invite._id, now)))
            throw new ConflictError("This invitation was already used");

        const activated = await this.deps.users.update(user.id, {
            passwordHash: await hashPassword(password),
            status: "active",
        });
        if (!activated) throw new NotFoundError(INVALID_INVITE);
        await this.deps.users.recordLogin(user.id, now);
        await this.deps.activities.record({
            actor: { type: "user", userId: user.id },
            action: "user.joined",
            entity: { type: "user", id: user.id },
        });
        return this.issueSession({ ...activated, lastLoginAt: now }, meta);
    }

    // Also signs out every other device.
    async changePassword(userId: string, current: string, next: string, keepTokenHash: string): Promise<void> {
        const user = await this.deps.users.findById(userId);
        if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, current))) {
            throw new ValidationError("Current password is incorrect", [
                { path: "currentPassword", message: "Current password is incorrect" },
            ]);
        }
        await this.deps.users.update(userId, { passwordHash: await hashPassword(next) });
        await this.deps.sessions.deleteForUser(userId, keepTokenHash);
        await this.deps.activities.record({
            actor: { type: "user", userId },
            action: "user.password_changed",
            entity: { type: "user", id: userId },
        });
    }

    async updateProfile(userId: string, patch: { name?: string; signatureHtml?: string }): Promise<User> {
        const user = await this.deps.users.update(userId, patch);
        if (!user) throw new NotFoundError("User not found");
        return user;
    }

    private async issueSession(user: User, meta: ClientMeta): Promise<IssuedSession> {
        const token = newSecretToken();
        const expiresAt = addDays(this.now(), this.deps.config.sessionTtlDays);
        await this.deps.sessions.create({ userId: user.id, tokenHash: hashToken(token), expiresAt, ...meta });
        return { user, token, expiresAt };
    }
}
