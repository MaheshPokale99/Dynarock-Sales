"use client";

import { ChartLine, PenSquare } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDashboard } from "@/hooks/use-analytics";
import { errorMessage, type Dashboard } from "@/lib/api";
import { INTENT_LABELS, STAGE_LABELS } from "@/lib/labels";
import { useCompose } from "../compose/compose-provider";
import { ActivityChart } from "./activity-chart";
import { BarList } from "./bar-list";
import { SegmentedBar } from "./segmented-bar";
import { StatTile } from "./stat-tile";

type Days = 7 | 30 | 90;

function Tiles({ data }: { data: Dashboard }) {
    const { kpis, range } = data;
    const d = range.days;
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
                label="Emails sent"
                metric={kpis.emailsSent}
                days={d}
                hint="Every email from sales@dynarock.in, including follow-ups"
            />
            <StatTile
                label="Client replies"
                metric={kpis.replies}
                days={d}
                hint="Real replies; auto-replies don't count"
            />
            <StatTile
                label="Reply rate"
                metric={kpis.replyRate}
                format="percent"
                days={d}
                hint="Conversations we started in this period that got at least one reply"
            />
            <StatTile label="Demos booked" metric={kpis.demosBooked} days={d} hint="Contacts moved to Demo scheduled" />
            <StatTile label="Won" metric={kpis.won} days={d} />
            <StatTile label="New contacts" metric={kpis.newContacts} days={d} />
            <StatTile
                label="Client reply time"
                metric={kpis.avgClientReplyHours}
                format="hours"
                lowerIsBetter
                days={d}
                hint="Average time from our first email to the client's first reply"
            />
            <StatTile
                label="Our response time"
                metric={kpis.avgResponseHours}
                format="hours"
                lowerIsBetter
                days={d}
                hint="Average time from a client's email to our answer"
            />
        </div>
    );
}

function Panels({ data }: { data: Dashboard }) {
    const totalContacts = data.pipeline.reduce((s, p) => s + p.count, 0);
    const s = data.ai.suggestions;

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Pipeline</CardTitle>
                    <CardDescription>Where every contact is today · {totalContacts} contacts</CardDescription>
                </CardHeader>
                <CardContent>
                    <BarList
                        rows={data.pipeline.map((p) => ({
                            key: p.stage,
                            label: STAGE_LABELS[p.stage],
                            value: p.count,
                            detail: totalContacts
                                ? `${Math.round((p.count / totalContacts) * 100)}% of contacts`
                                : undefined,
                        }))}
                        emptyText="No contacts yet."
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Follow-up results</CardTitle>
                    <CardDescription>
                        Share of automatic follow-ups that got a reply before the next email
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <BarList
                        max={100}
                        rows={data.followUpSteps.map((f) => ({
                            key: String(f.step),
                            label: `Follow-up ${f.step}`,
                            value: f.replyRate ?? 0,
                            display: `${f.replyRate ?? 0}%`,
                            detail: `${f.replied} of ${f.sent} replied`,
                        }))}
                        emptyText="No automatic follow-ups sent in this period."
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>What clients say</CardTitle>
                    <CardDescription>AI labels on client replies in this period</CardDescription>
                </CardHeader>
                <CardContent>
                    <BarList
                        rows={data.intents.map((i) => ({
                            key: i.intent,
                            label: INTENT_LABELS[i.intent],
                            value: i.count,
                        }))}
                        emptyText="No labelled replies yet."
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>AI reply drafts</CardTitle>
                    <CardDescription>
                        What the team did with suggested replies
                        {s.pending ? ` · ${s.pending} still waiting in Approvals` : ""}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <SegmentedBar
                        label="AI reply drafts"
                        segments={[
                            { key: "asis", label: "Sent as written", value: s.sentAsIs, color: "var(--chart-1)" },
                            {
                                key: "edited",
                                label: "Sent after editing",
                                value: s.sentEdited,
                                color: "var(--chart-2)",
                            },
                            { key: "rejected", label: "Rejected", value: s.rejected, color: "var(--chart-3)" },
                        ]}
                    />
                    <p className="text-xs text-muted-foreground">
                        {data.ai.calls.toLocaleString("en-IN")} AI calls · {data.ai.tokens.toLocaleString("en-IN")}{" "}
                        tokens
                        {data.ai.failedCalls ? ` · ${data.ai.failedCalls} failed` : ""}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

function TeamTable({ data }: { data: Dashboard }) {
    return (
        <Card className="gap-0 py-0">
            <CardHeader className="py-4">
                <CardTitle>Team</CardTitle>
                <CardDescription>Per salesperson, for the selected period</CardDescription>
            </CardHeader>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="pl-6">Salesperson</TableHead>
                        <TableHead className="text-right">Emails</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Follow-ups</TableHead>
                        <TableHead className="hidden text-right xl:table-cell">Conversations started</TableHead>
                        <TableHead className="text-right">Reply rate</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Demos</TableHead>
                        <TableHead className="text-right">Won</TableHead>
                        <TableHead className="hidden pr-6 text-right xl:table-cell">AI replies approved</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.team.map((t) => (
                        <TableRow key={t.userId} className={t.disabled ? "opacity-60" : undefined}>
                            <TableCell className="pl-6 font-medium">{t.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{t.emailsSent}</TableCell>
                            <TableCell className="hidden text-right tabular-nums sm:table-cell">
                                {t.followUpsSent}
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums xl:table-cell">
                                {t.conversationsStarted}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                                {t.replyRate === null ? "—" : `${t.replyRate}%`}
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums sm:table-cell">
                                {t.demosBooked}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{t.won}</TableCell>
                            <TableCell className="hidden pr-6 text-right tabular-nums xl:table-cell">
                                {t.aiRepliesApproved}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    );
}

export function DashboardPage() {
    const [days, setDays] = useState<Days>(30);
    const dashboard = useDashboard(days);
    const compose = useCompose();
    const data = dashboard.data;
    const nothingYet =
        data &&
        data.kpis.emailsSent.value === 0 &&
        data.kpis.emailsSent.previous === 0 &&
        data.pipeline.every((p) => p.count === 0);

    return (
        <>
            <PageHeader
                title="Dashboard"
                description="How outreach is going: emails, replies, demos and what the team and the AI are doing."
                actions={
                    <ToggleGroup
                        value={[String(days)]}
                        onValueChange={(v) => v[0] && setDays(Number(v[0]) as Days)}
                        variant="outline"
                        size="sm"
                        aria-label="Period"
                    >
                        <ToggleGroupItem value="7">7 days</ToggleGroupItem>
                        <ToggleGroupItem value="30">30 days</ToggleGroupItem>
                        <ToggleGroupItem value="90">90 days</ToggleGroupItem>
                    </ToggleGroup>
                }
            />
            {dashboard.isError ? (
                <ErrorState message={errorMessage(dashboard.error)} onRetry={() => void dashboard.refetch()} />
            ) : !data ? (
                <div className="space-y-4" role="status" aria-label="Loading dashboard">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 8 }, (_, i) => (
                            <Skeleton key={i} className="h-24 rounded-xl" />
                        ))}
                    </div>
                    <Skeleton className="h-80 rounded-xl" />
                </div>
            ) : nothingYet ? (
                <EmptyState
                    icon={ChartLine}
                    title="No numbers yet"
                    description="Send your first emails and this page fills up with replies, demos and team results."
                    action={
                        <Button onClick={() => compose.open()}>
                            <PenSquare data-icon="inline-start" />
                            Compose
                        </Button>
                    }
                />
            ) : (
                <div
                    className={
                        dashboard.isFetching
                            ? "space-y-4 opacity-70 transition-opacity"
                            : "space-y-4 transition-opacity"
                    }
                >
                    <Tiles data={data} />
                    <ActivityChart data={data} />
                    <Panels data={data} />
                    <TeamTable data={data} />
                </div>
            )}
        </>
    );
}
