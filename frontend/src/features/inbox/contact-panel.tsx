"use client";

import { Building2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useUpdateContact } from "@/hooks/use-contacts";
import { errorMessage, type Contact } from "@/lib/api";
import { CONTACT_ROLE_LABELS, CONTACT_STATUS_LABELS } from "@/lib/labels";
import { StageSelect } from "../contacts/pickers";

// Who this conversation is with, and their stage, next to the messages.
export function ContactPanel({ contacts }: { contacts: Contact[] }) {
    const update = useUpdateContact();
    if (contacts.length === 0) return null;

    return (
        <aside
            aria-label="Contacts in this conversation"
            className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l p-4 xl:block"
        >
            {contacts.map((c) => (
                <section key={c.id} className="space-y-2">
                    <div>
                        <Link
                            href={`/contacts/${c.id}`}
                            className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                        >
                            {c.name || c.email}
                            <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                        {(c.designation || c.role !== "other") && (
                            <div className="text-xs text-muted-foreground">
                                {c.designation || CONTACT_ROLE_LABELS[c.role]}
                            </div>
                        )}
                    </div>
                    {c.organization && (
                        <Link
                            href={`/organizations/${c.organization.id}`}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                            <Building2 className="size-3.5" aria-hidden />
                            {c.organization.name}
                        </Link>
                    )}
                    <StageSelect
                        size="sm"
                        value={c.stage}
                        disabled={update.isPending}
                        onChange={(stage, lostReason) =>
                            update.mutate(
                                { id: c.id, stage, lostReason },
                                {
                                    onSuccess: () => toast.success("Stage updated"),
                                    onError: (e) => toast.error(errorMessage(e)),
                                },
                            )
                        }
                    />
                    {c.status !== "active" && <Badge variant="destructive">{CONTACT_STATUS_LABELS[c.status]}</Badge>}
                </section>
            ))}
        </aside>
    );
}
