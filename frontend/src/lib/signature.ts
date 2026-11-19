const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Plain-text signature <-> stored HTML (until Compose has a rich editor).
export const textToHtml = (text: string) => (text.trim() ? text.trim().split("\n").map(escapeHtml).join("<br>") : "");

export const htmlToText = (html: string) =>
    html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
