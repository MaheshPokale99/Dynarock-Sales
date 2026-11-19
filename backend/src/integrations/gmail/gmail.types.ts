// Shapes of the Gmail REST API we use (users.messages / users.history).
export interface GmailHeader {
    name: string;
    value: string;
}

export interface GmailPart {
    partId?: string;
    mimeType: string;
    filename?: string;
    headers?: GmailHeader[];
    body?: { size?: number; data?: string; attachmentId?: string };
    parts?: GmailPart[];
}

export interface GmailMessage {
    id: string;
    threadId: string;
    labelIds?: string[];
    snippet?: string;
    historyId?: string;
    internalDate?: string;
    payload?: GmailPart;
}

export interface GmailHistoryPage {
    history?: { id: string; messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[] }[];
    nextPageToken?: string;
    historyId: string;
}

export interface GmailListPage {
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
}

export interface OAuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    scopes: string[];
}

export interface GmailOAuth {
    authUrl(state: string, loginHint: string): string;
    exchangeCode(code: string): Promise<OAuthTokens>;
    refresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>;
    revoke(token: string): Promise<void>;
}

export interface GmailApi {
    getProfile(): Promise<{ emailAddress: string; historyId: string }>;
    send(raw: string, threadId?: string): Promise<{ id: string; threadId: string }>;
    getMessage(id: string): Promise<GmailMessage>;
    listHistory(startHistoryId: string, pageToken?: string): Promise<GmailHistoryPage>;
    listMessages(query: string, pageToken?: string): Promise<GmailListPage>;
    getAttachment(messageId: string, attachmentId: string): Promise<Buffer>;
    modifyLabels(id: string, add: string[], remove: string[]): Promise<void>;
}

export type GmailApiFactory = (accessToken: () => Promise<string>) => GmailApi;

export class GmailError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly reason = "",
    ) {
        super(message);
        this.name = "GmailError";
    }
}

// The refresh token was revoked or expired: an admin must reconnect.
export const isInvalidGrant = (e: unknown) => e instanceof GmailError && e.reason === "invalid_grant";

// history.list answers 404 when startHistoryId is too old.
export const isHistoryExpired = (e: unknown) => e instanceof GmailError && e.status === 404;
