import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseQuery } from "../../common/http/request.js";
import { requireAuth } from "../auth/auth.middleware.js";
import type { AnalyticsService } from "./analytics.service.js";

const query = z.object({
    days: z.coerce
        .number()
        .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
        .default(30),
});

export class AnalyticsController {
    constructor(private readonly service: AnalyticsService) {}

    dashboard = async (c: Context<AppEnv>) => c.json(await this.service.dashboard(parseQuery(c, query).days));
}

export const createAnalyticsRoutes = (controller: AnalyticsController) =>
    new Hono<AppEnv>().get("/dashboard", requireAuth, controller.dashboard);
