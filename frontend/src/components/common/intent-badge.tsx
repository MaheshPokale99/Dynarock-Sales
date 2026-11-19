import { Badge } from "@/components/ui/badge";
import type { Intent } from "@/lib/api";
import { INTENT_LABELS, INTENT_TONE } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function IntentBadge({ intent, className }: { intent: Intent; className?: string }) {
    return (
        <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
            <span className={cn("size-1.5 rounded-full", INTENT_TONE[intent])} aria-hidden />
            {INTENT_LABELS[intent]}
        </Badge>
    );
}
