import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Metric } from "@/lib/api";
import { cn } from "@/lib/utils";

export type MetricFormat = "count" | "percent" | "hours";

export function formatMetric(value: number | null, format: MetricFormat): string {
    if (value === null) return "—";
    if (format === "percent") return `${value}%`;
    if (format === "hours") {
        if (value < 1) return `${Math.max(1, Math.round(value * 60))} min`;
        if (value < 48) return `${value.toFixed(value < 10 ? 1 : 0)} h`;
        return `${(value / 24).toFixed(1)} days`;
    }
    return value >= 10_000 ? `${(value / 1000).toFixed(1)}K` : value.toLocaleString("en-IN");
}

// Signed change vs the previous period; colour depends on whether up is good.
function Delta({
    metric,
    format,
    lowerIsBetter,
    days,
}: {
    metric: Metric;
    format: MetricFormat;
    lowerIsBetter?: boolean;
    days: number;
}) {
    const { value, previous } = metric;
    if (value === null || previous === null)
        return <span className="text-xs text-muted-foreground">No earlier data</span>;
    const diff = value - previous;
    if (diff === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Minus className="size-3" aria-hidden />
                Same as previous {days} days
            </span>
        );
    }
    const good = lowerIsBetter ? diff < 0 : diff > 0;
    const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
    const text =
        format === "percent"
            ? `${diff > 0 ? "+" : ""}${Math.round(diff * 10) / 10} pts`
            : previous === 0
              ? `+${formatMetric(diff, format)}`
              : `${diff > 0 ? "+" : ""}${Math.round((diff / previous) * 100)}%`;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                good ? "text-success" : "text-destructive",
            )}
        >
            <Icon className="size-3" aria-hidden />
            {text}
            <span className="font-normal text-muted-foreground">vs previous {days} days</span>
        </span>
    );
}

export function StatTile({
    label,
    metric,
    format = "count",
    lowerIsBetter,
    days,
    hint,
}: {
    label: string;
    metric: Metric;
    format?: MetricFormat;
    lowerIsBetter?: boolean;
    days: number;
    hint?: string;
}) {
    return (
        <Card size="sm">
            <CardContent className="space-y-1.5">
                <div className="text-sm text-muted-foreground" title={hint}>
                    {label}
                </div>
                <div className="text-2xl font-semibold tracking-tight">{formatMetric(metric.value, format)}</div>
                <Delta metric={metric} format={format} lowerIsBetter={lowerIsBetter} days={days} />
            </CardContent>
        </Card>
    );
}
