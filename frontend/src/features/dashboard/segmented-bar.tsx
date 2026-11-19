import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface Segment {
    key: string;
    label: string;
    value: number;
    color: string;
    // Text colour inside the block (white, or near-black on light fills).
    ink?: string;
}

// One whole split into parts: tall bar with shares inside, legend in block order.
export function SegmentedBar({ segments, label }: { segments: Segment[]; label: string }) {
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (total === 0) return <p className="py-2 text-sm text-muted-foreground">Nothing to show yet.</p>;
    const share = (v: number) => Math.round((v / total) * 100);

    return (
        <div className="space-y-3">
            <div
                className="flex h-7 w-full gap-0.5"
                role="img"
                aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
            >
                {segments
                    .filter((s) => s.value > 0)
                    .map((s) => (
                        <Tooltip key={s.key}>
                            <TooltipTrigger
                                render={
                                    <div
                                        className="flex h-full min-w-1 items-center rounded-[4px] px-2 text-xs font-medium whitespace-nowrap"
                                        style={{
                                            flexGrow: s.value,
                                            flexBasis: 0,
                                            background: s.color,
                                            color: s.ink ?? "#ffffff",
                                        }}
                                    />
                                }
                            >
                                {share(s.value) >= 12 ? `${share(s.value)}%` : null}
                            </TooltipTrigger>
                            <TooltipContent>
                                {s.label}: {s.value} ({share(s.value)}%)
                            </TooltipContent>
                        </Tooltip>
                    ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {segments.map((s) => (
                    <li key={s.key} className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
                        {s.label} <span className="font-medium text-foreground tabular-nums">{s.value}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
