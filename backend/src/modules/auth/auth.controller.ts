import type { Context } from "hono";
import type { AppEnv } from "../../common/http/app-env.js";
import { parseBody, parseParams } from "../../common/http/request.js";
import { clientAddress } from "../../common/middleware/rate-limit.js";
import { acceptInviteBody, changePasswordBody, loginBody, tokenParams, updateProfileBody } from "./auth.schema.js";
import { clearSessionCookie, currentAuth, setSessionCookie, type CookieSettings } from "./auth.middleware.js";
import type { AuthService, ClientMeta } from "./auth.service.js";

export class AuthController {
    constructor(
        private readonly service: AuthService,
        private readonly settings: CookieSettings & { trustProxy: boolean },
    ) {}

    private meta(c: Context<AppEnv>): ClientMeta {
        return {
            ip: clientAddress(c, this.settings.trustProxy),
            userAgent: (c.req.header("user-agent") ?? "").slice(0, 300),
        };
    }

    login = async (c: Context<AppEnv>) => {
        const { email, password } = await parseBody(c, loginBody);
        const session = await this.service.login(email, password, this.meta(c));
        setSessionCookie(c, session.token, session.expiresAt, this.settings);
        return c.json({ user: session.user });
    };

    logout = async (c: Context<AppEnv>) => {
        const auth = c.get("auth");
        if (auth) await this.service.logout(auth.tokenHash);
        clearSessionCookie(c);
        return c.json({ ok: true });
    };

    me = (c: Context<AppEnv>) => c.json({ user: currentAuth(c).user });

    updateProfile = async (c: Context<AppEnv>) => {
        const patch = await parseBody(c, updateProfileBody);
        return c.json({ user: await this.service.updateProfile(currentAuth(c).user.id, patch) });
    };

    changePassword = async (c: Context<AppEnv>) => {
        const { currentPassword, newPassword } = await parseBody(c, changePasswordBody);
        const auth = currentAuth(c);
        await this.service.changePassword(auth.user.id, currentPassword, newPassword, auth.tokenHash);
        return c.json({ ok: true });
    };

    inviteDetails = async (c: Context<AppEnv>) =>
        c.json(await this.service.inviteDetails(parseParams(c, tokenParams).token));

    acceptInvite = async (c: Context<AppEnv>) => {
        const { token, password } = await parseBody(c, acceptInviteBody);
        const session = await this.service.acceptInvite(token, password, this.meta(c));
        setSessionCookie(c, session.token, session.expiresAt, this.settings);
        return c.json({ user: session.user });
    };
}
