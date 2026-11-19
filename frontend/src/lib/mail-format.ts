import type { Address, ComposeMode, Message } from "@/lib/api";

export const displayName = (a: Address) => a.name || a.email.split("@")[0] || a.email;

export const isEmail = (s: string) => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(s);

// "14:05" today, "19 Nov" this year, "19/11/25" otherwise.
export function listTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    }
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export const fullTime = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

export function fileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const label = (a: Address) => (a.name ? `${esc(a.name)} &lt;${esc(a.email)}&gt;` : esc(a.email));

export function subjectFor(mode: ComposeMode, subject: string) {
    if (mode === "new") return "";
    const prefix = mode === "forward" ? "Fwd:" : "Re:";
    return subject.toLowerCase().startsWith(prefix.toLowerCase()) ? subject : `${prefix} ${subject}`;
}

// Quoted original appended under a reply or forward.
export function quoteHtml(mode: ComposeMode, m: Message) {
    if (mode === "forward") {
        return `<br><div class="ds-quote">---------- Forwarded message ---------<br>From: ${label(m.from)}<br>Date: ${esc(fullTime(m.sentAt))}<br>Subject: ${esc(m.subject)}<br>To: ${m.to.map(label).join(", ")}<br><br>${m.html}</div>`;
    }
    return `<br><div class="ds-quote"><div>On ${esc(fullTime(m.sentAt))}, ${label(m.from)} wrote:</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${m.html}</blockquote></div>`;
}

export function replyRecipients(mode: ComposeMode, m: Message, mailbox: string): { to: string[]; cc: string[] } {
    if (mode === "forward" || mode === "new") return { to: [], cc: [] };
    const others = (list: Address[]) => list.map((a) => a.email).filter((e) => e !== mailbox);
    const to = m.direction === "inbound" ? [m.from.email] : others(m.to);
    if (mode === "reply") return { to, cc: [] };
    const allTo = [...new Set([...to, ...(m.direction === "inbound" ? others(m.to) : [])])];
    return { to: allTo, cc: others(m.cc).filter((e) => !allTo.includes(e)) };
}
