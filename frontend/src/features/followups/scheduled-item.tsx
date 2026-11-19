"use client";

import { CalendarClock, Pencil, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCancelScheduled, useSendScheduledNow } from "@/hooks/use-automation";
import { errorMessage, type ScheduledEmail } from "@/lib/api";
import { whenLabel } from "@/lib/datetime";
import { displayName } from "@/lib/mail-format";
import { cn } from "@/lib/utils";
import { ScheduledEditDialog } from "./scheduled-edit-dialog";

const plain = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

// One scheduled follow-up or send-later email, with Edit / Send now / Cancel.
export function ScheduledItem({ item, showThread = true }: { item: ScheduledEmail; showThread?: boolean }) {
    const [editing, setEditing] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const sendNow = useSendScheduledNow();
    const cancel = useCancelScheduled();
    const pending = item.status === "scheduled";
    const who = item.thread?.participants.map(displayName).join(", ") || item.to.join(", ");

    return (
        <div className={cn("rounded-xl border p-4", pending ? "border-dashed bg-muted/30" : "bg-card")}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-medium">{pending ? whenLabel(item.sendAt) : whenLabel(item.updatedAt)}</span>
                <Badge variant="outline">
                    {item.kind === "follow_up"
                        ? `Follow-up ${item.step ?? ""}${item.totalSteps ? ` of ${item.totalSteps}` : ""}`
                        : "Send later"}
                </Badge>
                {item.aiGenerated && (
                    <Badge variant="secondary" className="gap-1">
                        <Sparkles className="size-3" aria-hidden />
                        AI
                    </Badge>
                )}
                {item.lastEditedBy && pending && <Badge variant="secondary">Edited</Badge>}
                {!pending && (
                    <Badge variant={item.status === "sent" ? "secondary" : "outline"} className="capitalize">
                        {item.status}
                    </Badge>
                )}
                {showThread && (
                    <span className="min-w-0 truncate text-muted-foreground">
                        to {who}
                        {item.threadId && (
                            <>
                                {" · "}
                                <Link href={`/inbox?f=all&t=${item.threadId}`} className="hover:underline">
                                    {item.thread?.subject ?? item.subject}
                                </Link>
                            </>
                        )}
                    </span>
                )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{plain(item.html)}</p>
            {item.statusReason && <p className="mt-1 text-xs text-muted-foreground">{item.statusReason}</p>}
            {pending && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                        <Pencil data-icon="inline-start" />
                        Edit
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={sendNow.isPending}
                        onClick={() =>
                            sendNow.mutate(item.id, {
                                onSuccess: () => toast.success("Sent"),
                                onError: (e) => toast.error(errorMessage(e)),
                            })
                        }
                    >
                        <Send data-icon="inline-start" />
                        Send now
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>
                        <X data-icon="inline-start" />
                        Cancel
                    </Button>
                </div>
            )}

            {editing && <ScheduledEditDialog item={item} onClose={() => setEditing(false)} />}
            <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{item.kind === "follow_up" ? "Stop follow-ups here?" : "Cancel this email?"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {item.kind === "follow_up"
                                ? "This follow-up and the rest of the plan for this conversation won’t be sent."
                                : "It won’t be sent."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                setConfirmCancel(false);
                                cancel.mutate(item.id, {
                                    onSuccess: () => toast.success("Cancelled"),
                                    onError: (e) => toast.error(errorMessage(e)),
                                });
                            }}
                        >
                            {item.kind === "follow_up" ? "Stop follow-ups" : "Cancel email"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
