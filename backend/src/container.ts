import type { Logger } from "./common/logger/logger.js";
import type { AppConfig } from "./config/env.js";
import { Database } from "./database/database.js";
import { createGmailApi } from "./integrations/gmail/gmail-client.js";
import { createGmailOAuth } from "./integrations/gmail/gmail-oauth.js";
import type { GmailApiFactory, GmailOAuth } from "./integrations/gmail/gmail.types.js";
import { ActivitiesRepository } from "./modules/activities/activities.repository.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { InvitesRepository } from "./modules/auth/invites.repository.js";
import { SessionsRepository } from "./modules/auth/sessions.repository.js";
import { DraftsController } from "./modules/drafts/drafts.js";
import { DraftsRepository } from "./modules/drafts/drafts.repository.js";
import { FilesController } from "./modules/files/files.routes.js";
import { FilesService } from "./modules/files/files.service.js";
import { Locks } from "./modules/locks/locks.js";
import { MailController } from "./modules/mail/mail.controller.js";
import { MailRepository } from "./modules/mail/mail.repository.js";
import { MailService } from "./modules/mail/mail.service.js";
import { MailSyncService } from "./modules/mail/mail-sync.service.js";
import { MailboxController } from "./modules/mailbox/mailbox.controller.js";
import { MailboxRepository } from "./modules/mailbox/mailbox.repository.js";
import { MailboxService } from "./modules/mailbox/mailbox.service.js";
import { SystemController } from "./modules/system/system.controller.js";
import { SystemService } from "./modules/system/system.service.js";
import { UsersController } from "./modules/users/users.controller.js";
import { UsersRepository } from "./modules/users/users.repository.js";
import { UsersService } from "./modules/users/users.service.js";

export interface ContainerOverrides {
    database?: Database;
    now?: () => Date;
    gmailOAuth?: GmailOAuth;
    gmailApi?: GmailApiFactory;
}

export type Container = ReturnType<typeof createContainer>;

// Composition root: builds and wires every repository, service and controller.
export function createContainer(config: AppConfig, logger: Logger, overrides: ContainerOverrides = {}) {
    const database = overrides.database ?? Database.create(config.mongoUri);
    const { models } = database;
    const now = overrides.now;

    const repositories = {
        users: new UsersRepository(models),
        sessions: new SessionsRepository(models),
        invites: new InvitesRepository(models),
        activities: new ActivitiesRepository(models),
        mailboxes: new MailboxRepository(models),
        mail: new MailRepository(models),
        drafts: new DraftsRepository(models),
    };

    const auth = new AuthService({ ...repositories, config: config.auth, now });
    const users = new UsersService({ ...repositories, config, now });
    const mailbox = new MailboxService({
        ...repositories,
        oauth: overrides.gmailOAuth ?? createGmailOAuth(config.gmail),
        createApi: overrides.gmailApi ?? createGmailApi,
        config: { ...config.gmail, appUrl: config.appUrl },
        logger,
    });
    const sync = new MailSyncService({
        mail: repositories.mail,
        mailbox,
        locks: new Locks(models),
        logger,
        lockTtlMs: Math.max(config.gmail.syncIntervalMs * 2, 120_000),
    });
    const files = new FilesService(database.connection);
    const mail = new MailService({ ...repositories, sync, mailbox, files, logger });
    const system = new SystemService(database, config);

    const cookie = { secure: config.auth.cookieSecure };

    return {
        config,
        logger,
        database,
        repositories,
        services: { auth, users, mailbox, sync, mail, files },
        cookie,
        controllers: {
            auth: new AuthController(auth, { ...cookie, trustProxy: config.rateLimit.trustProxy }),
            users: new UsersController(users),
            mailbox: new MailboxController(mailbox),
            mail: new MailController(mail, sync),
            drafts: new DraftsController(repositories.drafts),
            files: new FilesController(files),
            system: new SystemController(system),
        },
    };
}
