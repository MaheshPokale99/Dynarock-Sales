"use client";

import { ArrowLeft, Ban, Building2, Mail, Phone, PenSquare } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState, PageSkeleton } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useContact, useUpdateContact } from "@/hooks/use-contacts";
import { useTeam } from "@/hooks/use-team";
import { errorMessage, type Contact, type ContactInput, type ContactRole, type ContactStatus } from "@/lib/api";
import { CONTACT_ROLE_LABELS, CONTACT_STATUS_LABELS, options } from "@/lib/labels";
import { useCompose } from "../compose/compose-provider";
import { ConversationList } from "./conversation-list";
import { OrganizationSelect, OwnerSelect, StageSelect } from "./pickers";
import { Timeline } from "./timeline";

export function ContactDetailPage() {
    const { id } = useParams<{ id: string }>();
    const query = useContact(id);
    const update = useUpdateContact();
    const compose = useCompose();
    const { data: team } = useTeam();
    const teamNames = useMemo(() => new Map((team ?? []).map((m) => [m.id, m.name])), [team]);

    if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
    if (query.isPending) return <PageSkeleton />;
    const { contact, threads, activities } = query.data;

    const save = (body: ContactInput, done = "Saved") =>
        update.mutate(
            { id: contact.id, ...body },
            { onSuccess: () => toast.success(done), onError: (e) => toast.error(errorMessage(e)) },
        );

    return (
        <div className="space-y-6">
            <Button variant="ghost" size="sm" render={<Link href="/contacts" />} className="-ml-2">
                <ArrowLeft data-icon="inline-start" />
                Contacts
            </Button>

            <div className="flex flex-wrap items-start gap-4">
                <UserAvatar name={contact.name || contact.email} className="size-12" />
                <div className="min-w-0 flex-1">
                    <h1 className="font-heading text-2xl font-semibold tracking-tight">
                        {contact.name || contact.email}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <Mail className="size-3.5" aria-hidden />
                            {contact.email}
                        </span>
                        {contact.phone && (
                            <span className="inline-flex items-center gap-1.5">
                                <Phone className="size-3.5" aria-hidden />
                                {contact.phone}
                            </span>
                        )}
                        {contact.organization && (
                            <Link
                                href={`/organizations/${contact.organization.id}`}
                                className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
                            >
                                <Building2 className="size-3.5" aria-hidden />
                                {contact.organization.name}
                            </Link>
                        )}
                        <span>
                            {[contact.designation, contact.role !== "other" ? CONTACT_ROLE_LABELS[contact.role] : ""]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <StageSelect
                        value={contact.stage}
                        onChange={(stage, lostReason) => save({ stage, lostReason }, "Stage updated")}
                        disabled={update.isPending}
                    />
                    <OwnerSelect value={contact.ownerId} onChange={(ownerId) => save({ ownerId }, "Owner updated")} />
                    <Button
                        onClick={() => compose.open({ to: [contact.email] })}
                        disabled={contact.status !== "active"}
                    >
                        <PenSquare data-icon="inline-start" />
                        Email
                    </Button>
                </div>
            </div>

            {contact.status !== "active" && (
                <Alert variant="destructive">
                    <Ban aria-hidden />
                    <AlertTitle>{CONTACT_STATUS_LABELS[contact.status]}</AlertTitle>
                    <AlertDescription>
                        Emails to this person are blocked. Change the status under Details if that’s wrong.
                    </AlertDescription>
                </Alert>
            )}
            {contact.stage === "lost" && contact.lostReason && (
                <p className="text-sm text-muted-foreground">Lost: “{contact.lostReason}”</p>
            )}

            <Tabs defaultValue="conversations">
                <TabsList>
                    <TabsTrigger value="conversations">Conversations ({threads.length})</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>
                <TabsContent value="conversations" className="pt-4">
                    <ConversationList threads={threads} emptyText="Emails with this person will show up here." />
                </TabsContent>
                <TabsContent value="timeline" className="pt-4">
                    <Timeline activities={activities} teamNames={teamNames} />
                </TabsContent>
                <TabsContent value="details" className="pt-4">
                    <DetailsForm
                        key={contact.updatedAt}
                        contact={contact}
                        saving={update.isPending}
                        onSave={(b) => save(b)}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function DetailsForm({
    contact,
    saving,
    onSave,
}: {
    contact: Contact;
    saving: boolean;
    onSave: (b: ContactInput) => void;
}) {
    const [form, setForm] = useState({
        name: contact.name,
        designation: contact.designation,
        phone: contact.phone,
        notes: contact.notes,
        tags: contact.tags.join(", "),
    });
    const [role, setRole] = useState<ContactRole>(contact.role);
    const [status, setStatus] = useState<ContactStatus>(contact.status);
    const [org, setOrg] = useState(contact.organizationId);
    const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <Card className="max-w-3xl">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    onSave({
                        ...form,
                        tags: form.tags
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean),
                        role,
                        status,
                        organizationId: org,
                    });
                }}
            >
                <CardHeader>
                    <CardTitle>Details</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <FieldGroup className="grid gap-4 sm:grid-cols-2">
                        <Field>
                            <FieldLabel htmlFor="d-name">Name</FieldLabel>
                            <Input id="d-name" value={form.name} onChange={set("name")} />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="d-role">Role</FieldLabel>
                            <Select
                                value={role}
                                onValueChange={(v) => setRole(v as ContactRole)}
                                items={options(CONTACT_ROLE_LABELS)}
                            >
                                <SelectTrigger id="d-role" className="w-full">
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
                            <FieldLabel htmlFor="d-designation">Designation</FieldLabel>
                            <Input id="d-designation" value={form.designation} onChange={set("designation")} />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="d-phone">Phone</FieldLabel>
                            <Input id="d-phone" value={form.phone} onChange={set("phone")} />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="d-org">College</FieldLabel>
                            <OrganizationSelect id="d-org" value={org} onChange={setOrg} />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="d-status">Email status</FieldLabel>
                            <Select
                                value={status}
                                onValueChange={(v) => setStatus(v as ContactStatus)}
                                items={options(CONTACT_STATUS_LABELS)}
                            >
                                <SelectTrigger id="d-status" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {options(CONTACT_STATUS_LABELS).map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field className="sm:col-span-2">
                            <FieldLabel htmlFor="d-tags">Tags</FieldLabel>
                            <Input
                                id="d-tags"
                                value={form.tags}
                                onChange={set("tags")}
                                placeholder="hot lead, tier 2 city"
                            />
                        </Field>
                        <Field className="sm:col-span-2">
                            <FieldLabel htmlFor="d-notes">Notes</FieldLabel>
                            <Textarea
                                id="d-notes"
                                rows={5}
                                value={form.notes}
                                onChange={set("notes")}
                                placeholder="Uses Tally for fees, contract renews in March…"
                            />
                        </Field>
                    </FieldGroup>
                </CardContent>
                <CardFooter className="justify-end pt-6">
                    <Button type="submit" disabled={saving}>
                        {saving && <Spinner data-icon="inline-start" />}
                        Save details
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
