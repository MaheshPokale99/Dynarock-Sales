import addressparser from "nodemailer/lib/addressparser";
import MailComposer from "nodemailer/lib/mail-composer";
import type { GmailMessage, GmailPart } from "./gmail.types.js";

export interface Address {
    email: string;
    name: string;
}

export interface OutgoingAttachment {
    filename: string;
    contentType: string;
    content: Buffer;
}

export interface OutgoingMessage {
    from: Address;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    html: string;
    inReplyTo?: string;
    references?: string[];
    attachments?: OutgoingAttachment[];
    listUnsubscribe?: string;
}

export interface ParsedAttachment {
    filename: string;
    mimeType: string;
    size: number;
    gmailAttachmentId: string;
}

export interface ParsedMessage {
    gmailMessageId: string;
    gmailThreadId: string;
    labelIds: string[];
    rfcMessageId: string;
    inReplyTo: string | null;
    references: string[];
    from: Address;
    to: Address[];
    cc: Address[];
    bcc: Address[];
    subject: string;
    html: string;
    text: string;
    snippet: string;
    sentAt: Date;
    attachments: ParsedAttachment[];
    isAutoReply: boolean;
    authResult: AuthResult;
}

export type AuthResult = "pass" | "fail" | "unknown";

// Gmail's own verdict on the sender (DMARC, else SPF/DKIM), from the header Gmail adds on receipt.
export function parseAuthResult(value: string | undefined): AuthResult {
    if (!value || !/^\s*mx\.google\.com\s*;/i.test(value)) return "unknown";
    const result = (method: string) => new RegExp(`\\b${method}=(\\w+)`, "i").exec(value)?.[1]?.toLowerCase();
    const dmarc = result("dmarc");
    if (dmarc === "pass") return "pass";
    if (dmarc === "fail") return "fail";
    const spf = result("spf");
    const dkim = result("dkim");
    if (spf === "pass" || dkim === "pass") return "pass";
    if (spf === "fail" || spf === "softfail" || dkim === "fail") return "fail";
    return "unknown";
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const textToHtml = (text: string) => `<div>${escapeHtml(text).replace(/\r?\n/g, "<br>")}</div>`;

export function htmlToText(html: string): string {
    return html
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function parseAddresses(value: string | undefined): Address[] {
    if (!value) return [];
    return addressparser(value, { flatten: true })
        .filter((a) => a.address)
        .map((a) => ({ email: a.address.toLowerCase(), name: a.name }));
}

const formatAddress = (a: Address) => (a.name ? { name: a.name, address: a.email } : a.email);

// RFC 2822 message, base64url encoded for users.messages.send.
export async function buildRawMessage(msg: OutgoingMessage): Promise<string> {
    const node = new MailComposer({
        from: formatAddress(msg.from),
        to: msg.to,
        cc: msg.cc,
        bcc: msg.bcc,
        subject: msg.subject,
        html: msg.html,
        text: htmlToText(msg.html),
        inReplyTo: msg.inReplyTo,
        references: msg.references,
        attachments: msg.attachments,
        ...(msg.listUnsubscribe
            ? {
                  // Set directly: MailComposer ignores the "list" option.
                  headers: {
                      "List-Unsubscribe": `<${msg.listUnsubscribe}>`,
                      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                  },
              }
            : {}),
    }).compile();
    // Gmail needs the Bcc header to deliver to Bcc recipients (it strips it from what they receive).
    node.keepBcc = true;
    const raw = await node.build();
    return raw.toString("base64url");
}

const header = (part: GmailPart | undefined, name: string) =>
    part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

function decodeBody(part: GmailPart): string {
    const data = part.body?.data;
    if (!data) return "";
    const charset = /charset="?([^";]+)"?/i.exec(header(part, "content-type") ?? "")?.[1] ?? "utf-8";
    const bytes = Buffer.from(data, "base64url");
    try {
        return new TextDecoder(charset.trim().toLowerCase()).decode(bytes);
    } catch {
        return bytes.toString("utf8");
    }
}

function walk(part: GmailPart, visit: (p: GmailPart) => void) {
    visit(part);
    for (const child of part.parts ?? []) walk(child, visit);
}

const messageIds = (value: string | undefined) => value?.match(/<[^>]+>/g) ?? [];

export function parseGmailMessage(message: GmailMessage): ParsedMessage {
    const payload = message.payload ?? { mimeType: "text/plain" };
    let html = "";
    let text = "";
    const attachments: ParsedAttachment[] = [];

    walk(payload, (part) => {
        const disposition = header(part, "content-disposition") ?? "";
        const isAttachment = Boolean(part.filename) || /attachment/i.test(disposition);
        if (isAttachment && part.body?.attachmentId) {
            attachments.push({
                filename: part.filename || "attachment",
                mimeType: part.mimeType,
                size: part.body.size ?? 0,
                gmailAttachmentId: part.body.attachmentId,
            });
        } else if (!isAttachment && part.mimeType === "text/html" && !html) {
            html = decodeBody(part);
        } else if (!isAttachment && part.mimeType === "text/plain" && !text) {
            text = decodeBody(part);
        }
    });

    if (!html && text) html = textToHtml(text);
    if (!text && html) text = htmlToText(html);

    const autoSubmitted = header(payload, "auto-submitted");
    return {
        gmailMessageId: message.id,
        gmailThreadId: message.threadId,
        labelIds: message.labelIds ?? [],
        rfcMessageId: messageIds(header(payload, "message-id"))[0] ?? `<${message.id}@gmail>`,
        inReplyTo: messageIds(header(payload, "in-reply-to"))[0] ?? null,
        references: messageIds(header(payload, "references")),
        from: parseAddresses(header(payload, "from"))[0] ?? { email: "unknown", name: "" },
        to: parseAddresses(header(payload, "to")),
        cc: parseAddresses(header(payload, "cc")),
        bcc: parseAddresses(header(payload, "bcc")),
        subject: header(payload, "subject") ?? "",
        html,
        text,
        snippet: message.snippet ?? text.slice(0, 200),
        sentAt: new Date(Number(message.internalDate ?? Date.now())),
        attachments,
        isAutoReply:
            (Boolean(autoSubmitted) && autoSubmitted !== "no") ||
            Boolean(header(payload, "x-autoreply") ?? header(payload, "x-autorespond")),
        authResult: parseAuthResult(header(payload, "authentication-results")),
    };
}
