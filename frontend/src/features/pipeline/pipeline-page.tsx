"use client";

import { Building2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorState, PageHeader } from "@/components/common/page-header";
import { StageDot } from "@/components/common/stage-badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipeline, useUpdateContact } from "@/hooks/use-contacts";
import { useTeam } from "@/hooks/use-team";
import { errorMessage, type Contact, type ContactStage } from "@/lib/api";
import { STAGE_LABELS } from "@/lib/labels";
import { listTime } from "@/lib/mail-format";
import { cn } from "@/lib/utils";
import { LostReasonDialog, OwnerSelect } from "../contacts/pickers";

function Card({ contact, owner, onDragStart }: { contact: Contact; owner?: string; onDragStart: () => void }) {
    const last = [contact.lastContactedAt, contact.lastRepliedAt].filter(Boolean).sort().at(-1);
    return (
        <li
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", contact.id);
                e.dataTransfer.effectAllowed = "move";
                onDragStart();
            }}
            className="cursor-grab rounded-lg border bg-card p-3 shadow-xs active:cursor-grabbing"
        >
            <Link
                href={`/contacts/${contact.id}`}
                className="block text-sm font-medium hover:underline"
                draggable={false}
            >
                {contact.name || contact.email}
            </Link>
            {contact.organization && (
                <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Building2 className="size-3 shrink-0" aria-hidden />
                    {contact.organization.name}
                </div>
            )}
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">{owner ?? "Unassigned"}</span>
                {last && <span>{listTime(last)}</span>}
            </div>
        </li>
    );
}

export function PipelinePage() {
    const [search, setSearch] = useState("");
    const [q, setQ] = useState("");
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [dragging, setDragging] = useState<Contact | null>(null);
    const [over, setOver] = useState<ContactStage | null>(null);
    const [pendingLost, setPendingLost] = useState<Contact | null>(null);
    const pipeline = usePipeline({ q: q || undefined, ownerId: ownerId ?? undefined });
    const update = useUpdateContact();
    const { data: team } = useTeam();
    const teamNames = new Map((team ?? []).map((m) => [m.id, m.name]));

    useEffect(() => {
        const t = setTimeout(() => setQ(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    const move = (contact: Contact, stage: ContactStage, lostReason?: string) =>
        update.mutate(
            { id: contact.id, stage, lostReason },
            {
                onSuccess: () => toast.success(`${contact.name || contact.email} → ${STAGE_LABELS[stage]}`),
                onError: (e) => toast.error(errorMessage(e)),
            },
        );

    const drop = (stage: ContactStage) => {
        setOver(null);
        const contact = dragging;
        setDragging(null);
        if (!contact || contact.stage === stage) return;
        if (stage === "lost") setPendingLost(contact);
        else move(contact, stage);
    };

    return (
        <>
            <PageHeader
                title="Pipeline"
                description="Every contact by stage. Drag a card to move it. Contacted and Replied update automatically from email."
                actions={
                    <div className="flex flex-wrap gap-2">
                        <InputGroup className="w-56">
                            <InputGroupAddon>
                                <Search aria-hidden />
                            </InputGroupAddon>
                            <InputGroupInput
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Filter"
                                aria-label="Filter pipeline"
                            />
                        </InputGroup>
                        <OwnerSelect value={ownerId} onChange={setOwnerId} allowAll />
                    </div>
                }
            />

            {pipeline.isError ? (
                <ErrorState message={errorMessage(pipeline.error)} onRetry={() => void pipeline.refetch()} />
            ) : (
                <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
                    <div className="flex min-w-max gap-3">
                        {(pipeline.data?.stages ?? []).map(({ stage, total, contacts }) => (
                            <section
                                key={stage}
                                aria-label={STAGE_LABELS[stage]}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setOver(stage);
                                }}
                                onDragLeave={() => setOver((s) => (s === stage ? null : s))}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    drop(stage);
                                }}
                                className={cn(
                                    "flex w-64 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
                                    over === stage && dragging && dragging.stage !== stage && "border-primary bg-muted",
                                )}
                            >
                                <header className="flex items-center gap-2 px-3 py-2.5">
                                    <StageDot stage={stage} />
                                    <h2 className="text-sm font-medium">{STAGE_LABELS[stage]}</h2>
                                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{total}</span>
                                </header>
                                <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                                    {contacts.map((c) => (
                                        <Card
                                            key={c.id}
                                            contact={c}
                                            owner={c.ownerId ? teamNames.get(c.ownerId) : undefined}
                                            onDragStart={() => setDragging(c)}
                                        />
                                    ))}
                                    {total > contacts.length && (
                                        <li className="px-1 text-center text-xs text-muted-foreground">
                                            +{total - contacts.length} more ·{" "}
                                            <Link href="/contacts" className="hover:underline">
                                                see all
                                            </Link>
                                        </li>
                                    )}
                                </ul>
                            </section>
                        ))}
                        {pipeline.isPending &&
                            Array.from({ length: 6 }, (_, i) => (
                                <Skeleton key={i} className="h-96 w-64 shrink-0 rounded-xl" />
                            ))}
                    </div>
                </div>
            )}

            <LostReasonDialog
                open={pendingLost !== null}
                onCancel={() => setPendingLost(null)}
                onConfirm={(reason) => {
                    if (pendingLost) move(pendingLost, "lost", reason);
                    setPendingLost(null);
                }}
            />
        </>
    );
}
