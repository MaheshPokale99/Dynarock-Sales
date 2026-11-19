"use client";

import { Building2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCreateOrganization, useOrganizations } from "@/hooks/use-contacts";
import { errorMessage } from "@/lib/api";
import { ORG_TYPE_LABELS } from "@/lib/labels";
import { OrganizationFields, useOrganizationForm } from "./organization-form";

function NewOrganizationDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const state = useOrganizationForm();
    const create = useCreateOrganization();

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) create.reset();
            }}
        >
            <DialogTrigger render={<Button />}>
                <Plus data-icon="inline-start" />
                Add college
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        create.mutate(state.value(), {
                            onSuccess: (org) => {
                                setOpen(false);
                                toast.success(
                                    org.contactCount
                                        ? `${org.name} added and ${org.contactCount} contact(s) linked`
                                        : `${org.name} added`,
                                );
                                router.push(`/organizations/${org.id}`);
                            },
                        });
                    }}
                    noValidate
                >
                    <DialogHeader>
                        <DialogTitle>Add a college</DialogTitle>
                        <DialogDescription>
                            Add its email domain so everyone you email there is grouped under it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {create.isError && (
                            <Alert variant="destructive">
                                <AlertDescription>{errorMessage(create.error)}</AlertDescription>
                            </Alert>
                        )}
                        <OrganizationFields state={state} />
                    </div>
                    <DialogFooter>
                        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                        <Button type="submit" disabled={create.isPending || !state.form.name.trim()}>
                            {create.isPending && <Spinner data-icon="inline-start" />}
                            Add college
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function OrganizationsPage() {
    const [search, setSearch] = useState("");
    const [q, setQ] = useState("");
    const orgs = useOrganizations({ q: q || undefined });

    useEffect(() => {
        const t = setTimeout(() => setQ(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    return (
        <>
            <PageHeader
                title="Colleges"
                description="The institutions you sell to. Each one groups its people and every conversation with them."
                actions={<NewOrganizationDialog />}
            />
            <InputGroup className="mb-4 w-full sm:w-72">
                <InputGroupAddon>
                    <Search aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, domain, city"
                    aria-label="Search colleges"
                />
            </InputGroup>

            {orgs.isError ? (
                <ErrorState message={errorMessage(orgs.error)} onRetry={() => void orgs.refetch()} />
            ) : orgs.isPending ? (
                <Skeleton className="h-64 rounded-xl" />
            ) : orgs.data.length === 0 ? (
                <EmptyState
                    icon={Building2}
                    title={q ? "No matching colleges" : "No colleges yet"}
                    description={
                        q
                            ? "Try another search."
                            : "Add the colleges you’re selling to. Contacts with the same email domain join them automatically."
                    }
                />
            ) : (
                <Card className="py-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-4">College</TableHead>
                                <TableHead className="hidden md:table-cell">Type</TableHead>
                                <TableHead className="hidden sm:table-cell">City</TableHead>
                                <TableHead className="pr-4 text-right">Contacts</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orgs.data.map((o) => (
                                <TableRow key={o.id} className="relative">
                                    <TableCell className="pl-4">
                                        <Link href={`/organizations/${o.id}`} className="after:absolute after:inset-0">
                                            <div className="font-medium">{o.name}</div>
                                            {o.domain && (
                                                <div className="text-xs text-muted-foreground">{o.domain}</div>
                                            )}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">{ORG_TYPE_LABELS[o.type]}</TableCell>
                                    <TableCell className="hidden sm:table-cell">
                                        {[o.city, o.state].filter(Boolean).join(", ") || "—"}
                                    </TableCell>
                                    <TableCell className="pr-4 text-right tabular-nums">{o.contactCount}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}
        </>
    );
}
