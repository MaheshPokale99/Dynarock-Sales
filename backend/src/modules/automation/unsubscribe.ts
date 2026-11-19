import { Hono } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import type { AutomationService } from "./automation.service.js";

const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${escape(title)} · Dynarock</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fafafa;color:#171717;font:16px/1.5 system-ui,sans-serif}
main{max-width:420px;padding:32px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{color:#525252;margin:0 0 20px}
button{font:inherit;padding:10px 18px;border-radius:8px;border:0;background:#171717;color:#fff;cursor:pointer}</style></head>
<body><main>${body}</main></body></html>`;

// Public, outside /api: linked from automated emails and used by one-click unsubscribe.
export const createUnsubscribeRoutes = (automation: AutomationService) =>
    new Hono<AppEnv>()
        .get("/u/:token", (c) =>
            c.html(
                page(
                    "Unsubscribe",
                    `<h1>Stop emails from Dynarock?</h1><p>We won’t send you any more sales emails.</p>
<form method="post"><button type="submit">Unsubscribe</button></form>`,
                ),
            ),
        )
        .post("/u/:token", async (c) => {
            const result = await automation.unsubscribe(c.req.param("token"));
            if (!result) {
                return c.html(
                    page(
                        "Link not valid",
                        "<h1>This link isn’t valid</h1><p>Reply to the email and we’ll take you off our list.</p>",
                    ),
                    404,
                );
            }
            return c.html(
                page(
                    "Unsubscribed",
                    `<h1>You’re unsubscribed</h1><p>${escape(result.email)} won’t get any more sales emails from us.</p>`,
                ),
            );
        });
