import { Hono } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import type { UsersController } from "./users.controller.js";

// Everyone can see the team (for "sent by" filters); only admins change it.
export const createUsersRoutes = (controller: UsersController) =>
    new Hono<AppEnv>()
        .get("/", requireAuth, controller.list)
        .post("/invite", requireRole("admin"), controller.invite)
        .post("/:id/resend-invite", requireRole("admin"), controller.resendInvite)
        .patch("/:id", requireRole("admin"), controller.update);
