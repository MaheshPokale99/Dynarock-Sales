"use client";

import { MailSearch, PenSquare, RefreshCw, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMailbox, useSyncNow, useThreadCounts } from "@/hooks/use-mail";
import { useTeam } from "@/hooks/use-team";
import { errorMessage, type ThreadFolder } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useCompose } from "../compose/compose-provider";
import { DraftsList } from "./drafts-list";
import { MailboxBanner } from "./mailbox-banner";
import { ThreadList } from "./thread-list";
import { ThreadView } from "./thread-view";

type Tab = ThreadFolder | "drafts";
const TABS: { value: Tab; label: string }[] = [
    { value: "needs_reply", label: "Needs reply" },
    { value: "awaiting_reply", label: "Awaiting" },
    { value: "all", label: "All" },
    { value: "sent", label: "Sent" },
    { value: "drafts", label: "Drafts" },
    { value: "closed", label: "Closed" },
];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.value === v);

export function InboxPage() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const tab: Tab = isTab(params.get("f")) ? (params.get("f") as Tab) : "needs_reply";
    const threadId = params.get("t");
    const sentBy = params.get("by") ?? "";
    const [search, setSearch] = useState(params.get("q") ?? "");
    const q = params.get("q") ?? "";

    const compose = useCompose();
    const team = useTeam();
    const counts = useThreadCounts();
    const { data: mailbox } = useMailbox();
    const sync = useSyncNow();

    const teamNames = useMemo(() => new Map((team.data ?? []).map((m) => [m.id, m.name])), [team.data]);

    const href = (patch: Record<string, string | null>) => {
        const next = new URLSearchParams(params.toString());
        for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
        }
        const s = next.toString();
        return s ? `${pathname}?${s}` : pathname;
    };

    // Search after a short pause in typing.
    useEffect(() => {
        if (search.trim() === q) return;
        const t = setTimeout(() => router.replace(href({ q: search.trim() || null, t: null }), { scroll: false }), 350);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const syncNow = () =>
        sync.mutate(undefined, {
            onSuccess: (r) =>
                toast.success(r.added ? `${r.added} new message${r.added === 1 ? "" : "s"}` : "Up to date"),
            onError: (e) => toast.error(errorMessage(e)),
        });

    return (
        <div className="flex h-[calc(100svh-3.5rem)]">
            <section
                aria-label="Conversation list"
                className={cn(
                    "flex w-full min-w-0 flex-col border-r lg:w-[400px] lg:shrink-0",
                    threadId && "max-lg:hidden",
                )}
            >
                <div className="space-y-3 border-b p-3">
                    <div className="flex items-center gap-2">
                        <InputGroup className="flex-1">
                            <InputGroupAddon>
                                <Search aria-hidden />
                            </InputGroupAddon>
                            <InputGroupInput
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search people, subjects…"
                                aria-label="Search conversations"
                            />
                        </InputGroup>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={syncNow}
                            disabled={sync.isPending || mailbox?.status !== "connected"}
                            aria-label="Check for new mail"
                        >
                            <RefreshCw className={cn(sync.isPending && "animate-spin")} aria-hidden />
                        </Button>
                        <Button size="icon" onClick={() => compose.open()} aria-label="Compose" className="lg:hidden">
                            <PenSquare aria-hidden />
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Tabs
                            value={tab}
                            onValueChange={(v) => router.replace(href({ f: v as string, t: null }), { scroll: false })}
                            className="min-w-0 flex-1"
                        >
                            <TabsList className="w-full justify-start overflow-x-auto">
                                {TABS.map((t) => (
                                    <TabsTrigger key={t.value} value={t.value} className="flex-none px-2 text-xs">
                                        {t.label}
                                        {t.value === "needs_reply" && (counts.data?.needs_reply ?? 0) > 0 && (
                                            <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                                                {counts.data?.needs_reply}
                                            </span>
                                        )}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                    </div>
                    {tab !== "drafts" && (team.data?.length ?? 0) > 1 && (
                        <Select
                            value={sentBy || "everyone"}
                            onValueChange={(v) =>
                                router.replace(href({ by: v === "everyone" ? null : (v as string), t: null }), {
                                    scroll: false,
                                })
                            }
                            items={[
                                { value: "everyone", label: "Sent by anyone" },
                                ...(team.data ?? []).map((m) => ({ value: m.id, label: `Sent by ${m.name}` })),
                            ]}
                        >
                            <SelectTrigger size="sm" className="w-full" aria-label="Filter by sender">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="everyone">Sent by anyone</SelectItem>
                                {(team.data ?? []).map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        Sent by {m.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <MailboxBanner />
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {tab === "drafts" ? (
                        <DraftsList />
                    ) : (
                        <ThreadList
                            folder={tab}
                            q={q}
                            sentBy={sentBy}
                            activeId={threadId}
                            hrefFor={(id) => href({ t: id })}
                            teamNames={teamNames}
                        />
                    )}
                </div>
            </section>

            <section
                aria-label="Conversation"
                className={cn("min-w-0 flex-1 flex-col", threadId ? "flex" : "hidden lg:flex")}
            >
                {threadId ? (
                    <ThreadView key={threadId} threadId={threadId} backHref={href({ t: null })} teamNames={teamNames} />
                ) : (
                    <div className="flex flex-1 items-center justify-center p-6">
                        <EmptyState
                            icon={MailSearch}
                            title="Pick a conversation"
                            description="Or start a new one. Every email sent from sales@dynarock.in is tracked here."
                            action={
                                <Button onClick={() => compose.open()}>
                                    <PenSquare data-icon="inline-start" />
                                    Compose
                                </Button>
                            }
                        />
                    </div>
                )}
            </section>
        </div>
    );
}
