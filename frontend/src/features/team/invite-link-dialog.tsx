"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import type { Invitation } from "@/lib/api";
import { fullDate } from "@/lib/time";

export function InviteLinkDialog({ invitation, onClose }: { invitation: Invitation | null; onClose: () => void }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        if (!invitation) return;
        try {
            await navigator.clipboard.writeText(invitation.inviteUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Couldn't copy. Select the link and copy it manually.");
        }
    };

    return (
        <Dialog open={invitation !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Invite link for {invitation?.user.name}</DialogTitle>
                    <DialogDescription>
                        Send this link to {invitation?.user.email}. It works once and expires on{" "}
                        {invitation ? fullDate(invitation.expiresAt) : ""}. You won’t see it again, but you can always
                        resend a new one.
                    </DialogDescription>
                </DialogHeader>
                <InputGroup>
                    <InputGroupInput
                        readOnly
                        value={invitation?.inviteUrl ?? ""}
                        aria-label="Invite link"
                        onFocus={(e) => e.currentTarget.select()}
                    />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton onClick={() => void copy()} aria-label="Copy link">
                            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                            {copied ? "Copied" : "Copy"}
                        </InputGroupButton>
                    </InputGroupAddon>
                </InputGroup>
                <p className="text-xs text-muted-foreground">
                    Share it by WhatsApp, chat or your own email. The link only works for the address above.
                </p>
                <DialogFooter>
                    <DialogClose render={<Button />}>Done</DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
