"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { EmailBody } from "@/features/inbox/email-body";

// Shows the email in the Dynarock layout, exactly as the server will send it.
export function EmailPreview({ html, disabled }: { html: string; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState("");

    const load = async () => {
        setPreview(null);
        setError("");
        try {
            setPreview((await api.emails.preview(html)).html);
        } catch (e) {
            setError(errorMessage(e));
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) void load();
            }}
        >
            <DialogTrigger render={<Button type="button" variant="ghost" size="sm" disabled={disabled} />}>
                <Eye data-icon="inline-start" />
                Preview
            </DialogTrigger>
            <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Preview</DialogTitle>
                    <DialogDescription>
                        How the email looks to the recipient. Put [[BOOK_DEMO]] on its own line to add a &ldquo;Book a
                        demo&rdquo; button.
                    </DialogDescription>
                </DialogHeader>
                {error ? (
                    <p className="text-sm text-destructive">{error}</p>
                ) : preview === null ? (
                    <div className="flex justify-center py-10">
                        <Spinner />
                    </div>
                ) : (
                    <EmailBody html={preview} />
                )}
            </DialogContent>
        </Dialog>
    );
}
