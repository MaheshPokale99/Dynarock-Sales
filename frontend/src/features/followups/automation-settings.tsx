"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ErrorState } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAutomationSettings, useUpdateAutomationSettings } from "@/hooks/use-automation";
import { errorMessage, type AutomationSettings } from "@/lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 25 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));

function SettingsForm({ initial }: { initial: AutomationSettings }) {
    const update = useUpdateAutomationSettings();
    const [paused, setPaused] = useState(initial.automationPaused);
    const [cap, setCap] = useState(String(initial.dailySendCap));
    const [days, setDays] = useState(initial.sendWindow.days.map(String));
    const [start, setStart] = useState(String(initial.sendWindow.startHour));
    const [end, setEnd] = useState(String(initial.sendWindow.endHour));

    const save = () =>
        update.mutate(
            {
                automationPaused: paused,
                dailySendCap: Math.max(1, Number(cap) || 1),
                sendWindow: {
                    ...initial.sendWindow,
                    days: days.map(Number).sort(),
                    startHour: Number(start),
                    endHour: Number(end),
                },
            },
            {
                onSuccess: () => toast.success("Automation settings saved"),
                onError: (e) => toast.error(errorMessage(e)),
            },
        );

    return (
        <Card className="max-w-2xl">
            <CardHeader>
                <CardTitle>Automation</CardTitle>
                <CardDescription>
                    Applies to automatic follow-ups. Emails you send yourself always go out right away.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                <FieldGroup>
                    <Field orientation="horizontal">
                        <Switch id="a-paused" checked={paused} onCheckedChange={setPaused} />
                        <div>
                            <FieldLabel htmlFor="a-paused">Pause all automatic follow-ups</FieldLabel>
                            <FieldDescription>
                                Nothing automatic is sent until you turn this off. Plans resume where they left off.
                            </FieldDescription>
                        </div>
                    </Field>
                    <Field>
                        <FieldLabel>Send on</FieldLabel>
                        <ToggleGroup
                            multiple
                            value={days}
                            onValueChange={(v) => setDays(v as string[])}
                            variant="outline"
                            size="sm"
                            className="flex-wrap"
                        >
                            {DAYS.map((d, i) => (
                                <ToggleGroupItem key={d} value={String(i)} aria-label={d}>
                                    {d}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Field>
                            <FieldLabel htmlFor="a-start">From</FieldLabel>
                            <Select
                                value={start}
                                onValueChange={(v) => setStart(v as string)}
                                items={HOURS.slice(0, 24)}
                            >
                                <SelectTrigger id="a-start" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {HOURS.slice(0, 24).map((h) => (
                                        <SelectItem key={h.value} value={h.value}>
                                            {h.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="a-end">Until</FieldLabel>
                            <Select value={end} onValueChange={(v) => setEnd(v as string)} items={HOURS.slice(1)}>
                                <SelectTrigger id="a-end" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {HOURS.slice(1).map((h) => (
                                        <SelectItem key={h.value} value={h.value}>
                                            {h.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="a-cap">Max per day</FieldLabel>
                            <Input
                                id="a-cap"
                                type="number"
                                min={1}
                                max={2000}
                                value={cap}
                                onChange={(e) => setCap(e.target.value)}
                            />
                        </Field>
                    </div>
                    <FieldDescription>
                        Times are India time ({initial.sendWindow.timezone}). Gmail allows about 2,000 emails a day in
                        total.
                    </FieldDescription>
                </FieldGroup>
            </CardContent>
            <CardFooter className="justify-end pt-6">
                <Button onClick={save} disabled={update.isPending || days.length === 0 || Number(start) >= Number(end)}>
                    {update.isPending && <Spinner data-icon="inline-start" />}
                    Save
                </Button>
            </CardFooter>
        </Card>
    );
}

export function AutomationSettingsCard() {
    const settings = useAutomationSettings();
    if (settings.isError)
        return <ErrorState message={errorMessage(settings.error)} onRetry={() => void settings.refetch()} />;
    if (settings.isPending) return <Skeleton className="h-72 max-w-2xl rounded-xl" />;
    return <SettingsForm key={JSON.stringify(settings.data)} initial={settings.data} />;
}
