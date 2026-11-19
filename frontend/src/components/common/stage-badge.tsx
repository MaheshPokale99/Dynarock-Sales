import { Badge } from "@/components/ui/badge";
import type { ContactStage } from "@/lib/api";
import { STAGE_LABELS, STAGE_TONE } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function StageDot({ stage, className }: { stage: ContactStage; className?: string }) {
    return (
        <span className={cn("inline-block size-2 shrink-0 rounded-full", STAGE_TONE[stage], className)} aria-hidden />
    );
}

export function StageBadge({ stage }: { stage: ContactStage }) {
    return (
        <Badge variant="outline" className="gap-1.5 font-normal">
            <StageDot stage={stage} />
            {STAGE_LABELS[stage]}
        </Badge>
    );
}
