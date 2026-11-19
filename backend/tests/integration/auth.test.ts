import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Client, tokenFrom } from "../helpers/http.js";
import { ADMIN, createTestStack, type TestStack } from "../helpers/test-stack.js";

let stack: TestStack;
before(async () => {
    stack = await createTestStack();
});
beforeEach(() => stack.reset());
after(() => stack.stop());

describe("sign in", () => {
    it("signs in the bootstrap admin with an httpOnly session cookie", async () => {
        const client = new Client(stack);
        const res = await client.post("/auth/login", { email: "ADMIN@dynarock.in ", password: ADMIN.password });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.email, ADMIN.email);
        assert.equal(res.body.user.role, "admin");
        assert.equal(res.body.user.passwordHash, undefined);
        assert.match(res.headers.get("set-cookie") ?? "", /ds_session=.+HttpOnly.*SameSite=Lax/i);

        const me = await client.get("/auth/me");
        assert.equal(me.status, 200);
        assert.equal(me.body.user.name, ADMIN.name);
    });

    it("gives the same answer for a wrong password and an unknown email", async () => {
        const client = new Client(stack);
        const wrong = await client.post("/auth/login", { email: ADMIN.email, password: "nope-nope" });
        const unknown = await client.post("/auth/login", { email: "ghost@dynarock.in", password: "nope-nope" });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.equal(wrong.body.error.message, unknown.body.error.message);
    });

    it("rejects protected routes without a session and after sign out", async () => {
        const client = new Client(stack);
        assert.equal((await client.get("/auth/me")).status, 401);
        await client.login(ADMIN.email, ADMIN.password);
        const kept = client.cookie;
        await client.post("/auth/logout");
        client.cookie = kept;
        assert.equal((await client.get("/auth/me")).status, 401);
    });

    it("stores only a hash of the session token", async () => {
        const client = new Client(stack);
        await client.login(ADMIN.email, ADMIN.password);
        const token = client.cookie.split("=")[1] ?? "";
        const sessions = await stack.container.database.models.Session.find().lean();
        assert.equal(sessions.length, 1);
        assert.notEqual(sessions[0]?.tokenHash, token);
    });
});

describe("invitations", () => {
    async function invite(admin: Client, email = "ravi@dynarock.in", role = "sales_rep") {
        const res = await admin.post("/users/invite", { name: "Ravi Rep", email, role });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        return res.body as { user: { id: string }; inviteUrl: string };
    }

    it("lets an invited person set a password and sign straight in", async () => {
        const admin = new Client(stack);
        await admin.login(ADMIN.email, ADMIN.password);
        const { inviteUrl, user } = await invite(admin);
        assert.match(inviteUrl, /^http:\/\/localhost:3000\/accept-invite\?token=/);

        const team = await admin.get("/users");
        const row = team.body.find((u: { id: string }) => u.id === user.id);
        assert.equal(row.status, "invited");
        assert.equal(row.invite.expired, false);

        const rep = new Client(stack);
        const details = await rep.get(`/auth/invites/${tokenFrom(inviteUrl)}`);
        assert.equal(details.status, 200);
        assert.equal(details.body.email, "ravi@dynarock.in");

        const accepted = await rep.post("/auth/accept-invite", {
            token: tokenFrom(inviteUrl),
            password: "rep-password-1",
        });
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.user.status, "active");
        assert.equal((await rep.get("/auth/me")).body.user.role, "sales_rep");

        const again = await new Client(stack).post("/auth/accept-invite", {
            token: tokenFrom(inviteUrl),
            password: "another-pass",
        });
        assert.equal(again.status, 404);
    });

    it("refuses a duplicate invite and invalidates the old link on resend", async () => {
        const admin = new Client(stack);
        await admin.login(ADMIN.email, ADMIN.password);
        const first = await invite(admin);
        const dup = await admin.post("/users/invite", { name: "Ravi", email: "RAVI@dynarock.in", role: "sales_rep" });
        assert.equal(dup.status, 409);

        const resent = await admin.post(`/users/${first.user.id}/resend-invite`);
        assert.equal(resent.status, 200);
        assert.equal((await new Client(stack).get(`/auth/invites/${tokenFrom(first.inviteUrl)}`)).status, 404);
        assert.equal((await new Client(stack).get(`/auth/invites/${tokenFrom(resent.body.inviteUrl)}`)).status, 200);
    });

    it("only lets admins manage the team", async () => {
        const admin = new Client(stack);
        await admin.login(ADMIN.email, ADMIN.password);
        const { inviteUrl } = await invite(admin);
        const rep = new Client(stack);
        await rep.post("/auth/accept-invite", { token: tokenFrom(inviteUrl), password: "rep-password-1" });

        assert.equal((await rep.get("/users")).status, 200);
        const res = await rep.post("/users/invite", { name: "X", email: "x@dynarock.in", role: "admin" });
        assert.equal(res.status, 403);
    });
});

describe("managing users", () => {
    async function teamWithRep() {
        const admin = new Client(stack);
        await admin.login(ADMIN.email, ADMIN.password);
        const inv = await admin.post("/users/invite", { name: "Ravi", email: "ravi@dynarock.in", role: "sales_rep" });
        const rep = new Client(stack);
        await rep.post("/auth/accept-invite", { token: tokenFrom(inv.body.inviteUrl), password: "rep-password-1" });
        const adminId = (await admin.get("/auth/me")).body.user.id as string;
        return { admin, rep, repId: inv.body.user.id as string, adminId };
    }

    it("signs a disabled user out everywhere and blocks sign in", async () => {
        const { admin, rep, repId } = await teamWithRep();
        const res = await admin.patch(`/users/${repId}`, { status: "disabled" });
        assert.equal(res.status, 200);
        assert.equal((await rep.get("/auth/me")).status, 401);
        const login = await new Client(stack).post("/auth/login", {
            email: "ravi@dynarock.in",
            password: "rep-password-1",
        });
        assert.equal(login.status, 403);

        await admin.patch(`/users/${repId}`, { status: "active" });
        await new Client(stack).login("ravi@dynarock.in", "rep-password-1");
    });

    it("never leaves the team without an active admin", async () => {
        const { admin, adminId, repId } = await teamWithRep();
        assert.equal((await admin.patch(`/users/${adminId}`, { role: "sales_rep" })).status, 409);
        assert.equal((await admin.patch(`/users/${adminId}`, { status: "disabled" })).status, 409);

        await admin.patch(`/users/${repId}`, { role: "admin" });
        const repAsAdmin = new Client(stack);
        await repAsAdmin.login("ravi@dynarock.in", "rep-password-1");
        assert.equal((await repAsAdmin.patch(`/users/${adminId}`, { role: "sales_rep" })).status, 200);
        assert.equal((await repAsAdmin.patch(`/users/${repId}`, { role: "sales_rep" })).status, 409);
    });

    it("changes the password and signs out other devices only", async () => {
        const { rep } = await teamWithRep();
        const laptop = new Client(stack);
        await laptop.login("ravi@dynarock.in", "rep-password-1");

        const wrong = await rep.post("/auth/change-password", { currentPassword: "bad", newPassword: "new-pass-123" });
        assert.equal(wrong.status, 422);
        const ok = await rep.post("/auth/change-password", {
            currentPassword: "rep-password-1",
            newPassword: "new-pass-123",
        });
        assert.equal(ok.status, 200);
        assert.equal((await rep.get("/auth/me")).status, 200);
        assert.equal((await laptop.get("/auth/me")).status, 401);
        await new Client(stack).login("ravi@dynarock.in", "new-pass-123");
    });

    it("updates the profile and signature", async () => {
        const { rep } = await teamWithRep();
        const res = await rep.patch("/auth/me", { name: "Ravi Kumar", signatureHtml: "<p>Ravi, Dynarock</p>" });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.name, "Ravi Kumar");
        assert.equal(res.body.user.signatureHtml, "<p>Ravi, Dynarock</p>");
    });

    it("rejects state-changing requests from other sites", async () => {
        const res = await stack.app.request("/api/v1/auth/login", {
            method: "POST",
            headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
            body: "email=a&password=b",
        });
        assert.equal(res.status, 403);
    });
});
