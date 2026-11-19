import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "dotenv";
import { ENV_KEYS, loadConfig } from "../../src/config/env.js";

const example = () => parse(readFileSync(new URL("../../.env.example", import.meta.url)));

describe("loadConfig", () => {
    it("treats empty variables as not set", () => {
        const config = loadConfig({ GEMINI_API_KEY: "", COOKIE_SECURE: "", PORT: "" });
        assert.equal(config.gemini.enabled, false);
        assert.equal(config.auth.cookieSecure, false);
        assert.equal(config.port, 5000);
    });

    it("loads the shipped .env.example unchanged", () => {
        const config = loadConfig(example());
        assert.equal(config.mongoUri, "mongodb://127.0.0.1:27017/dynarock_sales");
        assert.equal(config.auth.bootstrapAdmin?.email, "admin@dynarock.in");
        assert.equal(config.appUrl, "http://localhost:3000");
    });

    it(".env.example lists every setting the code reads, and nothing else", () => {
        assert.deepEqual(Object.keys(example()).sort(), [...ENV_KEYS].sort());
    });

    it("uses secure cookies in production by default", () => {
        assert.equal(loadConfig({ NODE_ENV: "production" }).auth.cookieSecure, true);
        assert.equal(loadConfig({ NODE_ENV: "production", COOKIE_SECURE: "false" }).auth.cookieSecure, false);
    });

    it("requires the bootstrap admin email and password together", () => {
        assert.throws(() => loadConfig({ BOOTSTRAP_ADMIN_EMAIL: "a@b.in" }), /must be set together/);
        assert.throws(() => loadConfig({ BOOTSTRAP_ADMIN_EMAIL: "a@b.in", BOOTSTRAP_ADMIN_PASSWORD: "short" }), /8/);
    });

    it("rejects invalid values with a readable message", () => {
        assert.throws(() => loadConfig({ PORT: "abc" }), /Invalid environment configuration[\s\S]*PORT/);
        assert.throws(() => loadConfig({ TRUST_PROXY: "yes" }), /TRUST_PROXY/);
    });
});
