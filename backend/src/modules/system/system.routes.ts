import { Hono } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import { requireAuth } from "../auth/auth.middleware.js";
import type { SystemController } from "./system.controller.js";

export const createSystemRoutes = (controller: SystemController) =>
    new Hono<AppEnv>().get("/health", requireAuth, controller.status);

export const createProbeRoutes = (controller: SystemController) =>
    new Hono<AppEnv>().get("/healthz", controller.live).get("/readyz", controller.ready);
