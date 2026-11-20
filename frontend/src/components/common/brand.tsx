import { cn } from "@/lib/utils";

const BRAND_BLUE = "#42B6F5";

export function BrandMark({ className }: { className?: string }) {
    return (
        <svg className={cn("dr-symbol", className)} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
            <path
                className="dr-ring"
                fill="currentColor"
                fillRule="evenodd"
                d="M64 6 114 35v58l-50 29L14 93V35Zm0 21L32 46v36l32 19 32-19V46Z"
            />
            <path fill={BRAND_BLUE} d="M64 6 14 35v58l18-11V46Z" />
            <path
                className="dr-core"
                fill="currentColor"
                fillRule="evenodd"
                d="M64 40 85 52v24L64 88 43 76V52Z M69.5 64a5.5 5.5 0 1 0-11 0a5.5 5.5 0 1 0 11 0"
            />
            <path fill={BRAND_BLUE} d="M64 40 43 52v24l8-5V57Z" />
        </svg>
    );
}

export function DynarockLogo({
    size = 20,
    animated = false,
    className,
}: {
    size?: number;
    animated?: boolean;
    className?: string;
}) {
    return (
        <span
            role="img"
            aria-label="Dynarock"
            className={cn("dr-logo", className)}
            data-animated={animated}
            style={{ fontSize: size }}
        >
            <BrandMark />
            <span className="dr-word" aria-hidden="true">
                DYNAROCK
            </span>
        </span>
    );
}
