"use client";

import { CalendarClock, PauseCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page-header";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/hooks/use-auth";
import { useScheduled, useScheduledCounts } from "@/hooks/use-automation";
import { errorMessage, type ScheduledEmail, type ScheduledStatus } from "@/lib/api";
import { AutomationSettingsCard } from "./automation-settings";
import { Plans } from "./plans";
import { ScheduledItem } from "./scheduled-item";

function dayGroup(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString() || d < today) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

function List({ status, empty }: { status: ScheduledStatus; empty: string }) {
    const list = useScheduled({ status });
    if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />;
    if (list.isPending) return <Skeleton className="h-48 rounded-xl" />;
    if (list.data.length === 0) return <EmptyState icon={CalendarClock} title={empty} />;

    if (status !== "scheduled") {
        return (
            <div className="space-y-3">
                {list.data.map((s) => (
                    <ScheduledItem key={s.id} item={s} />
                ))}
            </div>
        );
    }
    const groups = new Map<string, ScheduledEmail[]>();
    for (const s of list.data) groups.set(dayGroup(s.sendAt), [...(groups.get(dayGroup(s.sendAt)) ?? []), s]);
    return (
        <div className="space-y-6">
            {[...groups].map(([day, items]) => (
                <section key={day} className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">
                        {day} · {items.length}
                    </h2>
                    {items.map((s) => (
                        <ScheduledItem key={s.id} item={s} />
                    ))}
                </section>
            ))}
        </div>
    );
}

export function FollowUpsPage() {
    const { data: me } = useMe();
    const { data: counts } = useScheduledCounts();
    const [tab, setTab] = useState("scheduled");

    return (
        <>
            <PageHeader
                title="Follow-ups"
                description="Everything that will send by itself. Follow-ups stop the moment a client replies, and you can edit any of them first."
            />
            {counts && (
                <p className="mb-4 text-sm text-muted-foreground">
                    {counts.upcoming} scheduled · {counts.today} due today · {counts.sentToday} of {counts.dailyCap}{" "}
                    automatic emails sent today
                </p>
            )}
            {counts?.paused && (
                <Alert className="mb-4 border-warning/50">
                    <PauseCircle className="text-warning" aria-hidden />
                    <AlertTitle>Automatic follow-ups are paused</AlertTitle>
                    <AlertDescription>Nothing automatic is being sent.</AlertDescription>
                    {me?.role === "admin" && (
                        <AlertAction>
                            <Button size="sm" variant="outline" onClick={() => setTab("settings")}>
                                Settings
                            </Button>
                        </AlertAction>
                    )}
                </Alert>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
                <TabsList className="max-w-full justify-start overflow-x-auto">
                    <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                    <TabsTrigger value="sent">Sent</TabsTrigger>
                    <TabsTrigger value="cancelled">Stopped</TabsTrigger>
                    <TabsTrigger value="plans">Plans</TabsTrigger>
                    {me?.role === "admin" && <TabsTrigger value="settings">Settings</TabsTrigger>}
                </TabsList>
                <TabsContent value="scheduled" className="pt-4">
                    <List status="scheduled" empty="Nothing scheduled" />
                    <p className="mt-4 text-xs text-muted-foreground">
                        Start follow-ups from Compose (“Follow up if no reply”) or from any conversation in the{" "}
                        <Link href="/inbox?f=awaiting_reply" className="underline">
                            Inbox
                        </Link>
                        .
                    </p>
                </TabsContent>
                <TabsContent value="sent" className="pt-4">
                    <List status="sent" empty="Nothing sent yet" />
                </TabsContent>
                <TabsContent value="cancelled" className="pt-4">
                    <List status="cancelled" empty="Nothing stopped" />
                </TabsContent>
                <TabsContent value="plans" className="pt-4">
                    <Plans />
                </TabsContent>
                {me?.role === "admin" && (
                    <TabsContent value="settings" className="pt-4">
                        <AutomationSettingsCard />
                    </TabsContent>
                )}
            </Tabs>
        </>
    );
}
