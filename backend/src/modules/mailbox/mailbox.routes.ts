import { Hono } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import type { MailboxController } from "./mailbox.controller.js";

export const createMailboxRoutes = (controller: MailboxController) =>
    new Hono<AppEnv>()
        .get("/", requireAuth, controller.status)
        .get("/connect", requireRole("admin"), controller.connect)
        // Google redirects the browser here; the signed state proves which admin started it.
        .get("/oauth/callback", controller.callback)
        .post("/disconnect", requireRole("admin"), controller.disconnect);
