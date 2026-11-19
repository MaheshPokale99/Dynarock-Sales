import { Hono } from "hono";
import type { AppEnv } from "../common/http/app-env.js";
import { MS_PER_MINUTE } from "../common/constants.js";
import { rateLimit } from "../common/middleware/rate-limit.js";
import type { Container } from "../container.js";
import { createAiRoutes } from "../modules/ai/ai.http.js";
import { createTemplatesRoutes } from "../modules/templates/templates.js";
import { createAnalyticsRoutes } from "../modules/analytics/analytics.http.js";
import { createAutomationRoutes } from "../modules/automation/automation.http.js";
import { createAuthRoutes } from "../modules/auth/auth.routes.js";
import { createKnowledgeRoutes } from "../modules/knowledge/knowledge.js";
import { createContactsRoutes } from "../modules/contacts/contacts.http.js";
import { createOrganizationsRoutes } from "../modules/organizations/organizations.http.js";
import { createDraftsRoutes } from "../modules/drafts/drafts.js";
import { createFilesRoutes } from "../modules/files/files.routes.js";
import { createMailRoutes } from "../modules/mail/mail.routes.js";
import { createMailboxRoutes } from "../modules/mailbox/mailbox.routes.js";
import { createSystemRoutes } from "../modules/system/system.routes.js";
import { createUsersRoutes } from "../modules/users/users.routes.js";

const SENDS_PER_MINUTE = 20;

export function createV1Routes({ config, controllers }: Container) {
    const authLimit = rateLimit({
        windowMs: MS_PER_MINUTE,
        max: config.rateLimit.authPerMinute,
        trustProxy: config.rateLimit.trustProxy,
    });

    const aiLimit = rateLimit({
        windowMs: MS_PER_MINUTE,
        max: config.rateLimit.aiPerMinute,
        trustProxy: config.rateLimit.trustProxy,
    });
    // Per person: how fast anyone can push email out of the shared mailbox.
    const sendLimit = rateLimit({
        windowMs: MS_PER_MINUTE,
        max: SENDS_PER_MINUTE,
        keyBy: (c) => c.get("auth")?.user.id,
    });

    return new Hono<AppEnv>()
        .use("/emails/send", sendLimit)
        .use("/ai/suggestions/:id/send", sendLimit)
        .use("/scheduled-emails/:id/send-now", sendLimit)
        .route("/auth", createAuthRoutes(controllers.auth, authLimit))
        .route("/users", createUsersRoutes(controllers.users))
        .route("/mailbox", createMailboxRoutes(controllers.mailbox))
        .route("/drafts", createDraftsRoutes(controllers.drafts))
        .route("/files", createFilesRoutes(controllers.files))
        .route("/organizations", createOrganizationsRoutes(controllers.organizations))
        .route("/knowledge", createKnowledgeRoutes(controllers.knowledge))
        .route("/templates", createTemplatesRoutes(controllers.templates))
        .route("/analytics", createAnalyticsRoutes(controllers.analytics))
        .route("/", createAiRoutes(controllers.ai, aiLimit))
        .route("/", createAutomationRoutes(controllers.automation))
        .route("/", createContactsRoutes(controllers.contacts))
        .route("/", createMailRoutes(controllers.mail))
        .route("/", createSystemRoutes(controllers.system));
}
