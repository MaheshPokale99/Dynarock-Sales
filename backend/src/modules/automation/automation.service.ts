import { Types } from "mongoose";
import { MS_PER_DAY, MS_PER_MINUTE } from "../../common/constants.js";
import {
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
} from "../../common/errors/app-error.js";
import type { Logger } from "../../common/logger/logger.js";
import { sign, verifySigned } from "../../common/utils/crypto.js";
import { isDuplicateKey } from "../../database/database.js";
import type { Models } from "../../database/models.js";
import type { ActivitiesRepository } from "../activities/activities.repository.js";
import type { ActivityAction } from "../activities/activity.model.js";
import { textToEmailHtml } from "../ai/draft.js";
import type { AiService } from "../ai/ai.service.js";
import type { ContactsRepository } from "../contacts/contacts.repository.js";
import type { Locks } from "../locks/locks.js";
import type { MessageDoc, ThreadDoc } from "../mail/mail.model.js";
import type { MailRepository } from "../mail/mail.repository.js";
import type { MailService, SendInput } from "../mail/mail.service.js";
import type { UsersRepository } from "../users/users.repository.js";
import type { User } from "../users/users.types.js";
import {
    DEFAULT_WINDOW,
    type EnrollmentDoc,
    type ScheduledEmailDoc,
    type SequenceDoc,
    type SequenceStep,
    type SettingsDoc,
    type StopReason,
} from "./automation.model.js";
import { inWindow, nextSendSlot, startOfLocalDay } from "./send-window.js";

const SETTINGS_ID = "global";
const LOCK = "automation";
const BATCH = 20;
const MIN_LEAD_MS = 5 * MS_PER_MINUTE;
const UNSUBSCRIBE_TTL_MS = 2 * 365 * MS_PER_DAY;
const FALLBACK_TEXT =
    "Just following up on my earlier email in case it got buried. Would a short 20-minute demo of Dynarock be useful for your team? Happy to work around your schedule.";

export const DEFAULT_SEQUENCE = {
    name: "Standard follow-up",
    description: "Three gentle follow-ups over two weeks. Stops as soon as they reply.",
    steps: [
        {
            delayDays: 3,
            instruction: "A short, friendly bump. Mention there is a free plan and ask if they had a chance to look.",
            fixedText: "",
        },
        {
            delayDays: 4,
            instruction:
                "Share one Dynarock benefit that fits their role (use KNOWLEDGE and the recipient's role) and ask for a 20-minute demo.",
            fixedText: "",
        },
        {
            delayDays: 7,
            instruction: "A polite last check-in. Offer to close the loop for now and say they can reply any time.",
            fixedText: "",
        },
    ] satisfies SequenceStep[],
};

const toSettingsDto = (s: SettingsDoc) => ({
    automationPaused: s.automationPaused,
    dailySendCap: s.dailySendCap,
    sendWindow: s.sendWindow,
    defaultSequenceId: s.defaultSequenceId?.toHexString() ?? null,
});

const toSequenceDto = (s: SequenceDoc) => ({
    id: s._id.toHexString(),
    name: s.name,
    description: s.description,
    active: s.active,
    steps: s.steps,
    updatedAt: s.updatedAt,
});

export interface SequenceInput {
    name: string;
    description: string;
    active: boolean;
    steps: SequenceStep[];
}

export interface ComposeSendInput extends SendInput {
    followUp?: { sequenceId: string } | null;
    sendAt?: Date;
}

interface Deps {
    models: Models;
    mail: MailRepository;
    mailService: MailService;
    contacts: ContactsRepository;
    users: UsersRepository;
    ai: AiService;
    activities: ActivitiesRepository;
    locks: Locks;
    config: { apiUrl: string; encryptionKey: Buffer | null };
    logger: Logger;
    now?: () => Date;
}

export class AutomationService {
    private readonly now: () => Date;

    constructor(private readonly deps: Deps) {
        this.now = deps.now ?? (() => new Date());
    }

    // ---------- settings and plans ----------

    async settingsDoc(): Promise<SettingsDoc> {
        const doc = await this.deps.models.Settings.findOneAndUpdate(
            { _id: SETTINGS_ID },
            { $setOnInsert: { automationPaused: false, dailySendCap: 300, sendWindow: DEFAULT_WINDOW } },
            { upsert: true, returnDocument: "after" },
        ).lean<SettingsDoc>();
        return doc;
    }

    async settings() {
        return toSettingsDto(await this.settingsDoc());
    }

    async updateSettings(
        userId: string,
        patch: Partial<Omit<ReturnType<typeof toSettingsDto>, "defaultSequenceId">> & {
            defaultSequenceId?: string | null;
        },
    ) {
        const { defaultSequenceId, ...rest } = patch;
        if (rest.sendWindow && rest.sendWindow.startHour >= rest.sendWindow.endHour) {
            throw new ValidationError("The send window must end after it starts");
        }
        await this.settingsDoc();
        const doc = await this.deps.models.Settings.findOneAndUpdate(
            { _id: SETTINGS_ID },
            {
                $set: {
                    ...rest,
                    ...(defaultSequenceId !== undefined
                        ? { defaultSequenceId: defaultSequenceId ? new Types.ObjectId(defaultSequenceId) : null }
                        : {}),
                    updatedBy: new Types.ObjectId(userId),
                },
            },
            { returnDocument: "after" },
        ).lean<SettingsDoc>();
        return toSettingsDto(doc!);
    }

    async listSequences() {
        const docs = await this.deps.models.Sequence.find().sort({ createdAt: 1 }).lean<SequenceDoc[]>();
        return docs.map(toSequenceDto);
    }

    async createSequence(userId: string, input: SequenceInput) {
        const doc = await this.deps.models.Sequence.create({ ...input, createdBy: new Types.ObjectId(userId) });
        return toSequenceDto(doc.toObject<SequenceDoc>());
    }

    async updateSequence(id: string, input: Partial<SequenceInput>) {
        const doc = await this.deps.models.Sequence.findByIdAndUpdate(
            id,
            { $set: input },
            { returnDocument: "after" },
        ).lean<SequenceDoc>();
        if (!doc) throw new NotFoundError("Follow-up plan not found");
        return toSequenceDto(doc);
    }

    async deleteSequence(id: string) {
        const inUse = await this.deps.models.Enrollment.countDocuments({
            sequenceId: new Types.ObjectId(id),
            status: { $in: ["active", "paused"] },
        });
        if (inUse > 0)
            throw new ConflictError("This plan is running on some conversations.", [
                "Turn it off instead, or stop those conversations first.",
            ]);
        const r = await this.deps.models.Sequence.deleteOne({ _id: id });
        if (r.deletedCount !== 1) throw new NotFoundError("Follow-up plan not found");
        await this.deps.models.Settings.updateOne(
            { _id: SETTINGS_ID, defaultSequenceId: new Types.ObjectId(id) },
            { $set: { defaultSequenceId: null } },
        );
    }

    // Creates the standard plan the first time the app starts.
    async seedDefaults(): Promise<boolean> {
        const settings = await this.settingsDoc();
        if ((await this.deps.models.Sequence.countDocuments()) > 0) return false;
        const seq = await this.deps.models.Sequence.create(DEFAULT_SEQUENCE);
        if (!settings.defaultSequenceId) {
            await this.deps.models.Settings.updateOne({ _id: SETTINGS_ID }, { $set: { defaultSequenceId: seq._id } });
        }
        return true;
    }

    // ---------- sending from Compose ----------

    // Sends now or later, and optionally starts follow-ups.
    async composeSend(user: User, input: ComposeSendInput) {
        const { followUp, sendAt, ...mail } = input;
        if (sendAt) return this.scheduleLater(user, mail, sendAt, followUp?.sequenceId);

        const sent = await this.deps.mailService.send(user, mail);
        if (followUp) {
            await this.enroll(user.id, sent.threadId, followUp.sequenceId);
        } else if (mail.mode !== "new") {
            await this.onManualReply(sent.threadId);
        }
        return { ...sent, scheduled: false };
    }

    private async scheduleLater(user: User, input: SendInput, sendAt: Date, sequenceId?: string) {
        if (sendAt.getTime() < this.now().getTime() + MS_PER_MINUTE)
            throw new ValidationError("Pick a time in the future");
        if ([...input.to, ...input.cc, ...input.bcc].length === 0)
            throw new ValidationError("Add at least one recipient");
        const doc = await this.deps.models.ScheduledEmail.create({
            kind: "send_later",
            mode: input.mode,
            threadId: input.threadId ? new Types.ObjectId(input.threadId) : null,
            replyToMessageId: input.replyToMessageId ? new Types.ObjectId(input.replyToMessageId) : null,
            to: input.to,
            cc: input.cc,
            bcc: input.bcc,
            subject: input.subject,
            html: input.html,
            attachmentFileIds: input.attachmentFileIds.map((id) => new Types.ObjectId(id)),
            sendAt,
            createdBy: new Types.ObjectId(user.id),
            // Remembered so the plan starts when it's actually sent.
            statusReason: sequenceId ? `followup:${sequenceId}` : "",
        });
        if (input.draftId)
            await this.deps.models.Draft.deleteOne({ _id: input.draftId, userId: new Types.ObjectId(user.id) });
        return {
            threadId: input.threadId ?? null,
            messageId: null,
            scheduled: true,
            scheduledId: doc._id.toHexString(),
            sendAt,
        };
    }

    // ---------- enrolment ----------

    async enroll(userId: string, threadId: string, sequenceId: string) {
        const sequence = Types.ObjectId.isValid(sequenceId)
            ? await this.deps.models.Sequence.findById(sequenceId).lean<SequenceDoc>()
            : null;
        if (!sequence?.active || sequence.steps.length === 0)
            throw new ValidationError("Pick an active follow-up plan with at least one step");
        const thread = await this.requireThread(threadId);
        if (!thread.lastOutboundAt) throw new ConflictError("Send the first email before starting follow-ups.");

        let enrollment: EnrollmentDoc;
        try {
            const created = await this.deps.models.Enrollment.create({
                sequenceId: sequence._id,
                threadId: thread._id,
                contactId: thread.contactIds?.[0] ?? null,
                enrolledBy: new Types.ObjectId(userId),
            });
            enrollment = created.toObject<EnrollmentDoc>();
        } catch (error) {
            if (isDuplicateKey(error)) throw new ConflictError("This conversation already has follow-ups running.");
            throw error;
        }
        await this.record("followup.enrolled", userId, thread._id, { sequence: sequence.name });
        await this.scheduleNext(enrollment);
        return this.threadAutomation(threadId);
    }

    // Writes and queues the next step, or completes the plan.
    private async scheduleNext(enrollment: EnrollmentDoc) {
        const sequence = await this.deps.models.Sequence.findById(enrollment.sequenceId).lean<SequenceDoc>();
        const thread = await this.deps.mail.findThread(enrollment.threadId.toHexString());
        const step = sequence?.steps[enrollment.currentStep];
        if (!sequence || !thread || !step) {
            await this.deps.models.Enrollment.updateOne({ _id: enrollment._id }, { $set: { status: "completed" } });
            return;
        }

        const settings = await this.settingsDoc();
        const base = (thread.lastOutboundAt ?? this.now()).getTime() + step.delayDays * MS_PER_DAY;
        const sendAt = nextSendSlot(new Date(Math.max(base, this.now().getTime() + MIN_LEAD_MS)), settings.sendWindow);
        const messages = await this.deps.mail.messagesOf(thread._id);
        const lastOut = messages.findLast((m) => m.direction === "outbound");
        const mailbox = lastOut?.from.email ?? "";
        const content = await this.writeStep(thread, enrollment.currentStep + 1, sequence.steps.length, step);

        await this.deps.models.ScheduledEmail.create({
            kind: "follow_up",
            mode: "reply",
            threadId: thread._id,
            replyToMessageId: messages.at(-1)?._id ?? null,
            to: (lastOut?.to ?? []).map((a) => a.email).filter((e) => e !== mailbox),
            cc: (lastOut?.cc ?? []).map((a) => a.email).filter((e) => e !== mailbox),
            subject: thread.subject.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject}`,
            html: content.html,
            aiGenerated: content.ai,
            heldReason: holdReason(content.warnings),
            sendAt,
            enrollmentId: enrollment._id,
            step: enrollment.currentStep + 1,
            createdBy: enrollment.enrolledBy,
        });
        await this.record("followup.scheduled", null, thread._id, { step: enrollment.currentStep + 1, sendAt });
    }

    private async writeStep(
        thread: ThreadDoc,
        step: number,
        total: number,
        def: SequenceStep,
    ): Promise<{ html: string; ai: boolean; warnings: string[] }> {
        if (def.fixedText.trim()) return { html: textToEmailHtml(def.fixedText), ai: false, warnings: [] };
        if (this.deps.ai.enabled) {
            try {
                const out = await this.deps.ai.writeFollowUp(thread._id.toHexString(), step, total, def.instruction);
                return { html: out.html, ai: true, warnings: out.warnings };
            } catch (error) {
                this.deps.logger.warn({ err: error }, "AI follow-up failed; using the standard text");
            }
        }
        return { html: textToEmailHtml(FALLBACK_TEXT), ai: false, warnings: [] };
    }

    async stopForThread(threadId: Types.ObjectId, reason: StopReason, actorId: string | null) {
        const enrollment = await this.deps.models.Enrollment.findOneAndUpdate(
            { threadId, status: { $in: ["active", "paused"] } },
            { $set: { status: "stopped", stopReason: reason } },
            { returnDocument: "after" },
        ).lean<EnrollmentDoc>();
        if (!enrollment) return false;
        await this.deps.models.ScheduledEmail.updateMany(
            { enrollmentId: enrollment._id, status: "scheduled" },
            { $set: { status: "cancelled", statusReason: STOP_TEXT[reason] } },
        );
        await this.record("followup.stopped", actorId, threadId, { reason });
        return true;
    }

    async setEnrollment(userId: string, id: string, action: "stop" | "pause" | "resume") {
        const enrollment = Types.ObjectId.isValid(id)
            ? await this.deps.models.Enrollment.findById(id).lean<EnrollmentDoc>()
            : null;
        if (!enrollment) throw new NotFoundError("Follow-ups not found");
        if (action === "stop") {
            await this.stopForThread(enrollment.threadId, "manual", userId);
        } else if (action === "pause") {
            await this.deps.models.Enrollment.updateOne(
                { _id: enrollment._id, status: "active" },
                { $set: { status: "paused" } },
            );
        } else {
            await this.deps.models.Enrollment.updateOne(
                { _id: enrollment._id, status: "paused" },
                { $set: { status: "active" } },
            );
            const settings = await this.settingsDoc();
            await this.deps.models.ScheduledEmail.updateMany(
                { enrollmentId: enrollment._id, status: "scheduled", sendAt: { $lt: this.now() } },
                { $set: { sendAt: nextSendSlot(new Date(this.now().getTime() + MIN_LEAD_MS), settings.sendWindow) } },
            );
        }
        return this.threadAutomation(enrollment.threadId.toHexString());
    }

    // A client reply (not an auto-reply) stops follow-ups.
    async onInbound(threadId: Types.ObjectId, messageId: Types.ObjectId) {
        const message = await this.deps.mail.findMessage(messageId.toHexString());
        if (!message || message.direction !== "inbound" || message.isAutoReply) return;
        await this.stopForThread(threadId, "replied", null);
    }

    // When someone replies by hand, the next follow-up waits its full delay again.
    private async onManualReply(threadId: string) {
        const pending = await this.deps.models.ScheduledEmail.findOne({
            threadId: new Types.ObjectId(threadId),
            kind: "follow_up",
            status: "scheduled",
        }).lean<ScheduledEmailDoc>();
        if (!pending?.enrollmentId || !pending.step) return;
        const enrollment = await this.deps.models.Enrollment.findById(pending.enrollmentId).lean<EnrollmentDoc>();
        const sequence = enrollment
            ? await this.deps.models.Sequence.findById(enrollment.sequenceId).lean<SequenceDoc>()
            : null;
        const delay = sequence?.steps[pending.step - 1]?.delayDays ?? 3;
        const settings = await this.settingsDoc();
        await this.deps.models.ScheduledEmail.updateOne(
            { _id: pending._id },
            {
                $set: {
                    sendAt: nextSendSlot(new Date(this.now().getTime() + delay * MS_PER_DAY), settings.sendWindow),
                },
            },
        );
    }

    // ---------- scheduled emails ----------

    async listScheduled(query: {
        status: ScheduledEmailDoc["status"];
        kind?: ScheduledEmailDoc["kind"];
        threadId?: string;
    }) {
        const filter: Record<string, unknown> = { status: query.status };
        if (query.kind) filter.kind = query.kind;
        if (query.threadId) filter.threadId = new Types.ObjectId(query.threadId);
        const docs = await this.deps.models.ScheduledEmail.find(filter)
            .sort(query.status === "scheduled" ? { sendAt: 1 } : { updatedAt: -1 })
            .limit(200)
            .lean<ScheduledEmailDoc[]>();
        return this.scheduledDtos(docs);
    }

    async counts() {
        const settings = await this.settingsDoc();
        const start = startOfLocalDay(this.now(), settings.sendWindow.timezone);
        const end = new Date(start.getTime() + MS_PER_DAY);
        const [today, upcoming, sentToday] = await Promise.all([
            this.deps.models.ScheduledEmail.countDocuments({ status: "scheduled", sendAt: { $lt: end } }),
            this.deps.models.ScheduledEmail.countDocuments({ status: "scheduled" }),
            this.sentToday(settings),
        ]);
        return { today, upcoming, sentToday, dailyCap: settings.dailySendCap, paused: settings.automationPaused };
    }

    // Saving new text counts as reviewing it, so a held follow-up is released.
    async editScheduled(
        user: User,
        id: string,
        patch: { subject?: string; html?: string; to?: string[]; cc?: string[]; sendAt?: Date },
    ) {
        if (patch.sendAt && patch.sendAt.getTime() < this.now().getTime())
            throw new ValidationError("Pick a time in the future");
        await this.requireOwnScheduled(user, id);
        const doc = await this.deps.models.ScheduledEmail.findOneAndUpdate(
            { _id: id, status: "scheduled" },
            {
                $set: {
                    ...patch,
                    ...(patch.html !== undefined ? { heldReason: "" } : {}),
                    lastEditedBy: new Types.ObjectId(user.id),
                },
            },
            { returnDocument: "after" },
        ).lean<ScheduledEmailDoc>();
        if (!doc) throw new ConflictError("This email isn't scheduled any more.");
        await this.recordScheduled("followup.edited", user.id, doc, { fields: Object.keys(patch) });
        return (await this.scheduledDtos([doc]))[0]!;
    }

    async approveScheduled(user: User, id: string) {
        await this.requireOwnScheduled(user, id);
        const doc = await this.deps.models.ScheduledEmail.findOneAndUpdate(
            { _id: id, status: "scheduled" },
            { $set: { heldReason: "", lastEditedBy: new Types.ObjectId(user.id) } },
            { returnDocument: "after" },
        ).lean<ScheduledEmailDoc>();
        if (!doc) throw new ConflictError("This email isn't scheduled any more.");
        await this.recordScheduled("followup.approved", user.id, doc, {});
        return (await this.scheduledDtos([doc]))[0]!;
    }

    // Cancelling a follow-up stops the plan for that conversation; a "send later" email is just dropped.
    async cancelScheduled(user: User, id: string) {
        await this.requireOwnScheduled(user, id);
        const userId = user.id;
        const doc = await this.deps.models.ScheduledEmail.findOneAndUpdate(
            { _id: id, status: "scheduled" },
            {
                $set: {
                    status: "cancelled",
                    statusReason: "Cancelled by a team member",
                    lastEditedBy: new Types.ObjectId(userId),
                },
            },
            { returnDocument: "after" },
        ).lean<ScheduledEmailDoc>();
        if (!doc) throw new ConflictError("This email isn't scheduled any more.");
        if (doc.kind === "follow_up" && doc.threadId) await this.stopForThread(doc.threadId, "manual", userId);
        else await this.recordScheduled("followup.cancelled", userId, doc, {});
    }

    // Admins can push anything out; others only their own, and follow-ups still respect the pause and daily cap.
    async sendNow(user: User, id: string) {
        const item = await this.requireOwnScheduled(user, id);
        if (item.kind === "follow_up" && user.role !== "admin") {
            const settings = await this.settingsDoc();
            if (settings.automationPaused) throw new ConflictError("Follow-ups are paused by an admin.");
            if ((await this.sentToday(settings)) >= settings.dailySendCap)
                throw new AppError("Today's follow-up limit has been reached.", 429, "FOLLOWUP_DAILY_CAP");
        }
        const claimed = await this.claim(item._id);
        if (!claimed) throw new ConflictError("This email isn't scheduled any more.");
        await this.recordScheduled("followup.sent_now", user.id, claimed, {});
        await this.deliver(claimed, true);
        const doc = await this.deps.models.ScheduledEmail.findById(id).lean<ScheduledEmailDoc>();
        if (doc?.status !== "sent") throw new ConflictError(doc?.statusReason || "Sending failed. Try again shortly.");
        return (await this.scheduledDtos([doc]))[0]!;
    }

    async regenerate(user: User, id: string) {
        const doc = await this.requireOwnScheduled(user, id);
        if (doc.status !== "scheduled" || doc.kind !== "follow_up" || !doc.enrollmentId || !doc.threadId) {
            throw new ConflictError("Only scheduled follow-ups can be rewritten.");
        }
        if (!this.deps.ai.enabled)
            throw new ServiceUnavailableError("AI isn't set up on the server. Add GEMINI_API_KEY to backend/.env.");
        const enrollment = await this.deps.models.Enrollment.findById(doc.enrollmentId).lean<EnrollmentDoc>();
        const sequence = enrollment
            ? await this.deps.models.Sequence.findById(enrollment.sequenceId).lean<SequenceDoc>()
            : null;
        const step = sequence?.steps[(doc.step ?? 1) - 1];
        const out = await this.deps.ai.writeFollowUp(
            doc.threadId.toHexString(),
            doc.step ?? 1,
            sequence?.steps.length ?? 1,
            step?.instruction ?? "",
        );
        const updated = await this.deps.models.ScheduledEmail.findOneAndUpdate(
            { _id: doc._id, status: "scheduled" },
            {
                $set: {
                    html: out.html,
                    aiGenerated: true,
                    heldReason: holdReason(out.warnings),
                    lastEditedBy: new Types.ObjectId(user.id),
                },
            },
            { returnDocument: "after" },
        ).lean<ScheduledEmailDoc>();
        if (updated) await this.recordScheduled("followup.edited", user.id, updated, { regenerated: true });
        return { ...(await this.scheduledDtos([updated ?? doc]))[0]!, warnings: out.warnings };
    }

    async threadAutomation(threadId: string) {
        const thread = await this.requireThread(threadId);
        const enrollment = await this.deps.models.Enrollment.findOne({ threadId: thread._id })
            .sort({ createdAt: -1 })
            .lean<EnrollmentDoc>();
        const sequence = enrollment
            ? await this.deps.models.Sequence.findById(enrollment.sequenceId).lean<SequenceDoc>()
            : null;
        const scheduled = await this.deps.models.ScheduledEmail.find({ threadId: thread._id, status: "scheduled" })
            .sort({ sendAt: 1 })
            .lean<ScheduledEmailDoc[]>();
        return {
            enrollment: enrollment
                ? {
                      id: enrollment._id.toHexString(),
                      status: enrollment.status,
                      stopReason: enrollment.stopReason,
                      currentStep: enrollment.currentStep,
                      totalSteps: sequence?.steps.length ?? 0,
                      sequence: sequence ? { id: sequence._id.toHexString(), name: sequence.name } : null,
                  }
                : null,
            scheduled: await this.scheduledDtos(scheduled),
        };
    }

    // ---------- the worker ----------

    // Sends everything that is due. Safe to call from several servers.
    async runDue(): Promise<number> {
        return (
            (await this.deps.locks.withLock(LOCK, 5 * MS_PER_MINUTE, async () => {
                const due = await this.deps.models.ScheduledEmail.find({
                    status: "scheduled",
                    heldReason: { $in: ["", null] },
                    sendAt: { $lte: this.now() },
                })
                    .sort({ sendAt: 1 })
                    .limit(BATCH)
                    .lean<ScheduledEmailDoc[]>();
                let sent = 0;
                for (const item of due) {
                    const claimed = await this.claim(item._id);
                    if (claimed && (await this.deliver(claimed, false))) sent++;
                }
                return sent;
            })) ?? 0
        );
    }

    private claim(id: Types.ObjectId) {
        return this.deps.models.ScheduledEmail.findOneAndUpdate(
            { _id: id, status: "scheduled" },
            { $set: { status: "sending" }, $inc: { attempts: 1 } },
            { returnDocument: "after" },
        ).lean<ScheduledEmailDoc>();
    }

    private async release(item: ScheduledEmailDoc, sendAt: Date, reason = "") {
        await this.deps.models.ScheduledEmail.updateOne(
            { _id: item._id },
            {
                $set: { status: "scheduled", sendAt, statusReason: reason },
                ...(reason ? {} : { $inc: { attempts: -1 } }),
            },
        );
    }

    private async finish(item: ScheduledEmailDoc, status: "cancelled" | "skipped" | "failed", reason: string) {
        await this.deps.models.ScheduledEmail.updateOne({ _id: item._id }, { $set: { status, statusReason: reason } });
    }

    // Returns true when the email went out. `manual` skips the window, cap and pause checks.
    private async deliver(item: ScheduledEmailDoc, manual: boolean): Promise<boolean> {
        const now = this.now();
        const settings = await this.settingsDoc();
        const isFollowUp = item.kind === "follow_up";

        if (isFollowUp && !manual) {
            const enrollment = item.enrollmentId
                ? await this.deps.models.Enrollment.findById(item.enrollmentId).lean<EnrollmentDoc>()
                : null;
            if (!enrollment || enrollment.status === "stopped" || enrollment.status === "completed") {
                await this.finish(item, "cancelled", "Follow-ups were stopped");
                return false;
            }
            if (enrollment.status === "paused" || settings.automationPaused) {
                await this.release(
                    item,
                    nextSendSlot(new Date(now.getTime() + 60 * MS_PER_MINUTE), settings.sendWindow),
                );
                return false;
            }
            if (!inWindow(now, settings.sendWindow)) {
                await this.release(item, nextSendSlot(now, settings.sendWindow));
                return false;
            }
            if ((await this.sentToday(settings)) >= settings.dailySendCap) {
                const tomorrow = new Date(startOfLocalDay(now, settings.sendWindow.timezone).getTime() + MS_PER_DAY);
                await this.release(item, nextSendSlot(tomorrow, settings.sendWindow));
                return false;
            }
        }
        if (isFollowUp && item.threadId) {
            const thread = await this.deps.mail.findThread(item.threadId.toHexString());
            const replied = (await this.deps.mail.messagesOf(item.threadId)).some(
                (m: MessageDoc) => m.direction === "inbound" && !m.isAutoReply && m.sentAt > item.createdAt,
            );
            if (!thread || replied) {
                await this.finish(item, "cancelled", "The client replied");
                if (thread) await this.stopForThread(thread._id, "replied", null);
                return false;
            }
        }

        const user = await this.deps.users.findById(item.createdBy.toHexString());
        if (!user || user.status !== "active") {
            await this.finish(item, "failed", "The person who scheduled it no longer has access");
            if (isFollowUp && item.threadId) await this.stopForThread(item.threadId, "failed", null);
            return false;
        }

        const unsubscribe = isFollowUp ? await this.unsubscribeUrlForThread(item.threadId) : null;
        try {
            const sent = await this.deps.mailService.send(
                user,
                {
                    mode: item.mode,
                    threadId: item.threadId?.toHexString(),
                    replyToMessageId: item.replyToMessageId?.toHexString(),
                    to: item.to,
                    cc: item.cc,
                    bcc: item.bcc,
                    subject: item.subject,
                    html: unsubscribe ? `${item.html}${footer(unsubscribe)}` : item.html,
                    attachmentFileIds: item.attachmentFileIds.map((id) => id.toHexString()),
                },
                { origin: isFollowUp ? "app_followup" : "app_scheduled", listUnsubscribe: unsubscribe ?? undefined },
            );
            await this.deps.models.ScheduledEmail.updateOne(
                { _id: item._id },
                { $set: { status: "sent", statusReason: "", sentMessageId: new Types.ObjectId(sent.messageId) } },
            );
            await this.afterSent(item, user, sent.threadId);
            return true;
        } catch (error) {
            return this.handleFailure(item, error);
        }
    }

    private async afterSent(item: ScheduledEmailDoc, user: User, threadId: string) {
        if (item.kind === "follow_up" && item.enrollmentId) {
            const enrollment = await this.deps.models.Enrollment.findOneAndUpdate(
                { _id: item.enrollmentId },
                { $set: { currentStep: item.step ?? 1 } },
                { returnDocument: "after" },
            ).lean<EnrollmentDoc>();
            await this.record("followup.sent", null, new Types.ObjectId(threadId), { step: item.step });
            if (enrollment?.status === "active") await this.scheduleNext(enrollment);
            return;
        }
        const pending = /^followup:([a-f0-9]{24})$/.exec(item.statusReason)?.[1];
        if (pending)
            await this.enroll(user.id, threadId, pending).catch((e: unknown) =>
                this.deps.logger.warn({ err: e }, "Couldn't start follow-ups after a scheduled send"),
            );
        else if (item.mode !== "new") await this.onManualReply(threadId);
    }

    private async handleFailure(item: ScheduledEmailDoc, error: unknown): Promise<false> {
        const message = error instanceof AppError ? error.message : "Sending failed";
        const reasons =
            error instanceof AppError ? ((error.details as { reasons?: string[] } | undefined)?.reasons ?? []) : [];
        const blocked = message.startsWith("Can't email");
        if (blocked) {
            await this.finish(item, "skipped", [message, ...reasons].join(" "));
            if (item.kind === "follow_up" && item.threadId)
                await this.stopForThread(item.threadId, "unsubscribed", null);
        } else if (item.attempts < 3) {
            await this.release(item, new Date(this.now().getTime() + 15 * MS_PER_MINUTE), message);
        } else {
            await this.finish(item, "failed", message);
            if (item.kind === "follow_up" && item.threadId) await this.stopForThread(item.threadId, "failed", null);
        }
        this.deps.logger.warn({ err: error, scheduledId: item._id.toHexString() }, "Scheduled email not sent");
        return false;
    }

    private sentToday(settings: SettingsDoc) {
        return this.deps.models.Message.countDocuments({
            origin: "app_followup",
            sentAt: { $gte: startOfLocalDay(this.now(), settings.sendWindow.timezone) },
        });
    }

    // ---------- unsubscribe ----------

    private async unsubscribeUrlForThread(threadId: Types.ObjectId | null): Promise<string | null> {
        const key = this.deps.config.encryptionKey;
        if (!key || !threadId) return null;
        const thread = await this.deps.mail.findThread(threadId.toHexString());
        const contactId = thread?.contactIds?.[0];
        return contactId
            ? `${this.deps.config.apiUrl}/u/${sign({ c: contactId.toHexString() }, key, UNSUBSCRIBE_TTL_MS)}`
            : null;
    }

    async unsubscribe(token: string): Promise<{ email: string } | null> {
        const key = this.deps.config.encryptionKey;
        const payload = key ? verifySigned<{ c: string }>(token, key) : null;
        const contact = payload ? await this.deps.contacts.findById(payload.c) : null;
        if (!contact) return null;
        if (contact.status === "active") {
            await this.deps.contacts.update(contact._id, { status: "unsubscribed" });
            await this.deps.activities.record({
                actor: { type: "system" },
                action: "contact.unsubscribed",
                contactId: contact._id.toHexString(),
                meta: { reason: "Clicked the unsubscribe link" },
            });
            const threads = await this.deps.mail.threadsFor({ contactIds: [contact._id] }, 500);
            for (const t of threads) await this.stopForThread(t._id, "unsubscribed", null);
        }
        return { email: contact.email };
    }

    // ---------- helpers ----------

    private async scheduledDtos(docs: ScheduledEmailDoc[]) {
        const threads = await this.deps.models.Thread.find({
            _id: { $in: docs.flatMap((d) => (d.threadId ? [d.threadId] : [])) },
        }).lean<ThreadDoc[]>();
        const threadById = new Map(threads.map((t) => [t._id.toHexString(), t]));
        const enrollments = await this.deps.models.Enrollment.find({
            _id: { $in: docs.flatMap((d) => (d.enrollmentId ? [d.enrollmentId] : [])) },
        }).lean<EnrollmentDoc[]>();
        const sequences = await this.deps.models.Sequence.find({
            _id: { $in: enrollments.map((e) => e.sequenceId) },
        }).lean<SequenceDoc[]>();
        const seqById = new Map(sequences.map((s) => [s._id.toHexString(), s]));
        const seqByEnrollment = new Map(
            enrollments.map((e) => [e._id.toHexString(), seqById.get(e.sequenceId.toHexString())]),
        );
        return docs.map((d) => {
            const thread = d.threadId ? threadById.get(d.threadId.toHexString()) : undefined;
            const seq = d.enrollmentId ? seqByEnrollment.get(d.enrollmentId.toHexString()) : undefined;
            return {
                id: d._id.toHexString(),
                kind: d.kind,
                mode: d.mode,
                threadId: d.threadId?.toHexString() ?? null,
                thread: thread ? { subject: thread.subject, participants: thread.participants } : null,
                to: d.to,
                cc: d.cc,
                bcc: d.bcc,
                subject: d.subject,
                html: d.html,
                sendAt: d.sendAt,
                status: d.status,
                statusReason: d.statusReason.startsWith("followup:") ? "" : d.statusReason,
                step: d.step,
                totalSteps: seq?.steps.length ?? null,
                sequenceName: seq?.name ?? null,
                aiGenerated: d.aiGenerated,
                heldReason: d.heldReason ?? "",
                createdBy: d.createdBy.toHexString(),
                lastEditedBy: d.lastEditedBy?.toHexString() ?? null,
                updatedAt: d.updatedAt,
            };
        });
    }

    private async requireThread(id: string) {
        const thread = await this.deps.mail.findThread(id);
        if (!thread) throw new NotFoundError("Conversation not found");
        return thread;
    }

    // Only the person who scheduled it, or an admin, may change it.
    private async requireOwnScheduled(user: User, id: string): Promise<ScheduledEmailDoc> {
        const doc = Types.ObjectId.isValid(id)
            ? await this.deps.models.ScheduledEmail.findById(id).lean<ScheduledEmailDoc>()
            : null;
        if (!doc) throw new NotFoundError("Scheduled email not found");
        if (user.role !== "admin" && doc.createdBy.toHexString() !== user.id) {
            throw new ForbiddenError("Only the person who scheduled this email, or an admin, can change it.");
        }
        return doc;
    }

    private record(
        action: ActivityAction,
        actorId: string | null,
        threadId: Types.ObjectId | null,
        meta: Record<string, unknown>,
        entity?: { type: string; id: string },
    ) {
        return this.deps.activities.record({
            actor: actorId ? { type: "user", userId: actorId } : { type: "system" },
            action,
            threadId: threadId?.toHexString(),
            entity,
            meta,
        });
    }

    private recordScheduled(
        action: ActivityAction,
        actorId: string,
        doc: ScheduledEmailDoc,
        meta: Record<string, unknown>,
    ) {
        return this.record(
            action,
            actorId,
            doc.threadId,
            { kind: doc.kind, step: doc.step, ...meta },
            { type: "scheduled_email", id: doc._id.toHexString() },
        );
    }
}

const STOP_TEXT: Record<StopReason, string> = {
    replied: "The client replied",
    unsubscribed: "The contact can't be emailed",
    bounced: "The email bounced",
    manual: "Stopped by a team member",
    failed: "Sending kept failing",
};

const holdReason = (warnings: string[]) =>
    warnings.length ? `Check before it sends: ${warnings.join(" ")}`.slice(0, 1000) : "";

const footer = (url: string) =>
    `<p style="margin-top:24px;font-size:12px;color:#888">If you’d rather not hear from us, <a href="${url}">unsubscribe here</a>.</p>`;
