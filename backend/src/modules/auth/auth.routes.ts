import { Hono, type MiddlewareHandler } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import type { AuthController } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

export const createAuthRoutes = (controller: AuthController, authLimit: MiddlewareHandler<AppEnv>) =>
    new Hono<AppEnv>()
        .post("/login", authLimit, controller.login)
        .post("/logout", controller.logout)
        .get("/me", requireAuth, controller.me)
        .patch("/me", requireAuth, controller.updateProfile)
        .post("/change-password", requireAuth, authLimit, controller.changePassword)
        .get("/invites/:token", authLimit, controller.inviteDetails)
        .post("/accept-invite", authLimit, controller.acceptInvite);
