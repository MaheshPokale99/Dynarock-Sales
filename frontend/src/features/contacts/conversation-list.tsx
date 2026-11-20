import { Mail } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import type { Thread } from "@/lib/api";
import { displayName, listTime } from "@/lib/mail-format";
import { STATE_LABELS } from "../inbox/thread-list";

export function ConversationList({ threads, emptyText }: { threads: Thread[]; emptyText: string }) {
    if (threads.length === 0) return <EmptyState icon={Mail} title="No conversations yet" description={emptyText} />;
    return (
        <ul className="divide-y rounded-xl border">
            {threads.map((t) => (
                <li key={t.id}>
                    <Link
                        href={`/inbox?f=all&t=${t.id}`}
                        className="flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/60 sm:flex-row sm:items-start sm:gap-3"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                                <span className="truncate text-sm font-medium">{t.subject}</span>
                                <time className="ml-auto shrink-0 text-xs text-muted-foreground">
                                    {listTime(t.lastMessageAt)}
                                </time>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                                {t.participants.map(displayName).join(", ")} · {t.snippet}
                            </p>
                        </div>
                        <Badge
                            variant={t.state === "needs_reply" ? "default" : "outline"}
                            className="shrink-0 self-start"
                        >
                            {STATE_LABELS[t.state]}
                        </Badge>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
