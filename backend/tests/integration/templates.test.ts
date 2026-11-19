import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { fillTemplate } from "../../src/modules/templates/templates.js";
import { Client, tokenFrom } from "../helpers/http.js";
import { ADMIN, createTestStack, type TestStack } from "../helpers/test-stack.js";

let stack: TestStack;
before(async () => {
    stack = await createTestStack();
});
beforeEach(async () => {
    await stack.reset();
    await stack.container.services.templates.seedIfEmpty();
});
after(() => stack.stop());

async function admin() {
    const c = new Client(stack);
    await c.login(ADMIN.email, ADMIN.password);
    return c;
}

describe("templates", () => {
    it("starts with four starter templates", async () => {
        const list = (await (await admin()).get("/templates")).body;
        assert.equal(list.length, 4);
        assert.ok(list.some((t: { name: string }) => t.name === "Intro to a principal"));
    });

    it("fills in the contact, college and sender, and counts the use", async () => {
        const c = await admin();
        const org = await c.post("/organizations", { name: "XYZ Institute", domain: "xyz.edu.in" });
        await c.post("/contacts", {
            email: "principal@xyz.edu.in",
            name: "Dr. Meera Rao",
            organizationId: org.body.id,
        });
        const intro = (await c.get("/templates")).body.find((t: { name: string }) => t.name === "Intro to a principal");

        const res = await c.post(`/templates/${intro.id}/render`, { to: ["principal@xyz.edu.in"] });
        assert.equal(res.status, 200);
        assert.equal(res.body.subject, "One platform for XYZ Institute");
        assert.match(res.body.html, /<p>Dear Meera,<\/p>/);
        assert.match(res.body.html, /I'm Asha from Dynarock/);
        assert.equal((await c.get("/templates")).body.find((t: { id: string }) => t.id === intro.id).usageCount, 1);

        const unknown = await c.post(`/templates/${intro.id}/render`, { to: ["new@other.example"] });
        assert.equal(unknown.body.subject, "One platform for your institution");
        assert.match(unknown.body.html, /Dear there,/);
    });

    it("escapes values put into HTML", () => {
        assert.equal(
            fillTemplate("<p>Hi {{contact.name}}</p>", { "contact.name": "<b>Eve</b>" }, true),
            "<p>Hi &lt;b&gt;Eve&lt;/b&gt;</p>",
        );
    });

    it("lets people edit their own templates; admins edit all", async () => {
        const a = await admin();
        const inv = await a.post("/users/invite", { name: "Ravi Rep", email: "ravi@dynarock.in", role: "sales_rep" });
        const rep = new Client(stack);
        await rep.post("/auth/accept-invite", { token: tokenFrom(inv.body.inviteUrl), password: "rep-password-1" });

        const mine = await rep.post("/templates", {
            name: "My intro",
            category: "intro",
            subject: "Hi",
            html: "<p>Hello</p>",
        });
        assert.equal(mine.status, 201);
        assert.equal((await rep.patch(`/templates/${mine.body.id}`, { name: "Renamed" })).body.name, "Renamed");

        const starter = (await rep.get("/templates")).body.find((t: { name: string }) => t.name === "Demo invitation");
        assert.equal((await rep.patch(`/templates/${starter.id}`, { name: "x" })).status, 409);
        assert.equal((await a.patch(`/templates/${starter.id}`, { name: "Demo invite" })).status, 200);
        assert.equal((await a.del(`/templates/${mine.body.id}`)).status, 200);
    });
});
