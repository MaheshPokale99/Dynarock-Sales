import type { Types } from "mongoose";
import { MS_PER_DAY } from "../../common/constants.js";
import type { Models } from "../../database/models.js";
import type { SuggestionDoc } from "../ai/ai.model.js";
import type { ScheduledEmailDoc } from "../automation/automation.model.js";
import { startOfLocalDay } from "../automation/send-window.js";
import { CONTACT_STAGES } from "../contacts/contact.model.js";
import type { MessageDoc, ThreadDoc } from "../mail/mail.model.js";
import type { UserDoc } from "../users/user.model.js";

const TZ = "Asia/Kolkata";
const MS_PER_HOUR = 3_600_000;
// A reply counts toward a follow-up step if it arrives within this window.
const STEP_REPLY_WINDOW_MS = 7 * MS_PER_DAY;

interface Range {
    from: Date;
    to: Date;
}

type Light = Pick<MessageDoc, "threadId" | "direction" | "sentAt" | "isAutoReply" | "origin" | "sentByUserId">;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const inRange = (d: Date, r: Range) => d >= r.from && d < r.to;

// Conversation-level facts for threads that we started in a range.
interface ThreadFacts {
    started: number;
    replied: number;
    replyHours: number[];
    byStarter: Map<string, { started: number; replied: number }>;
}

export class AnalyticsService {
    constructor(
        private readonly models: Models,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async dashboard(days: number) {
        const to = this.now();
        const current: Range = { from: new Date(startOfLocalDay(to, TZ).getTime() - (days - 1) * MS_PER_DAY), to };
        const previous: Range = { from: new Date(current.from.getTime() - days * MS_PER_DAY), to: current.from };

        // One read of every message in both periods; everything below is computed from it.
        const messages = await this.models.Message.find({ sentAt: { $gte: previous.from, $lt: to } })
            .select("threadId direction sentAt isAutoReply origin sentByUserId")
            .sort({ sentAt: 1 })
            .lean<Light[]>();

        const [now, before] = await Promise.all([this.kpis(current, messages), this.kpis(previous, messages)]);
        const metric = (key: keyof typeof now) => ({ value: now[key], previous: before[key] });

        return {
            range: { from: current.from, to, days, interval: days > 31 ? "week" : "day" },
            kpis: {
                emailsSent: metric("emailsSent"),
                replies: metric("replies"),
                replyRate: metric("replyRate"),
                avgClientReplyHours: metric("avgClientReplyHours"),
                avgResponseHours: metric("avgResponseHours"),
                demosBooked: metric("demosBooked"),
                won: metric("won"),
                newContacts: metric("newContacts"),
                followUpsSent: metric("followUpsSent"),
            },
            series: this.series(current, messages, days > 31 ? 7 : 1),
            pipeline: await this.pipeline(),
            followUpSteps: await this.followUpSteps(current),
            intents: await this.intents(current),
            ai: await this.ai(current),
            team: await this.team(current, messages),
        };
    }

    private async kpis(r: Range, all: Light[]) {
        const msgs = all.filter((m) => inRange(m.sentAt, r));
        const facts = await this.threadFacts(r);
        const [demosBooked, won, newContacts] = await Promise.all([
            this.stageChanges(r, "demo_scheduled"),
            this.stageChanges(r, "won"),
            this.models.Contact.countDocuments({ createdAt: { $gte: r.from, $lt: r.to } }),
        ]);
        return {
            emailsSent: msgs.filter((m) => m.direction === "outbound").length,
            replies: msgs.filter((m) => m.direction === "inbound" && !m.isAutoReply).length,
            replyRate: rate(facts.replied, facts.started),
            avgClientReplyHours: round1(avg(facts.replyHours)),
            avgResponseHours: round1(await this.responseHours(r)),
            demosBooked,
            won,
            newContacts,
            followUpsSent: msgs.filter((m) => m.origin === "app_followup").length,
        };
    }

    private stageChanges(r: Range, to: string, userId?: Types.ObjectId) {
        return this.models.Activity.countDocuments({
            action: "contact.stage_changed",
            "meta.to": to,
            createdAt: { $gte: r.from, $lt: r.to },
            ...(userId ? { "actor.userId": userId } : {}),
        });
    }

    // Threads whose first email was ours and went out in the range: did the client ever reply, and how fast?
    private async threadFacts(r: Range): Promise<ThreadFacts> {
        const threads = await this.models.Thread.find({ createdAt: { $gte: r.from, $lt: r.to } })
            .select("_id startedBy")
            .lean<Pick<ThreadDoc, "_id" | "startedBy">[]>();
        const facts: ThreadFacts = { started: 0, replied: 0, replyHours: [], byStarter: new Map() };
        if (threads.length === 0) return facts;

        const msgs = await this.models.Message.find({ threadId: { $in: threads.map((t) => t._id) } })
            .select("threadId direction sentAt isAutoReply")
            .sort({ sentAt: 1 })
            .lean<Light[]>();
        const byThread = new Map<string, Light[]>();
        for (const m of msgs)
            byThread.set(m.threadId.toHexString(), [...(byThread.get(m.threadId.toHexString()) ?? []), m]);

        for (const t of threads) {
            const list = byThread.get(t._id.toHexString()) ?? [];
            const first = list[0];
            if (first?.direction !== "outbound" || !inRange(first.sentAt, r)) continue;
            const reply = list.find((m) => m.direction === "inbound" && !m.isAutoReply);
            facts.started++;
            if (reply) {
                facts.replied++;
                facts.replyHours.push((reply.sentAt.getTime() - first.sentAt.getTime()) / MS_PER_HOUR);
            }
            if (t.startedBy) {
                const key = t.startedBy.toHexString();
                const s = facts.byStarter.get(key) ?? { started: 0, replied: 0 };
                s.started++;
                if (reply) s.replied++;
                facts.byStarter.set(key, s);
            }
        }
        return facts;
    }

    // How long a client waits for our answer: client email -> our next email in that thread.
    private async responseHours(r: Range): Promise<number | null> {
        const inbound = await this.models.Message.find({
            direction: "inbound",
            isAutoReply: false,
            sentAt: { $gte: r.from, $lt: r.to },
        })
            .select("threadId sentAt")
            .lean<Light[]>();
        if (inbound.length === 0) return null;
        const outbound = await this.models.Message.find({
            threadId: { $in: [...new Set(inbound.map((m) => m.threadId.toHexString()))] },
            direction: "outbound",
            sentAt: { $gte: r.from },
        })
            .select("threadId sentAt")
            .sort({ sentAt: 1 })
            .lean<Light[]>();
        const hours: number[] = [];
        for (const m of inbound) {
            const answer = outbound.find((o) => o.threadId.equals(m.threadId) && o.sentAt > m.sentAt);
            if (answer) hours.push((answer.sentAt.getTime() - m.sentAt.getTime()) / MS_PER_HOUR);
        }
        return avg(hours);
    }

    // Emails sent, replies and follow-ups per day (or per week for long ranges), in India time.
    private series(r: Range, all: Light[], stepDays: number) {
        const buckets: { date: Date; sent: number; replies: number; followUps: number }[] = [];
        for (let t = r.from.getTime(); t < r.to.getTime(); t += stepDays * MS_PER_DAY) {
            buckets.push({ date: new Date(t), sent: 0, replies: 0, followUps: 0 });
        }
        for (const m of all) {
            if (!inRange(m.sentAt, r)) continue;
            const i = Math.floor((m.sentAt.getTime() - r.from.getTime()) / (stepDays * MS_PER_DAY));
            const b = buckets[i];
            if (!b) continue;
            if (m.direction === "outbound") {
                b.sent++;
                if (m.origin === "app_followup") b.followUps++;
            } else if (!m.isAutoReply) {
                b.replies++;
            }
        }
        return buckets;
    }

    private async pipeline() {
        const rows = await this.models.Contact.aggregate<{ _id: string; n: number }>([
            { $group: { _id: "$stage", n: { $sum: 1 } } },
        ]);
        const counts = new Map(rows.map((r) => [r._id, r.n]));
        return CONTACT_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
    }

    // For each follow-up step: how many went out, and how many got a reply before the next email.
    private async followUpSteps(r: Range) {
        const sent = await this.models.ScheduledEmail.find({
            kind: "follow_up",
            status: "sent",
            updatedAt: { $gte: r.from, $lt: r.to },
        })
            .select("threadId step sentMessageId")
            .lean<ScheduledEmailDoc[]>();
        if (sent.length === 0) return [];
        const sentMessages = await this.models.Message.find({
            _id: { $in: sent.flatMap((s) => (s.sentMessageId ? [s.sentMessageId] : [])) },
        })
            .select("_id sentAt")
            .lean<Pick<MessageDoc, "_id" | "sentAt">[]>();
        const sentAt = new Map(sentMessages.map((m) => [m._id.toHexString(), m.sentAt]));
        const threadIds = [...new Set(sent.flatMap((s) => (s.threadId ? [s.threadId.toHexString()] : [])))];
        const thread = await this.models.Message.find({ threadId: { $in: threadIds } })
            .select("threadId direction sentAt isAutoReply")
            .sort({ sentAt: 1 })
            .lean<Light[]>();

        const steps = new Map<number, { sent: number; replied: number }>();
        for (const s of sent) {
            const at = s.sentMessageId ? sentAt.get(s.sentMessageId.toHexString()) : undefined;
            if (!at || !s.threadId) continue;
            const after = thread.filter((m) => m.threadId.equals(s.threadId) && m.sentAt > at);
            const nextOut = after.find((m) => m.direction === "outbound")?.sentAt.getTime() ?? Infinity;
            const limit = Math.min(nextOut, at.getTime() + STEP_REPLY_WINDOW_MS);
            const replied = after.some(
                (m) => m.direction === "inbound" && !m.isAutoReply && m.sentAt.getTime() < limit,
            );
            const row = steps.get(s.step ?? 1) ?? { sent: 0, replied: 0 };
            row.sent++;
            if (replied) row.replied++;
            steps.set(s.step ?? 1, row);
        }
        return [...steps.entries()]
            .sort(([a], [b]) => a - b)
            .map(([step, v]) => ({ step, sent: v.sent, replied: v.replied, replyRate: rate(v.replied, v.sent) }));
    }

    private async intents(r: Range) {
        const rows = await this.models.Message.aggregate<{ _id: string; n: number }>([
            {
                $match: {
                    direction: "inbound",
                    "classification.intent": { $exists: true },
                    sentAt: { $gte: r.from, $lt: r.to },
                },
            },
            { $group: { _id: "$classification.intent", n: { $sum: 1 } } },
            { $sort: { n: -1 } },
        ]);
        return rows.map((x) => ({ intent: x._id, count: x.n }));
    }

    private async ai(r: Range) {
        const suggestions = await this.models.Suggestion.find({ createdAt: { $gte: r.from, $lt: r.to } })
            .select("status editedBeforeSend")
            .lean<Pick<SuggestionDoc, "status" | "editedBeforeSend">[]>();
        const runs = await this.models.AiRun.aggregate<{ _id: null; n: number; failed: number; tokens: number }>([
            { $match: { createdAt: { $gte: r.from, $lt: r.to } } },
            {
                $group: {
                    _id: null,
                    n: { $sum: 1 },
                    failed: { $sum: { $cond: ["$ok", 0, 1] } },
                    tokens: { $sum: { $add: ["$inputTokens", "$outputTokens"] } },
                },
            },
        ]);
        return {
            suggestions: {
                sentAsIs: suggestions.filter((s) => s.status === "sent" && !s.editedBeforeSend).length,
                sentEdited: suggestions.filter((s) => s.status === "sent" && s.editedBeforeSend).length,
                rejected: suggestions.filter((s) => s.status === "rejected").length,
                pending: suggestions.filter((s) => s.status === "pending").length,
            },
            calls: runs[0]?.n ?? 0,
            failedCalls: runs[0]?.failed ?? 0,
            tokens: runs[0]?.tokens ?? 0,
        };
    }

    private async team(r: Range, all: Light[]) {
        const users = await this.models.User.find({ status: { $ne: "invited" } })
            .select("_id name status")
            .lean<Pick<UserDoc, "_id" | "name" | "status">[]>();
        const msgs = all.filter((m) => inRange(m.sentAt, r) && m.direction === "outbound" && m.sentByUserId);
        const facts = await this.threadFacts(r);
        return Promise.all(
            users.map(async (u) => {
                const mine = msgs.filter((m) => m.sentByUserId?.equals(u._id));
                const started = facts.byStarter.get(u._id.toHexString()) ?? { started: 0, replied: 0 };
                const [demos, won, aiApproved] = await Promise.all([
                    this.stageChanges(r, "demo_scheduled", u._id),
                    this.stageChanges(r, "won", u._id),
                    this.models.Suggestion.countDocuments({
                        status: "sent",
                        reviewedBy: u._id,
                        reviewedAt: { $gte: r.from, $lt: r.to },
                    }),
                ]);
                return {
                    userId: u._id.toHexString(),
                    name: u.name,
                    disabled: u.status === "disabled",
                    emailsSent: mine.filter((m) => m.origin !== "app_followup").length,
                    followUpsSent: mine.filter((m) => m.origin === "app_followup").length,
                    conversationsStarted: started.started,
                    replyRate: rate(started.replied, started.started),
                    demosBooked: demos,
                    won,
                    aiRepliesApproved: aiApproved,
                };
            }),
        ).then((rows) => rows.sort((a, b) => b.emailsSent + b.followUpsSent - (a.emailsSent + a.followUpsSent)));
    }
}
