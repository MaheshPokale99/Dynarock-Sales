"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
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
import { useInvite } from "@/hooks/use-team";
import { errorMessage, type Invitation, type UserRole } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/labels";

const ROLE_HINTS: Record<UserRole, string> = {
    sales_rep: "Can email clients, use AI and see every conversation.",
    admin: "Everything a sales rep can do, plus team, mailbox and automation settings.",
};

export function InviteDialog({ onInvited }: { onInvited: (invitation: Invitation) => void }) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<UserRole>("sales_rep");
    const invite = useInvite();

    const reset = () => {
        setName("");
        setEmail("");
        setRole("sales_rep");
        invite.reset();
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        invite.mutate(
            { name, email, role },
            {
                onSuccess: (invitation) => {
                    setOpen(false);
                    reset();
                    onInvited(invitation);
                },
            },
        );
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) reset();
            }}
        >
            <DialogTrigger render={<Button />}>
                <UserPlus data-icon="inline-start" />
                Invite member
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submit} noValidate>
                    <DialogHeader>
                        <DialogTitle>Invite a team member</DialogTitle>
                        <DialogDescription>They get a one-time link to choose their password.</DialogDescription>
                    </DialogHeader>
                    <FieldGroup className="py-4">
                        {invite.isError && (
                            <Alert variant="destructive">
                                <AlertDescription>{errorMessage(invite.error)}</AlertDescription>
                            </Alert>
                        )}
                        <Field>
                            <FieldLabel htmlFor="invite-name">Name</FieldLabel>
                            <Input
                                id="invite-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ravi Kumar"
                                autoFocus
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="invite-email">Work email</FieldLabel>
                            <Input
                                id="invite-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="ravi@dynarock.in"
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                            <Select
                                value={role}
                                onValueChange={(v) => setRole(v as UserRole)}
                                items={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
                            >
                                <SelectTrigger id="invite-role" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sales_rep">{ROLE_LABELS.sales_rep}</SelectItem>
                                    <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                                </SelectContent>
                            </Select>
                            <FieldDescription>{ROLE_HINTS[role]}</FieldDescription>
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                        <Button type="submit" disabled={invite.isPending || !name.trim() || !email.trim()}>
                            {invite.isPending && <Spinner data-icon="inline-start" />}
                            Create invite
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
