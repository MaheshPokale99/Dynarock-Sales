import type { KnowledgeCategory } from "./knowledge.model.js";

// Starting facts, taken from dynarock.in (November 2026). Admins edit them on the Knowledge page.
export const KNOWLEDGE_SEED: {
    name: string;
    category: KnowledgeCategory;
    summary: string;
    details?: string;
    pitchByRole?: Record<string, string>;
}[] = [
    {
        name: "Dynarock, the AI-Powered Campus Operating System",
        category: "company",
        summary:
            "One real-time platform that replaces a college's separate ERP, LMS and campus tools, built by Dynarock Systems Inc.",
        details:
            "Dynarock brings data, people and processes together: academics, attendance, fees, exams, placements, communication and operations in one system, with AI insights on top.",
        pitchByRole: {
            principal: "One dashboard for the whole campus instead of a dozen disconnected tools.",
            trustee: "Fewer tools to pay for and one source of truth for decisions.",
            director: "Real-time view of academics, fees and operations across departments.",
        },
    },
    {
        name: "Free plan and demo",
        category: "offer",
        summary: "There is a free plan, no credit card is required, and the team offers a demo.",
        details:
            "The main call to action is to schedule a demo. Do not quote prices; pricing is discussed after the demo.",
    },
    {
        name: "Admissions",
        category: "module",
        summary: "Track, manage and convert student enquiries from web, email and walk-ins in one admissions system.",
        pitchByRole: { registrar: "Every enquiry and application in one place, no spreadsheets." },
    },
    {
        name: "Academic structure and student records",
        category: "module",
        summary: "Consistent, real-time academic records with central access to grades, attendance and faculty inputs.",
        details: "Includes bulk CSV import and a global search across every module.",
    },
    {
        name: "Attendance",
        category: "module",
        summary: "Timetable-linked student attendance plus geofenced and biometric staff check-in.",
        pitchByRole: { principal: "Attendance trends per class and department without manual registers." },
    },
    {
        name: "Fees and student ledger",
        category: "module",
        summary: "Configurable fee structures with a full debit and credit ledger per student, and fee reconciliation.",
        pitchByRole: {
            trustee: "Clear fee collection and dues per student.",
            principal: "No more fee tracking in Tally and Excel.",
        },
    },
    {
        name: "Exams and result cards",
        category: "module",
        summary: "Custom-branded hall tickets, marksheets and bulk result processing, published to the student portal.",
        pitchByRole: { registrar: "Exam schedules, hall tickets and results without manual work." },
    },
    {
        name: "Smart timetable engine",
        category: "module",
        summary: "Auto-generates conflict-free timetables, validates faculty and room load, and exports to DOCX.",
    },
    {
        name: "Placements cell",
        category: "module",
        summary: "Eligibility rules, placement drives, applications and offer tracking end to end.",
    },
    {
        name: "Leave management",
        category: "module",
        summary: "Staff leave applications with department-aware approvals.",
    },
    {
        name: "Inventory and procurement",
        category: "module",
        summary: "Request, approve, issue and raise purchase orders for equipment.",
    },
    {
        name: "Library",
        category: "module",
        summary: "Searchable catalogue with student hold and request workflows.",
    },
    {
        name: "Document requests",
        category: "module",
        summary: "Bonafide certificates and transcripts, tracked end to end.",
        pitchByRole: { registrar: "Students request documents online; the office tracks every request." },
    },
    {
        name: "Calendar, notifications and messaging",
        category: "module",
        summary:
            "Academic calendar with role-scoped alerts and bulk event import; messaging, projects and announcements kept in sync across the campus.",
    },
    {
        name: "AI quiz generator",
        category: "ai_feature",
        summary: "Turns uploaded course material into ready-to-grade quizzes in seconds.",
        pitchByRole: { dean: "Faculty save hours preparing assessments." },
    },
    {
        name: "AI performance insights",
        category: "ai_feature",
        summary: "Auto-generated student and cohort reports with prioritised recommendations.",
        pitchByRole: { principal: "See which students and classes need attention, early." },
    },
    {
        name: "AI course feedback",
        category: "ai_feature",
        summary: "Student review forms with AI-generated question sets, targeted by department or batch.",
    },
    {
        name: "Security and access control",
        category: "faq",
        summary: "Role-based access control, full audit logging and IP-level abuse protection are built in.",
        pitchByRole: { it_head: "RBAC, a full audit log and abuse protection out of the box." },
    },
    {
        name: "Migration from legacy software",
        category: "faq",
        summary: "The Dynarock team handles migration from existing systems; setup takes minutes for new modules.",
        pitchByRole: { it_head: "We migrate your existing data; no big-bang switch." },
    },
];
