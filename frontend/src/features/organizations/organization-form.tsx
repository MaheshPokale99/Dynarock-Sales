"use client";

import { useState } from "react";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Organization, OrganizationInput, OrganizationType } from "@/lib/api";
import { ORG_TYPE_LABELS, options } from "@/lib/labels";

export function useOrganizationForm(initial?: Organization) {
    const [form, setForm] = useState({
        name: initial?.name ?? "",
        domain: initial?.domain ?? "",
        website: initial?.website ?? "",
        city: initial?.city ?? "",
        state: initial?.state ?? "",
        studentCount: initial?.studentCount?.toString() ?? "",
        currentSystems: initial?.currentSystems ?? "",
        notes: initial?.notes ?? "",
    });
    const [type, setType] = useState<OrganizationType>(initial?.type ?? "engineering_college");
    const value = (): OrganizationInput & { name: string } => ({
        ...form,
        name: form.name.trim(),
        domain: form.domain.trim() || null,
        studentCount: form.studentCount ? Number(form.studentCount) : null,
        type,
    });
    return { form, setForm, type, setType, value };
}

export function OrganizationFields({ state, full }: { state: ReturnType<typeof useOrganizationForm>; full?: boolean }) {
    const { form, setForm, type, setType } = state;
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
                <FieldLabel htmlFor="o-name">College name</FieldLabel>
                <Input
                    id="o-name"
                    value={form.name}
                    onChange={set("name")}
                    placeholder="XYZ Institute of Technology"
                    autoFocus={!full}
                />
            </Field>
            <Field>
                <FieldLabel htmlFor="o-type">Type</FieldLabel>
                <Select
                    value={type}
                    onValueChange={(v) => setType(v as OrganizationType)}
                    items={options(ORG_TYPE_LABELS)}
                >
                    <SelectTrigger id="o-type" className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {options(ORG_TYPE_LABELS).map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>
            <Field>
                <FieldLabel htmlFor="o-domain">Email domain</FieldLabel>
                <Input id="o-domain" value={form.domain} onChange={set("domain")} placeholder="xyz.edu.in" />
                <FieldDescription>Contacts with this domain are linked automatically.</FieldDescription>
            </Field>
            <Field>
                <FieldLabel htmlFor="o-city">City</FieldLabel>
                <Input id="o-city" value={form.city} onChange={set("city")} placeholder="Pune" />
            </Field>
            <Field>
                <FieldLabel htmlFor="o-state">State</FieldLabel>
                <Input id="o-state" value={form.state} onChange={set("state")} placeholder="Maharashtra" />
            </Field>
            {full && (
                <>
                    <Field>
                        <FieldLabel htmlFor="o-website">Website</FieldLabel>
                        <Input
                            id="o-website"
                            value={form.website}
                            onChange={set("website")}
                            placeholder="https://xyz.edu.in"
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="o-students">Students</FieldLabel>
                        <Input
                            id="o-students"
                            type="number"
                            min={0}
                            value={form.studentCount}
                            onChange={set("studentCount")}
                            placeholder="2000"
                        />
                    </Field>
                    <Field className="sm:col-span-2">
                        <FieldLabel htmlFor="o-systems">Systems they use today</FieldLabel>
                        <Input
                            id="o-systems"
                            value={form.currentSystems}
                            onChange={set("currentSystems")}
                            placeholder="Tally for fees, Excel for attendance"
                        />
                    </Field>
                    <Field className="sm:col-span-2">
                        <FieldLabel htmlFor="o-notes">Notes</FieldLabel>
                        <Textarea id="o-notes" rows={4} value={form.notes} onChange={set("notes")} />
                    </Field>
                </>
            )}
        </FieldGroup>
    );
}
