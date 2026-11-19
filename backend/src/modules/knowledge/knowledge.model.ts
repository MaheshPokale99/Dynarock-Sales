import { Schema, type Types } from "mongoose";

export const KNOWLEDGE_CATEGORIES = ["module", "ai_feature", "offer", "company", "faq", "case_study"] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export interface KnowledgeDoc {
    _id: Types.ObjectId;
    name: string;
    category: KnowledgeCategory;
    summary: string;
    details: string;
    // Angle per buyer role, e.g. { it_head: "RBAC, audit log, migration handled" }.
    pitchByRole: Record<string, string>;
    url: string;
    active: boolean;
    updatedBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

export const knowledgeSchema = new Schema<KnowledgeDoc>(
    {
        name: { type: String, required: true, trim: true },
        category: { type: String, enum: KNOWLEDGE_CATEGORIES, required: true },
        summary: { type: String, default: "" },
        details: { type: String, default: "" },
        pitchByRole: { type: Schema.Types.Mixed, default: {} },
        url: { type: String, default: "" },
        active: { type: Boolean, default: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true, minimize: false },
);

knowledgeSchema.index({ active: 1, category: 1 });
