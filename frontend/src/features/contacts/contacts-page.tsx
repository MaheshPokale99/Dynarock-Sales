"use client";

import { ChevronLeft, ChevronRight, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page-header";
import { StageBadge, StageDot } from "@/components/common/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useContacts } from "@/hooks/use-contacts";
import { useTeam } from "@/hooks/use-team";
import { errorMessage, type ContactStage } from "@/lib/api";
import { CONTACT_ROLE_LABELS, CONTACT_STATUS_LABELS, STAGE_LABELS, STAGES } from "@/lib/labels";
import { listTime } from "@/lib/mail-format";
import { ContactDialog } from "./contact-dialog";
import { OwnerSelect } from "./pickers";

const ALL = "__all__";

export function ContactsPage() {
    const [search, setSearch] = useState("");
    const [q, setQ] = useState("");
    const [stage, setStage] = useState<ContactStage | undefined>();
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const { data: team } = useTeam();
    const teamNames = new Map((team ?? []).map((m) => [m.id, m.name]));
    const contacts = useContacts({ q: q || undefined, stage, ownerId: ownerId ?? undefined, page });

    useEffect(() => {
        const t = setTimeout(() => {
            setQ(search.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    const pages = contacts.data ? Math.max(1, Math.ceil(contacts.data.total / contacts.data.pageSize)) : 1;

    return (
        <>
            <PageHeader
                title="Contacts"
                description="Everyone you email, with their college and stage. People are added automatically when you email them or they write in."
                actions={<ContactDialog />}
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <InputGroup className="w-full sm:w-72">
                    <InputGroupAddon>
                        <Search aria-hidden />
                    </InputGroupAddon>
                    <InputGroupInput
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, email, phone"
                        aria-label="Search contacts"
                    />
                </InputGroup>
                <Select
                    value={stage ?? ALL}
                    onValueChange={(v) => {
                        setStage(v === ALL ? undefined : (v as ContactStage));
                        setPage(1);
                    }}
                    items={[
                        { value: ALL, label: "All stages" },
                        ...STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
                    ]}
                >
                    <SelectTrigger className="min-w-40" aria-label="Filter by stage">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>All stages</SelectItem>
                        {STAGES.map((s) => (
                            <SelectItem key={s} value={s}>
                                <StageDot stage={s} />
                                {STAGE_LABELS[s]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <OwnerSelect
                    value={ownerId}
                    allowAll
                    onChange={(id) => {
                        setOwnerId(id);
                        setPage(1);
                    }}
                />
                {contacts.data && (
                    <span className="ml-auto text-sm text-muted-foreground">
                        {contacts.data.total} contact{contacts.data.total === 1 ? "" : "s"}
                    </span>
                )}
            </div>

            {contacts.isError ? (
                <ErrorState message={errorMessage(contacts.error)} onRetry={() => void contacts.refetch()} />
            ) : contacts.isPending ? (
                <Skeleton className="h-80 rounded-xl" />
            ) : contacts.data.items.length === 0 ? (
                <EmptyState
                    icon={UsersRound}
                    title={q || stage || ownerId ? "No matching contacts" : "No contacts yet"}
                    description={
                        q || stage || ownerId
                            ? "Try a different search or filter."
                            : "Send an email with Compose, or add someone by hand."
                    }
                />
            ) : (
                <>
                    <Card className="py-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-4">Contact</TableHead>
                                    <TableHead className="hidden md:table-cell">College</TableHead>
                                    <TableHead>Stage</TableHead>
                                    <TableHead className="hidden lg:table-cell">Owner</TableHead>
                                    <TableHead className="hidden pr-4 text-right sm:table-cell">Last email</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contacts.data.items.map((c) => {
                                    const last = [c.lastContactedAt, c.lastRepliedAt].filter(Boolean).sort().at(-1);
                                    return (
                                        <TableRow key={c.id} className="relative">
                                            <TableCell className="pl-4">
                                                <Link
                                                    href={`/contacts/${c.id}`}
                                                    className="after:absolute after:inset-0"
                                                >
                                                    <div className="font-medium">{c.name || c.email}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {c.name ? c.email : ""}
                                                        {c.role !== "other" && ` · ${CONTACT_ROLE_LABELS[c.role]}`}
                                                    </div>
                                                </Link>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                {c.organization?.name ?? (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    <StageBadge stage={c.stage} />
                                                    {c.status !== "active" && (
                                                        <Badge variant="destructive">
                                                            {CONTACT_STATUS_LABELS[c.status]}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden text-sm lg:table-cell">
                                                {(c.ownerId && teamNames.get(c.ownerId)) ?? (
                                                    <span className="text-muted-foreground">Unassigned</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="hidden pr-4 text-right text-sm text-muted-foreground sm:table-cell">
                                                {last ? listTime(last) : "—"}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Card>
                    {pages > 1 && (
                        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
                            <span className="text-muted-foreground">
                                Page {page} of {pages}
                            </span>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() => setPage((p) => p - 1)}
                                disabled={page <= 1}
                                aria-label="Previous page"
                            >
                                <ChevronLeft aria-hidden />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() => setPage((p) => p + 1)}
                                disabled={page >= pages}
                                aria-label="Next page"
                            >
                                <ChevronRight aria-hidden />
                            </Button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
