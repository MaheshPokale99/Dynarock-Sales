"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAiStatus } from "@/hooks/use-ai";
import { useEditScheduled, useRegenerateScheduled } from "@/hooks/use-automation";
import { errorMessage, type ScheduledEmail } from "@/lib/api";
import { fromLocalInput, toLocalInput } from "@/lib/datetime";
import { RecipientInput } from "../compose/recipient-input";
import { RichEditor } from "../compose/rich-editor";

export function ScheduledEditDialog({ item, onClose }: { item: ScheduledEmail; onClose: () => void }) {
    const edit = useEditScheduled();
    const regenerate = useRegenerateScheduled();
    const { data: ai } = useAiStatus();
    const [version, setVersion] = useState(0);
    const [html, setHtml] = useState(item.html);
    const [subject, setSubject] = useState(item.subject);
    const [to, setTo] = useState(item.to);
    const [sendAt, setSendAt] = useState(toLocalInput(item.sendAt));

    const save = () =>
        edit.mutate(
            { id: item.id, html, subject, to, sendAt: fromLocalInput(sendAt) },
            {
                onSuccess: () => {
                    toast.success("Saved");
                    onClose();
                },
                onError: (e) => toast.error(errorMessage(e)),
            },
        );

    const rewrite = () =>
        regenerate.mutate(item.id, {
            onSuccess: (r) => {
                setHtml(r.html);
                setVersion((v) => v + 1);
                toast.success(r.warnings.length ? "New draft ready. Check the flagged details." : "New draft ready");
            },
            onError: (e) => toast.error(errorMessage(e)),
        });

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {item.kind === "follow_up"
                            ? `Follow-up ${item.step ?? ""}${item.totalSteps ? ` of ${item.totalSteps}` : ""}`
                            : "Scheduled email"}
                    </DialogTitle>
                    <DialogDescription>{item.thread?.subject ?? item.subject}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="overflow-hidden rounded-lg border">
                        <RecipientInput label="To" value={to} onChange={setTo} />
                        <input
                            className="w-full border-b bg-transparent px-3 py-2 text-sm outline-none"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            aria-label="Subject"
                        />
                        <RichEditor key={version} className="max-h-80" initialHtml={html} onChange={setHtml} />
                    </div>
                    <Field className="max-w-xs">
                        <FieldLabel htmlFor="send-at">Send at</FieldLabel>
                        <Input
                            id="send-at"
                            type="datetime-local"
                            value={sendAt}
                            onChange={(e) => setSendAt(e.target.value)}
                        />
                    </Field>
                </div>
                <DialogFooter className="sm:justify-between">
                    {item.kind === "follow_up" && ai?.enabled ? (
                        <Button variant="ghost" onClick={rewrite} disabled={regenerate.isPending}>
                            {regenerate.isPending ? (
                                <Spinner data-icon="inline-start" />
                            ) : (
                                <Sparkles data-icon="inline-start" />
                            )}
                            Rewrite with AI
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                        <Button onClick={save} disabled={edit.isPending || !sendAt}>
                            {edit.isPending && <Spinner data-icon="inline-start" />}
                            Save
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
