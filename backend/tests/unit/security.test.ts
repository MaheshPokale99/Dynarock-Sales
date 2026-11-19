import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { AppEnv } from "../../src/common/http/app-env.js";
import { errorHandler } from "../../src/common/middleware/error-handler.js";
import { rateLimit } from "../../src/common/middleware/rate-limit.js";
import { redactPath } from "../../src/common/middleware/request-context.js";
import { loadConfig } from "../../src/config/env.js";
import { parseAuthResult } from "../../src/integrations/gmail/mime.js";
import { canonicalEmail } from "../../src/modules/contacts/contacts.repository.js";

const PROD = { NODE_ENV: "production", BOOTSTRAP_ADMIN_EMAIL: "admin@dynarock.in" };

describe("production admin password", () => {
    it("refuses the example password and short ones", () => {
        assert.throws(() => loadConfig({ ...PROD, BOOTSTRAP_ADMIN_PASSWORD: "change-me-now" }), /16 characters/);
        assert.throws(() => loadConfig({ ...PROD, BOOTSTRAP_ADMIN_PASSWORD: "only-12-char" }), /16 characters/);
        assert.doesNotThrow(() => loadConfig({ ...PROD, BOOTSTRAP_ADMIN_PASSWORD: "a-long-own-password-42" }));
    });
});

describe("rate limit behind a proxy", () => {
    it("keys on the last X-Forwarded-For entry, so a client can't rotate the first one", async () => {
        const app = new Hono<AppEnv>();
        app.use(rateLimit({ windowMs: 60_000, max: 1, trustProxy: true }));
        app.get("/", (c) => c.json({ ok: true }));
        app.onError(errorHandler);
        const hit = (spoofed: string) =>
            app.request("/", { headers: { "x-forwarded-for": `${spoofed}, 203.0.113.9` } });
        assert.equal((await hit("1.1.1.1")).status, 200);
        assert.equal((await hit("2.2.2.2")).status, 429);
    });
});

describe("request logs", () => {
    it("hide invite and unsubscribe tokens", () => {
        assert.equal(redactPath("/api/v1/auth/invites/abc123/x"), "/api/v1/auth/invites/[redacted]/x");
        assert.equal(redactPath("/u/token.sig"), "/u/[redacted]");
        assert.equal(redactPath("/api/v1/threads/1"), "/api/v1/threads/1");
    });
});

describe("Gmail authentication results", () => {
    it("reads Gmail's own verdict and ignores headers from anyone else", () => {
        assert.equal(parseAuthResult("mx.google.com; dkim=pass header.i=@x.in; spf=pass; dmarc=pass"), "pass");
        assert.equal(parseAuthResult("mx.google.com; spf=fail smtp.mailfrom=x.in; dmarc=fail (p=NONE)"), "fail");
        assert.equal(parseAuthResult("mx.google.com; spf=softfail smtp.mailfrom=x.in"), "fail");
        assert.equal(parseAuthResult("evil.example; dmarc=pass"), "unknown");
        assert.equal(parseAuthResult(undefined), "unknown");
    });
});

describe("canonicalEmail", () => {
    it("drops +tags and case", () => {
        assert.equal(canonicalEmail("Dean+News@ABC.edu.in"), "dean@abc.edu.in");
        assert.equal(canonicalEmail("dean@abc.edu.in"), "dean@abc.edu.in");
    });
});
