import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { FakeAi } from "../helpers/fake-ai.js";
import { FakeGmail } from "../helpers/fake-gmail.js";
import { Client } from "../helpers/http.js";
import { ADMIN, createTestStack, type TestStack } from "../helpers/test-stack.js";

const DAY = 86_400_000;
const ENV = {
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    API_PUBLIC_URL: "https://api.sales.dynarock.in",
};
const CLIENT = "principal@xyz.edu.in";

let stack: TestStack;
let gmail: FakeGmail;
let ai: FakeAi;
const clock = { now: new Date() };

before(async () => {
    gmail = new FakeGmail();
    ai = new FakeAi();
    stack = await createTestStack(ENV, { gmailOAuth: gmail.oauth, gmailApi: gmail.factory, ai, now: () => clock.now });
});
beforeEach(async () => {
    await stack.reset();
    await stack.container.services.automation.seedDefaults();
    Object.assign(gmail, new FakeGmail());
    Object.assign(ai, new FakeAi());
    clock.now = new Date();
    gmail.now = () => clock.now.getTime();
});
after(() => stack.stop());

const automation = () => stack.container.services.automation;

// mailparser groups List-* headers under "list".
const unsubscribeUrl = (parsed: FakeGmail["sent"][number]["parsed"]) =>
    String((parsed.headers.get("list") as { unsubscribe?: { url?: string } } | undefined)?.unsubscribe?.url ?? "");
const later = (days: number) => {
    clock.now = new Date(clock.now.getTime() + days * DAY);
};

// Admin with the mailbox connected and a 24/7 send window, so tests don't depend on the real time of day.
async function setup() {
    const c = new Client(stack);
    await c.login(ADMIN.email, ADMIN.password);
    const { body } = await c.get("/mailbox/connect");
    const state = new URL(body.url as string).searchParams.get("state") ?? "";
    await c.get(`/mailbox/oauth/callback?code=good&state=${encodeURIComponent(state)}`);
    await c.patch("/automation/settings", {
        sendWindow: { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24, timezone: "Asia/Kolkata" },
    });
    const plan = (await c.get("/sequences")).body[0];
    return { c, planId: plan.id as string };
}

async function sendWithFollowUps(c: Client, planId: string) {
    const res = await c.post("/emails/send", {
        to: [CLIENT],
        subject: "Dynarock for XYZ",
        html: "<p>Hello</p>",
        followUp: { sequenceId: planId },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.threadId as string;
}

describe("follow-up plans", () => {
    it("starts with the standard three-step plan", async () => {
        const { c } = await setup();
        const plans = (await c.get("/sequences")).body;
        assert.equal(plans.length, 1);
        assert.equal(plans[0].name, "Standard follow-up");
        assert.deepEqual(
            plans[0].steps.map((s: { delayDays: number }) => s.delayDays),
            [3, 4, 7],
        );
        assert.equal((await c.get("/automation/settings")).body.defaultSequenceId, plans[0].id);
    });

    it("schedules an AI follow-up, sends it when due with an unsubscribe link, then queues the next step", async () => {
        const { c, planId } = await setup();
        const threadId = await sendWithFollowUps(c, planId);

        let state = (await c.get(`/threads/${threadId}/automation`)).body;
        assert.equal(state.enrollment.status, "active");
        assert.equal(state.enrollment.totalSteps, 3);
        const first = state.scheduled[0];
        assert.equal(first.step, 1);
        assert.equal(first.aiGenerated, true);
        assert.deepEqual(first.to, [CLIENT]);
        assert.equal(first.subject, "Re: Dynarock for XYZ");
        assert.ok(new Date(first.sendAt).getTime() - Date.now() > 2.9 * DAY, "first follow-up waits about 3 days");

        assert.equal(await automation().runDue(), 0, "nothing is due yet");
        later(3.2);
        assert.equal(await automation().runDue(), 1);

        const sent = gmail.sent.at(-1)!;
        assert.match(unsubscribeUrl(sent.parsed), /^https:\/\/api\.sales\.dynarock\.in\/u\//);
        assert.match(Buffer.from(sent.raw, "base64url").toString(), /^List-Unsubscribe-Post: List-Unsubscribe=One-Click$/m);
        assert.match(sent.parsed.html || "", /unsubscribe here/);
        const message = await stack.container.database.models.Message.findOne({ origin: "app_followup" }).lean();
        assert.ok(message, "follow-up is saved with its own origin");

        state = (await c.get(`/threads/${threadId}/automation`)).body;
        assert.equal(state.enrollment.currentStep, 1);
        assert.equal(state.scheduled[0].step, 2);
    });

    it("stops as soon as the client replies", async () => {
        const { c, planId } = await setup();
        const threadId = await sendWithFollowUps(c, planId);
        const ours = [...gmail.messages.values()][0]!;
        gmail.deliver({
            from: `Dr. Rao <${CLIENT}>`,
            subject: "Re: Dynarock for XYZ",
            text: "Call me",
            threadId: ours.threadId,
        });
        await c.post("/mailbox/sync");

        const state = (await c.get(`/threads/${threadId}/automation`)).body;
        assert.equal(state.enrollment.status, "stopped");
        assert.equal(state.enrollment.stopReason, "replied");
        assert.equal(state.scheduled.length, 0);
        later(10);
        assert.equal(await automation().runDue(), 0);
    });

    it("ignores auto-replies and keeps following up", async () => {
        const { c, planId } = await setup();
        const threadId = await sendWithFollowUps(c, planId);
        const ours = [...gmail.messages.values()][0]!;
        gmail.deliver({
            from: CLIENT,
            subject: "Out of office",
            text: "Back Monday",
            threadId: ours.threadId,
            headers: { "Auto-Submitted": "auto-replied" },
        });
        await c.post("/mailbox/sync");
        assert.equal((await c.get(`/threads/${threadId}/automation`)).body.enrollment.status, "active");
    });

    it("holds sends while automation is paused, and respects the daily limit", async () => {
        const { c, planId } = await setup();
        await sendWithFollowUps(c, planId);
        await c.patch("/automation/settings", { automationPaused: true });
        later(4);
        assert.equal(await automation().runDue(), 0);

        await c.patch("/automation/settings", { automationPaused: false });
        later(0.1);
        assert.equal(await automation().runDue(), 1);
    });

    it("never sends more follow-ups in a day than the daily limit", async () => {
        const { c, planId } = await setup();
        await c.patch("/automation/settings", { dailySendCap: 1 });
        await sendWithFollowUps(c, planId);
        await c.post("/emails/send", {
            to: ["dean@abc.edu.in"],
            subject: "Hi",
            html: "<p>Hi</p>",
            followUp: { sequenceId: planId },
        });
        later(3.5);

        assert.equal(await automation().runDue(), 1, "two are due but only one fits today");
        const counts = (await c.get("/scheduled-emails/counts")).body;
        assert.equal(counts.sentToday, 1);
        assert.equal(counts.dailyCap, 1);
        const waiting = (await c.get("/scheduled-emails")).body.filter((s: { step: number }) => s.step === 1);
        assert.equal(waiting.length, 1);
        assert.ok(new Date(waiting[0].sendAt).getTime() > clock.now.getTime(), "the other one moves to tomorrow");
    });

    it("sends exactly what a person edited, and cancelling stops the plan", async () => {
        const { c, planId } = await setup();
        const threadId = await sendWithFollowUps(c, planId);
        const [item] = (await c.get(`/scheduled-emails?threadId=${threadId}`)).body;
        const edited = await c.patch(`/scheduled-emails/${item.id}`, { html: "<p>Edited by Ravi</p>" });
        assert.equal(edited.status, 200);
        assert.ok(edited.body.lastEditedBy);

        const now = await c.post(`/scheduled-emails/${item.id}/send-now`);
        assert.equal(now.status, 200, JSON.stringify(now.body));
        assert.match(gmail.sent.at(-1)!.parsed.html || "", /Edited by Ravi/);

        const [next] = (await c.get(`/scheduled-emails?threadId=${threadId}`)).body;
        assert.equal((await c.post(`/scheduled-emails/${next.id}/cancel`)).status, 200);
        const state = (await c.get(`/threads/${threadId}/automation`)).body;
        assert.equal(state.enrollment.status, "stopped");
        assert.equal(state.enrollment.stopReason, "manual");
    });

    it("pushes the next follow-up back when someone replies by hand", async () => {
        const { c, planId } = await setup();
        const threadId = await sendWithFollowUps(c, planId);
        const before = new Date((await c.get(`/threads/${threadId}/automation`)).body.scheduled[0].sendAt).getTime();
        later(2);
        await c.post("/emails/send", { mode: "reply", threadId, to: [CLIENT], html: "<p>One more thing</p>" });
        const afterTs = new Date((await c.get(`/threads/${threadId}/automation`)).body.scheduled[0].sendAt).getTime();
        assert.ok(afterTs - before > 1.5 * DAY);
    });
});

describe("unsubscribe link", () => {
    it("unsubscribes the contact and stops their follow-ups", async () => {
        const { c, planId } = await setup();
        const threadId = await sendWithFollowUps(c, planId);
        later(3.5);
        await automation().runDue();
        const url = unsubscribeUrl(gmail.sent.at(-1)!.parsed);
        const path = new URL(url).pathname;

        const page = await stack.app.request(path);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /Stop emails from Dynarock/);
        const done = await stack.app.request(path, { method: "POST" });
        assert.equal(done.status, 200);
        assert.match(await done.text(), /unsubscribed/);

        const contact = (await c.get(`/contacts?q=${CLIENT}`)).body.items[0];
        assert.equal(contact.status, "unsubscribed");
        assert.equal((await c.get(`/threads/${threadId}/automation`)).body.enrollment.stopReason, "unsubscribed");
        assert.equal((await stack.app.request("/u/forged.token", { method: "POST" })).status, 404);
    });
});

describe("send later", () => {
    it("schedules an email and starts follow-ups once it's sent", async () => {
        const { c, planId } = await setup();
        const sendAt = new Date(Date.now() + 2 * 3_600_000).toISOString();
        const res = await c.post("/emails/send", {
            to: [CLIENT],
            subject: "Later",
            html: "<p>Morning!</p>",
            sendAt,
            followUp: { sequenceId: planId },
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.scheduled, true);
        assert.equal(gmail.sent.length, 0);
        assert.equal((await c.get("/scheduled-emails?kind=send_later")).body.length, 1);

        later(0.2);
        assert.equal(await automation().runDue(), 1);
        assert.equal(gmail.sent.length, 1);
        const msg = await stack.container.database.models.Message.findOne({ origin: "app_scheduled" }).lean();
        assert.ok(msg);
        const threadId = msg.threadId.toHexString();
        assert.equal((await c.get(`/threads/${threadId}/automation`)).body.enrollment.status, "active");
        assert.equal(
            (
                await c.post("/emails/send", {
                    to: [CLIENT],
                    html: "<p>x</p>",
                    sendAt: new Date(Date.now() - 1000).toISOString(),
                })
            ).status,
            422,
        );
    });
});
