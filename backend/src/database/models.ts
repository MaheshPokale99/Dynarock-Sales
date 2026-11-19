import type { Connection } from "mongoose";
import { aiRunSchema, suggestionSchema, type AiRunDoc, type SuggestionDoc } from "../modules/ai/ai.model.js";
import { knowledgeSchema, type KnowledgeDoc } from "../modules/knowledge/knowledge.model.js";
import { contactSchema, type ContactDoc } from "../modules/contacts/contact.model.js";
import { organizationSchema, type OrganizationDoc } from "../modules/organizations/organization.model.js";
import { activitySchema, type ActivityDoc } from "../modules/activities/activity.model.js";
import { inviteSchema, sessionSchema, type InviteDoc, type SessionDoc } from "../modules/auth/auth.model.js";
import { draftSchema, type DraftDoc } from "../modules/drafts/draft.model.js";
import { lockSchema, type LockDoc } from "../modules/locks/locks.js";
import { messageSchema, threadSchema, type MessageDoc, type ThreadDoc } from "../modules/mail/mail.model.js";
import { mailboxSchema, type MailboxDoc } from "../modules/mailbox/mailbox.model.js";
import { userSchema, type UserDoc } from "../modules/users/user.model.js";

export function registerModels(connection: Connection) {
    return {
        User: connection.model<UserDoc>("User", userSchema, "users"),
        Session: connection.model<SessionDoc>("Session", sessionSchema, "sessions"),
        Invite: connection.model<InviteDoc>("Invite", inviteSchema, "invites"),
        Activity: connection.model<ActivityDoc>("Activity", activitySchema, "activities"),
        Mailbox: connection.model<MailboxDoc>("Mailbox", mailboxSchema, "mailboxes"),
        Thread: connection.model<ThreadDoc>("Thread", threadSchema, "threads"),
        Message: connection.model<MessageDoc>("Message", messageSchema, "messages"),
        Draft: connection.model<DraftDoc>("Draft", draftSchema, "drafts"),
        Lock: connection.model<LockDoc>("Lock", lockSchema, "locks"),
        Contact: connection.model<ContactDoc>("Contact", contactSchema, "contacts"),
        Organization: connection.model<OrganizationDoc>("Organization", organizationSchema, "organizations"),
        Knowledge: connection.model<KnowledgeDoc>("Knowledge", knowledgeSchema, "knowledge"),
        Suggestion: connection.model<SuggestionDoc>("Suggestion", suggestionSchema, "ai_suggestions"),
        AiRun: connection.model<AiRunDoc>("AiRun", aiRunSchema, "ai_runs"),
    };
}

export type Models = ReturnType<typeof registerModels>;
