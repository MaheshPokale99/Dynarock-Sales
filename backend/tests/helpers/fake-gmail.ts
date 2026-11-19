import { simpleParser, type AddressObject } from "mailparser";
import {
    GmailError,
    type GmailApi,
    type GmailApiFactory,
    type GmailHeader,
    type GmailMessage,
    type GmailOAuth,
    type GmailPart,
} from "../../src/integrations/gmail/gmail.types.js";

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const addressText = (a: AddressObject | AddressObject[] | undefined) =>
    a ? (Array.isArray(a) ? a.map((x) => x.text).join(", ") : a.text) : undefined;

interface Delivery {
    from: string;
    to?: string;
    subject: string;
    text?: string;
    html?: string;
    threadId?: string;
    inReplyTo?: string;
    labels?: string[];
    headers?: Record<string, string>;
    attachment?: { filename: string; mimeType: string; content: string };
}

// In-memory Gmail: real MIME parsing of what the app sends, scripted inbound mail.
export class FakeGmail {
    address = "sales@dynarock.in";
    profileEmail = this.address;
    historyId = 1000;
    expireHistory = false;
    failRefresh: "invalid_grant" | null = null;
    messages = new Map<string, GmailMessage>();
    history: { id: string; messageId: string; threadId: string }[] = [];
    attachments = new Map<string, Buffer>();
    sent: { raw: string; threadId?: string; parsed: Awaited<ReturnType<typeof simpleParser>> }[] = [];
    labelChanges: { id: string; remove: string[] }[] = [];
    revoked: string[] = [];
    private seq = 0;

    private nextId = (prefix: string) => `${prefix}${(++this.seq).toString(16).padStart(6, "0")}`;

    private store(message: Omit<GmailMessage, "id" | "historyId">, id = this.nextId("m")): GmailMessage {
        this.historyId += 1;
        const full = { ...message, id, historyId: String(this.historyId) };
        this.messages.set(id, full);
        this.history.push({ id: String(this.historyId), messageId: id, threadId: full.threadId });
        return full;
    }

    private attachmentPart(filename: string, mimeType: string, content: Buffer): GmailPart {
        const attachmentId = this.nextId("a");
        this.attachments.set(attachmentId, content);
        return { mimeType, filename, headers: [], body: { size: content.length, attachmentId } };
    }

    deliver(d: Delivery): GmailMessage {
        const headers: GmailHeader[] = [
            { name: "From", value: d.from },
            { name: "To", value: d.to ?? this.address },
            { name: "Subject", value: d.subject },
            { name: "Message-ID", value: `<${this.nextId("rfc")}@client.example>` },
            ...(d.inReplyTo
                ? [
                      { name: "In-Reply-To", value: d.inReplyTo },
                      { name: "References", value: d.inReplyTo },
                  ]
                : []),
            ...Object.entries(d.headers ?? {}).map(([name, value]) => ({ name, value })),
        ];
        const parts: GmailPart[] = [
            {
                mimeType: "text/plain",
                headers: [{ name: "Content-Type", value: 'text/plain; charset="UTF-8"' }],
                body: { data: b64(d.text ?? "") },
            },
        ];
        if (d.html) parts.push({ mimeType: "text/html", body: { data: b64(d.html) } });
        if (d.attachment)
            parts.push(
                this.attachmentPart(d.attachment.filename, d.attachment.mimeType, Buffer.from(d.attachment.content)),
            );
        return this.store({
            threadId: d.threadId ?? this.nextId("t"),
            labelIds: d.labels ?? ["INBOX", "UNREAD"],
            snippet: (d.text ?? "").slice(0, 100),
            internalDate: String(Date.now() + this.seq),
            payload: { mimeType: "multipart/mixed", headers, parts },
        });
    }

    readonly oauth: GmailOAuth = {
        authUrl: (state, hint) => `https://accounts.example/auth?state=${encodeURIComponent(state)}&hint=${hint}`,
        exchangeCode: (code) => {
            if (code === "bad") return Promise.reject(new GmailError("bad code", 400, "invalid_grant"));
            return Promise.resolve({
                accessToken: "access-1",
                refreshToken: "refresh-1",
                expiresAt: new Date(Date.now() + 3_600_000),
                scopes: ["gmail.modify"],
            });
        },
        refresh: () =>
            this.failRefresh
                ? Promise.reject(new GmailError("Token has been expired or revoked.", 400, this.failRefresh))
                : Promise.resolve({ accessToken: "access-2", expiresAt: new Date(Date.now() + 3_600_000) }),
        revoke: (token) => {
            this.revoked.push(token);
            return Promise.resolve();
        },
    };

    readonly factory: GmailApiFactory = (token) => {
        const api: GmailApi = {
            getProfile: async () => {
                await token();
                return { emailAddress: this.profileEmail, historyId: String(this.historyId) };
            },
            send: async (raw, threadId) => {
                await token();
                const parsed = await simpleParser(Buffer.from(raw, "base64url"));
                this.sent.push({ raw, threadId, parsed });
                const headers: GmailHeader[] = [
                    ["From", addressText(parsed.from)],
                    ["To", addressText(parsed.to)],
                    ["Cc", addressText(parsed.cc)],
                    ["Bcc", addressText(parsed.bcc)],
                    ["Subject", parsed.subject],
                    ["Message-ID", parsed.messageId],
                    ["In-Reply-To", parsed.inReplyTo],
                    ["References", Array.isArray(parsed.references) ? parsed.references.join(" ") : parsed.references],
                ].flatMap(([name, value]) => (value ? [{ name: name!, value }] : []));
                const parts: GmailPart[] = [
                    { mimeType: "text/plain", body: { data: b64(parsed.text ?? "") } },
                    { mimeType: "text/html", body: { data: b64(parsed.html || "") } },
                    ...parsed.attachments.map((a) =>
                        this.attachmentPart(a.filename ?? "file", a.contentType, a.content),
                    ),
                ];
                const message = this.store({
                    threadId: threadId ?? this.nextId("t"),
                    labelIds: ["SENT"],
                    snippet: (parsed.text ?? "").slice(0, 100),
                    internalDate: String(Date.now() + this.seq),
                    payload: { mimeType: "multipart/mixed", headers, parts },
                });
                return { id: message.id, threadId: message.threadId };
            },
            getMessage: async (id) => {
                await token();
                const m = this.messages.get(id);
                if (!m) throw new GmailError("Not found", 404);
                return m;
            },
            listHistory: async (start) => {
                await token();
                if (this.expireHistory) throw new GmailError("Requested entity was not found.", 404);
                const added = this.history.filter((h) => Number(h.id) > Number(start));
                return {
                    history: added.map((h) => ({
                        id: h.id,
                        messagesAdded: [{ message: { id: h.messageId, threadId: h.threadId } }],
                    })),
                    historyId: String(this.historyId),
                };
            },
            listMessages: async () => {
                await token();
                return { messages: [...this.messages.values()].map((m) => ({ id: m.id, threadId: m.threadId })) };
            },
            getAttachment: async (_id, attachmentId) => {
                await token();
                const content = this.attachments.get(attachmentId);
                if (!content) throw new GmailError("Not found", 404);
                return content;
            },
            modifyLabels: async (id, _add, remove) => {
                await token();
                this.labelChanges.push({ id, remove });
            },
        };
        return api;
    };
}
