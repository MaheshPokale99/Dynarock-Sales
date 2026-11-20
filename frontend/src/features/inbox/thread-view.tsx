"use client";

import { Archive, ArchiveRestore, ArrowLeft, Forward, MailOpen, Reply, ReplyAll, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IntentBadge } from "@/components/common/intent-badge";
import { ErrorState } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAiStatus, useSuggestions, useSuggestReply } from "@/hooks/use-ai";
import { useMe } from "@/hooks/use-auth";
import { useMailbox, useThread, useUpdateThread } from "@/hooks/use-mail";
import { errorMessage, type ComposeMode, type Message } from "@/lib/api";
import { displayName, quoteHtml, replyRecipients, subjectFor } from "@/lib/mail-format";
import { SuggestionCard } from "../approvals/suggestion-card";
import { AutomationPanel } from "./automation-panel";
import { ComposeForm, withSignature, type ComposeInit } from "../compose/compose-form";
import { ContactPanel } from "./contact-panel";
import { MessageCard } from "./message-card";
import { STATE_LABELS } from "./thread-list";

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} />}>
                {children}
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

export function ThreadView({
    threadId,
    backHref,
    teamNames,
}: {
    threadId: string;
    backHref: string;
    teamNames: Map<string, string>;
}) {
    const { data, isPending, isError, error, refetch } = useThread(threadId);
    const { data: mailbox } = useMailbox();
    const { data: me } = useMe();
    const update = useUpdateThread();
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [reply, setReply] = useState<ComposeInit | null>(null);
    const { data: ai } = useAiStatus();
    const { data: pending } = useSuggestions({ threadId, status: "pending" });
    const suggest = useSuggestReply();
    const suggestion = pending?.[0];

    const thread = data?.thread;
    const messages = data?.messages ?? [];
    const lastId = messages.at(-1)?.id;

    const autoRead = useRef(false);
    useEffect(() => {
        if (!thread || autoRead.current) return;
        autoRead.current = true;
        if (thread.unread) update.mutate({ id: thread.id, unread: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread?.id]);

    if (isError) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
    if (isPending || !thread) {
        return (
            <div className="space-y-3 p-4" role="status" aria-label="Loading conversation">
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-48 w-full rounded-xl" />
            </div>
        );
    }

    const startReply = (mode: ComposeMode, base: Message) => {
        const recipients = replyRecipients(mode, base, mailbox?.address ?? "");
        setReply({
            mode,
            threadId: thread.id,
            replyToMessageId: base.id,
            ...recipients,
            subject: subjectFor(mode, thread.subject),
            bodyHtml: withSignature(me?.signatureHtml ?? ""),
            quoteHtml: quoteHtml(mode, base),
        });
    };

    const last = messages.at(-1);
    const run = (patch: { unread?: boolean; closed?: boolean }, done: string) =>
        update.mutate(
            { id: thread.id, ...patch },
            { onSuccess: () => toast.success(done), onError: (e) => toast.error(errorMessage(e)) },
        );

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex items-start gap-2 border-b px-4 py-3">
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="lg:hidden"
                    nativeButton={false}
                    render={<Link href={backHref} />}
                    aria-label="Back to list"
                >
                    <ArrowLeft aria-hidden />
                </Button>
                <div className="min-w-0 flex-1">
                    <h1 className="font-heading text-lg leading-snug font-semibold text-balance">{thread.subject}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant={thread.state === "needs_reply" ? "default" : "outline"}>
                            {STATE_LABELS[thread.state]}
                        </Badge>
                        {thread.latestIntent && <IntentBadge intent={thread.latestIntent} />}
                        <span className="truncate">
                            with {thread.participants.map(displayName).join(", ") || "no one yet"}
                        </span>
                    </div>
                    {thread.aiSummary && (
                        <p className="mt-1.5 flex gap-1.5 text-sm text-muted-foreground">
                            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            {thread.aiSummary}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center">
                    {(data?.contacts.length ?? 0) > 0 && (
                        <Sheet>
                            <SheetTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="xl:hidden"
                                        aria-label="Contacts in this conversation"
                                    />
                                }
                            >
                                <Users aria-hidden />
                            </SheetTrigger>
                            <SheetContent side="right" className="w-[min(20rem,90vw)] overflow-y-auto">
                                <SheetHeader>
                                    <SheetTitle>Contacts</SheetTitle>
                                </SheetHeader>
                                <ContactPanel contacts={data?.contacts ?? []} inSheet />
                            </SheetContent>
                        </Sheet>
                    )}
                    <IconAction label="Mark as unread" onClick={() => run({ unread: true }, "Marked as unread")}>
                        <MailOpen aria-hidden />
                    </IconAction>
                    {thread.state === "closed" ? (
                        <IconAction label="Reopen" onClick={() => run({ closed: false }, "Conversation reopened")}>
                            <ArchiveRestore aria-hidden />
                        </IconAction>
                    ) : (
                        <IconAction
                            label="Close conversation"
                            onClick={() => run({ closed: true }, "Conversation closed")}
                        >
                            <Archive aria-hidden />
                        </IconAction>
                    )}
                </div>
            </header>

            <div className="flex min-h-0 min-w-0 flex-1">
                <div className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
                    {messages.map((m) => (
                        <MessageCard
                            key={m.id}
                            message={m}
                            teamNames={teamNames}
                            expanded={m.id === lastId || expanded.has(m.id)}
                            onToggle={() =>
                                setExpanded((s) => {
                                    const next = new Set(s);
                                    if (next.has(m.id)) next.delete(m.id);
                                    else next.add(m.id);
                                    return next;
                                })
                            }
                        />
                    ))}

                    <AutomationPanel
                        threadId={thread.id}
                        canStart={thread.state === "awaiting_reply" && Boolean(thread.lastOutboundAt)}
                    />

                    {!reply && suggestion && (
                        <SuggestionCard key={suggestion.id} suggestion={suggestion} showThreadLink={false} />
                    )}

                    {!reply &&
                        !suggestion &&
                        ai?.enabled &&
                        last?.direction === "inbound" &&
                        thread.state !== "closed" && (
                            <Button
                                variant="secondary"
                                disabled={suggest.isPending}
                                onClick={() =>
                                    suggest.mutate(thread.id, {
                                        onSuccess: () => toast.success("Suggested reply ready"),
                                        onError: (e) => toast.error(errorMessage(e)),
                                    })
                                }
                            >
                                {suggest.isPending ? (
                                    <Spinner data-icon="inline-start" />
                                ) : (
                                    <Sparkles data-icon="inline-start" />
                                )}
                                Suggest a reply with AI
                            </Button>
                        )}

                    {reply ? (
                        <ComposeForm
                            key={`${reply.mode}-${reply.replyToMessageId}`}
                            init={reply}
                            variant="inline"
                            onDone={() => setReply(null)}
                        />
                    ) : (
                        last && (
                            <div className="flex flex-wrap gap-2 pt-1">
                                <Button variant="outline" onClick={() => startReply("reply", last)}>
                                    <Reply data-icon="inline-start" />
                                    Reply
                                </Button>
                                {[...last.to, ...last.cc].length > 1 && (
                                    <Button variant="outline" onClick={() => startReply("reply_all", last)}>
                                        <ReplyAll data-icon="inline-start" />
                                        Reply all
                                    </Button>
                                )}
                                <Button variant="outline" onClick={() => startReply("forward", last)}>
                                    <Forward data-icon="inline-start" />
                                    Forward
                                </Button>
                            </div>
                        )
                    )}
                </div>
                <ContactPanel contacts={data?.contacts ?? []} />
            </div>
        </div>
    );
}
