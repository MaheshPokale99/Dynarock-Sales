import { ConflictError, NotFoundError } from "../../common/errors/app-error.js";
import { addDays } from "../../common/utils/time.js";
import { hashToken, newSecretToken } from "../../common/utils/tokens.js";
import type { AppConfig } from "../../config/env.js";
import { isDuplicateKey } from "../../database/database.js";
import type { ActivitiesRepository } from "../activities/activities.repository.js";
import type { InvitesRepository } from "../auth/invites.repository.js";
import { hashPassword } from "../auth/password.js";
import type { SessionsRepository } from "../auth/sessions.repository.js";
import type { UserRole } from "./user.model.js";
import type { UserPatch, UsersRepository } from "./users.repository.js";
import type { Invitation, TeamMember, User } from "./users.types.js";

interface Deps {
    users: UsersRepository;
    invites: InvitesRepository;
    sessions: SessionsRepository;
    activities: ActivitiesRepository;
    config: Pick<AppConfig, "appUrl"> & { auth: Pick<AppConfig["auth"], "inviteTtlDays"> };
    now?: () => Date;
}

export interface InviteInput {
    name: string;
    email: string;
    role: UserRole;
}

export interface UserUpdate {
    name?: string;
    role?: UserRole;
    status?: "active" | "disabled";
}

export class UsersService {
    private readonly now: () => Date;

    constructor(private readonly deps: Deps) {
        this.now = deps.now ?? (() => new Date());
    }

    async list(): Promise<TeamMember[]> {
        const users = await this.deps.users.list();
        const invites = await this.deps.invites.latestOpenByUser(
            users.filter((u) => u.status === "invited").map((u) => u.id),
        );
        const now = this.now().getTime();
        return users.map((user) => {
            const expiresAt = invites.get(user.id);
            return {
                ...user,
                invite:
                    user.status === "invited"
                        ? { expiresAt: expiresAt ?? user.createdAt, expired: !expiresAt || expiresAt.getTime() <= now }
                        : null,
            };
        });
    }

    async invite(actorId: string, input: InviteInput): Promise<Invitation> {
        const existing = await this.deps.users.findByEmail(input.email);
        if (existing) {
            const hint =
                existing.status === "invited"
                    ? "They have already been invited. Use “Resend invite” for a new link."
                    : existing.status === "disabled"
                      ? "Their account is disabled. Enable it instead."
                      : "They are already on the team.";
            throw new ConflictError(`${input.email} already has an account.`, [hint]);
        }

        let user: User;
        try {
            user = await this.deps.users.create({
                ...input,
                status: "invited",
                passwordHash: null,
                invitedBy: actorId,
            });
        } catch (error) {
            if (isDuplicateKey(error)) throw new ConflictError(`${input.email} already has an account.`);
            throw error;
        }
        const invitation = await this.issueInvite(user, actorId);
        await this.deps.activities.record({
            actor: { type: "user", userId: actorId },
            action: "user.invited",
            entity: { type: "user", id: user.id },
            meta: { role: user.role },
        });
        return invitation;
    }

    // New link; the old one stops working.
    async resendInvite(actorId: string, userId: string): Promise<Invitation> {
        const user = await this.deps.users.findById(userId);
        if (!user) throw new NotFoundError("User not found");
        if (user.status !== "invited") throw new ConflictError("This person has already joined.");

        const { passwordHash: _hash, ...plain } = user;
        const invitation = await this.issueInvite(plain, actorId);
        await this.deps.activities.record({
            actor: { type: "user", userId: actorId },
            action: "user.invite_resent",
            entity: { type: "user", id: user.id },
        });
        return invitation;
    }

    async update(actorId: string, userId: string, input: UserUpdate): Promise<User> {
        const target = await this.deps.users.findById(userId);
        if (!target) throw new NotFoundError("User not found");

        const changingRole = input.role !== undefined && input.role !== target.role;
        const disabling = input.status === "disabled" && target.status !== "disabled";
        const enabling = input.status === "active" && target.status === "disabled";

        if (actorId === userId && (changingRole || disabling)) {
            throw new ConflictError("You can't change your own role or disable your own account.", [
                "Ask another admin to do it.",
            ]);
        }
        if (input.status === "active" && target.status === "invited") {
            throw new ConflictError("They haven't accepted their invitation yet.", [
                "Use “Resend invite” to send them a new link.",
            ]);
        }
        const losesAdmin = target.role === "admin" && target.status === "active" && (disabling || changingRole);
        if (losesAdmin && (await this.deps.users.countActiveAdmins(userId)) === 0) {
            throw new ConflictError("The team needs at least one active admin.", ["Make someone else an admin first."]);
        }

        const patch: UserPatch = {};
        if (input.name !== undefined) patch.name = input.name;
        if (changingRole) patch.role = input.role;
        if (disabling) patch.status = "disabled";
        // Someone who never set a password goes back to "invited" and needs a fresh link.
        if (enabling) patch.status = target.passwordHash ? "active" : "invited";

        const updated = await this.deps.users.update(userId, patch);
        if (!updated) throw new NotFoundError("User not found");

        if (disabling) {
            await this.deps.sessions.deleteForUser(userId);
            await this.deps.invites.revokeForUser(userId);
        }
        await this.deps.activities.record({
            actor: { type: "user", userId: actorId },
            action: disabling ? "user.disabled" : enabling ? "user.enabled" : "user.updated",
            entity: { type: "user", id: userId },
            meta: { ...patch, passwordHash: undefined },
        });
        return updated;
    }

    // First admin from env when there are no users.
    async bootstrapAdmin(admin: { name: string; email: string; password: string } | null): Promise<boolean> {
        if (!admin || (await this.deps.users.count()) > 0) return false;
        const user = await this.deps.users.create({
            name: admin.name,
            email: admin.email,
            role: "admin",
            status: "active",
            passwordHash: await hashPassword(admin.password),
            invitedBy: null,
        });
        await this.deps.activities.record({
            actor: { type: "system" },
            action: "user.bootstrapped",
            entity: { type: "user", id: user.id },
        });
        return true;
    }

    private async issueInvite(user: User, actorId: string): Promise<Invitation> {
        await this.deps.invites.revokeForUser(user.id);
        const token = newSecretToken();
        const expiresAt = addDays(this.now(), this.deps.config.auth.inviteTtlDays);
        await this.deps.invites.create({
            userId: user.id,
            email: user.email,
            tokenHash: hashToken(token),
            invitedBy: actorId,
            expiresAt,
        });
        const inviteUrl = `${this.deps.config.appUrl}/accept-invite?token=${encodeURIComponent(token)}`;
        return { user, inviteUrl, expiresAt };
    }
}
