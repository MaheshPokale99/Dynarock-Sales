"use client";

import { FilePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteDraft, useDrafts } from "@/hooks/use-mail";
import { errorMessage } from "@/lib/api";
import { listTime } from "@/lib/mail-format";
import { useCompose } from "../compose/compose-provider";

const plain = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

export function DraftsList() {
    const drafts = useDrafts();
    const remove = useDeleteDraft();
    const compose = useCompose();

    if (drafts.isError)
        return (
            <div className="p-4">
                <ErrorState message={errorMessage(drafts.error)} onRetry={() => void drafts.refetch()} />
            </div>
        );
    if (drafts.isPending)
        return (
            <div className="p-4">
                <Skeleton className="h-24 rounded-xl" />
            </div>
        );
    if (drafts.data.length === 0) {
        return (
            <div className="p-4">
                <EmptyState
                    icon={FilePen}
                    title="No drafts"
                    description="Unsent emails are saved here automatically."
                />
            </div>
        );
    }

    return (
        <ul aria-label="Drafts">
            {drafts.data.map((d) => (
                <li key={d.id} className="group flex items-start gap-2 border-b px-4 py-3 hover:bg-muted/60">
                    <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() =>
                            compose.open({
                                mode: d.mode,
                                threadId: d.threadId ?? undefined,
                                to: d.to,
                                cc: d.cc,
                                bcc: d.bcc,
                                subject: d.subject,
                                bodyHtml: d.html,
                                attachments: d.attachments,
                                draftId: d.id,
                            })
                        }
                    >
                        <div className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-destructive">Draft</span>
                            <span className="truncate text-sm">{d.to.join(", ") || "(no recipients)"}</span>
                            <time className="ml-auto shrink-0 text-xs text-muted-foreground">
                                {listTime(d.updatedAt)}
                            </time>
                        </div>
                        <div className="truncate text-sm">{d.subject || "(no subject)"}</div>
                        <p className="truncate text-xs text-muted-foreground">{plain(d.html) || "Empty"}</p>
                    </button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete draft"
                        onClick={() => remove.mutate(d.id, { onSuccess: () => toast.success("Draft deleted") })}
                    >
                        <Trash2 aria-hidden />
                    </Button>
                </li>
            ))}
        </ul>
    );
}
