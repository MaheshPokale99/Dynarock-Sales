import type { Context } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams } from "../../common/http/request.js";
import { idParams } from "../../common/http/schemas.js";
import { currentAuth } from "../auth/auth.middleware.js";
import { inviteBody, updateUserBody } from "./users.schema.js";
import type { UsersService } from "./users.service.js";

export class UsersController {
    constructor(private readonly service: UsersService) {}

    list = async (c: Context<AppEnv>) => c.json(await this.service.list());

    invite = async (c: Context<AppEnv>) => {
        const input = await parseBody(c, inviteBody);
        return c.json(await this.service.invite(currentAuth(c).user.id, input), 201);
    };

    resendInvite = async (c: Context<AppEnv>) =>
        c.json(await this.service.resendInvite(currentAuth(c).user.id, parseParams(c, idParams).id));

    update = async (c: Context<AppEnv>) => {
        const { id } = parseParams(c, idParams);
        const input = await parseBody(c, updateUserBody);
        return c.json(await this.service.update(currentAuth(c).user.id, id, input));
    };
}
