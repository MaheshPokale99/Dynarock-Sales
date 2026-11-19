import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { RateLimitError } from "../errors/app-error.js";
import type { AppEnv } from "../http/app-env.js";

export interface RateLimitOptions {
    windowMs: number;
    max: number;
    trustProxy?: boolean;
    // Custom key (e.g. the signed-in user); falls back to the client address.
    keyBy?: (c: Context<AppEnv>) => string | undefined;
}

interface Window {
    count: number;
    resetAt: number;
}

// Hard cap on tracked keys so a flood of distinct clients can't grow memory without limit.
const MAX_KEYS = 50_000;

// Behind a proxy, the last X-Forwarded-For entry is the one our own proxy added; earlier ones are client-supplied.
export function clientAddress(c: Context<AppEnv>, trustProxy: boolean): string {
    if (trustProxy) {
        const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
        if (forwarded) return forwarded;
    }
    try {
        return getConnInfo(c).remote.address ?? "unknown";
    } catch {
        return "unknown";
    }
}

/** Fixed-window, in-memory rate limiter; responds 429 with Retry-After when exceeded. */
export function rateLimit({ windowMs, max, trustProxy = false, keyBy }: RateLimitOptions) {
    const windows = new Map<string, Window>();

    const sweep = (now: number) => {
        for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
    };
    setInterval(() => sweep(Date.now()), windowMs).unref();

    return createMiddleware<AppEnv>(async (c, next) => {
        const key = keyBy?.(c) ?? clientAddress(c, trustProxy);
        const now = Date.now();

        let current = windows.get(key);
        if (!current || current.resetAt <= now) {
            if (windows.size >= MAX_KEYS) sweep(now);
            if (windows.size >= MAX_KEYS) windows.delete(windows.keys().next().value!);
            current = { count: 0, resetAt: now + windowMs };
            windows.set(key, current);
        }
        current.count += 1;

        c.header("RateLimit-Limit", String(max));
        c.header("RateLimit-Remaining", String(Math.max(0, max - current.count)));

        if (current.count > max) {
            const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
            c.header("Retry-After", String(retryAfter));
            throw new RateLimitError(retryAfter);
        }
        await next();
    });
}
