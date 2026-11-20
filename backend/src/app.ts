import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { except } from "hono/combine";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { API_PREFIX, MAX_BODY_BYTES, MS_PER_MINUTE, REQUEST_ID_HEADER } from "./common/constants.js";
import { PayloadTooLargeError } from "./common/errors/app-error.js";
import type { AppEnv } from "./common/http/app-env.js";
import { errorHandler, notFoundHandler } from "./common/middleware/error-handler.js";
import { rateLimit } from "./common/middleware/rate-limit.js";
import { requestContext } from "./common/middleware/request-context.js";
import type { Container } from "./container.js";
import { sessionMiddleware } from "./modules/auth/auth.middleware.js";
import { createUnsubscribeRoutes } from "./modules/automation/unsubscribe.js";
import { createCronRoutes } from "./modules/system/cron.routes.js";
import { createProbeRoutes } from "./modules/system/system.routes.js";
import { createV1Routes } from "./routes/v1.js";

export function createApp(container: Container) {
    const { config, logger, controllers, services, cookie } = container;
    const app = new Hono<AppEnv>();

    app.use(requestContext(logger));
    app.use(secureHeaders());
    app.use(
        `${API_PREFIX}/*`,
        cors({
            origin: config.corsOrigins,
            credentials: true,
            exposeHeaders: [REQUEST_ID_HEADER, "RateLimit-Limit", "RateLimit-Remaining", "Retry-After"],
        }),
    );
    app.use(`${API_PREFIX}/*`, csrf({ origin: config.corsOrigins }));
    const jsonLimit = bodyLimit({
        maxSize: MAX_BODY_BYTES,
        onError: () => {
            throw new PayloadTooLargeError();
        },
    });
    // File uploads set their own, larger limit.
    app.use(`${API_PREFIX}/*`, except(`${API_PREFIX}/files`, jsonLimit));
    app.use(
        `${API_PREFIX}/*`,
        rateLimit({
            windowMs: MS_PER_MINUTE,
            max: config.rateLimit.perMinute,
            trustProxy: config.rateLimit.trustProxy,
        }),
    );
    app.use(`${API_PREFIX}/*`, sessionMiddleware(services.auth, cookie));

    app.route(API_PREFIX, createV1Routes(container));
    app.route("/", createProbeRoutes(controllers.system));
    app.route("/", createCronRoutes(container));
    app.route("/", createUnsubscribeRoutes(services.automation));

    app.notFound(notFoundHandler);
    app.onError(errorHandler);
    return app;
}
