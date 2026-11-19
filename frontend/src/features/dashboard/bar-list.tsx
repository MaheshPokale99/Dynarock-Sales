import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface BarRow {
    key: string;
    label: string;
    value: number;
    // Text at the bar tip; defaults to the value.
    display?: string;
    // Extra detail for the hover tooltip.
    detail?: string;
}

// Horizontal bars for one series: thin, 4px rounded tip, value at the tip, hover detail.
export function BarList({ rows, max, emptyText }: { rows: BarRow[]; max?: number; emptyText: string }) {
    if (rows.length === 0 || rows.every((r) => r.value === 0)) {
        return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
    }
    const top = max ?? Math.max(...rows.map((r) => r.value), 1);

    return (
        <ul className="space-y-2.5">
            {rows.map((r) => (
                <li key={r.key} className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-3 text-sm">
                    <span className="truncate text-muted-foreground" title={r.label}>
                        {r.label}
                    </span>
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <div
                                    className="flex h-6 min-w-0 cursor-default items-center gap-2"
                                    tabIndex={0}
                                    aria-label={`${r.label}: ${r.display ?? r.value}${r.detail ? `, ${r.detail}` : ""}`}
                                />
                            }
                        >
                            {r.value > 0 && (
                                <span
                                    className="block h-3 shrink-0 rounded-r-[4px] bg-chart-1"
                                    style={{ width: `calc(${(r.value / top) * 100}% - 3rem)`, minWidth: "4px" }}
                                />
                            )}
                            <span className="shrink-0 text-xs font-medium tabular-nums">{r.display ?? r.value}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {r.label}: {r.display ?? r.value}
                            {r.detail ? ` · ${r.detail}` : ""}
                        </TooltipContent>
                    </Tooltip>
                </li>
            ))}
        </ul>
    );
}
