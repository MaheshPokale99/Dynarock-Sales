const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Plain text from the model -> safe email HTML. Blank lines split paragraphs; "- " lines become a list.
export function textToEmailHtml(text: string): string {
    return text
        .replace(/\r\n/g, "\n")
        .trim()
        .split(/\n{2,}/)
        .map((block) => {
            const lines = block
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);
            if (lines.length > 0 && lines.every((l) => /^[-•*]\s+/.test(l))) {
                return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^[-•*]\s+/, ""))}</li>`).join("")}</ul>`;
            }
            return `<p>${lines.map(escapeHtml).join("<br>")}</p>`;
        })
        .join("");
}

const FIGURE = /(?:₹|\brs\.?|\binr)\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{2,3})+\b|\b\d{4,}\b/gi;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const digits = (s: string) => s.replace(/\D/g, "");

function hostOf(url: string): string {
    try {
        return new URL(url.startsWith("www.") ? `https://${url}` : url).hostname;
    } catch {
        return url;
    }
}

// Warnings for figures and links the AI wrote that aren't backed by the knowledge base or the conversation.
export function checkDraft(text: string, sources: string[]): string[] {
    const corpus = sources.join("\n").toLowerCase();
    // Every number that appears in the sources, compared whole (2,40,000 == 240000).
    const known = new Set((corpus.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(digits));
    const warnings = new Set<string>();

    for (const match of text.match(FIGURE) ?? []) {
        const d = digits(match);
        if (d.length > 0 && !known.has(d)) {
            warnings.add(`“${match.trim()}” isn't in the knowledge base or the conversation. Check it before sending.`);
        }
    }
    for (const match of text.match(LINK) ?? []) {
        const url = match.replace(/[.,;:]+$/, "");
        if (!/(^|\.)dynarock\.in$/i.test(hostOf(url)) && !corpus.includes(url.toLowerCase())) {
            warnings.add(`The link ${url} isn't from dynarock.in or the knowledge base. Check it before sending.`);
        }
    }
    return [...warnings];
}
