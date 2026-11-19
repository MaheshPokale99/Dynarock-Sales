import { Schema, type Types } from "mongoose";

export const ORGANIZATION_TYPES = [
    "university",
    "engineering_college",
    "degree_college",
    "school",
    "institute",
    "other",
] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export interface OrganizationDoc {
    _id: Types.ObjectId;
    name: string;
    type: OrganizationType;
    // e.g. "xyz.edu.in": contacts with this email domain are linked automatically.
    domain: string | null;
    website: string;
    city: string;
    state: string;
    country: string;
    studentCount: number | null;
    currentSystems: string;
    notes: string;
    tags: string[];
    createdBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

export const organizationSchema = new Schema<OrganizationDoc>(
    {
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: ORGANIZATION_TYPES, default: "other" },
        domain: { type: String, default: null, lowercase: true, trim: true },
        website: { type: String, default: "" },
        city: { type: String, default: "" },
        state: { type: String, default: "" },
        country: { type: String, default: "India" },
        studentCount: { type: Number, default: null },
        currentSystems: { type: String, default: "" },
        notes: { type: String, default: "" },
        tags: { type: [String], default: [] },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true },
);

organizationSchema.index({ domain: 1 }, { unique: true, partialFilterExpression: { domain: { $type: "string" } } });
organizationSchema.index({ name: 1 });
