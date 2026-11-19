"use client";

import type { Editor } from "@tiptap/react";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/hooks/use-auth";
import { useDeleteTemplate, useSaveTemplate, useTemplates } from "@/hooks/use-templates";
import { errorMessage, type EmailTemplate, type TemplateCategory } from "@/lib/api";
import { options, TEMPLATE_CATEGORY_LABELS } from "@/lib/labels";
import { RichEditor } from "../compose/rich-editor";

const FIELDS = [
    { key: "contact.firstName", label: "First name" },
    { key: "contact.name", label: "Full name" },
    { key: "contact.designation", label: "Designation" },
    { key: "organization.name", label: "College" },
    { key: "organization.city", label: "City" },
    { key: "sender.firstName", label: "Your first name" },
];

const plain = (html: string) =>
    html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

function TemplateDialog({ template, onClose }: { template: EmailTemplate | null; onClose: () => void }) {
    const save = useSaveTemplate();
    const [name, setName] = useState(template?.name ?? "");
    const [category, setCategory] = useState<TemplateCategory>(template?.category ?? "intro");
    const [subject, setSubject] = useState(template?.subject ?? "");
    const [html, setHtml] = useState(template?.html ?? "<p>Hi {{contact.firstName}},</p><p></p>");
    const [editor, setEditor] = useState<Editor | null>(null);

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        save.mutate(
                            { id: template?.id, name, category, subject, html },
                            {
                                onSuccess: () => {
                                    toast.success("Template saved");
                                    onClose();
                                },
                            },
                        );
                    }}
                    noValidate
                >
                    <DialogHeader>
                        <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
                        <DialogDescription>
                            Fields in {"{{ }}"} are filled in from the contact when you use it in Compose.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {save.isError && (
                            <Alert variant="destructive">
                                <AlertDescription>{errorMessage(save.error)}</AlertDescription>
                            </Alert>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field>
                                <FieldLabel htmlFor="t-name">Name</FieldLabel>
                                <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="t-cat">Type</FieldLabel>
                                <Select
                                    value={category}
                                    onValueChange={(v) => setCategory(v as TemplateCategory)}
                                    items={options(TEMPLATE_CATEGORY_LABELS)}
                                >
                                    <SelectTrigger id="t-cat" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {options(TEMPLATE_CATEGORY_LABELS).map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>
                        <Field>
                            <FieldLabel htmlFor="t-subject">Subject</FieldLabel>
                            <Input
                                id="t-subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="One platform for {{organization.name}}"
                            />
                        </Field>
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Email</div>
                            <div className="overflow-hidden rounded-lg border">
                                <RichEditor
                                    className="max-h-80"
                                    initialHtml={html}
                                    onChange={setHtml}
                                    onEditor={setEditor}
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Insert:</span>
                                {FIELDS.map((f) => (
                                    <Button
                                        key={f.key}
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => editor?.chain().focus().insertContent(`{{${f.key}}}`).run()}
                                    >
                                        {f.label}
                                    </Button>
                                ))}
                            </div>
                            <FieldDescription>Your signature is added automatically when you send.</FieldDescription>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                        <Button type="submit" disabled={save.isPending || !name.trim() || !plain(html)}>
                            {save.isPending && <Spinner data-icon="inline-start" />}
                            Save template
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function TemplatesPage() {
    const { data: me } = useMe();
    const templates = useTemplates();
    const remove = useDeleteTemplate();
    const [editing, setEditing] = useState<{ template: EmailTemplate | null } | null>(null);
    const canEdit = (t: EmailTemplate) => me?.role === "admin" || (t.createdBy !== null && t.createdBy === me?.id);

    return (
        <>
            <PageHeader
                title="Templates"
                description="Saved emails the whole team can reuse from Compose. Names and colleges are filled in for you."
                actions={
                    <Button onClick={() => setEditing({ template: null })}>
                        <Plus data-icon="inline-start" />
                        New template
                    </Button>
                }
            />
            {templates.isError ? (
                <ErrorState message={errorMessage(templates.error)} onRetry={() => void templates.refetch()} />
            ) : templates.isPending ? (
                <Skeleton className="h-64 rounded-xl" />
            ) : templates.data.length === 0 ? (
                <EmptyState icon={FileText} title="No templates yet" description="Save an email you send often." />
            ) : (
                <div className="grid gap-3 md:grid-cols-2">
                    {templates.data.map((t) => (
                        <Card key={t.id} size="sm">
                            <CardContent className="space-y-2">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-medium">{t.name}</h3>
                                        <p className="truncate text-sm text-muted-foreground">
                                            {t.subject || "(no subject)"}
                                        </p>
                                    </div>
                                    <Badge variant="outline">{TEMPLATE_CATEGORY_LABELS[t.category]}</Badge>
                                </div>
                                <p className="line-clamp-3 text-sm text-muted-foreground">{plain(t.html)}</p>
                                <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">
                                        Used {t.usageCount} time{t.usageCount === 1 ? "" : "s"}
                                    </span>
                                    {canEdit(t) && (
                                        <div className="ml-auto flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => setEditing({ template: t })}
                                                aria-label={`Edit ${t.name}`}
                                            >
                                                <Pencil aria-hidden />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`Delete ${t.name}`}
                                                onClick={() =>
                                                    remove.mutate(t.id, {
                                                        onSuccess: () => toast.success("Template deleted"),
                                                        onError: (e) => toast.error(errorMessage(e)),
                                                    })
                                                }
                                            >
                                                <Trash2 aria-hidden />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
            {editing && (
                <TemplateDialog
                    key={editing.template?.id ?? "new"}
                    template={editing.template}
                    onClose={() => setEditing(null)}
                />
            )}
        </>
    );
}
