"use client";

import { ExternalLink, Send, Sparkles, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { IntentBadge } from "@/components/common/intent-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-auth";
import { useRejectSuggestion, useSendSuggestion } from "@/hooks/use-ai";
import { errorMessage, type Suggestion } from "@/lib/api";
import { displayName, isEmail, listTime } from "@/lib/mail-format";
import { RecipientInput } from "../compose/recipient-input";
import { RichEditor } from "../compose/rich-editor";

// The client's email next to the AI's draft answer; edit, then send or reject.
export function SuggestionCard({
    suggestion,
    showThreadLink = true,
}: {
    suggestion: Suggestion;
    showThreadLink?: boolean;
}) {
    const { data: me } = useMe();
    const send = useSendSuggestion();
    const reject = useRejectSuggestion();
    const signature = me?.signatureHtml ? `<p>--<br>${me.signatureHtml}</p>` : "";
    const [initialHtml] = useState(`${suggestion.html}${signature}`);
    const [html, setHtml] = useState(initialHtml);
    const [to, setTo] = useState(suggestion.forMessage ? [suggestion.forMessage.from.email] : []);
    const [showEmail, setShowEmail] = useState(false);
    const [rejecting, setRejecting] = useState(false);
    const [reason, setReason] = useState("");
    const from = suggestion.forMessage?.from;

    const submit = () => {
        if (to.length === 0 || to.some((e) => !isEmail(e))) {
            toast.error("Check the recipients");
            return;
        }
        send.mutate(
            { id: suggestion.id, to, cc: [], bcc: [], subject: suggestion.subject, html },
            { onSuccess: () => toast.success("Reply sent"), onError: (e) => toast.error(errorMessage(e)) },
        );
    };

    return (
        <Card className="gap-0 overflow-hidden py-0">
            <div className="grid lg:grid-cols-2">
                <section className="space-y-3 border-b p-4 lg:border-r lg:border-b-0" aria-label="Client's email">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{from ? displayName(from) : "Client"}</span>
                        {from && <span className="text-xs text-muted-foreground">{from.email}</span>}
                        {suggestion.intent && <IntentBadge intent={suggestion.intent} />}
                        {suggestion.forMessage && (
                            <time className="ml-auto text-xs text-muted-foreground">
                                {listTime(suggestion.forMessage.sentAt)}
                            </time>
                        )}
                    </div>
                    {suggestion.thread && <div className="text-sm font-medium">{suggestion.thread.subject}</div>}
                    {suggestion.forMessage?.summary && (
                        <p className="flex gap-1.5 text-sm text-muted-foreground">
                            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            {suggestion.forMessage.summary}
                        </p>
                    )}
                    {suggestion.forMessage?.text && (
                        <div>
                            <p
                                className={
                                    showEmail
                                        ? "text-sm whitespace-pre-wrap"
                                        : "line-clamp-4 text-sm whitespace-pre-wrap"
                                }
                            >
                                {suggestion.forMessage.text}
                            </p>
                            <Button variant="link" size="xs" className="px-0" onClick={() => setShowEmail((v) => !v)}>
                                {showEmail ? "Show less" : "Show full email"}
                            </Button>
                        </div>
                    )}
                    {showThreadLink && (
                        <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={<Link href={`/inbox?f=all&t=${suggestion.threadId}`} />}
                        >
                            <ExternalLink data-icon="inline-start" />
                            Open conversation
                        </Button>
                    )}
                </section>

                <section className="flex min-w-0 flex-col" aria-label="AI draft reply">
                    <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
                        <Sparkles className="size-4 text-muted-foreground" aria-hidden />
                        <span className="font-medium">Suggested reply</span>
                        {suggestion.rationale && (
                            <span className="truncate text-xs text-muted-foreground" title={suggestion.rationale}>
                                · {suggestion.rationale}
                            </span>
                        )}
                    </div>
                    <RecipientInput label="To" value={to} onChange={setTo} />
                    <RichEditor className="max-h-80" initialHtml={initialHtml} onChange={setHtml} />
                    {suggestion.warnings.length > 0 && (
                        <Alert className="mx-3 my-2 w-auto border-warning/50">
                            <TriangleAlert className="text-warning" aria-hidden />
                            <AlertTitle>Check before sending</AlertTitle>
                            <AlertDescription>
                                <ul className="list-disc pl-4">
                                    {suggestion.warnings.map((w) => (
                                        <li key={w}>{w}</li>
                                    ))}
                                </ul>
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="mt-auto flex items-center gap-2 border-t px-3 py-2">
                        <Button onClick={submit} disabled={send.isPending || reject.isPending}>
                            {send.isPending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                            Send reply
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setRejecting(true)}
                            disabled={send.isPending || reject.isPending}
                        >
                            <X data-icon="inline-start" />
                            Reject
                        </Button>
                        <span className="ml-auto text-xs text-muted-foreground">Edit anything before sending</span>
                    </div>
                </section>
            </div>

            <Dialog open={rejecting} onOpenChange={setRejecting}>
                <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            setRejecting(false);
                            reject.mutate(
                                { id: suggestion.id, reason: reason.trim() },
                                {
                                    onSuccess: () => toast.success("Draft rejected"),
                                    onError: (err) => toast.error(errorMessage(err)),
                                },
                            );
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Reject this draft?</DialogTitle>
                            <DialogDescription>
                                The client gets nothing. You can still reply yourself from the conversation.
                            </DialogDescription>
                        </DialogHeader>
                        <Field className="py-4">
                            <FieldLabel htmlFor={`reason-${suggestion.id}`}>Why? (optional)</FieldLabel>
                            <Textarea
                                id={`reason-${suggestion.id}`}
                                rows={2}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Wrong facts, too pushy, I'll call them instead…"
                            />
                        </Field>
                        <DialogFooter>
                            <DialogClose render={<Button type="button" variant="outline" />}>Keep it</DialogClose>
                            <Button type="submit" variant="destructive">
                                Reject
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
