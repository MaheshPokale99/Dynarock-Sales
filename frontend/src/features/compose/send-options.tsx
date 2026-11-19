"use client";

import { CalendarClock, ChevronDown } from "lucide-react";
import { useState } from "react";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Sequence } from "@/lib/api";
import { fromLocalInput, nextWorkingSlot, toLocalInput, whenLabel } from "@/lib/datetime";

export interface FollowUpChoice {
    enabled: boolean;
    planId: string | null;
}

export function FollowUpToggle({
    value,
    onChange,
    plans,
}: {
    value: FollowUpChoice;
    onChange: (v: FollowUpChoice) => void;
    plans: Sequence[];
}) {
    if (plans.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-1.5 text-sm">
            <Switch
                id="follow-up"
                size="sm"
                checked={value.enabled}
                onCheckedChange={(enabled) => onChange({ ...value, enabled })}
            />
            <Label htmlFor="follow-up" className="font-normal text-muted-foreground">
                Follow up if no reply
            </Label>
            {value.enabled && (
                <Select
                    value={value.planId ?? ""}
                    onValueChange={(v) => onChange({ ...value, planId: v as string })}
                    items={plans.map((p) => ({ value: p.id, label: p.name }))}
                >
                    <SelectTrigger size="sm" className="h-7 min-w-40" aria-label="Follow-up plan">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {plans.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.name} · {p.steps.length} follow-up{p.steps.length === 1 ? "" : "s"}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    );
}

// "Send later" choices next to the Send button.
export function ScheduleMenu({ onPick, disabled }: { onPick: (sendAt: string) => void; disabled?: boolean }) {
    const [custom, setCustom] = useState(false);
    const [value, setValue] = useState(() => toLocalInput(nextWorkingSlot(9)));
    const [{ tomorrow, monday }] = useState(() => ({ tomorrow: nextWorkingSlot(9), monday: nextWorkingSlot(9, true) }));
    const [error, setError] = useState("");

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={disabled}
                            aria-label="Schedule send"
                        />
                    }
                >
                    <ChevronDown aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-52">
                    <DropdownMenuGroup>
                        <DropdownMenuLabel>Schedule send</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onPick(tomorrow.toISOString())}>
                            <CalendarClock aria-hidden />
                            {whenLabel(tomorrow.toISOString())}
                        </DropdownMenuItem>
                        {monday.toDateString() !== tomorrow.toDateString() && (
                            <DropdownMenuItem onClick={() => onPick(monday.toISOString())}>
                                <CalendarClock aria-hidden />
                                {whenLabel(monday.toISOString())}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setCustom(true)}>
                            <CalendarClock aria-hidden />
                            Pick date and time…
                        </DropdownMenuItem>
                    </DropdownMenuGroup>
                </DropdownMenuContent>
            </DropdownMenu>
            <Dialog open={custom} onOpenChange={setCustom}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Schedule send</DialogTitle>
                        <DialogDescription>The email goes out from sales@dynarock.in at this time.</DialogDescription>
                    </DialogHeader>
                    <Field>
                        <FieldLabel htmlFor="schedule-at">Date and time</FieldLabel>
                        <Input
                            id="schedule-at"
                            type="datetime-local"
                            value={value}
                            onChange={(e) => {
                                setValue(e.target.value);
                                setError("");
                            }}
                            aria-invalid={Boolean(error)}
                        />
                        {error && <FieldError>{error}</FieldError>}
                    </Field>
                    <DialogFooter>
                        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                        <Button
                            disabled={!value}
                            onClick={() => {
                                if (new Date(value).getTime() < Date.now() + 60_000) {
                                    setError("Pick a time in the future.");
                                    return;
                                }
                                setCustom(false);
                                onPick(fromLocalInput(value));
                            }}
                        >
                            Schedule
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
