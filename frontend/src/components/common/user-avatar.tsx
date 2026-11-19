import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?";

export function UserAvatar({ name, className }: { name: string; className?: string }) {
    return (
        <Avatar className={cn("rounded-lg", className)}>
            <AvatarFallback className="rounded-lg text-xs font-medium">{initials(name)}</AvatarFallback>
        </Avatar>
    );
}
