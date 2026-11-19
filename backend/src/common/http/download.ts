import type { Context } from "hono";
import type { AppEnv } from "./app-env.js";

// Sends a file as a download; the filename is RFC 5987 encoded so any language works.
export function download(
    c: Context<AppEnv>,
    file: { filename: string; mimeType: string; content: Buffer },
    inline = false,
) {
    const ascii = file.filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
    c.header("Content-Type", file.mimeType || "application/octet-stream");
    c.header(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "private, max-age=300");
    return c.body(new Uint8Array(file.content));
}
