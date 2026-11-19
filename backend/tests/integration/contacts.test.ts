import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { FakeGmail } from "../helpers/fake-gmail.js";
import { Client } from "../helpers/http.js";
import { ADMIN, createTestStack, type TestStack } from "../helpers/test-stack.js";

const ENV = {
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};

let stack: TestStack;
let gmail: FakeGmail;

before(async () => {
    gmail = new FakeGmail();
    stack = await createTestStack(ENV, { gmailOAuth: gmail.oauth, gmailApi: gmail.factory });
});
beforeEach(async () => {
    await stack.reset();
    Object.assign(gmail, new FakeGmail());
});
after(() => stack.stop());

async function connectedAdmin() {
    const c = new Client(stack);
    await c.login(ADMIN.email, ADMIN.password);
    const { body } = await c.get("/mailbox/connect");
    const state = new URL(body.url as string).searchParams.get("state") ?? "";
    await c.get(`/mailbox/oauth/callback?code=good&state=${encodeURIComponent(state)}`);
    return c;
}

const send = (c: Client, to: string, subject = "Dynarock for your campus") =>
    c.post("/emails/send", { to: [to], subject, html: "<p>Hello</p>" });

async function findContact(c: Client, email: string) {
    const list = await c.get(`/contacts?q=${encodeURIComponent(email)}`);
    return list.body.items.find((x: { email: string }) => x.email === email);
}

describe("contacts from email", () => {
    it("creates the contact on send, links the college by domain, and moves the stage forward", async () => {
        const c = await connectedAdmin();
        const org = await c.post("/organizations", {
            name: "XYZ Institute of Technology",
            type: "engineering_college",
            domain: "https://www.XYZ.edu.in/about",
        });
        assert.equal(org.status, 201, JSON.stringify(org.body));
        assert.equal(org.body.domain, "xyz.edu.in");

        const sent = await send(c, "principal@xyz.edu.in");
        let contact = await findContact(c, "principal@xyz.edu.in");
        assert.equal(contact.stage, "contacted");
        assert.equal(contact.source, "compose");
        assert.equal(contact.organization.name, "XYZ Institute of Technology");
        assert.ok(contact.lastContactedAt);
        assert.ok(contact.ownerId, "the sender becomes the owner");

        const thread = (await c.get(`/threads/${sent.body.threadId}`)).body;
        assert.deepEqual(thread.thread.contactIds, [contact.id]);
        assert.equal(thread.thread.organizationId, org.body.id);
        assert.equal(thread.contacts[0].email, "principal@xyz.edu.in");

        const ours = [...gmail.messages.values()][0]!;
        gmail.deliver({
            from: "Dr. Meera Rao <principal@xyz.edu.in>",
            subject: "Re: Dynarock for your campus",
            text: "Interested",
            threadId: ours.threadId,
        });
        await c.post("/mailbox/sync");
        contact = await findContact(c, "principal@xyz.edu.in");
        assert.equal(contact.stage, "replied");
        assert.equal(contact.name, "Dr. Meera Rao", "name filled from the reply");
        assert.ok(contact.lastRepliedAt);

        const detail = (await c.get(`/contacts/${contact.id}`)).body;
        assert.equal(detail.threads.length, 1);
        const actions = detail.activities.map((a: { action: string }) => a.action);
        for (const a of ["contact.created", "contact.stage_changed", "email.sent", "email.received"]) {
            assert.ok(actions.includes(a), `timeline should include ${a}: ${actions.join(", ")}`);
        }
    });

    it("never moves a stage backwards automatically", async () => {
        const c = await connectedAdmin();
        const sent = await send(c, "dean@uni.ac.in");
        const contact = await findContact(c, "dean@uni.ac.in");
        await c.patch(`/contacts/${contact.id}`, { stage: "demo_scheduled" });

        const ours = [...gmail.messages.values()][0]!;
        gmail.deliver({ from: "dean@uni.ac.in", subject: "Re: x", text: "See you then", threadId: ours.threadId });
        await c.post("/mailbox/sync");
        await c.post("/emails/send", {
            mode: "reply",
            threadId: sent.body.threadId,
            to: ["dean@uni.ac.in"],
            html: "<p>ok</p>",
        });
        assert.equal((await findContact(c, "dean@uni.ac.in")).stage, "demo_scheduled");
    });

    it("doesn't link personal email addresses to a college", async () => {
        const c = await connectedAdmin();
        assert.equal((await c.post("/organizations", { name: "Gmail?", domain: "gmail.com" })).status, 422);
        await send(c, "someone@gmail.com");
        assert.equal((await findContact(c, "someone@gmail.com")).organization, null);
    });

    it("links existing contacts when a college with their domain is added later", async () => {
        const c = await connectedAdmin();
        const sent = await send(c, "registrar@abc.edu.in");
        const org = await c.post("/organizations", {
            name: "ABC University",
            type: "university",
            domain: "abc.edu.in",
        });
        assert.equal(org.body.contactCount, 1);

        const detail = (await c.get(`/organizations/${org.body.id}`)).body;
        assert.equal(detail.contacts[0].email, "registrar@abc.edu.in");
        assert.equal(detail.threads[0].id, sent.body.threadId);
        assert.equal((await c.post("/organizations", { name: "Dup", domain: "abc.edu.in" })).status, 409);
    });
});

describe("managing contacts", () => {
    it("creates contacts by hand, refuses duplicates and requires a reason for Lost", async () => {
        const c = await connectedAdmin();
        const created = await c.post("/contacts", {
            email: "IT.Head@College.edu.in",
            name: "Ravi Iyer",
            role: "it_head",
            designation: "Head of IT",
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        assert.equal(created.body.email, "it.head@college.edu.in");
        assert.equal(created.body.stage, "new");
        assert.equal((await c.post("/contacts", { email: "it.head@college.edu.in" })).status, 409);

        const noReason = await c.patch(`/contacts/${created.body.id}`, { stage: "lost" });
        assert.equal(noReason.status, 422);
        const lost = await c.patch(`/contacts/${created.body.id}`, { stage: "lost", lostReason: "Chose another ERP" });
        assert.equal(lost.body.stage, "lost");

        const timeline = (await c.get(`/contacts/${created.body.id}`)).body.activities;
        const change = timeline.find((a: { action: string }) => a.action === "contact.stage_changed");
        assert.deepEqual(change.meta, { from: "new", to: "lost", reason: "Chose another ERP" });
    });

    it("blocks emailing unsubscribed or do-not-contact people", async () => {
        const c = await connectedAdmin();
        const created = await c.post("/contacts", { email: "stop@college.edu.in" });
        await c.patch(`/contacts/${created.body.id}`, { status: "do_not_contact" });
        const res = await send(c, "stop@college.edu.in");
        assert.equal(res.status, 409);
        assert.match(res.body.error.details.reasons[0], /do not contact/);
        assert.equal(gmail.sent.length, 0);
    });

    it("groups contacts by stage for the pipeline and filters the list", async () => {
        const c = await connectedAdmin();
        await c.post("/contacts", { email: "a@one.edu.in", stage: "proposal" });
        await c.post("/contacts", { email: "b@two.edu.in", stage: "proposal" });
        await c.post("/contacts", { email: "c@three.edu.in" });

        const pipeline = (await c.get("/pipeline")).body;
        const proposal = pipeline.stages.find((s: { stage: string }) => s.stage === "proposal");
        assert.equal(proposal.total, 2);
        assert.equal(pipeline.stages.length, 9);

        const filtered = (await c.get("/contacts?stage=new")).body;
        assert.equal(filtered.total, 1);
        assert.equal(filtered.items[0].email, "c@three.edu.in");
    });

    it("links conversations that existed before contacts did", async () => {
        const c = await connectedAdmin();
        gmail.deliver({ from: "Old Lead <old@legacy.edu.in>", subject: "Hello", text: "Hi" });
        await c.post("/mailbox/sync");
        const models = stack.container.database.models;
        await models.Contact.deleteMany({});
        await models.Thread.updateMany({}, { $set: { contactIds: [] } });

        const linked = await stack.container.services.contacts.backfill("sales@dynarock.in");
        assert.equal(linked, 1);
        const contact = await findContact(c, "old@legacy.edu.in");
        assert.equal(contact.stage, "replied");
        assert.equal(contact.name, "Old Lead");
    });
});
