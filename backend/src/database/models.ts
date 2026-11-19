import type { Connection } from "mongoose";
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
    };
}

export type Models = ReturnType<typeof registerModels>;
