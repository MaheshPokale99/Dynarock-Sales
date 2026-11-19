"use client";

import { useState } from "react";
import { StageDot } from "@/components/common/stage-badge";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizations } from "@/hooks/use-contacts";
import { useTeam } from "@/hooks/use-team";
import type { ContactStage } from "@/lib/api";
import { STAGE_LABELS, STAGES } from "@/lib/labels";

const NONE = "__none__";

// Stage picker; choosing "Lost" asks for a reason first.
export function StageSelect({
    value,
    onChange,
    disabled,
    size = "default",
}: {
    value: ContactStage;
    onChange: (stage: ContactStage, lostReason?: string) => void;
    disabled?: boolean;
    size?: "sm" | "default";
}) {
    const [askLost, setAskLost] = useState(false);
    return (
        <>
            <Select
                value={value}
                onValueChange={(v) => (v === "lost" ? setAskLost(true) : onChange(v as ContactStage))}
                items={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
                disabled={disabled}
            >
                <SelectTrigger size={size} className="min-w-40" aria-label="Stage">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {STAGES.map((s) => (
                        <SelectItem key={s} value={s}>
                            <StageDot stage={s} />
                            {STAGE_LABELS[s]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <LostReasonDialog
                open={askLost}
                onCancel={() => setAskLost(false)}
                onConfirm={(reason) => {
                    setAskLost(false);
                    onChange("lost", reason);
                }}
            />
        </>
    );
}

export function LostReasonDialog({
    open,
    onCancel,
    onConfirm,
}: {
    open: boolean;
    onCancel: () => void;
    onConfirm: (reason: string) => void;
}) {
    const [reason, setReason] = useState("");
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
            <DialogContent className="sm:max-w-md">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (reason.trim()) onConfirm(reason.trim());
                        setReason("");
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Why was this lost?</DialogTitle>
                        <DialogDescription>A short reason helps the team learn what to fix.</DialogDescription>
                    </DialogHeader>
                    <Field className="py-4">
                        <FieldLabel htmlFor="lost-reason">Reason</FieldLabel>
                        <Textarea
                            id="lost-reason"
                            rows={3}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Chose another ERP, no budget this year…"
                            autoFocus
                        />
                    </Field>
                    <DialogFooter>
                        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                        <Button type="submit" variant="destructive" disabled={!reason.trim()}>
                            Mark as lost
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function OwnerSelect({
    value,
    onChange,
    allowAll,
    size = "default",
}: {
    value: string | null;
    onChange: (id: string | null) => void;
    allowAll?: boolean;
    size?: "sm" | "default";
}) {
    const { data: team } = useTeam();
    const members = (team ?? []).filter((m) => m.status !== "disabled");
    const empty = allowAll ? "Everyone" : "Unassigned";
    return (
        <Select
            value={value ?? NONE}
            onValueChange={(v) => onChange(v === NONE ? null : (v as string))}
            items={[{ value: NONE, label: empty }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
        >
            <SelectTrigger size={size} className="min-w-36" aria-label="Owner">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NONE}>{empty}</SelectItem>
                {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                        {m.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function OrganizationSelect({
    value,
    onChange,
    id,
}: {
    value: string | null;
    onChange: (id: string | null) => void;
    id?: string;
}) {
    const { data: orgs } = useOrganizations();
    return (
        <Select
            value={value ?? NONE}
            onValueChange={(v) => onChange(v === NONE ? null : (v as string))}
            items={[{ value: NONE, label: "No college" }, ...(orgs ?? []).map((o) => ({ value: o.id, label: o.name }))]}
        >
            <SelectTrigger id={id} className="w-full" aria-label="College">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NONE}>No college</SelectItem>
                {(orgs ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                        {o.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
