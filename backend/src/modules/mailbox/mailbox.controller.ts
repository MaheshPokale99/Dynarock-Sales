import type { Context } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import { currentAuth } from "../auth/auth.middleware.js";
import type { MailboxService } from "./mailbox.service.js";

export class MailboxController {
    constructor(private readonly service: MailboxService) {}

    status = async (c: Context<AppEnv>) => c.json(await this.service.status());

    connect = (c: Context<AppEnv>) => c.json({ url: this.service.connectUrl(currentAuth(c).user.id) });

    callback = async (c: Context<AppEnv>) => {
        const { code, state, error } = c.req.query();
        return c.redirect(await this.service.handleCallback({ code, state, error }), 302);
    };

    disconnect = async (c: Context<AppEnv>) => {
        await this.service.disconnect(currentAuth(c).user.id);
        return c.json(await this.service.status());
    };
}
