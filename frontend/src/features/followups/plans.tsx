"use client";

import { Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/common/page-header";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-auth";
import {
    useAutomationSettings,
    useDeleteSequence,
    useSaveSequence,
    useSequences,
    useUpdateAutomationSettings,
} from "@/hooks/use-automation";
import { errorMessage, type Sequence, type SequenceStep } from "@/lib/api";
import { CalendarClock } from "lucide-react";

const NEW_STEP: SequenceStep = { delayDays: 3, instruction: "A short, friendly follow-up.", fixedText: "" };

function PlanDialog({ plan, onClose }: { plan: Sequence | null; onClose: () => void }) {
    const save = useSaveSequence();
    const [name, setName] = useState(plan?.name ?? "");
    const [description, setDescription] = useState(plan?.description ?? "");
    const [active, setActive] = useState(plan?.active ?? true);
    const [steps, setSteps] = useState<SequenceStep[]>(plan?.steps ?? [NEW_STEP]);
    const setStep = (i: number, patch: Partial<SequenceStep>) =>
        setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    let day = 0;

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        save.mutate(
                            { id: plan?.id, name, description, active, steps },
                            {
                                onSuccess: () => {
                                    toast.success("Plan saved");
                                    onClose();
                                },
                            },
                        );
                    }}
                    noValidate
                >
                    <DialogHeader>
                        <DialogTitle>{plan ? "Edit follow-up plan" : "New follow-up plan"}</DialogTitle>
                        <DialogDescription>
                            Each step waits a number of days with no reply, then sends. A reply stops the plan.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {save.isError && (
                            <Alert variant="destructive">
                                <AlertDescription>{errorMessage(save.error)}</AlertDescription>
                            </Alert>
                        )}
                        <Field>
                            <FieldLabel htmlFor="p-name">Name</FieldLabel>
                            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="p-desc">Description</FieldLabel>
                            <Input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
                        </Field>
                        <ol className="space-y-3">
                            {steps.map((s, i) => {
                                day += s.delayDays;
                                return (
                                    <li key={i} className="space-y-3 rounded-lg border p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">Follow-up {i + 1}</span>
                                            <span className="text-xs text-muted-foreground">around day {day}</span>
                                            {steps.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="ml-auto"
                                                    aria-label={`Remove follow-up ${i + 1}`}
                                                    onClick={() => setSteps((list) => list.filter((_, j) => j !== i))}
                                                >
                                                    <X aria-hidden />
                                                </Button>
                                            )}
                                        </div>
                                        <Field orientation="horizontal">
                                            <FieldLabel htmlFor={`p-delay-${i}`} className="shrink-0">
                                                Wait
                                            </FieldLabel>
                                            <Input
                                                id={`p-delay-${i}`}
                                                type="number"
                                                min={1}
                                                max={60}
                                                className="w-20"
                                                value={s.delayDays}
                                                onChange={(e) => setStep(i, { delayDays: Math.max(1, Number(e.target.value) || 1) })}
                                            />
                                            <span className="text-sm text-muted-foreground">days after the previous email</span>
                                        </Field>
                                        <Field>
                                            <FieldLabel htmlFor={`p-inst-${i}`}>What the AI should write</FieldLabel>
                                            <Textarea
                                                id={`p-inst-${i}`}
                                                rows={2}
                                                value={s.instruction}
                                                onChange={(e) => setStep(i, { instruction: e.target.value })}
                                            />
                                        </Field>
                                        <Field>
                                            <FieldLabel htmlFor={`p-fixed-${i}`}>Or a fixed text (optional)</FieldLabel>
                                            <Textarea
                                                id={`p-fixed-${i}`}
                                                rows={2}
                                                value={s.fixedText}
                                                onChange={(e) => setStep(i, { fixedText: e.target.value })}
                                            />
                                            <FieldDescription>Used instead of AI when filled in.</FieldDescription>
                                        </Field>
                                    </li>
                                );
                            })}
                        </ol>
                        {steps.length < 10 && (
                            <Button type="button" variant="outline" size="sm" onClick={() => setSteps((l) => [...l, { ...NEW_STEP, delayDays: 7 }])}>
                                <Plus data-icon="inline-start" />
                                Add follow-up
                            </Button>
                        )}
                        <Field orientation="horizontal">
                            <Switch id="p-active" checked={active} onCheckedChange={setActive} />
                            <FieldLabel htmlFor="p-active">Available in Compose</FieldLabel>
                        </Field>
                    </div>
                    <DialogFooter>
                        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                        <Button type="submit" disabled={save.isPending || !name.trim()}>
                            {save.isPending && <Spinner data-icon="inline-start" />}
                            Save plan
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function Plans() {
    const { data: me } = useMe();
    const isAdmin = me?.role === "admin";
    const plans = useSequences();
    const { data: settings } = useAutomationSettings();
    const updateSettings = useUpdateAutomationSettings();
    const remove = useDeleteSequence();
    const [editing, setEditing] = useState<{ plan: Sequence | null } | null>(null);

    if (plans.isError) return <ErrorState message={errorMessage(plans.error)} onRetry={() => void plans.refetch()} />;
    if (plans.isPending) return <Skeleton className="h-48 rounded-xl" />;

    return (
        <div className="space-y-3">
            {isAdmin && (
                <Button onClick={() => setEditing({ plan: null })}>
                    <Plus data-icon="inline-start" />
                    New plan
                </Button>
            )}
            {plans.data.length === 0 ? (
                <EmptyState icon={CalendarClock} title="No follow-up plans" description="Create one to follow up automatically." />
            ) : (
                plans.data.map((p) => {
                    const isDefault = settings?.defaultSequenceId === p.id;
                    let day = 0;
                    return (
                        <Card key={p.id} size="sm" className={p.active ? undefined : "opacity-60"}>
                            <CardContent className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-medium">{p.name}</h3>
                                    {isDefault && <Badge>Default</Badge>}
                                    {!p.active && <Badge variant="outline">Off</Badge>}
                                    {isAdmin && (
                                        <div className="ml-auto flex gap-1">
                                            {!isDefault && p.active && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        updateSettings.mutate(
                                                            { defaultSequenceId: p.id },
                                                            { onSuccess: () => toast.success(`${p.name} is now the default`) },
                                                        )
                                                    }
                                                >
                                                    <Star data-icon="inline-start" />
                                                    Make default
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ plan: p })} aria-label={`Edit ${p.name}`}>
                                                <Pencil aria-hidden />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`Delete ${p.name}`}
                                                onClick={() =>
                                                    remove.mutate(p.id, {
                                                        onSuccess: () => toast.success("Plan deleted"),
                                                        onError: (e) => toast.error(errorMessage(e)),
                                                    })
                                                }
                                            >
                                                <Trash2 aria-hidden />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                                <ol className="flex flex-wrap gap-2 text-xs">
                                    {p.steps.map((s, i) => {
                                        day += s.delayDays;
                                        return (
                                            <li key={i} className="rounded-full border px-2.5 py-1 text-muted-foreground" title={s.fixedText || s.instruction}>
                                                Day {day} · {s.fixedText ? "fixed text" : "AI"}
                                            </li>
                                        );
                                    })}
                                </ol>
                            </CardContent>
                        </Card>
                    );
                })
            )}
            {editing && <PlanDialog key={editing.plan?.id ?? "new"} plan={editing.plan} onClose={() => setEditing(null)} />}
        </div>
    );
}
