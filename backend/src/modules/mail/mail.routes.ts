import { Hono } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import { requireAuth } from "../auth/auth.middleware.js";
import type { MailController } from "./mail.controller.js";

export const createMailRoutes = (controller: MailController) =>
    new Hono<AppEnv>()
        .get("/threads", requireAuth, controller.list)
        .get("/threads/counts", requireAuth, controller.counts)
        .get("/threads/:id", requireAuth, controller.detail)
        .patch("/threads/:id", requireAuth, controller.update)
        .post("/emails/send", requireAuth, controller.send)
        .get("/messages/:id/attachments/:index", requireAuth, controller.attachment)
        .get("/recipients", requireAuth, controller.recipients)
        .post("/mailbox/sync", requireAuth, controller.syncNow);
