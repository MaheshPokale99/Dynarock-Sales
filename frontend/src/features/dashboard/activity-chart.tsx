"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Dashboard } from "@/lib/api";

const config = {
    sent: { label: "Emails sent", color: "var(--chart-1)" },
    replies: { label: "Client replies", color: "var(--chart-2)" },
} satisfies ChartConfig;

const dayLabel = (iso: string, interval: "day" | "week") =>
    new Date(iso).toLocaleDateString(
        "en-IN",
        interval === "week" ? { day: "numeric", month: "short" } : { day: "numeric", month: "short" },
    );

// Emails sent vs client replies over the range, with a table view for accessibility.
export function ActivityChart({ data }: { data: Dashboard }) {
    const [asTable, setAsTable] = useState(false);
    const rows = data.series.map((b) => ({ ...b, label: dayLabel(b.date, data.range.interval) }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Emails sent and replies</CardTitle>
                <CardDescription>
                    Per {data.range.interval}, India time. Sent includes automatic follow-ups.
                </CardDescription>
                <CardAction>
                    <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)}>
                        {asTable ? "Show chart" : "Show table"}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                {asTable ? (
                    <div className="max-h-72 overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{data.range.interval === "week" ? "Week of" : "Day"}</TableHead>
                                    <TableHead className="text-right">Sent</TableHead>
                                    <TableHead className="text-right">Follow-ups</TableHead>
                                    <TableHead className="text-right">Replies</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((r) => (
                                    <TableRow key={r.date}>
                                        <TableCell>{r.label}</TableCell>
                                        <TableCell className="text-right tabular-nums">{r.sent}</TableCell>
                                        <TableCell className="text-right tabular-nums">{r.followUps}</TableCell>
                                        <TableCell className="text-right tabular-nums">{r.replies}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <ChartContainer config={config} className="aspect-auto h-64 w-full">
                        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="var(--border)" />
                            <XAxis
                                dataKey="label"
                                tickLine={false}
                                axisLine={{ stroke: "var(--border)" }}
                                tickMargin={8}
                                minTickGap={24}
                            />
                            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                            <ChartTooltip
                                cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
                                content={<ChartTooltipContent />}
                            />
                            <ChartLegend content={<ChartLegendContent />} />
                            {(Object.keys(config) as (keyof typeof config)[]).map((key) => (
                                <Line
                                    key={key}
                                    dataKey={key}
                                    type="monotone"
                                    stroke={`var(--color-${key})`}
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                                />
                            ))}
                        </LineChart>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>
    );
}
