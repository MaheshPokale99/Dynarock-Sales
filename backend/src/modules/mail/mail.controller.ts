import type { Context } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import { download } from "../../common/http/download.js";
import { parseBody, parseParams, parseQuery } from "../../common/http/request.js";
import { idParams } from "../../common/http/schemas.js";
import { currentAuth } from "../auth/auth.middleware.js";
import { attachmentParams, listQuery, recipientsQuery, sendBody, updateThreadBody } from "./mail.schema.js";
import type { MailService } from "./mail.service.js";
import type { MailSyncService } from "./mail-sync.service.js";

export class MailController {
    constructor(
        private readonly service: MailService,
        private readonly sync: MailSyncService,
    ) {}

    list = async (c: Context<AppEnv>) => c.json(await this.service.list(parseQuery(c, listQuery)));

    counts = async (c: Context<AppEnv>) => c.json(await this.service.counts());

    detail = async (c: Context<AppEnv>) => c.json(await this.service.detail(parseParams(c, idParams).id));

    update = async (c: Context<AppEnv>) => {
        const { id } = parseParams(c, idParams);
        return c.json(await this.service.update(id, await parseBody(c, updateThreadBody)));
    };

    send = async (c: Context<AppEnv>) => {
        const input = await parseBody(c, sendBody);
        return c.json(await this.service.send(currentAuth(c).user, input), 201);
    };

    attachment = async (c: Context<AppEnv>) => {
        const { id, index } = parseParams(c, attachmentParams);
        return download(c, await this.service.attachment(id, index));
    };

    recipients = async (c: Context<AppEnv>) => c.json(await this.service.recipients(parseQuery(c, recipientsQuery).q));

    syncNow = async (c: Context<AppEnv>) => c.json((await this.sync.syncNow()) ?? { added: 0, skipped: true });
}
