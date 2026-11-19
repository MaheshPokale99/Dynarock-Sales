"use client";

import { MailWarning } from "lucide-react";
import Link from "next/link";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/use-auth";
import { useMailbox } from "@/hooks/use-mail";

// Explains why mail can't be sent or fetched, and how to fix it.
export function MailboxBanner() {
    const { data: mailbox } = useMailbox();
    const { data: me } = useMe();
    if (!mailbox || mailbox.status === "connected") return null;

    const isAdmin = me?.role === "admin";
    const title =
        mailbox.status === "error"
            ? "The mailbox needs attention"
            : mailbox.status === "not_configured"
              ? "Gmail isn't set up on the server yet"
              : `${mailbox.address} isn't connected`;
    const description =
        mailbox.status === "error"
            ? mailbox.lastError
            : mailbox.status === "not_configured"
              ? "The server needs Google OAuth credentials before the mailbox can be connected."
              : isAdmin
                ? "Connect it so the team can send and receive email here."
                : "Ask an admin to connect it in Settings.";

    return (
        <Alert variant={mailbox.status === "error" ? "destructive" : "default"} className="m-3 w-auto">
            <MailWarning aria-hidden />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>{description}</AlertDescription>
            {isAdmin && mailbox.status !== "not_configured" && (
                <AlertAction>
                    <Button size="sm" variant="outline" render={<Link href="/settings" />}>
                        Open settings
                    </Button>
                </AlertAction>
            )}
        </Alert>
    );
}
