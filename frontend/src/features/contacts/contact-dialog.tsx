"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useCreateContact } from "@/hooks/use-contacts";
import { errorMessage, type ContactRole } from "@/lib/api";
import { CONTACT_ROLE_LABELS, options } from "@/lib/labels";
import { OrganizationSelect } from "./pickers";

export function ContactDialog({ organizationId }: { organizationId?: string }) {
    const router = useRouter();
    const create = useCreateContact();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ email: "", name: "", designation: "", phone: "" });
    const [role, setRole] = useState<ContactRole>("other");
    const [org, setOrg] = useState<string | null>(organizationId ?? null);

    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        create.mutate(
            { ...form, role, organizationId: org },
            {
                onSuccess: (c) => {
                    setOpen(false);
                    setForm({ email: "", name: "", designation: "", phone: "" });
                    toast.success(`${c.name || c.email} added`);
                    router.push(`/contacts/${c.id}`);
                },
            },
        );
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) create.reset();
            }}
        >
            <DialogTrigger render={<Button />}>
                <UserPlus data-icon="inline-start" />
                Add contact
            </DialogTrigger>
            <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>Add a contact</DialogTitle>
                        <DialogDescription>
                            People you email are added automatically. Use this for someone you haven’t emailed yet.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup className="py-4">
                        {create.isError && (
                            <Alert variant="destructive">
                                <AlertDescription>{errorMessage(create.error)}</AlertDescription>
                            </Alert>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field>
                                <FieldLabel htmlFor="c-email">Email</FieldLabel>
                                <Input
                                    id="c-email"
                                    type="email"
                                    value={form.email}
                                    onChange={set("email")}
                                    placeholder="principal@college.edu.in"
                                    autoFocus
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="c-name">Name</FieldLabel>
                                <Input
                                    id="c-name"
                                    value={form.name}
                                    onChange={set("name")}
                                    placeholder="Dr. Meera Rao"
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="c-role">Role</FieldLabel>
                                <Select
                                    value={role}
                                    onValueChange={(v) => setRole(v as ContactRole)}
                                    items={options(CONTACT_ROLE_LABELS)}
                                >
                                    <SelectTrigger id="c-role" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {options(CONTACT_ROLE_LABELS).map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="c-designation">Designation</FieldLabel>
                                <Input
                                    id="c-designation"
                                    value={form.designation}
                                    onChange={set("designation")}
                                    placeholder="Vice Principal (Academics)"
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="c-phone">Phone</FieldLabel>
                                <Input
                                    id="c-phone"
                                    value={form.phone}
                                    onChange={set("phone")}
                                    placeholder="+91 98765 43210"
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="c-org">College</FieldLabel>
                                <OrganizationSelect id="c-org" value={org} onChange={setOrg} />
                                <FieldDescription>Left empty, it’s matched by email domain.</FieldDescription>
                            </Field>
                        </div>
                    </FieldGroup>
                    <DialogFooter>
                        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                        <Button type="submit" disabled={create.isPending || !form.email.trim()}>
                            {create.isPending && <Spinner data-icon="inline-start" />}
                            Add contact
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
