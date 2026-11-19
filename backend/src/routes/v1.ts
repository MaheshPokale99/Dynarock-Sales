import { Hono } from "hono";
import type { AppEnv } from "../common/http/app-env.js";
import { MS_PER_MINUTE } from "../common/constants.js";
import { rateLimit } from "../common/middleware/rate-limit.js";
import type { Container } from "../container.js";
import { createAuthRoutes } from "../modules/auth/auth.routes.js";
import { createContactsRoutes } from "../modules/contacts/contacts.http.js";
import { createOrganizationsRoutes } from "../modules/organizations/organizations.http.js";
import { createDraftsRoutes } from "../modules/drafts/drafts.js";
import { createFilesRoutes } from "../modules/files/files.routes.js";
import { createMailRoutes } from "../modules/mail/mail.routes.js";
import { createMailboxRoutes } from "../modules/mailbox/mailbox.routes.js";
import { createSystemRoutes } from "../modules/system/system.routes.js";
import { createUsersRoutes } from "../modules/users/users.routes.js";

export function createV1Routes({ config, controllers }: Container) {
    const authLimit = rateLimit({
        windowMs: MS_PER_MINUTE,
        max: config.rateLimit.authPerMinute,
        trustProxy: config.rateLimit.trustProxy,
    });

    return new Hono<AppEnv>()
        .route("/auth", createAuthRoutes(controllers.auth, authLimit))
        .route("/users", createUsersRoutes(controllers.users))
        .route("/mailbox", createMailboxRoutes(controllers.mailbox))
        .route("/drafts", createDraftsRoutes(controllers.drafts))
        .route("/files", createFilesRoutes(controllers.files))
        .route("/organizations", createOrganizationsRoutes(controllers.organizations))
        .route("/", createContactsRoutes(controllers.contacts))
        .route("/", createMailRoutes(controllers.mail))
        .route("/", createSystemRoutes(controllers.system));
}
