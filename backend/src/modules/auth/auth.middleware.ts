import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { SESSION_COOKIE } from "../../common/constants.js";
import { ForbiddenError, UnauthorizedError } from "../../common/errors/app-error.js";
import type { AppEnv, AuthContext } from "../../common/http/app-env.js";
import type { UserRole } from "../users/user.model.js";
import type { AuthService } from "./auth.service.js";

export interface CookieSettings {
    secure: boolean;
}

export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date, settings: CookieSettings) {
    setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "Lax",
        secure: settings.secure,
        path: "/",
        expires: expiresAt,
    });
}

export const clearSessionCookie = (c: Context<AppEnv>) => deleteCookie(c, SESSION_COOKIE, { path: "/" });

// Reads the session cookie (if any) and puts the signed-in user on the context.
export const sessionMiddleware = (auth: AuthService, settings: CookieSettings) =>
    createMiddleware<AppEnv>(async (c, next) => {
        const token = getCookie(c, SESSION_COOKIE);
        if (token) {
            const result = await auth.authenticate(token);
            if (result) {
                c.set("auth", { user: result.user, tokenHash: result.tokenHash });
                if (result.renewedUntil) setSessionCookie(c, token, result.renewedUntil, settings);
            } else {
                clearSessionCookie(c);
            }
        }
        await next();
    });

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get("auth")) throw new UnauthorizedError();
    await next();
});

export const requireRole = (...roles: UserRole[]) =>
    createMiddleware<AppEnv>(async (c, next) => {
        const auth = c.get("auth");
        if (!auth) throw new UnauthorizedError();
        if (!roles.includes(auth.user.role)) throw new ForbiddenError("Only an admin can do this");
        await next();
    });

export function currentAuth(c: Context<AppEnv>): AuthContext {
    const auth = c.get("auth");
    if (!auth) throw new UnauthorizedError();
    return auth;
}
