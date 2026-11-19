import type {
    ContactRole,
    ContactStage,
    ContactStatus,
    Intent,
    KnowledgeCategory,
    OrganizationType,
    Tone,
    UserRole,
    UserStatus,
} from "@/lib/api";

export const INTENT_LABELS: Record<Intent, string> = {
    interested: "Interested",
    demo_request: "Wants a demo",
    question: "Question",
    pricing: "Pricing",
    objection: "Objection",
    not_now: "Not now",
    not_interested: "Not interested",
    out_of_office: "Out of office",
    unsubscribe: "Unsubscribe",
    bounce: "Bounced",
    other: "Other",
};

export const INTENT_TONE: Record<Intent, string> = {
    interested: "bg-success",
    demo_request: "bg-success",
    question: "bg-info",
    pricing: "bg-info",
    objection: "bg-warning",
    not_now: "bg-warning",
    not_interested: "bg-destructive",
    out_of_office: "bg-muted-foreground/50",
    unsubscribe: "bg-destructive",
    bounce: "bg-destructive",
    other: "bg-muted-foreground/50",
};

export const TONE_LABELS: Record<Tone, string> = {
    professional: "Professional",
    friendly: "Friendly",
    formal: "Formal",
    concise: "Short and direct",
};

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
    company: "Company",
    offer: "Offer",
    module: "Module",
    ai_feature: "AI feature",
    faq: "FAQ",
    case_study: "Case study",
};

export const ROLE_LABELS: Record<UserRole, string> = { admin: "Admin", sales_rep: "Sales rep" };

export const STATUS_LABELS: Record<UserStatus, string> = {
    invited: "Invited",
    active: "Active",
    disabled: "Disabled",
};

export const STAGES: ContactStage[] = [
    "new",
    "contacted",
    "replied",
    "demo_scheduled",
    "demo_done",
    "proposal",
    "negotiation",
    "won",
    "lost",
];

export const STAGE_LABELS: Record<ContactStage, string> = {
    new: "New",
    contacted: "Contacted",
    replied: "Replied",
    demo_scheduled: "Demo scheduled",
    demo_done: "Demo done",
    proposal: "Proposal sent",
    negotiation: "Negotiation",
    won: "Won",
    lost: "Lost",
};

// Dot colour per stage (semantic tokens only).
export const STAGE_TONE: Record<ContactStage, string> = {
    new: "bg-muted-foreground/50",
    contacted: "bg-info",
    replied: "bg-warning",
    demo_scheduled: "bg-info",
    demo_done: "bg-info",
    proposal: "bg-warning",
    negotiation: "bg-warning",
    won: "bg-success",
    lost: "bg-destructive",
};

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
    principal: "Principal",
    director: "Director",
    dean: "Dean",
    registrar: "Registrar",
    it_head: "IT head",
    trustee: "Trustee / management",
    faculty: "Faculty",
    admin_staff: "Admin staff",
    other: "Other",
};

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
    active: "Active",
    unsubscribed: "Unsubscribed",
    bounced: "Bounced",
    do_not_contact: "Do not contact",
};

export const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
    university: "University",
    engineering_college: "Engineering college",
    degree_college: "Degree college",
    school: "School",
    institute: "Institute",
    other: "Other",
};

export const options = <T extends string>(labels: Record<T, string>) =>
    (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
