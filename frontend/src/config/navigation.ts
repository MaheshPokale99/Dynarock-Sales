import {
    BookOpen,
    CalendarClock,
    ChartLine,
    FileText,
    Inbox,
    Kanban,
    Settings,
    Sparkles,
    Users,
    UsersRound,
    Building2,
    type LucideIcon,
} from "lucide-react";

export interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    adminOnly?: boolean;
    // Shown in the menu but built in a later phase.
    soon?: string;
}

export interface NavSection {
    label: string;
    items: NavItem[];
}

export const APP_NAME = "Dynarock Sales";
export const APP_TAGLINE = "sales@dynarock.in";

export const NAV_SECTIONS: readonly NavSection[] = [
    {
        label: "Sales",
        items: [
            {
                href: "/inbox",
                label: "Inbox",
                icon: Inbox,
            },
            {
                href: "/approvals",
                label: "Approvals",
                icon: Sparkles,
            },
            {
                href: "/follow-ups",
                label: "Follow-ups",
                icon: CalendarClock,
            },
            { href: "/contacts", label: "Contacts", icon: UsersRound },
            { href: "/organizations", label: "Colleges", icon: Building2 },
            { href: "/pipeline", label: "Pipeline", icon: Kanban },
            { href: "/dashboard", label: "Dashboard", icon: ChartLine, soon: "Growth charts and team numbers." },
        ],
    },
    {
        label: "Library",
        items: [
            { href: "/templates", label: "Templates", icon: FileText, soon: "Saved emails you can reuse." },
            {
                href: "/knowledge",
                label: "Knowledge",
                icon: BookOpen,
            },
        ],
    },
    {
        label: "Workspace",
        items: [
            { href: "/team", label: "Team", icon: Users, adminOnly: true },
            { href: "/settings", label: "Settings", icon: Settings },
        ],
    },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export const HOME_PATH = "/inbox";

export const isNavActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export const navItemFor = (pathname: string) => ALL_NAV_ITEMS.find((item) => isNavActive(pathname, item.href));
