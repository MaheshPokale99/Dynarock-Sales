import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { FakeAi } from "../helpers/fake-ai.js";
import { FakeGmail } from "../helpers/fake-gmail.js";
import { Client } from "../helpers/http.js";
import { ADMIN, createTestStack, type TestStack } from "../helpers/test-stack.js";

const HOUR = 3_600_000;
const ENV = {
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
};

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

async function setup() {
    const c = new Client(stack);
    await c.login(ADMIN.email, ADMIN.password);
    const { body } = await c.get("/mailbox/connect");
    const state = new URL(body.url as string).searchParams.get("state") ?? "";
    await c.get(`/mailbox/oauth/callback?code=good&state=${encodeURIComponent(state)}`);
    await c.patch("/automation/settings", {
        sendWindow: { days: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 24, timezone: "Asia/Kolkata" },
    });
    return c;
}

const clientReply = async (c: Client, from: string, threadId: string, text: string) => {
    gmail.deliver({ from, subject: "Re: Dynarock", text, threadId });
    await c.post("/mailbox/sync");
    await stack.container.services.ai.idle();
};

describe("dashboard", () => {
    it("is empty but well-formed with no data", async () => {
        const c = await setup();
        const res = await c.get("/analytics/dashboard?days=7");
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.range.days, 7);
        assert.equal(res.body.series.length, 7);
        assert.equal(res.body.kpis.emailsSent.value, 0);
        assert.equal(res.body.kpis.replyRate.value, null);
        assert.equal(res.body.pipeline.length, 9);
        assert.equal((await c.get("/analytics/dashboard?days=12")).status, 422);
    });

    it("counts sends, replies, reply time, demos, follow-up results and AI drafts", async () => {
        const c = await setup();
        const plan = (await c.get("/sequences")).body[0];

        // Two conversations started; one client replies after 6 hours.
        await c.post("/emails/send", { to: ["a@one.edu.in"], subject: "Dynarock", html: "<p>Hi</p>" });
        const second = await c.post("/emails/send", {
            to: ["b@two.edu.in"],
            subject: "Dynarock",
            html: "<p>Hi</p>",
            followUp: { sequenceId: plan.id },
        });
        const gmailThread = (to: string) =>
            [...gmail.messages.values()].find((m) =>
                m.payload?.headers?.some((h) => h.name === "To" && h.value.includes(to)),
            )!.threadId;

        clock.now = new Date(clock.now.getTime() + 6 * HOUR);
        await clientReply(c, "Dr. A <a@one.edu.in>", gmailThread("a@one.edu.in"), "Interested, tell me more");
        const contactA = (await c.get("/contacts?q=a@one")).body.items[0];
        await c.patch(`/contacts/${contactA.id}`, { stage: "demo_scheduled" });

        // AI drafted a reply; someone edits and sends it. Another draft gets rejected later.
        const [draft] = (await c.get("/ai/suggestions")).body;
        await c.post(`/ai/suggestions/${draft.id}/send`, { to: ["a@one.edu.in"], html: "<p>Edited answer</p>" });

        // The follow-up to B goes out after 3+ days and B replies to it.
        clock.now = new Date(clock.now.getTime() + 3.5 * 24 * HOUR);
        assert.equal(await stack.container.services.automation.runDue(), 1);
        clock.now = new Date(clock.now.getTime() + 2 * HOUR);
        await clientReply(c, "b@two.edu.in", gmailThread("b@two.edu.in"), "Ok, let's talk");
        const [draftB] = (await c.get("/ai/suggestions")).body;
        await c.post(`/ai/suggestions/${draftB.id}/reject`, { reason: "Calling instead" });

        clock.now = new Date(clock.now.getTime() + 60_000);
        const d = (await c.get("/analytics/dashboard?days=30")).body;
        assert.equal(d.kpis.emailsSent.value, 4, "2 first emails + 1 AI reply + 1 follow-up");
        assert.equal(d.kpis.followUpsSent.value, 1);
        assert.equal(d.kpis.replies.value, 2);
        assert.equal(
            d.kpis.replyRate.value,
            100,
            "both conversations got a reply, A directly and B after the follow-up",
        );
        assert.equal(d.kpis.demosBooked.value, 1);
        assert.equal(d.kpis.newContacts.value, 2);
        assert.ok(d.kpis.avgClientReplyHours.value > 5.9);
        assert.equal(d.kpis.emailsSent.previous, 0);

        assert.deepEqual(d.followUpSteps, [{ step: 1, sent: 1, replied: 1, replyRate: 100 }]);
        assert.deepEqual(d.ai.suggestions, { sentAsIs: 0, sentEdited: 1, rejected: 1, pending: 0 });
        assert.ok(d.ai.calls >= 4);
        assert.equal(d.intents[0].intent, "question");
        assert.equal(d.pipeline.find((p: { stage: string }) => p.stage === "demo_scheduled").count, 1);

        const me = d.team.find((t: { name: string }) => t.name === ADMIN.name);
        assert.equal(me.emailsSent, 3);
        assert.equal(me.followUpsSent, 1);
        assert.equal(me.conversationsStarted, 2);
        assert.equal(me.demosBooked, 1);
        assert.equal(me.aiRepliesApproved, 1);
        assert.equal(
            d.series.reduce((n: number, b: { sent: number }) => n + b.sent, 0),
            4,
        );
        void second;
    });
});
