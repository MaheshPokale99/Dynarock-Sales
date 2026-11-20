import { Types } from "mongoose";
import { z } from "zod";
import {
    AppError,
    ConflictError,
    NotFoundError,
    ServiceUnavailableError,
    UpstreamError,
} from "../../common/errors/app-error.js";
import type { Logger } from "../../common/logger/logger.js";
import type { Models } from "../../database/models.js";
import type { AiModel } from "../../integrations/gemini/gemini.js";
import { htmlToText } from "../../integrations/gmail/mime.js";
import type { ActivitiesRepository } from "../activities/activities.repository.js";
import { startOfLocalDay } from "../automation/send-window.js";
import { CONTACT_STAGES, type ContactDoc } from "../contacts/contact.model.js";
import type { ContactsRepository } from "../contacts/contacts.repository.js";
import type { KnowledgeService } from "../knowledge/knowledge.js";
import type { MessageClassification, MessageDoc, ThreadDoc } from "../mail/mail.model.js";
import type { MailRepository } from "../mail/mail.repository.js";
import { DEMO_BUTTON_MARKER, renderEmail, type EmailBrand } from "../mail/email-layout.js";
import type { MailService } from "../mail/mail.service.js";
import type { OrganizationsRepository } from "../organizations/organizations.repository.js";
import type { User } from "../users/users.types.js";
import { INTENTS, type AiKind, type Intent, type SuggestionDoc } from "./ai.model.js";
import { checkDraft, textToEmailHtml } from "./draft.js";
import {
    CLASSIFIER_SYSTEM,
    knowledgeBlock,
    REWRITE_ACTIONS,
    WRITER_SYSTEM,
    type RewriteAction,
    type Tone,
} from "./prompts.js";

const emailSchema = z.object({ subject: z.string().max(200), body: z.string().min(1).max(6000) });
const bodySchema = z.object({ body: z.string().min(1).max(6000) });
const replySchema = z.object({ body: z.string().min(1).max(6000), rationale: z.string().max(400) });
const classifySchema = z.object({
    intent: z.enum(INTENTS),
    confidence: z.number().min(0).max(1),
    sentiment: z.enum(["positive", "neutral", "negative"]),
    summary: z.string().max(300),
    suggestedStage: z.enum(CONTACT_STAGES).nullable(),
    meetingAt: z.string().nullable(),
    returnDate: z.string().nullable(),
});

// Intents that deserve a drafted answer.
const REPLY_INTENTS = new Set<Intent>([
    "interested",
    "demo_request",
    "question",
    "pricing",
    "objection",
    "not_now",
    "other",
]);
const MAX_MESSAGE_CHARS = 2500;
const LIMIT_TIMEZONE = "Asia/Kolkata";
// Automatic AI work per client email address per day, and emails waiting for AI at once.
const MAX_AUTO_PER_SENDER = 5;
const MAX_QUEUE = 100;

const toJsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-7" });
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
// What a person actually sees: the HTML part when there is one (a hidden text part can say anything).
const visibleText = (m: Pick<MessageDoc, "html" | "text">) => (m.html ? htmlToText(m.html) : m.text);

export const toSuggestionDto = (s: SuggestionDoc) => ({
    id: s._id.toHexString(),
    threadId: s.threadId.toHexString(),
    forMessageId: s.forMessageId.toHexString(),
    intent: s.intent,
    subject: s.subject,
    html: s.html,
    rationale: s.rationale,
    warnings: s.warnings,
    status: s.status,
    reviewedBy: s.reviewedBy?.toHexString() ?? null,
    reviewedAt: s.reviewedAt,
    rejectionReason: s.rejectionReason,
    editedBeforeSend: s.editedBeforeSend,
    createdAt: s.createdAt,
});

const DEMO_BUTTON_RULE = `If inviting them to book a demo, put ${DEMO_BUTTON_MARKER} alone on its own line where a "Book a demo" button should appear (once at most, never with a link).`;

interface Deps {
    model: AiModel;
    models: Models;
    knowledge: KnowledgeService;
    contacts: ContactsRepository;
    organizations: OrganizationsRepository;
    mail: MailRepository;
    mailService: MailService;
    activities: ActivitiesRepository;
    limits: { aiDailyCalls: number };
    brand: EmailBrand;
    logger: Logger;
    now?: () => Date;
}

export class AiService {
    private queue: Promise<void> = Promise.resolve();
    private queued = 0;
    private readonly now: () => Date;

    constructor(private readonly deps: Deps) {
        this.now = deps.now ?? (() => new Date());
    }

    get enabled() {
        return this.deps.model.enabled;
    }

    private requireEnabled() {
        if (!this.enabled)
            throw new ServiceUnavailableError("AI isn't set up on the server. Add GEMINI_API_KEY to backend/.env.");
    }

    // One model call: JSON in a fixed shape, validated, retried once if invalid, and logged.
    private async run<T>(
        kind: AiKind,
        userId: string | null,
        schema: z.ZodType<T>,
        system: string,
        prompt: string,
        temperature: number,
    ): Promise<T> {
        if (await this.overBudget())
            throw new AppError(
                "The team has used today's AI allowance. It resets at midnight India time.",
                429,
                "AI_DAILY_LIMIT",
            );
        const started = Date.now();
        let inputTokens = 0;
        let outputTokens = 0;
        let lastError = "";
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const res = await this.deps.model.generate({
                    system,
                    prompt:
                        attempt === 1
                            ? prompt
                            : `${prompt}\n\nYour previous answer did not match the required JSON format. Answer again with valid JSON only.`,
                    schema: toJsonSchema(schema),
                    temperature,
                });
                inputTokens += res.inputTokens;
                outputTokens += res.outputTokens;
                const parsed = schema.safeParse(JSON.parse(res.text));
                if (parsed.success) {
                    await this.logRun(kind, userId, started, inputTokens, outputTokens, null);
                    return parsed.data;
                }
                lastError = "invalid output";
            } catch (error) {
                lastError = error instanceof SyntaxError ? "invalid JSON" : (error as Error).message;
                if (!(error instanceof SyntaxError)) break;
            }
        }
        await this.logRun(kind, userId, started, inputTokens, outputTokens, lastError);
        this.deps.logger.warn({ kind, error: lastError }, "AI call failed");
        throw new UpstreamError("The AI couldn't do that right now. Try again in a moment.");
    }

    private async logRun(
        kind: AiKind,
        userId: string | null,
        started: number,
        inputTokens: number,
        outputTokens: number,
        error: string | null,
    ) {
        await this.deps.models.AiRun.create({
            kind,
            userId: userId ? new Types.ObjectId(userId) : null,
            model: this.deps.model.model,
            inputTokens,
            outputTokens,
            durationMs: Date.now() - started,
            ok: error === null,
            error,
        });
    }

    private startOfDay() {
        return startOfLocalDay(this.now(), LIMIT_TIMEZONE);
    }

    private async overBudget() {
        const used = await this.deps.models.AiRun.countDocuments({ createdAt: { $gte: this.startOfDay() } });
        return used >= this.deps.limits.aiDailyCalls;
    }

    private async knowledge() {
        return this.deps.knowledge.list(true);
    }

    // Notes are internal; leave them out of emails that send without a person reading them first.
    private async contactsBlock(contacts: ContactDoc[], withNotes = true): Promise<string> {
        if (contacts.length === 0) return "RECIPIENT: unknown (no contact details yet).";
        const orgs = await this.deps.organizations.findByIds(
            contacts.flatMap((c) => (c.organizationId ? [c.organizationId] : [])),
        );
        const orgById = new Map(orgs.map((o) => [o._id.toHexString(), o]));
        const lines = contacts.map((c) => {
            const org = c.organizationId ? orgById.get(c.organizationId.toHexString()) : undefined;
            return [
                `- ${c.name || "(name unknown)"} <${c.email}>`,
                c.designation || (c.role !== "other" ? c.role : ""),
                org
                    ? `at ${org.name}${org.city ? `, ${org.city}` : ""}${org.studentCount ? `, ~${org.studentCount} students` : ""}${org.currentSystems ? `, uses: ${org.currentSystems}` : ""}`
                    : "",
                `stage: ${c.stage}`,
                withNotes && c.notes ? `notes: ${truncate(c.notes, 400)}` : "",
            ]
                .filter(Boolean)
                .join(" | ");
        });
        return `RECIPIENT(S):\n${lines.join("\n")}`;
    }

    private threadBlock(messages: MessageDoc[]): string {
        const recent = messages.slice(-6);
        const parts = recent.map((m) => {
            const who = m.direction === "outbound" ? "DYNAROCK" : `CLIENT ${m.from.name || m.from.email}`;
            return `[${m.sentAt.toISOString().slice(0, 10)}] ${who}:\n${truncate(visibleText(m), MAX_MESSAGE_CHARS)}`;
        });
        return `<thread>\n${parts.join("\n---\n")}\n</thread>`;
    }

    private async finish(userId: string | null, body: string, extraSources: string[]) {
        const knowledge = await this.knowledge();
        const sources = [...knowledge.map((k) => `${k.name} ${k.summary} ${k.details} ${k.url}`), ...extraSources];
        return { html: textToEmailHtml(body), warnings: checkDraft(body, sources), userId };
    }

    async compose(user: User, input: { instruction: string; to: string[]; threadId?: string; tone: Tone }) {
        this.requireEnabled();
        const contacts = input.to.length ? await this.deps.contacts.findByEmails(input.to) : [];
        const thread = input.threadId ? await this.deps.mail.findThread(input.threadId) : null;
        const messages = thread ? await this.deps.mail.messagesOf(thread._id, true) : [];

        const prompt = [
            knowledgeBlock(await this.knowledge()),
            await this.contactsBlock(contacts),
            input.to.length && contacts.length === 0 ? `Recipient email(s): ${input.to.join(", ")}` : "",
            messages.length ? this.threadBlock(messages) : "",
            `SENDER: ${user.name}, Dynarock sales team.`,
            `TONE: ${input.tone}.`,
            `TASK: ${input.instruction}`,
            "Write the email. Return a short subject (under 70 characters) and the body.",
        ]
            .filter(Boolean)
            .join("\n\n");

        const out = await this.run("compose", user.id, emailSchema, WRITER_SYSTEM, prompt, 0.6);
        const done = await this.finish(user.id, out.body, messages.map(visibleText));
        return { subject: out.subject.trim(), html: done.html, warnings: done.warnings };
    }

    async rewrite(user: User, input: { html: string; action: RewriteAction; instruction?: string }) {
        this.requireEnabled();
        const text = htmlToText(input.html);
        if (!text.trim()) throw new ConflictError("Write something first, then ask the AI to rewrite it.");
        const how = input.action === "custom" ? (input.instruction ?? "Improve it.") : REWRITE_ACTIONS[input.action];
        const prompt = [
            knowledgeBlock(await this.knowledge()),
            `<draft>\n${truncate(text, 6000)}\n</draft>`,
            `TASK: Rewrite the draft. ${how}`,
            "Keep any facts and numbers that are already in the draft. Return only the new body.",
        ].join("\n\n");
        const out = await this.run("rewrite", user.id, bodySchema, WRITER_SYSTEM, prompt, 0.4);
        const done = await this.finish(user.id, out.body, [text]);
        return { html: done.html, warnings: done.warnings };
    }

    // Writes follow-up number `step` for a conversation where the client hasn't replied.
    async writeFollowUp(threadId: string, step: number, totalSteps: number, instruction: string) {
        this.requireEnabled();
        const thread = await this.deps.mail.findThread(threadId);
        if (!thread) throw new NotFoundError("Conversation not found");
        // Auto-replies are written by whoever controls the client's mailbox, so they don't reach the prompt.
        const messages = (await this.deps.mail.messagesOf(thread._id, true)).filter((m) => !m.isAutoReply);
        const contacts = await this.deps.contacts.findByIds(thread.contactIds ?? []);
        const prompt = [
            knowledgeBlock(await this.knowledge()),
            await this.contactsBlock(contacts, false),
            this.threadBlock(messages),
            `TASK: Write follow-up ${step} of ${totalSteps}. The client has not replied to our last email. ${instruction}`,
            "Keep it under 90 words. Do not repeat earlier emails word for word. One clear, low-pressure next step.",
            DEMO_BUTTON_RULE,
        ].join("\n\n");
        const out = await this.run("compose", null, bodySchema, WRITER_SYSTEM, prompt, 0.6);
        const done = await this.finish(null, out.body, messages.map(visibleText));
        return { html: done.html, warnings: done.warnings };
    }

    // Labels one client email and stores the result on the message and its thread.
    async classify(message: MessageDoc, thread: ThreadDoc): Promise<MessageClassification> {
        const messages = await this.deps.mail.messagesOf(thread._id, true);
        const earlier = messages.filter((m) => m.sentAt < message.sentAt);
        const prompt = [
            earlier.length ? `Earlier in the conversation:\n${this.threadBlock(earlier)}` : "",
            `The reply to label:\n<email>\nFrom: ${message.from.name} <${message.from.email}>\nSubject: ${message.subject}\nAuto-reply headers: ${message.isAutoReply ? "yes" : "no"}\n\n${truncate(visibleText(message), 4000)}\n</email>`,
        ]
            .filter(Boolean)
            .join("\n\n");
        const result = await this.run("classify", null, classifySchema, CLASSIFIER_SYSTEM, prompt, 0);
        await this.deps.models.Message.updateOne({ _id: message._id }, { $set: { classification: result } });
        await this.deps.models.Thread.updateOne(
            { _id: thread._id },
            { $set: { latestIntent: result.intent, aiSummary: result.summary } },
        );
        return result;
    }

    // Drafts an answer to a client email; it waits in Approvals until someone sends or rejects it.
    async suggestReply(threadId: string, forMessageId?: string, userId: string | null = null) {
        this.requireEnabled();
        const thread = await this.deps.mail.findThread(threadId);
        if (!thread) throw new NotFoundError("Conversation not found");
        const messages = await this.deps.mail.messagesOf(thread._id, true);
        const target = forMessageId
            ? messages.find((m) => m._id.toHexString() === forMessageId)
            : messages.findLast((m) => m.direction === "inbound");
        if (!target || target.direction !== "inbound")
            throw new ConflictError("There's no client email here to reply to.");

        const contacts = await this.deps.contacts.findByIds(thread.contactIds ?? []);
        const label = target.classification
            ? `The client's email was labelled "${target.classification.intent}": ${target.classification.summary}`
            : "";
        const prompt = [
            knowledgeBlock(await this.knowledge()),
            await this.contactsBlock(contacts),
            this.threadBlock(messages.filter((m) => m.sentAt <= target.sentAt)),
            label,
            "TASK: Write the Dynarock sales team's reply to the client's latest email. Answer what they asked using only KNOWLEDGE, and propose a clear next step (usually a short demo). Also give a one-sentence rationale for the salesperson.",
            DEMO_BUTTON_RULE,
        ]
            .filter(Boolean)
            .join("\n\n");

        const out = await this.run("reply", userId, replySchema, WRITER_SYSTEM, prompt, 0.5);
        const done = await this.finish(userId, out.body, messages.map(visibleText));
        await this.deps.models.Suggestion.deleteMany({ forMessageId: target._id, status: "pending" });
        await this.deps.models.Suggestion.updateMany(
            { threadId: thread._id, status: "pending" },
            { $set: { status: "superseded" } },
        );
        const doc = await this.deps.models.Suggestion.create({
            threadId: thread._id,
            forMessageId: target._id,
            contactIds: thread.contactIds ?? [],
            intent: target.classification?.intent ?? null,
            subject: thread.subject.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject}`,
            html: done.html,
            rationale: out.rationale,
            warnings: done.warnings,
            model: this.deps.model.model,
        });
        await this.deps.activities.record({
            actor: { type: "ai" },
            action: "ai.reply_suggested",
            threadId: thread._id.toHexString(),
            entity: { type: "suggestion", id: doc._id.toHexString() },
        });
        return toSuggestionDto(doc.toObject<SuggestionDoc>());
    }

    // Runs for every new client email, one at a time in the background.
    enqueueInbound(threadId: Types.ObjectId, messageId: Types.ObjectId): void {
        if (!this.enabled) return;
        if (this.queued >= MAX_QUEUE) {
            this.deps.logger.warn({ messageId: messageId.toHexString() }, "AI queue is full; skipping a client email");
            return;
        }
        this.queued++;
        this.queue = this.queue
            .then(() => this.processInbound(threadId, messageId))
            .catch((error: unknown) => this.deps.logger.warn({ err: error }, "AI processing of a client email failed"))
            .finally(() => {
                this.queued--;
            });
    }

    // Resolves when queued AI work is done (used by tests and shutdown).
    idle(): Promise<void> {
        return this.queue;
    }

    private async processInbound(threadId: Types.ObjectId, messageId: Types.ObjectId) {
        const thread = await this.deps.mail.findThread(threadId.toHexString());
        const message = await this.deps.mail.findMessage(messageId.toHexString());
        if (!thread || !message || message.direction !== "inbound") return;
        // Only conversations we started or answered: a stranger can't spend the AI budget by emailing us.
        if (!thread.lastOutboundAt) return;
        if (await this.overBudget()) return;
        const fromSender = await this.deps.models.Message.countDocuments({
            direction: "inbound",
            "from.email": message.from.email,
            classification: { $ne: null },
            createdAt: { $gte: this.startOfDay() },
        });
        if (fromSender >= MAX_AUTO_PER_SENDER) return;

        // A newer client email makes older drafts in this thread outdated.
        await this.deps.models.Suggestion.updateMany(
            { threadId: thread._id, status: "pending", forMessageId: { $ne: message._id } },
            { $set: { status: "superseded" } },
        );

        const result = await this.classify(message, thread);
        // A sender that failed Gmail's authentication check could be forging someone else's address.
        if (result.intent === "unsubscribe" && message.authResult !== "fail")
            await this.unsubscribe(message.from.email, thread);
        if (message.isAutoReply || !REPLY_INTENTS.has(result.intent)) return;

        const latestInbound = (await this.deps.mail.messagesOf(thread._id)).findLast((m) => m.direction === "inbound");
        if (latestInbound && !latestInbound._id.equals(message._id)) return;
        await this.suggestReply(thread._id.toHexString(), message._id.toHexString());
    }

    private async unsubscribe(email: string, thread: ThreadDoc) {
        const [contact] = await this.deps.contacts.findByEmails([email]);
        if (!contact || contact.status !== "active") return;
        await this.deps.contacts.update(contact._id, { status: "unsubscribed" });
        await this.deps.activities.record({
            actor: { type: "ai" },
            action: "contact.unsubscribed",
            contactId: contact._id.toHexString(),
            threadId: thread._id.toHexString(),
            meta: { reason: "Asked to stop emails" },
        });
    }

    async listSuggestions(query: { status: SuggestionDoc["status"]; threadId?: string }) {
        const filter: Record<string, unknown> = { status: query.status };
        if (query.threadId) filter.threadId = new Types.ObjectId(query.threadId);
        const docs = await this.deps.models.Suggestion.find(filter)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean<SuggestionDoc[]>();
        const threads = await this.deps.models.Thread.find({ _id: { $in: docs.map((d) => d.threadId) } }).lean<
            ThreadDoc[]
        >();
        const messages = await this.deps.models.Message.find({ _id: { $in: docs.map((d) => d.forMessageId) } })
            .select("from subject snippet sentAt classification text html")
            .lean<MessageDoc[]>();
        const threadById = new Map(threads.map((t) => [t._id.toHexString(), t]));
        const messageById = new Map(messages.map((m) => [m._id.toHexString(), m]));
        return docs.map((d) => {
            const t = threadById.get(d.threadId.toHexString());
            const m = messageById.get(d.forMessageId.toHexString());
            return {
                ...toSuggestionDto(d),
                thread: t ? { id: t._id.toHexString(), subject: t.subject, participants: t.participants } : null,
                forMessage: m
                    ? {
                          from: m.from,
                          subject: m.subject,
                          text: truncate(visibleText(m), 3000),
                          sentAt: m.sentAt,
                          summary: m.classification?.summary ?? "",
                      }
                    : null,
            };
        });
    }

    async pendingCount() {
        return this.deps.models.Suggestion.countDocuments({ status: "pending" });
    }

    async sendSuggestion(
        user: User,
        id: string,
        input: { to: string[]; cc: string[]; bcc: string[]; subject: string; html: string },
    ) {
        const suggestion = await this.pending(id);
        try {
            const sent = await this.deps.mailService.send(user, {
                mode: "reply",
                threadId: suggestion.threadId.toHexString(),
                replyToMessageId: suggestion.forMessageId.toHexString(),
                attachmentFileIds: [],
                ...input,
                html: renderEmail(input.html, this.deps.brand),
            });
            await this.deps.models.Suggestion.updateOne(
                { _id: suggestion._id },
                {
                    $set: {
                        status: "sent",
                        reviewedBy: new Types.ObjectId(user.id),
                        reviewedAt: new Date(),
                        editedBeforeSend: htmlToText(input.html).trim() !== htmlToText(suggestion.html).trim(),
                        sentMessageId: new Types.ObjectId(sent.messageId),
                    },
                },
            );
            await this.deps.activities.record({
                actor: { type: "user", userId: user.id },
                action: "ai.suggestion_sent",
                threadId: sent.threadId,
                entity: { type: "suggestion", id },
            });
            return sent;
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new UpstreamError("Sending failed. The draft is still waiting in Approvals.");
        }
    }

    async rejectSuggestion(user: User, id: string, reason: string) {
        const suggestion = await this.pending(id);
        await this.deps.models.Suggestion.updateOne(
            { _id: suggestion._id },
            {
                $set: {
                    status: "rejected",
                    reviewedBy: new Types.ObjectId(user.id),
                    reviewedAt: new Date(),
                    rejectionReason: reason,
                },
            },
        );
        await this.deps.activities.record({
            actor: { type: "user", userId: user.id },
            action: "ai.suggestion_rejected",
            threadId: suggestion.threadId.toHexString(),
            entity: { type: "suggestion", id },
            meta: reason ? { reason } : {},
        });
    }

    private async pending(id: string) {
        const suggestion = Types.ObjectId.isValid(id)
            ? await this.deps.models.Suggestion.findById(id).lean<SuggestionDoc>()
            : null;
        if (!suggestion) throw new NotFoundError("Suggestion not found");
        if (suggestion.status !== "pending") throw new ConflictError(`This draft was already ${suggestion.status}.`);
        return suggestion;
    }
}
