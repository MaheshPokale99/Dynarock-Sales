"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useTemplates } from "@/hooks/use-templates";
import { api, errorMessage } from "@/lib/api";
import { TEMPLATE_CATEGORY_LABELS } from "@/lib/labels";

// Inserts a saved template, filled in for the first recipient.
export function TemplatePicker({
    to,
    onPick,
}: {
    to: string[];
    onPick: (t: { subject: string; html: string }) => void;
}) {
    const { data: templates } = useTemplates();
    const [busy, setBusy] = useState(false);
    const categories = [...new Set((templates ?? []).map((t) => t.category))];

    const pick = async (id: string) => {
        setBusy(true);
        try {
            onPick(await api.templates.render(id, to));
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label="Insert a template" />
                }
            >
                {busy ? <Spinner data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
                <span className="max-sm:hidden">Templates</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="max-h-80 min-w-60 overflow-y-auto">
                {(templates ?? []).length === 0 && <DropdownMenuItem disabled>No templates yet</DropdownMenuItem>}
                {categories.map((cat, i) => (
                    <DropdownMenuGroup key={cat}>
                        {i > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel>{TEMPLATE_CATEGORY_LABELS[cat]}</DropdownMenuLabel>
                        {(templates ?? [])
                            .filter((t) => t.category === cat)
                            .map((t) => (
                                <DropdownMenuItem key={t.id} onClick={() => void pick(t.id)}>
                                    {t.name}
                                </DropdownMenuItem>
                            ))}
                    </DropdownMenuGroup>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/templates" />}>Manage templates</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
