import type { MessageDoc, ThreadDoc } from "./mail.model.js";

export const toThreadDto = (t: ThreadDoc) => ({
    id: t._id.toHexString(),
    subject: t.subject,
    participants: t.participants,
    snippet: t.snippet,
    messageCount: t.messageCount,
    lastMessageAt: t.lastMessageAt,
    lastMessageDirection: t.lastMessageDirection,
    lastInboundAt: t.lastInboundAt,
    lastOutboundAt: t.lastOutboundAt,
    state: t.state,
    unread: t.unread,
    hasAttachments: t.hasAttachments,
    senderIds: t.senderIds.map((id) => id.toHexString()),
    startedBy: t.startedBy?.toHexString() ?? null,
});

export const toMessageDto = (m: MessageDoc) => ({
    id: m._id.toHexString(),
    direction: m.direction,
    from: m.from,
    to: m.to,
    cc: m.cc,
    bcc: m.bcc,
    subject: m.subject,
    html: m.html,
    snippet: m.snippet,
    attachments: m.attachments.map((a, index) => ({ index, filename: a.filename, mimeType: a.mimeType, size: a.size })),
    sentAt: m.sentAt,
    sentByUserId: m.sentByUserId?.toHexString() ?? null,
    origin: m.origin,
    isAutoReply: m.isAutoReply,
});

export type ThreadDto = ReturnType<typeof toThreadDto>;
