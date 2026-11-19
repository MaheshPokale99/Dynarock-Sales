"use client";

import { PenSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/common/brand";
import { UserMenu } from "@/components/layout/user-menu";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME, APP_TAGLINE, HOME_PATH, NAV_SECTIONS, isNavActive } from "@/config/navigation";
import { useCompose } from "@/features/compose/compose-provider";
import { useSuggestionCounts } from "@/hooks/use-ai";
import { useScheduledCounts } from "@/hooks/use-automation";
import { useThreadCounts } from "@/hooks/use-mail";
import type { User } from "@/lib/api";

export function AppSidebar({ user }: { user: User }) {
    const pathname = usePathname();
    const { isMobile, setOpenMobile } = useSidebar();
    const close = () => isMobile && setOpenMobile(false);
    const compose = useCompose();
    const { data: counts } = useThreadCounts();
    const { data: approvals } = useSuggestionCounts();
    const { data: scheduled } = useScheduledCounts();

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            size="lg"
                            tooltip={APP_NAME}
                            render={<Link href={HOME_PATH} />}
                            onClick={close}
                        >
                            <BrandMark />
                            <span className="grid flex-1 text-left leading-tight">
                                <span className="truncate text-sm font-semibold">{APP_NAME}</span>
                                <span className="truncate text-xs text-muted-foreground">{APP_TAGLINE}</span>
                            </span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem className="mt-2">
                        <SidebarMenuButton
                            tooltip="Compose"
                            className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                            onClick={() => {
                                close();
                                compose.open();
                            }}
                        >
                            <PenSquare aria-hidden />
                            <span>Compose</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {NAV_SECTIONS.map((section) => {
                    const items = section.items.filter((i) => !i.adminOnly || user.role === "admin");
                    if (items.length === 0) return null;
                    return (
                        <SidebarGroup key={section.label}>
                            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {items.map(({ href, label, icon: Icon }) => {
                                        const active = isNavActive(pathname, href);
                                        return (
                                            <SidebarMenuItem key={href}>
                                                <SidebarMenuButton
                                                    tooltip={label}
                                                    isActive={active}
                                                    render={
                                                        <Link href={href} aria-current={active ? "page" : undefined} />
                                                    }
                                                    onClick={close}
                                                >
                                                    <Icon aria-hidden />
                                                    <span>{label}</span>
                                                </SidebarMenuButton>
                                                {href === "/follow-ups" && (scheduled?.today ?? 0) > 0 && (
                                                    <SidebarMenuBadge aria-label={`${scheduled?.today} due today`}>
                                                        {scheduled?.today}
                                                    </SidebarMenuBadge>
                                                )}
                                                {href === "/approvals" && (approvals?.pending ?? 0) > 0 && (
                                                    <SidebarMenuBadge
                                                        aria-label={`${approvals?.pending} waiting for approval`}
                                                    >
                                                        {approvals?.pending}
                                                    </SidebarMenuBadge>
                                                )}
                                                {href === "/inbox" && (counts?.needs_reply ?? 0) > 0 && (
                                                    <SidebarMenuBadge
                                                        aria-label={`${counts?.needs_reply} need a reply`}
                                                    >
                                                        {counts?.needs_reply}
                                                    </SidebarMenuBadge>
                                                )}
                                            </SidebarMenuItem>
                                        );
                                    })}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    );
                })}
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <UserMenu user={user} />
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
