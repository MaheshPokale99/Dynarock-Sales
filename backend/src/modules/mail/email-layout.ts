const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailBrand {
    logoUrl: string | null;
    brandColor: string;
    demoUrl: string | null;
}

// Written by the AI (or a template) on its own line where the "Book a demo" button goes.
export const DEMO_BUTTON_MARKER = "[[BOOK_DEMO]]";

const COMPANY = "Dynarock";
const WEBSITE = "https://dynarock.in";
const LAYOUT_ATTR = 'data-layout="dynarock"';
const FONT = "Arial, Helvetica, sans-serif";
const MARKER_BLOCK = /<p>\s*\[\[BOOK_DEMO\]\]\s*<\/p>|\[\[BOOK_DEMO\]\]/g;

const demoButton = (url: string, color: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;"><tr>` +
    `<td bgcolor="${color}" style="border-radius:6px;">` +
    `<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">Book a demo</a>` +
    `</td></tr></table>`;

const header = (brand: EmailBrand) =>
    brand.logoUrl
        ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${COMPANY}" height="32" style="display:block;height:32px;border:0;">`
        : `<span style="font-family:${FONT};font-size:20px;font-weight:bold;color:${brand.brandColor};">${COMPANY}</span>`;

// Wraps an email body in the Dynarock layout: logo, body, optional demo button, footer.
// Table-based with inline styles so it renders the same in Gmail, Outlook and Apple Mail.
export function renderEmail(bodyHtml: string, brand: EmailBrand): string {
    if (bodyHtml.includes(LAYOUT_ATTR)) return bodyHtml;
    let usedButton = false;
    const body = bodyHtml.replace(MARKER_BLOCK, () => {
        if (!brand.demoUrl || usedButton) return "";
        usedButton = true;
        return demoButton(brand.demoUrl, brand.brandColor);
    });

    return (
        `<div ${LAYOUT_ATTR} style="margin:0;padding:0;background:#f4f6f8;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;"><tr><td align="center" style="padding:24px 12px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:8px;border-top:4px solid ${brand.brandColor};">` +
        `<tr><td style="padding:24px 32px 8px;">${header(brand)}</td></tr>` +
        `<tr><td style="padding:8px 32px 24px;font-family:${FONT};font-size:15px;line-height:1.6;color:#1f2937;">${body}</td></tr>` +
        `</table>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;"><tr>` +
        `<td align="center" style="padding:16px 32px;font-family:${FONT};font-size:12px;line-height:1.5;color:#6b7280;">` +
        `${COMPANY} · The AI-powered campus operating system · <a href="${WEBSITE}" style="color:#6b7280;">dynarock.in</a>` +
        `</td></tr></table>` +
        `</td></tr></table></div>`
    );
}
