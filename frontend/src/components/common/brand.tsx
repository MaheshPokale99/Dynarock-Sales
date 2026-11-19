import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                "flex aspect-square size-8 items-center justify-center rounded-lg bg-primary font-heading text-sm font-bold text-primary-foreground",
                className,
            )}
            aria-hidden
        >
            D
        </span>
    );
}
