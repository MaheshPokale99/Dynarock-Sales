import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { loadConfig } from "../../src/config/env.js";
import { createTestStack, type TestStack } from "../helpers/test-stack.js";

const SECRET = "test-cron-secret-0123456789abcdef0123";

describe("POST /internal/tick", () => {
    let stack: TestStack;
    before(async () => {
        stack = await createTestStack({ WORKER_MODE: "cron", CRON_SECRET: SECRET });
    });
    after(() => stack.stop());

    const tick = (headers: Record<string, string> = {}) =>
        stack.app.request("/internal/tick", { method: "POST", headers });

    it("rejects calls without the secret", async () => {
        assert.equal((await tick()).status, 401);
        assert.equal((await tick({ "X-Cron-Secret": "wrong" })).status, 401);
    });

    it("runs one pass with the secret", async () => {
        const res = await tick({ "X-Cron-Secret": SECRET });
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { synced: 0, sent: 0 });
    });
});

describe("worker mode config", () => {
    it("is off unless WORKER_MODE=cron", async () => {
        const stack = await createTestStack({ CRON_SECRET: SECRET });
        try {
            const res = await stack.app.request("/internal/tick", {
                method: "POST",
                headers: { "X-Cron-Secret": SECRET },
            });
            assert.equal(res.status, 404);
        } finally {
            await stack.stop();
        }
    });

    it("requires CRON_SECRET in cron mode", () => {
        assert.throws(() => loadConfig({ WORKER_MODE: "cron" }), /CRON_SECRET is required/);
        assert.throws(() => loadConfig({ WORKER_MODE: "cron", CRON_SECRET: "short" }), /CRON_SECRET/);
    });
});
