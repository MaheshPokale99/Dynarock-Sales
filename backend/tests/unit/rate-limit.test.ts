import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { AppEnv } from "../../src/common/http/app-env.js";
import { errorHandler } from "../../src/common/middleware/error-handler.js";
import { clientAddress, rateLimit } from "../../src/common/middleware/rate-limit.js";

const build = (max: number) => {
    const app = new Hono<AppEnv>();
    app.use(rateLimit({ windowMs: 60_000, max }));
    app.get("/", (c) => c.json({ ok: true }));
    app.onError(errorHandler);
    return app;
};

describe("rateLimit", () => {
    it("allows requests up to the limit and reports what remains", async () => {
        const app = build(2);
        const first = await app.request("/");
        assert.equal(first.status, 200);
        assert.equal(first.headers.get("RateLimit-Limit"), "2");
        assert.equal(first.headers.get("RateLimit-Remaining"), "1");
        assert.equal((await app.request("/")).status, 200);
    });

    it("answers 429 with Retry-After and the standard error body once exceeded", async () => {
        const app = build(1);
        await app.request("/");
        const blocked = await app.request("/");
        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
        const body = (await blocked.json()) as { error: { code: string } };
        assert.equal(body.error.code, "RATE_LIMITED");
    });
});

describe("clientAddress behind a proxy", () => {
    const address = async (headers: Record<string, string>) => {
        const app = new Hono<AppEnv>();
        app.get("/", (c) => c.text(clientAddress(c, true)));
        return (await app.request("/", { headers })).text();
    };

    it("uses the X-Client-IP the load balancer sets, ignoring client-supplied entries", async () => {
        const lb = { "X-Forwarded-For": "6.6.6.6, 203.0.113.9, 34.8.0.1", "X-Client-IP": "6.6.6.6, 203.0.113.9" };
        assert.equal(await address(lb), "203.0.113.9");
    });

    it("falls back to the last X-Forwarded-For entry", async () => {
        assert.equal(await address({ "X-Forwarded-For": "6.6.6.6, 203.0.113.9" }), "203.0.113.9");
    });
});
