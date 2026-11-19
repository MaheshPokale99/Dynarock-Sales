import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { FakeGmail } from "../helpers/fake-gmail.js";
import { Client, tokenFrom } from "../helpers/http.js";
import { ADMIN, createTestStack, type TestStack } from "../helpers/test-stack.js";

const GMAIL_ENV = {
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};
const PRINCIPAL = "principal@college.edu.in";

let stack: TestStack;
let gmail: FakeGmail;

before(async () => {
    gmail = new FakeGmail();
    stack = await createTestStack(GMAIL_ENV, { gmailOAuth: gmail.oauth, gmailApi: gmail.factory });
});
beforeEach(async () => {
    await stack.reset();
    Object.assign(gmail, new FakeGmail());
});
after(() => stack.stop());

async function admin() {
    const c = new Client(stack);
    await c.login(ADMIN.email, ADMIN.password);
    return c;
}

async function connect(c: Client) {
    const { body } = await c.get("/mailbox/connect");
    const state = new URL(body.url as string).searchParams.get("state") ?? "";
    return c.get(`/mailbox/oauth/callback?code=good&state=${encodeURIComponent(state)}`);
}

async function rep(a: Client) {
    const inv = await a.post("/users/invite", { name: "Ravi Kumar", email: "ravi@dynarock.in", role: "sales_rep" });
    const c = new Client(stack);
    await c.post("/auth/accept-invite", { token: tokenFrom(inv.body.inviteUrl), password: "rep-password-1" });
    return { client: c, id: inv.body.user.id as string };
}

async function connectedTeam() {
    const a = await admin();
    await connect(a);
    return { admin: a, ...(await rep(a)) };
}

describe("connecting the mailbox", () => {
    it("connects sales@ through Google and reports who connected it", async () => {
        const a = await admin();
        assert.equal((await a.get("/mailbox")).body.status, "disconnected");

        const res = await connect(a);
        assert.equal(res.status, 302);
        assert.equal(res.headers.get("location"), "http://localhost:3000/settings?mailbox=connected");

        const status = (await a.get("/mailbox")).body;
        assert.equal(status.status, "connected");
        assert.equal(status.connectedBy, ADMIN.name);

        const stored = await stack.container.database.models.Mailbox.findOne().lean();
        assert.ok(stored?.auth?.refreshTokenEnc);
        assert.ok(!JSON.stringify(stored).includes("refresh-1"), "tokens must be encrypted at rest");
    });

    it("refuses any account other than the shared mailbox", async () => {
        gmail.profileEmail = "someone@gmail.com";
        const res = await connect(await admin());
        assert.match(res.headers.get("location") ?? "", /mailbox=error&reason=wrong_account$/);
        assert.deepEqual(gmail.revoked, ["refresh-1"]);
    });

    it("rejects a forged state and non-admins", async () => {
        const a = await admin();
        const res = await a.get("/mailbox/oauth/callback?code=good&state=forged.state");
        assert.match(res.headers.get("location") ?? "", /mailbox=error/);
        const { client } = await rep(a);
        assert.equal((await client.get("/mailbox/connect")).status, 403);
    });

    it("blocks sending until the mailbox is connected", async () => {
        const res = await (await admin()).post("/emails/send", { to: [PRINCIPAL], subject: "Hi", html: "<p>Hi</p>" });
        assert.equal(res.status, 409);
    });

    it("asks for a reconnect when Google revokes access", async () => {
        const { admin: a } = await connectedTeam();
        await stack.container.database.models.Mailbox.updateOne({}, { $set: { "auth.expiresAt": new Date(0) } });
        gmail.failRefresh = "invalid_grant";
        const res = await a.post("/emails/send", { to: [PRINCIPAL], subject: "Hi", html: "<p>Hi</p>" });
        assert.equal(res.status, 409);
        assert.match(res.body.error.message, /reconnect/);
        assert.equal((await a.get("/mailbox")).body.status, "error");
    });
});

describe("sending and receiving", () => {
    it("sends a new email, receives the reply, and replies in the same conversation", async () => {
        const { client, id: repId } = await connectedTeam();

        const sent = await client.post("/emails/send", {
            to: [PRINCIPAL],
            subject: "Dynarock for your campus",
            html: "<p>Hello Dr. Rao</p>",
        });
        assert.equal(sent.status, 201, JSON.stringify(sent.body));
        const threadId = sent.body.threadId as string;
        assert.equal(gmail.sent[0]?.parsed.from?.text, '"Ravi Kumar (Dynarock)" <sales@dynarock.in>');

        let detail = (await client.get(`/threads/${threadId}`)).body;
        assert.equal(detail.thread.state, "awaiting_reply");
        assert.equal(detail.messages[0].sentByUserId, repId);
        assert.equal(detail.messages[0].origin, "app_compose");
        assert.deepEqual(detail.thread.senderIds, [repId]);

        const ours = [...gmail.messages.values()][0]!;
        const rfcId = ours.payload?.headers?.find((h) => h.name === "Message-ID")?.value ?? "";
        gmail.deliver({
            from: "Dr. Meera Rao <principal@college.edu.in>",
            subject: "Re: Dynarock for your campus",
            text: "Can you share pricing for 2,000 students?",
            threadId: ours.threadId,
            inReplyTo: rfcId,
        });
        const sync = await client.post("/mailbox/sync");
        assert.equal(sync.body.added, 1);

        detail = (await client.get(`/threads/${threadId}`)).body;
        assert.equal(detail.thread.state, "needs_reply");
        assert.equal(detail.thread.unread, true);
        assert.deepEqual(detail.thread.participants, [{ email: PRINCIPAL, name: "Dr. Meera Rao" }]);
        assert.equal(detail.messages.length, 2);
        assert.equal(detail.messages[1].direction, "inbound");

        const inbox = (await client.get("/threads?folder=needs_reply")).body;
        assert.equal(inbox.threads.length, 1);
        assert.equal(inbox.counts.needs_reply, 1);
        assert.deepEqual((await client.get("/threads/counts")).body, { needs_reply: 1, unread: 1 });

        const reply = await client.post("/emails/send", {
            mode: "reply",
            threadId,
            to: [PRINCIPAL],
            subject: "",
            html: "<p>Sure, attached.</p>",
        });
        assert.equal(reply.status, 201);
        const last = gmail.sent.at(-1)!;
        assert.equal(last.threadId, ours.threadId);
        assert.equal(last.parsed.subject, "Re: Dynarock for your campus");
        const inboundId =
            detail.messages[1] &&
            [...gmail.messages.values()][1]?.payload?.headers?.find((h) => h.name === "Message-ID")?.value;
        assert.equal(last.parsed.inReplyTo, inboundId);

        detail = (await client.get(`/threads/${threadId}`)).body;
        assert.equal(detail.thread.state, "awaiting_reply");
        assert.equal(detail.thread.unread, false);
        assert.equal(detail.thread.messageCount, 3);

        assert.equal((await client.post("/mailbox/sync")).body.added, 0, "sync must not duplicate sent mail");
    });

    it("keeps Bcc recipients and attachments", async () => {
        const { client } = await connectedTeam();
        const file = await client.upload("brochure.txt", "Dynarock modules");
        assert.equal(file.status, 201);

        const sent = await client.post("/emails/send", {
            to: [PRINCIPAL],
            bcc: ["director@college.edu.in"],
            subject: "Brochure",
            html: "<p>See attached</p>",
            attachmentFileIds: [file.body.id],
        });
        assert.equal(sent.status, 201, JSON.stringify(sent.body));
        assert.match(
            String(gmail.sent[0]?.parsed.bcc ? (gmail.sent[0].parsed.bcc as { text: string }).text : ""),
            /director/,
        );

        const detail = (await client.get(`/threads/${sent.body.threadId}`)).body;
        assert.equal(detail.messages[0].attachments[0].filename, "brochure.txt");
        const dl = await client.get(`/messages/${detail.messages[0].id}/attachments/0`);
        assert.equal(dl.status, 200);
        assert.equal(await dl.raw.text(), "Dynarock modules");
        assert.match(dl.headers.get("content-disposition") ?? "", /attachment; filename="brochure.txt"/);
    });

    it("skips spam, survives an expired history and marks read in Gmail", async () => {
        const { client } = await connectedTeam();
        gmail.deliver({ from: "spam@bad.example", subject: "WIN", labels: ["SPAM"] });
        const real = gmail.deliver({ from: "Registrar <reg@uni.ac.in>", subject: "Demo request", text: "Please call" });
        assert.equal((await client.post("/mailbox/sync")).body.added, 1);

        gmail.expireHistory = true;
        gmail.deliver({ from: "dean@uni.ac.in", subject: "Another", text: "Hello" });
        assert.equal((await client.post("/mailbox/sync")).body.added, 1);

        const list = (await client.get("/threads?q=registrar")).body;
        assert.equal(list.threads.length, 1);
        const res = await client.patch(`/threads/${list.threads[0].id}`, { unread: false });
        assert.equal(res.body.unread, false);
        await new Promise((r) => setTimeout(r, 50));
        assert.deepEqual(gmail.labelChanges, [{ id: real.id, remove: ["UNREAD"] }]);

        const closed = await client.patch(`/threads/${list.threads[0].id}`, { closed: true });
        assert.equal(closed.body.state, "closed");
    });

    it("suggests recipients from past conversations", async () => {
        const { client } = await connectedTeam();
        gmail.deliver({ from: "Dr. Meera Rao <principal@college.edu.in>", subject: "Hi", text: "x" });
        await client.post("/mailbox/sync");
        const res = await client.get("/recipients?q=meera");
        assert.deepEqual(res.body, [{ email: PRINCIPAL, name: "Dr. Meera Rao" }]);
    });
});

describe("sending limits and safety", () => {
    it("caps recipients per email and emails per day", async () => {
        const { client } = await connectedTeam();
        const many = (p: string) => Array.from({ length: 30 }, (_, i) => `${p}${i}@college.edu.in`);
        const tooMany = await client.post("/emails/send", { to: many("a"), cc: many("b"), html: "<p>x</p>" });
        assert.equal(tooMany.status, 422);
        assert.match(tooMany.body.error.message, /at most 50/);

        const limits = stack.container.config.limits;
        const saved = { ...limits };
        try {
            limits.userDailySends = 1;
            assert.equal((await client.post("/emails/send", { to: [PRINCIPAL], html: "<p>1</p>" })).status, 201);
            const blocked = await client.post("/emails/send", { to: [PRINCIPAL], html: "<p>2</p>" });
            assert.equal(blocked.status, 429);
            assert.equal(blocked.body.error.code, "USER_DAILY_LIMIT");
            limits.userDailySends = 100;
            limits.mailboxDailySends = 1;
            const shared = await client.post("/emails/send", { to: [PRINCIPAL], html: "<p>3</p>" });
            assert.equal(shared.body.error.code, "MAILBOX_DAILY_LIMIT");
        } finally {
            Object.assign(limits, saved);
        }
    });

    it("only lets the uploader (or an admin) use or download a file", async () => {
        const { admin: a, client } = await connectedTeam();
        const other = new Client(stack);
        const inv = await a.post("/users/invite", { name: "Priya", email: "priya@dynarock.in", role: "sales_rep" });
        await other.post("/auth/accept-invite", { token: tokenFrom(inv.body.inviteUrl), password: "rep-password-2" });

        const file = await client.upload("quote.txt", "Private quote");
        assert.equal((await other.get(`/files/${file.body.id}`)).status, 404);
        assert.equal((await a.get(`/files/${file.body.id}`)).status, 200);
        const stolen = await other.post("/emails/send", {
            to: [PRINCIPAL],
            html: "<p>x</p>",
            attachmentFileIds: [file.body.id],
        });
        assert.equal(stolen.status, 404);
        assert.equal(gmail.sent.length, 0);
    });

    it("treats mail that only claims to be from sales@ as inbound", async () => {
        const { client } = await connectedTeam();
        gmail.deliver({ from: `Sales <${gmail.address}>`, subject: "Reset your password", text: "Click here" });
        await client.post("/mailbox/sync");
        const message = await stack.container.database.models.Message.findOne({
            subject: "Reset your password",
        }).lean();
        assert.equal(message?.direction, "inbound");
    });
});

describe("drafts", () => {
    it("autosaves drafts that only their author can see, and deletes them on send", async () => {
        const { admin: a, client } = await connectedTeam();
        const created = await client.post("/drafts", { to: ["princ"], subject: "Draft", html: "<p>wip</p>" });
        assert.equal(created.status, 201);
        const id = created.body.id as string;

        await client.patch(`/drafts/${id}`, { to: [PRINCIPAL] });
        assert.deepEqual((await client.get("/drafts")).body[0].to, [PRINCIPAL]);
        assert.equal((await a.get("/drafts")).body.length, 0);
        assert.equal((await a.patch(`/drafts/${id}`, { subject: "x" })).status, 404);

        await client.post("/emails/send", { to: [PRINCIPAL], subject: "Draft", html: "<p>done</p>", draftId: id });
        assert.equal((await client.get("/drafts")).body.length, 0);
    });
});
