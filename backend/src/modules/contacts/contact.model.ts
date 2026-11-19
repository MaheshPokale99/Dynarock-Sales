import { Schema, type Types } from "mongoose";

export const CONTACT_STAGES = [
    "new",
    "contacted",
    "replied",
    "demo_scheduled",
    "demo_done",
    "proposal",
    "negotiation",
    "won",
    "lost",
] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];

export const CONTACT_ROLES = [
    "principal",
    "director",
    "dean",
    "registrar",
    "it_head",
    "trustee",
    "faculty",
    "admin_staff",
    "other",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_STATUSES = ["active", "unsubscribed", "bounced", "do_not_contact"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_SOURCES = ["compose", "inbound", "manual", "import"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export interface ContactDoc {
    _id: Types.ObjectId;
    email: string;
    // Email domain, for linking to a college.
    domain: string;
    name: string;
    role: ContactRole;
    designation: string;
    phone: string;
    organizationId: Types.ObjectId | null;
    stage: ContactStage;
    lostReason: string;
    ownerId: Types.ObjectId | null;
    status: ContactStatus;
    source: ContactSource;
    tags: string[];
    notes: string;
    lastContactedAt: Date | null;
    lastRepliedAt: Date | null;
    createdBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

export const contactSchema = new Schema<ContactDoc>(
    {
        email: { type: String, required: true, lowercase: true, trim: true },
        domain: { type: String, required: true, lowercase: true },
        name: { type: String, default: "", trim: true },
        role: { type: String, enum: CONTACT_ROLES, default: "other" },
        designation: { type: String, default: "" },
        phone: { type: String, default: "" },
        organizationId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
        stage: { type: String, enum: CONTACT_STAGES, default: "new" },
        lostReason: { type: String, default: "" },
        ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
        status: { type: String, enum: CONTACT_STATUSES, default: "active" },
        source: { type: String, enum: CONTACT_SOURCES, default: "manual" },
        tags: { type: [String], default: [] },
        notes: { type: String, default: "" },
        lastContactedAt: { type: Date, default: null },
        lastRepliedAt: { type: Date, default: null },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);

contactSchema.index({ email: 1 }, { unique: true });
contactSchema.index({ domain: 1 });
contactSchema.index({ stage: 1, updatedAt: -1 });
contactSchema.index({ organizationId: 1 });
contactSchema.index({ ownerId: 1 });
contactSchema.index({ updatedAt: -1 });
