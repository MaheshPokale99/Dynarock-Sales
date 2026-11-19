import { setTimeout as sleep } from "node:timers/promises";
import {
    GmailError,
    type GmailApi,
    type GmailApiFactory,
    type GmailHistoryPage,
    type GmailListPage,
    type GmailMessage,
} from "./gmail.types.js";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_ATTEMPTS = 3;

interface ErrorBody {
    error?: { message?: string; status?: string; errors?: { reason?: string }[] };
}

// Thin fetch client for the Gmail REST API; retries 429 and 5xx with backoff.
export const createGmailApi: GmailApiFactory = (accessToken) => {
    async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
        for (let attempt = 1; ; attempt++) {
            const res = await fetch(`${BASE}${path}`, {
                ...init,
                headers: {
                    authorization: `Bearer ${await accessToken()}`,
                    "content-type": "application/json",
                    ...init.headers,
                },
                signal: AbortSignal.timeout(30_000),
            });
            if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

            const retryable = res.status === 429 || res.status >= 500;
            if (retryable && attempt < MAX_ATTEMPTS) {
                await sleep(500 * 2 ** attempt);
                continue;
            }
            const body = (await res.json().catch(() => ({}))) as ErrorBody;
            throw new GmailError(
                body.error?.message ?? `Gmail API ${res.status}`,
                res.status,
                body.error?.errors?.[0]?.reason ?? body.error?.status ?? "",
            );
        }
    }

    const api: GmailApi = {
        getProfile: () => call("/profile"),
        send: (raw, threadId) =>
            call("/messages/send", { method: "POST", body: JSON.stringify(threadId ? { raw, threadId } : { raw }) }),
        getMessage: (id) => call<GmailMessage>(`/messages/${id}?format=full`),
        listHistory: (startHistoryId, pageToken) => {
            const q = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" });
            if (pageToken) q.set("pageToken", pageToken);
            return call<GmailHistoryPage>(`/history?${q}`);
        },
        listMessages: (query, pageToken) => {
            const q = new URLSearchParams({ q: query, maxResults: "100" });
            if (pageToken) q.set("pageToken", pageToken);
            return call<GmailListPage>(`/messages?${q}`);
        },
        getAttachment: async (messageId, attachmentId) => {
            const r = await call<{ data: string }>(`/messages/${messageId}/attachments/${attachmentId}`);
            return Buffer.from(r.data, "base64url");
        },
        modifyLabels: async (id, add, remove) => {
            await call(`/messages/${id}/modify`, {
                method: "POST",
                body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }),
            });
        },
    };
    return api;
};
