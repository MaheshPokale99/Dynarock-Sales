"use client";

import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDeleteKnowledge, useKnowledge, useSaveKnowledge } from "@/hooks/use-ai";
import { useMe } from "@/hooks/use-auth";
import { errorMessage, type KnowledgeCategory, type KnowledgeEntry } from "@/lib/api";
import { CONTACT_ROLE_LABELS, KNOWLEDGE_CATEGORY_LABELS, options } from "@/lib/labels";

const ORDER: KnowledgeCategory[] = ["company", "offer", "module", "ai_feature", "faq", "case_study"];
const PITCH_ROLES = ["principal", "director", "dean", "registrar", "it_head", "trustee"] as const;

function EntryDialog({ entry, open, onClose }: { entry: KnowledgeEntry | null; open: boolean; onClose: () => void }) {
    const save = useSaveKnowledge();
    const [form, setForm] = useState({
        name: entry?.name ?? "",
        summary: entry?.summary ?? "",
        details: entry?.details ?? "",
        url: entry?.url ?? "",
    });
    const [category, setCategory] = useState<KnowledgeCategory>(entry?.category ?? "module");
    const [active, setActive] = useState(entry?.active ?? true);
    const [pitch, setPitch] = useState<Record<string, string>>(entry?.pitchByRole ?? {});
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        save.mutate(
                            {
                                id: entry?.id,
                                ...form,
                                category,
                                active,
                                pitchByRole: Object.fromEntries(Object.entries(pitch).filter(([, v]) => v.trim())),
                            },
                            {
                                onSuccess: () => {
                                    toast.success("Saved. The AI uses it from the next email.");
                                    onClose();
                                },
                            },
                        );
                    }}
                    noValidate
                >
                    <DialogHeader>
                        <DialogTitle>{entry ? "Edit fact" : "Add a fact"}</DialogTitle>
                        <DialogDescription>
                            The AI may only say what’s written here. Keep it accurate; don’t add prices you can’t
                            honour.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup className="grid gap-4 py-4 sm:grid-cols-2">
                        {save.isError && (
                            <Alert variant="destructive" className="sm:col-span-2">
                                <AlertDescription>{errorMessage(save.error)}</AlertDescription>
                            </Alert>
                        )}
                        <Field>
                            <FieldLabel htmlFor="k-name">Name</FieldLabel>
                            <Input
                                id="k-name"
                                value={form.name}
                                onChange={set("name")}
                                placeholder="Fees and student ledger"
                                autoFocus
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="k-category">Type</FieldLabel>
                            <Select
                                value={category}
                                onValueChange={(v) => setCategory(v as KnowledgeCategory)}
                                items={options(KNOWLEDGE_CATEGORY_LABELS)}
                            >
                                <SelectTrigger id="k-category" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {options(KNOWLEDGE_CATEGORY_LABELS).map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field className="sm:col-span-2">
                            <FieldLabel htmlFor="k-summary">Summary</FieldLabel>
                            <Textarea id="k-summary" rows={2} value={form.summary} onChange={set("summary")} />
                        </Field>
                        <Field className="sm:col-span-2">
                            <FieldLabel htmlFor="k-details">Details</FieldLabel>
                            <Textarea id="k-details" rows={3} value={form.details} onChange={set("details")} />
                        </Field>
                        <Field className="sm:col-span-2">
                            <FieldLabel htmlFor="k-url">Link</FieldLabel>
                            <Input
                                id="k-url"
                                value={form.url}
                                onChange={set("url")}
                                placeholder="https://dynarock.in"
                            />
                            <FieldDescription>The only links the AI may include.</FieldDescription>
                        </Field>
                        <div className="space-y-3 sm:col-span-2">
                            <div className="text-sm font-medium">Angle per role (optional)</div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {PITCH_ROLES.map((role) => (
                                    <Field key={role}>
                                        <FieldLabel
                                            htmlFor={`k-pitch-${role}`}
                                            className="text-xs text-muted-foreground"
                                        >
                                            {CONTACT_ROLE_LABELS[role]}
                                        </FieldLabel>
                                        <Input
                                            id={`k-pitch-${role}`}
                                            value={pitch[role] ?? ""}
                                            onChange={(e) => setPitch((p) => ({ ...p, [role]: e.target.value }))}
                                        />
                                    </Field>
                                ))}
                            </div>
                        </div>
                        <Field orientation="horizontal" className="sm:col-span-2">
                            <Switch id="k-active" checked={active} onCheckedChange={setActive} />
                            <FieldLabel htmlFor="k-active">Used by the AI</FieldLabel>
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                        <Button type="submit" disabled={save.isPending || !form.name.trim() || !form.summary.trim()}>
                            {save.isPending && <Spinner data-icon="inline-start" />}
                            Save
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function KnowledgePage() {
    const { data: me } = useMe();
    const isAdmin = me?.role === "admin";
    const knowledge = useKnowledge();
    const remove = useDeleteKnowledge();
    const [editing, setEditing] = useState<{ entry: KnowledgeEntry | null } | null>(null);

    return (
        <>
            <PageHeader
                title="Knowledge"
                description="Dynarock product facts. The AI writes only from these, so a wrong fact here means a wrong email."
                actions={
                    isAdmin && (
                        <Button onClick={() => setEditing({ entry: null })}>
                            <Plus data-icon="inline-start" />
                            Add fact
                        </Button>
                    )
                }
            />
            {knowledge.isError ? (
                <ErrorState message={errorMessage(knowledge.error)} onRetry={() => void knowledge.refetch()} />
            ) : knowledge.isPending ? (
                <Skeleton className="h-80 rounded-xl" />
            ) : knowledge.data.length === 0 ? (
                <EmptyState
                    icon={BookOpen}
                    title="No facts yet"
                    description="Restart the API to load the dynarock.in facts, or add your own."
                />
            ) : (
                <div className="space-y-8">
                    {ORDER.filter((cat) => knowledge.data.some((k) => k.category === cat)).map((cat) => (
                        <section key={cat}>
                            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                                {KNOWLEDGE_CATEGORY_LABELS[cat]}
                            </h2>
                            <div className="grid gap-3 md:grid-cols-2">
                                {knowledge.data
                                    .filter((k) => k.category === cat)
                                    .map((k) => (
                                        <Card key={k.id} size="sm" className={k.active ? undefined : "opacity-60"}>
                                            <CardContent className="space-y-2">
                                                <div className="flex items-start gap-2">
                                                    <h3 className="flex-1 font-medium">{k.name}</h3>
                                                    {!k.active && <Badge variant="outline">Not used</Badge>}
                                                    {isAdmin && (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-xs"
                                                                onClick={() => setEditing({ entry: k })}
                                                                aria-label={`Edit ${k.name}`}
                                                            >
                                                                <Pencil aria-hidden />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-xs"
                                                                aria-label={`Delete ${k.name}`}
                                                                onClick={() =>
                                                                    remove.mutate(k.id, {
                                                                        onSuccess: () =>
                                                                            toast.success(`${k.name} deleted`),
                                                                        onError: (e) => toast.error(errorMessage(e)),
                                                                    })
                                                                }
                                                            >
                                                                <Trash2 aria-hidden />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{k.summary}</p>
                                                {k.details && (
                                                    <p className="text-sm text-muted-foreground">{k.details}</p>
                                                )}
                                                {Object.keys(k.pitchByRole).length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {Object.keys(k.pitchByRole).map((role) => (
                                                            <Badge
                                                                key={role}
                                                                variant="secondary"
                                                                className="font-normal"
                                                                title={k.pitchByRole[role]}
                                                            >
                                                                {CONTACT_ROLE_LABELS[
                                                                    role as keyof typeof CONTACT_ROLE_LABELS
                                                                ] ?? role}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
            {editing && (
                <EntryDialog
                    key={editing.entry?.id ?? "new"}
                    entry={editing.entry}
                    open
                    onClose={() => setEditing(null)}
                />
            )}
        </>
    );
}
