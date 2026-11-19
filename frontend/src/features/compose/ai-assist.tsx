"use client";

import { ChevronDown, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAiStatus } from "@/hooks/use-ai";
import { api, errorMessage, type RewriteAction, type Tone } from "@/lib/api";
import { options, TONE_LABELS } from "@/lib/labels";

const REWRITES: { action: RewriteAction; label: string }[] = [
    { action: "improve", label: "Improve" },
    { action: "shorten", label: "Shorten" },
    { action: "formal", label: "More formal" },
    { action: "friendly", label: "Friendlier" },
    { action: "demo_cta", label: "Add a demo request" },
    { action: "grammar", label: "Fix grammar" },
];

const EXAMPLES = [
    "Intro email to the principal about our fees and attendance modules",
    "Follow up on the demo we did last week and ask for a decision",
    "Thank them and suggest a 20-minute demo next week",
];

export interface AiResult {
    subject?: string;
    html: string;
    warnings: string[];
}

// AI Write (from an instruction) and Rewrite (the current draft) for Compose.
export function AiAssist({
    to,
    threadId,
    getBody,
    onResult,
}: {
    to: string[];
    threadId?: string;
    getBody: () => string;
    onResult: (result: AiResult) => void;
}) {
    const { data: status } = useAiStatus();
    const [open, setOpen] = useState(false);
    const [instruction, setInstruction] = useState("");
    const [tone, setTone] = useState<Tone>("professional");
    const [busy, setBusy] = useState<"write" | "rewrite" | null>(null);

    if (status && !status.enabled) {
        return (
            <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} />}>
                    <Button type="button" variant="ghost" size="sm" disabled>
                        <Sparkles data-icon="inline-start" />
                        AI
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Add GEMINI_API_KEY to the server to turn on AI writing</TooltipContent>
            </Tooltip>
        );
    }

    const write = async () => {
        setBusy("write");
        try {
            const result = await api.ai.compose({ instruction, to, threadId, tone });
            onResult(result);
            setOpen(false);
            setInstruction("");
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    const rewrite = async (action: RewriteAction) => {
        const html = getBody();
        if (!html.replace(/<[^>]+>/g, "").trim()) {
            toast.error("Write something first, or use AI Write.");
            return;
        }
        setBusy("rewrite");
        try {
            onResult(await api.ai.rewrite({ html, action }));
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex items-center">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger render={<Button type="button" variant="ghost" size="sm" disabled={busy !== null} />}>
                    {busy === "write" ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                    AI Write
                </PopoverTrigger>
                <PopoverContent className="w-96" side="top" align="start">
                    <form
                        className="space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (instruction.trim().length >= 3) void write();
                        }}
                    >
                        <Field>
                            <FieldLabel htmlFor="ai-instruction">What should the email say?</FieldLabel>
                            <Textarea
                                id="ai-instruction"
                                rows={3}
                                value={instruction}
                                onChange={(e) => setInstruction(e.target.value)}
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        (e.ctrlKey || e.metaKey) &&
                                        instruction.trim().length >= 3
                                    ) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void write();
                                    }
                                }}
                                placeholder={EXAMPLES[0]}
                                autoFocus
                            />
                        </Field>
                        <div className="flex flex-wrap gap-1">
                            {EXAMPLES.slice(1).map((ex) => (
                                <button
                                    key={ex}
                                    type="button"
                                    onClick={() => setInstruction(ex)}
                                    className="rounded-full border px-2 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    {ex}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <Select value={tone} onValueChange={(v) => setTone(v as Tone)} items={options(TONE_LABELS)}>
                                <SelectTrigger size="sm" className="flex-1" aria-label="Tone">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {options(TONE_LABELS).map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button type="submit" size="sm" disabled={busy !== null || instruction.trim().length < 3}>
                                {busy === "write" && <Spinner data-icon="inline-start" />}
                                Write
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Uses the contact, the conversation and the Knowledge base. Always read it before sending.
                        </p>
                    </form>
                </PopoverContent>
            </Popover>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy !== null}
                            aria-label="Rewrite with AI"
                        />
                    }
                >
                    {busy === "rewrite" ? <Spinner data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />}
                    Rewrite
                    <ChevronDown className="size-3" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-44">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Rewrite the draft</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {REWRITES.map((r) => (
                            <DropdownMenuItem key={r.action} onClick={() => void rewrite(r.action)}>
                                {r.label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
