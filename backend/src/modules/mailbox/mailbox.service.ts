import { ConflictError, ServiceUnavailableError } from "../../common/errors/app-error.js";
import { decrypt, encrypt, sign, verifySigned } from "../../common/utils/crypto.js";
import type { Logger } from "../../common/logger/logger.js";
import type { AppConfig } from "../../config/env.js";
import {
    isInvalidGrant,
    type GmailApi,
    type GmailApiFactory,
    type GmailOAuth,
} from "../../integrations/gmail/gmail.types.js";
import type { ActivitiesRepository } from "../activities/activities.repository.js";
import type { UsersRepository } from "../users/users.repository.js";
import type { MailboxDoc } from "./mailbox.model.js";
import type { MailboxRepository } from "./mailbox.repository.js";

const STATE_TTL_MS = 10 * 60_000;

export type CallbackReason = "access_denied" | "google_error" | "expired" | "not_admin" | "wrong_account";
const RECONNECT_MESSAGE =
    "Google access for the mailbox was revoked or expired. An admin needs to reconnect it in Settings.";

export interface MailboxStatus {
    configured: boolean;
    address: string;
    status: "not_configured" | "disconnected" | "connected" | "error";
    lastSyncAt: Date | null;
    lastError: string | null;
    connectedAt: Date | null;
    connectedBy: string | null;
}

export interface ConnectedMailbox {
    doc: MailboxDoc;
    api: GmailApi;
}

interface Deps {
    mailboxes: MailboxRepository;
    users: UsersRepository;
    activities: ActivitiesRepository;
    oauth: GmailOAuth;
    createApi: GmailApiFactory;
    config: AppConfig["gmail"] & { appUrl: string };
    logger: Logger;
}

export class MailboxService {
    constructor(private readonly deps: Deps) {}

    private get key(): Buffer {
        const key = this.deps.config.encryptionKey;
        if (!this.deps.config.enabled || !key) {
            throw new ServiceUnavailableError(
                "Gmail isn't set up on the server yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ENCRYPTION_KEY.",
            );
        }
        return key;
    }

    async status(): Promise<MailboxStatus> {
        const { config } = this.deps;
        const doc = config.enabled ? await this.deps.mailboxes.findByEmail(config.mailboxAddress) : null;
        const by = doc?.connectedBy ? await this.deps.users.findById(doc.connectedBy.toHexString()) : null;
        return {
            configured: config.enabled,
            address: config.mailboxAddress,
            status: !config.enabled ? "not_configured" : (doc?.status ?? "disconnected"),
            lastSyncAt: doc?.lastSyncAt ?? null,
            lastError: doc?.lastError ?? null,
            connectedAt: doc?.connectedAt ?? null,
            connectedBy: by?.name ?? null,
        };
    }

    connectUrl(userId: string): string {
        const state = sign({ uid: userId }, this.key, STATE_TTL_MS);
        return this.deps.oauth.authUrl(state, this.deps.config.mailboxAddress);
    }

    // Google redirects here; returns the Settings page URL to send the browser to.
    async handleCallback(query: { code?: string; state?: string; error?: string }): Promise<string> {
        // Only fixed reason codes go back to the app; never text taken from the request.
        const back = (result: "connected" | "error", reason?: CallbackReason) =>
            `${this.deps.config.appUrl}/settings?mailbox=${result}${reason ? `&reason=${reason}` : ""}`;

        if (query.error) return back("error", query.error === "access_denied" ? "access_denied" : "google_error");
        const state = query.state ? verifySigned<{ uid: string }>(query.state, this.key) : null;
        if (!state || !query.code) return back("error", "expired");

        const admin = await this.deps.users.findById(state.uid);
        if (admin?.role !== "admin" || admin.status !== "active") return back("error", "not_admin");

        try {
            const tokens = await this.deps.oauth.exchangeCode(query.code);
            const api = this.deps.createApi(() => Promise.resolve(tokens.accessToken));
            const profile = await api.getProfile();
            const expected = this.deps.config.mailboxAddress;
            if (profile.emailAddress.toLowerCase() !== expected) {
                await this.deps.oauth.revoke(tokens.refreshToken);
                return back("error", "wrong_account");
            }
            const doc = await this.deps.mailboxes.saveConnection({
                email: expected,
                auth: {
                    refreshTokenEnc: encrypt(tokens.refreshToken, this.key),
                    accessTokenEnc: encrypt(tokens.accessToken, this.key),
                    expiresAt: tokens.expiresAt,
                    scopes: tokens.scopes,
                },
                historyId: profile.historyId,
                connectedBy: admin.id,
            });
            await this.deps.activities.record({
                actor: { type: "user", userId: admin.id },
                action: "mailbox.connected",
                entity: { type: "mailbox", id: doc._id.toHexString() },
            });
            return back("connected");
        } catch (error) {
            this.deps.logger.error({ err: error }, "Mailbox connection failed");
            return back("error", "google_error");
        }
    }

    async disconnect(actorId: string): Promise<void> {
        const doc = await this.deps.mailboxes.findByEmail(this.deps.config.mailboxAddress);
        if (!doc) return;
        if (doc.auth) await this.deps.oauth.revoke(decrypt(doc.auth.refreshTokenEnc, this.key));
        await this.deps.mailboxes.update(doc._id, { status: "disconnected", auth: null, lastError: null });
        await this.deps.activities.record({
            actor: { type: "user", userId: actorId },
            action: "mailbox.disconnected",
            entity: { type: "mailbox", id: doc._id.toHexString() },
        });
    }

    // The connected mailbox plus a Gmail client that refreshes its own access token.
    async connected(): Promise<ConnectedMailbox> {
        const key = this.key;
        const doc = await this.deps.mailboxes.findByEmail(this.deps.config.mailboxAddress);
        if (!doc?.auth || doc.status === "disconnected") {
            throw new ConflictError("The mailbox isn't connected yet.", ["An admin can connect it in Settings."]);
        }
        if (doc.status === "error" && doc.lastError === RECONNECT_MESSAGE) throw new ConflictError(RECONNECT_MESSAGE);

        let accessToken = decrypt(doc.auth.accessTokenEnc, key);
        let expiresAt = doc.auth.expiresAt;
        const refreshToken = decrypt(doc.auth.refreshTokenEnc, key);

        const token = async () => {
            if (expiresAt.getTime() > Date.now()) return accessToken;
            try {
                const fresh = await this.deps.oauth.refresh(refreshToken);
                accessToken = fresh.accessToken;
                expiresAt = fresh.expiresAt;
                await this.deps.mailboxes.update(doc._id, {
                    auth: { ...doc.auth!, accessTokenEnc: encrypt(accessToken, key), expiresAt },
                });
                return accessToken;
            } catch (error) {
                if (isInvalidGrant(error)) {
                    await this.deps.mailboxes.update(doc._id, { status: "error", lastError: RECONNECT_MESSAGE });
                    throw new ConflictError(RECONNECT_MESSAGE);
                }
                throw error;
            }
        };
        return { doc, api: this.deps.createApi(token) };
    }

    async recordSync(doc: MailboxDoc, patch: { historyId?: string; error?: string | null }): Promise<void> {
        await this.deps.mailboxes.update(doc._id, {
            ...(patch.historyId ? { historyId: patch.historyId } : {}),
            ...(patch.error === undefined ? { lastSyncAt: new Date() } : {}),
            lastError: patch.error ?? null,
            status: patch.error ? "error" : "connected",
        });
    }
}
