import { API_BASE, ApiError, patch, post, request, toApiError } from "./client";
import type {
    Draft,
    Health,
    Invitation,
    InviteDetails,
    MailboxStatus,
    SendInput,
    StoredFile,
    TeamMember,
    ThreadCounts,
    ThreadDetail,
    ThreadFolder,
    ThreadPage,
    Thread,
    User,
    UserRole,
    Address,
    Contact,
    ContactDetail,
    ContactInput,
    ContactPage,
    ContactStage,
    ContactStatus,
    Organization,
    OrganizationDetail,
    OrganizationInput,
    OrganizationType,
    Pipeline,
    AiDraft,
    KnowledgeEntry,
    KnowledgeInput,
    RewriteAction,
    Suggestion,
    SuggestionStatus,
    Tone,
} from "./types";

type UserResponse = { user: User };

const qs = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    const s = q.toString();
    return s ? `?${s}` : "";
};

async function upload(file: File): Promise<StoredFile> {
    const form = new FormData();
    form.append("file", file);
    let res: Response;
    try {
        res = await fetch(`${API_BASE}/files`, { method: "POST", body: form, credentials: "include" });
    } catch {
        throw new ApiError("Cannot reach the server. Check your connection and try again.", 0, "network_error");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw toApiError(res.status, data);
    return data as StoredFile;
}

export const api = {
    health: () => request<Health>("/health"),

    auth: {
        me: () => request<UserResponse>("/auth/me").then((r) => r.user),
        login: (email: string, password: string) =>
            post<UserResponse>("/auth/login", { email, password }).then((r) => r.user),
        logout: () => post<{ ok: true }>("/auth/logout"),
        updateProfile: (body: { name?: string; signatureHtml?: string }) =>
            patch<UserResponse>("/auth/me", body).then((r) => r.user),
        changePassword: (currentPassword: string, newPassword: string) =>
            post<{ ok: true }>("/auth/change-password", { currentPassword, newPassword }),
        inviteDetails: (token: string) => request<InviteDetails>(`/auth/invites/${encodeURIComponent(token)}`),
        acceptInvite: (token: string, password: string) =>
            post<UserResponse>("/auth/accept-invite", { token, password }).then((r) => r.user),
    },

    users: {
        list: () => request<TeamMember[]>("/users"),
        invite: (body: { name: string; email: string; role: UserRole }) => post<Invitation>("/users/invite", body),
        resendInvite: (id: string) => post<Invitation>(`/users/${id}/resend-invite`),
        update: (id: string, body: { name?: string; role?: UserRole; status?: "active" | "disabled" }) =>
            patch<User>(`/users/${id}`, body),
    },

    mailbox: {
        status: () => request<MailboxStatus>("/mailbox"),
        connectUrl: () => request<{ url: string }>("/mailbox/connect").then((r) => r.url),
        disconnect: () => post<MailboxStatus>("/mailbox/disconnect"),
        sync: () => post<{ added: number }>("/mailbox/sync"),
    },

    threads: {
        list: (p: { folder: ThreadFolder; q?: string; sentBy?: string; before?: string }) =>
            request<ThreadPage>(`/threads${qs(p)}`),
        counts: () => request<ThreadCounts>("/threads/counts"),
        get: (id: string) => request<ThreadDetail>(`/threads/${id}`),
        update: (id: string, body: { unread?: boolean; closed?: boolean }) => patch<Thread>(`/threads/${id}`, body),
    },

    emails: {
        send: (body: SendInput) => post<{ threadId: string; messageId: string }>("/emails/send", body),
        attachmentUrl: (messageId: string, index: number) => `${API_BASE}/messages/${messageId}/attachments/${index}`,
    },

    recipients: (q: string) => request<Address[]>(`/recipients${qs({ q })}`),

    drafts: {
        list: () => request<Draft[]>("/drafts"),
        create: (body: Partial<Omit<Draft, "id" | "updatedAt">>) => post<Draft>("/drafts", body),
        update: (id: string, body: Partial<Omit<Draft, "id" | "updatedAt">>) => patch<Draft>(`/drafts/${id}`, body),
        remove: (id: string) => request<{ ok: true }>(`/drafts/${id}`, { method: "DELETE" }),
    },

    files: { upload },

    contacts: {
        list: (p: {
            q?: string;
            stage?: ContactStage;
            status?: ContactStatus;
            organizationId?: string;
            ownerId?: string;
            page?: number;
        }) => request<ContactPage>(`/contacts${qs({ ...p, page: p.page ? String(p.page) : undefined })}`),
        get: (id: string) => request<ContactDetail>(`/contacts/${id}`),
        create: (body: ContactInput & { email: string }) => post<Contact>("/contacts", body),
        update: (id: string, body: ContactInput) => patch<Contact>(`/contacts/${id}`, body),
    },

    pipeline: (p: { q?: string; ownerId?: string }) => request<Pipeline>(`/pipeline${qs(p)}`),

    ai: {
        status: () => request<{ enabled: boolean }>("/ai/status"),
        compose: (body: { instruction: string; to: string[]; threadId?: string; tone: Tone }) =>
            post<AiDraft & { subject: string }>("/ai/compose", body),
        rewrite: (body: { html: string; action: RewriteAction; instruction?: string }) =>
            post<AiDraft>("/ai/rewrite", body),
        suggestReply: (threadId: string) => post<Suggestion>(`/threads/${threadId}/ai/suggest-reply`),
        suggestions: (p: { status?: SuggestionStatus; threadId?: string } = {}) =>
            request<Suggestion[]>(`/ai/suggestions${qs(p)}`),
        counts: () => request<{ pending: number }>("/ai/suggestions/counts"),
        send: (id: string, body: { to: string[]; cc: string[]; bcc: string[]; subject: string; html: string }) =>
            post<{ threadId: string; messageId: string }>(`/ai/suggestions/${id}/send`, body),
        reject: (id: string, reason: string) => post<{ ok: true }>(`/ai/suggestions/${id}/reject`, { reason }),
    },

    knowledge: {
        list: () => request<KnowledgeEntry[]>("/knowledge"),
        create: (body: KnowledgeInput) => post<KnowledgeEntry>("/knowledge", body),
        update: (id: string, body: Partial<KnowledgeInput>) => patch<KnowledgeEntry>(`/knowledge/${id}`, body),
        remove: (id: string) => request<{ ok: true }>(`/knowledge/${id}`, { method: "DELETE" }),
    },

    organizations: {
        list: (p: { q?: string; type?: OrganizationType } = {}) => request<Organization[]>(`/organizations${qs(p)}`),
        get: (id: string) => request<OrganizationDetail>(`/organizations/${id}`),
        create: (body: OrganizationInput & { name: string }) => post<Organization>("/organizations", body),
        update: (id: string, body: OrganizationInput) => patch<Organization>(`/organizations/${id}`, body),
    },
};
