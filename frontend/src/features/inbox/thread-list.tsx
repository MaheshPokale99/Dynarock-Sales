"use client";

import { Inbox, Paperclip } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useThreads } from "@/hooks/use-mail";
import { errorMessage, type Thread, type ThreadFolder, type ThreadState } from "@/lib/api";
import { displayName, listTime } from "@/lib/mail-format";
import { cn } from "@/lib/utils";

export const STATE_LABELS: Record<ThreadState, string> = {
    needs_reply: "Needs reply",
    awaiting_reply: "Awaiting reply",
    closed: "Closed",
};

const EMPTY: Record<ThreadFolder, { title: string; description: string }> = {
    needs_reply: { title: "All caught up", description: "No client is waiting for an answer." },
    awaiting_reply: {
        title: "Nothing pending",
        description: "Emails you send will wait here until the client replies.",
    },
    all: { title: "No conversations yet", description: "Send your first email with Compose." },
    sent: { title: "Nothing sent yet", description: "Emails the team sends from the app show up here." },
    unread: { title: "No unread mail", description: "You're up to date." },
    closed: { title: "No closed conversations", description: "Close a conversation when there's nothing left to do." },
};

function ThreadRow({
    thread,
    href,
    active,
    teamNames,
}: {
    thread: Thread;
    href: string;
    active: boolean;
    teamNames: Map<string, string>;
}) {
    const who = thread.participants[0];
    const title = who ? displayName(who) : "(no recipient)";
    const more = thread.participants.length > 1 ? ` +${thread.participants.length - 1}` : "";
    const senders = thread.senderIds.map((id) => teamNames.get(id)).filter(Boolean);

    return (
        <li>
            <Link
                href={href}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cn(
                    "flex gap-3 border-b px-4 py-3 transition-colors hover:bg-muted/60",
                    active && "bg-muted",
                )}
            >
                <UserAvatar name={title} className="mt-0.5 size-8" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                        <span className={cn("truncate text-sm", thread.unread ? "font-semibold" : "font-medium")}>
                            {title}
                            <span className="text-muted-foreground">{more}</span>
                        </span>
                        {thread.messageCount > 1 && (
                            <span className="text-xs text-muted-foreground">{thread.messageCount}</span>
                        )}
                        <time
                            className="ml-auto shrink-0 text-xs text-muted-foreground"
                            dateTime={thread.lastMessageAt}
                        >
                            {listTime(thread.lastMessageAt)}
                        </time>
                    </div>
                    <div className={cn("truncate text-sm", thread.unread ? "font-semibold" : "text-foreground/90")}>
                        {thread.subject}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{thread.snippet}</p>
                        {thread.hasAttachments && (
                            <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label="Has attachments" />
                        )}
                        {thread.unread && (
                            <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                        )}
                    </div>
                    {senders.length > 0 && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">by {senders.join(", ")}</p>
                    )}
                </div>
            </Link>
        </li>
    );
}

export function ThreadList({
    folder,
    q,
    sentBy,
    activeId,
    hrefFor,
    teamNames,
}: {
    folder: ThreadFolder;
    q: string;
    sentBy: string;
    activeId: string | null;
    hrefFor: (id: string) => string;
    teamNames: Map<string, string>;
}) {
    const query = useThreads(folder, q, sentBy);

    if (query.isError)
        return (
            <div className="p-4">
                <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
            </div>
        );
    if (query.isPending) {
        return (
            <div className="space-y-px" role="status" aria-label="Loading conversations">
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="flex gap-3 border-b px-4 py-3">
                        <Skeleton className="size-8 rounded-lg" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-3.5 w-1/2" />
                            <Skeleton className="h-3.5 w-4/5" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const threads = query.data.pages.flatMap((p) => p.threads);
    if (threads.length === 0) {
        const empty = q ? { title: "No matches", description: `Nothing matches “${q}”.` } : EMPTY[folder];
        return (
            <div className="p-4">
                <EmptyState icon={Inbox} title={empty.title} description={empty.description} />
            </div>
        );
    }

    return (
        <>
            <ul aria-label="Conversations">
                {threads.map((t) => (
                    <ThreadRow
                        key={t.id}
                        thread={t}
                        href={hrefFor(t.id)}
                        active={t.id === activeId}
                        teamNames={teamNames}
                    />
                ))}
            </ul>
            {query.hasNextPage && (
                <div className="p-3 text-center">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void query.fetchNextPage()}
                        disabled={query.isFetchingNextPage}
                    >
                        {query.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                        Load older
                    </Button>
                </div>
            )}
        </>
    );
}
