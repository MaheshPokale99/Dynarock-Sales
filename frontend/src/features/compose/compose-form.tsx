"use client";

import type { Editor } from "@tiptap/react";
import { FileText, Paperclip, Send, Trash2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-auth";
import { useAutomationSettings, useSequences } from "@/hooks/use-automation";
import { useSendEmail } from "@/hooks/use-mail";
import { api, errorMessage, type ComposeMode, type DraftAttachment } from "@/lib/api";
import { whenLabel } from "@/lib/datetime";
import { fileSize, isEmail } from "@/lib/mail-format";
import { cn } from "@/lib/utils";
import { AiAssist, type AiResult } from "./ai-assist";
import { RecipientInput } from "./recipient-input";
import { RichEditor } from "./rich-editor";
import { FollowUpToggle, ScheduleMenu, type FollowUpChoice } from "./send-options";
import { TemplatePicker } from "./template-picker";

export interface ComposeInit {
    mode: ComposeMode;
    threadId?: string;
    replyToMessageId?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    bodyHtml?: string;
    quoteHtml?: string;
    draftId?: string;
    attachments?: DraftAttachment[];
}

const AUTOSAVE_MS = 1500;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export const withSignature = (signatureHtml: string) =>
    `<p></p>${signatureHtml ? `<p>--<br>${signatureHtml}</p>` : ""}`;

const SIGNATURE_MARK = "<p>--<br>";

// Separates what the user wrote from the signature block added by withSignature.
export function splitSignature(html: string) {
    const at = html.lastIndexOf(SIGNATURE_MARK);
    return at < 0 ? { body: html, signature: "" } : { body: html.slice(0, at), signature: html.slice(at) };
}

export function ComposeForm({
    init,
    variant,
    onDone,
    onSubjectChange,
}: {
    init: ComposeInit;
    variant: "window" | "inline";
    onDone: () => void;
    onSubjectChange?: (subject: string) => void;
}) {
    const router = useRouter();
    const { data: me } = useMe();
    const send = useSendEmail();

    const [to, setTo] = useState(init.to ?? []);
    const [cc, setCc] = useState(init.cc ?? []);
    const [bcc, setBcc] = useState(init.bcc ?? []);
    const [showCc, setShowCc] = useState((init.cc?.length ?? 0) > 0);
    const [showBcc, setShowBcc] = useState((init.bcc?.length ?? 0) > 0);
    const [subject, setSubject] = useState(init.subject ?? "");
    const [initialHtml] = useState(init.bodyHtml ?? withSignature(me?.signatureHtml ?? ""));
    const [html, setHtml] = useState(initialHtml);
    const [includeQuote, setIncludeQuote] = useState(Boolean(init.quoteHtml));
    const [attachments, setAttachments] = useState<DraftAttachment[]>(init.attachments ?? []);
    const [uploading, setUploading] = useState(0);
    const [draftId, setDraftId] = useState(init.draftId);
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(init.draftId ? "saved" : "idle");
    const { data: plans } = useSequences();
    const { data: automation } = useAutomationSettings();
    const activePlans = (plans ?? []).filter((p) => p.active);
    const defaultPlanId = automation?.defaultSequenceId ?? activePlans[0]?.id ?? null;
    // On by default for brand-new emails: no reply means an automatic follow-up.
    const [followUp, setFollowUp] = useState<FollowUpChoice>({ enabled: init.mode === "new", planId: null });
    const [editor, setEditor] = useState<Editor | null>(null);
    const [aiWarnings, setAiWarnings] = useState<string[]>([]);
    const fileInput = useRef<HTMLInputElement>(null);
    const dirty = useRef(false);
    const sent = useRef(false);

    // AI text replaces the body; the signature stays underneath.
    // Replaces the body (keeping the signature) and fills an empty subject.
    const applyBody = (bodyHtml: string, newSubject?: string) => {
        const { signature } = splitSignature(html);
        const next = `${bodyHtml}${signature}`;
        editor?.commands.setContent(next, { emitUpdate: false });
        dirty.current = true;
        setHtml(next);
        if (newSubject && !subject.trim()) setSubject(newSubject);
    };

    const applyAi = (result: AiResult) => {
        applyBody(result.html, result.subject);
        setAiWarnings(result.warnings);
        if (result.warnings.length === 0) toast.success("AI draft ready. Read it before sending.");
    };

    useEffect(() => onSubjectChange?.(subject), [subject, onSubjectChange]);

    // Autosave as a draft shortly after the user stops typing.
    useEffect(() => {
        if (!dirty.current || sent.current) return;
        const timer = setTimeout(() => {
            const body = { mode: init.mode, threadId: init.threadId ?? null, to, cc, bcc, subject, html, attachments };
            setSaveState("saving");
            const save = draftId ? api.drafts.update(draftId, body) : api.drafts.create(body);
            save.then(
                (d) => {
                    if (!sent.current) {
                        setDraftId(d.id);
                        setSaveState("saved");
                    }
                },
                () => setSaveState("idle"),
            );
        }, AUTOSAVE_MS);
        return () => clearTimeout(timer);
    }, [to, cc, bcc, subject, html, attachments, draftId, init.mode, init.threadId]);

    const touch =
        <T,>(setter: (v: T) => void) =>
        (v: T) => {
            dirty.current = true;
            setter(v);
        };

    const totalBytes = attachments.reduce((s, a) => s + a.size, 0);

    const addFiles = async (files: FileList | null) => {
        if (!files) return;
        for (const file of Array.from(files)) {
            if (totalBytes + file.size > MAX_TOTAL_BYTES) {
                toast.error(`${file.name} is too big. Attachments can be 20 MB in total.`);
                continue;
            }
            setUploading((n) => n + 1);
            try {
                const stored = await api.files.upload(file);
                dirty.current = true;
                setAttachments((list) => [
                    ...list,
                    { fileId: stored.id, filename: stored.filename, mimeType: stored.mimeType, size: stored.size },
                ]);
            } catch (e) {
                toast.error(`${file.name}: ${errorMessage(e)}`);
            } finally {
                setUploading((n) => n - 1);
            }
        }
        if (fileInput.current) fileInput.current.value = "";
    };

    const invalid = [...to, ...cc, ...bcc].filter((e) => !isEmail(e));
    const canSend = [...to, ...cc, ...bcc].length > 0 && invalid.length === 0 && uploading === 0 && !send.isPending;

    const submit = (sendAt?: string) => {
        if (!canSend) {
            if (invalid.length) toast.error(`Fix these addresses first: ${invalid.join(", ")}`);
            else if (![...to, ...cc, ...bcc].length) toast.error("Add at least one recipient");
            return;
        }
        const planId = followUp.enabled ? (followUp.planId ?? defaultPlanId) : null;
        send.mutate(
            {
                mode: init.mode,
                threadId: init.threadId,
                replyToMessageId: init.replyToMessageId,
                to,
                cc,
                bcc,
                subject,
                html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${html}${includeQuote && init.quoteHtml ? init.quoteHtml : ""}</div>`,
                attachmentFileIds: attachments.map((a) => a.fileId),
                draftId,
                followUp: planId ? { sequenceId: planId } : null,
                sendAt,
            },
            {
                onSuccess: (result) => {
                    sent.current = true;
                    if (result.scheduled && result.sendAt) {
                        toast.success(`Scheduled for ${whenLabel(result.sendAt)}`, {
                            action: { label: "Follow-ups", onClick: () => router.push("/follow-ups") },
                        });
                    } else {
                        toast.success(planId ? "Email sent · follow-ups scheduled" : "Email sent", {
                            action:
                                init.mode === "new" && result.threadId
                                    ? { label: "View", onClick: () => router.push(`/inbox?t=${result.threadId}`) }
                                    : undefined,
                        });
                    }
                    onDone();
                },
                onError: (e) => toast.error(errorMessage(e)),
            },
        );
    };

    const discard = () => {
        sent.current = true;
        if (draftId) void api.drafts.remove(draftId).catch(() => undefined);
        onDone();
    };

    return (
        <div
            className={cn("flex min-h-0 flex-1 flex-col", variant === "inline" && "rounded-xl border bg-card")}
            onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submit();
                }
            }}
        >
            <RecipientInput
                label="To"
                value={to}
                onChange={touch(setTo)}
                autoFocus={init.mode === "new" || init.mode === "forward"}
                trailing={
                    <div className="flex shrink-0 gap-1 pt-1 text-xs text-muted-foreground">
                        {!showCc && (
                            <button
                                type="button"
                                className="hover:text-foreground hover:underline"
                                onClick={() => setShowCc(true)}
                            >
                                Cc
                            </button>
                        )}
                        {!showBcc && (
                            <button
                                type="button"
                                className="hover:text-foreground hover:underline"
                                onClick={() => setShowBcc(true)}
                            >
                                Bcc
                            </button>
                        )}
                    </div>
                }
            />
            {showCc && <RecipientInput label="Cc" value={cc} onChange={touch(setCc)} />}
            {showBcc && <RecipientInput label="Bcc" value={bcc} onChange={touch(setBcc)} />}
            {variant === "window" || init.mode === "forward" ? (
                <input
                    className="border-b bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Subject"
                    value={subject}
                    onChange={(e) => touch(setSubject)(e.target.value)}
                    aria-label="Subject"
                />
            ) : null}

            <RichEditor
                className={variant === "window" ? "min-h-0 flex-1" : "max-h-96"}
                initialHtml={initialHtml}
                onChange={touch(setHtml)}
                onEditor={setEditor}
                autoFocus={init.mode === "reply" || init.mode === "reply_all"}
            />

            {aiWarnings.length > 0 && (
                <Alert className="mx-3 mb-2 w-auto border-warning/50">
                    <TriangleAlert className="text-warning" aria-hidden />
                    <AlertTitle>Check before sending</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-4">
                            {aiWarnings.map((w) => (
                                <li key={w}>{w}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                    <AlertAction>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setAiWarnings([])}
                            aria-label="Dismiss"
                        >
                            <X aria-hidden />
                        </Button>
                    </AlertAction>
                </Alert>
            )}

            {(attachments.length > 0 || uploading > 0 || init.quoteHtml) && (
                <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
                    {attachments.map((a) => (
                        <Badge key={a.fileId} variant="outline" className="h-7 gap-1.5 pr-1 font-normal">
                            <FileText className="size-3.5" aria-hidden />
                            <span className="max-w-40 truncate">{a.filename}</span>
                            <span className="text-muted-foreground">{fileSize(a.size)}</span>
                            <button
                                type="button"
                                className="rounded-full p-0.5 hover:bg-foreground/10"
                                onClick={() => touch(setAttachments)(attachments.filter((x) => x.fileId !== a.fileId))}
                                aria-label={`Remove ${a.filename}`}
                            >
                                <X className="size-3" aria-hidden />
                            </button>
                        </Badge>
                    ))}
                    {uploading > 0 && (
                        <Badge variant="outline" className="h-7 gap-1.5 font-normal">
                            <Spinner className="size-3.5" /> Uploading…
                        </Badge>
                    )}
                    {init.quoteHtml && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="ml-auto text-muted-foreground"
                            onClick={() => setIncludeQuote((v) => !v)}
                        >
                            {includeQuote
                                ? init.mode === "forward"
                                    ? "Original message included"
                                    : "Quoted text included · remove"
                                : "Quoted text removed · add back"}
                        </Button>
                    )}
                </div>
            )}

            {init.mode !== "forward" && <FollowUpToggle value={followUp} onChange={setFollowUp} plans={activePlans} />}

            <div className="flex flex-wrap items-center gap-1 border-t px-2 py-2">
                <div className="flex">
                    <Button
                        type="button"
                        className="rounded-r-none"
                        onClick={() => submit()}
                        disabled={send.isPending || uploading > 0}
                    >
                        {send.isPending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                        Send
                    </Button>
                    <ScheduleMenu onPick={(at) => submit(at)} disabled={send.isPending || uploading > 0} />
                </div>
                <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => void addFiles(e.target.files)}
                />
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Attach files"
                                onClick={() => fileInput.current?.click()}
                            />
                        }
                    >
                        <Paperclip aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent>Attach files (20 MB total)</TooltipContent>
                </Tooltip>
                <TemplatePicker
                    to={to}
                    onPick={(t) => {
                        applyBody(t.html, t.subject);
                        toast.success("Template inserted");
                    }}
                />
                <AiAssist
                    to={to}
                    threadId={init.threadId}
                    getBody={() => splitSignature(html).body}
                    onResult={applyAi}
                />
                <span className="ml-auto pr-1 text-xs text-muted-foreground" aria-live="polite">
                    {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Draft saved" : ""}
                </span>
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <Button type="button" variant="ghost" size="icon" aria-label="Discard" onClick={discard} />
                        }
                    >
                        <Trash2 aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent>Discard{draftId ? " draft" : ""}</TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}
