"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Mail, RefreshCw, Volume2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/common/password-input";
import { PageHeader } from "@/components/common/page-header";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useChangePassword, useMe, useUpdateProfile } from "@/hooks/use-auth";
import { mailKeys, useMailbox, useSyncNow } from "@/hooks/use-mail";
import {
    disableMailNotifications,
    enableMailNotifications,
    mailNotificationsEnabled,
    playMailSound,
    subscribeMailNotifications,
} from "@/lib/mail-notifications";
import { api, ApiError, errorMessage, type User } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/labels";
import { htmlToText, textToHtml } from "@/lib/signature";
import { fullDate, timeAgo } from "@/lib/time";

const CONNECT_ERRORS: Record<string, string> = {
    access_denied: "Google access wasn't granted. Try again and allow access.",
    google_error: "Google couldn't complete the sign-in. Try again in a moment.",
    expired: "The connect link expired. Start again from this page.",
    not_admin: "Only an admin can connect the mailbox.",
    wrong_account: "Sign in to Google with the shared sales mailbox, not a personal account.",
};

export function SettingsPage() {
    const { data: me } = useMe();
    if (!me) return null;
    return (
        <>
            <PageHeader title="Settings" description="Your profile, email signature and password." />
            <div className="grid max-w-3xl gap-6">
                <ProfileCard user={me} />
                <PasswordCard />
                <MailNotificationsCard />
                {me.role === "admin" && <MailboxCard />}
            </div>
        </>
    );
}

function ProfileCard({ user }: { user: User }) {
    const [name, setName] = useState(user.name);
    const [signature, setSignature] = useState(htmlToText(user.signatureHtml));
    const update = useUpdateProfile();
    const dirty = name.trim() !== user.name || signature !== htmlToText(user.signatureHtml);

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        update.mutate(
            { name: name.trim(), signatureHtml: textToHtml(signature) },
            { onSuccess: () => toast.success("Profile saved"), onError: (err) => toast.error(errorMessage(err)) },
        );
    };

    return (
        <Card>
            <form onSubmit={save} className="contents">
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>
                        {user.email} · {ROLE_LABELS[user.role]}
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="name">Name</FieldLabel>
                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                            <FieldDescription>Shown to the team and used in the emails you send.</FieldDescription>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="signature">Email signature</FieldLabel>
                            <Textarea
                                id="signature"
                                rows={4}
                                value={signature}
                                onChange={(e) => setSignature(e.target.value)}
                                placeholder={`${user.name}\nSales, Dynarock\n+91 98765 43210`}
                            />
                            <FieldDescription>Added to the end of every email you send from the app.</FieldDescription>
                        </Field>
                    </FieldGroup>
                </CardContent>
                <CardFooter className="justify-end pt-6">
                    <Button type="submit" disabled={!dirty || !name.trim() || update.isPending}>
                        {update.isPending && <Spinner data-icon="inline-start" />}
                        Save
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

function PasswordCard() {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const change = useChangePassword();
    const currentError = change.error instanceof ApiError ? change.error.fieldError("currentPassword") : undefined;

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        change.mutate(
            { current, next },
            {
                onSuccess: () => {
                    setCurrent("");
                    setNext("");
                    toast.success("Password changed. Other devices were signed out.");
                },
                onError: (err) => {
                    if (!(err instanceof ApiError && err.fieldError("currentPassword"))) toast.error(errorMessage(err));
                },
            },
        );
    };

    return (
        <Card>
            <form onSubmit={save} className="contents">
                <CardHeader>
                    <CardTitle>Password</CardTitle>
                    <CardDescription>Changing it signs you out on every other device.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <FieldGroup className="sm:grid sm:grid-cols-2">
                        <Field data-invalid={Boolean(currentError)}>
                            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                            <PasswordInput
                                id="current-password"
                                autoComplete="current-password"
                                value={current}
                                onChange={(e) => setCurrent(e.target.value)}
                                aria-invalid={Boolean(currentError)}
                            />
                            {currentError && <FieldError>{currentError}</FieldError>}
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="new-password">New password</FieldLabel>
                            <PasswordInput
                                id="new-password"
                                autoComplete="new-password"
                                value={next}
                                onChange={(e) => setNext(e.target.value)}
                            />
                            <FieldDescription>At least 8 characters.</FieldDescription>
                        </Field>
                    </FieldGroup>
                </CardContent>
                <CardFooter className="justify-end pt-6">
                    <Button type="submit" disabled={!current || next.length < 8 || change.isPending}>
                        {change.isPending && <Spinner data-icon="inline-start" />}
                        Change password
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

function MailNotificationsCard() {
    const enabled = useSyncExternalStore(subscribeMailNotifications, mailNotificationsEnabled, () => false);

    const toggle = async () => {
        if (enabled) {
            disableMailNotifications();
            toast.success("Mail alerts turned off");
            return;
        }
        const result = await enableMailNotifications();
        toast.success(result === "denied" ? "Sound enabled; desktop notifications are blocked" : "Mail alerts enabled");
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Mail notifications</CardTitle>
                <CardDescription>
                    Play a sound and show a desktop alert when new mail or a bounce arrives.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 text-sm text-muted-foreground">
                {enabled
                    ? "Desktop alert sounds follow your operating system settings. In the Electron app, closing the window keeps mail alerts active in the system tray; choose Quit there to stop them."
                    : "Enable alerts here, then allow browser notifications when asked."}
            </CardContent>
            <CardFooter className="justify-end gap-2 pt-6">
                {enabled && (
                    <Button variant="outline" onClick={playMailSound}>
                        <Volume2 data-icon="inline-start" />
                        Test sound
                    </Button>
                )}
                <Button variant={enabled ? "secondary" : "default"} onClick={() => void toggle()}>
                    {enabled ? <BellOff data-icon="inline-start" /> : <Bell data-icon="inline-start" />}
                    {enabled ? "Turn off alerts" : "Enable alerts"}
                </Button>
            </CardFooter>
        </Card>
    );
}

function MailboxCard() {
    const params = useSearchParams();
    const router = useRouter();
    const { data: mailbox, isPending } = useMailbox();
    const qc = useQueryClient();
    const sync = useSyncNow();
    const [connecting, setConnecting] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const disconnect = useMutation({
        mutationFn: api.mailbox.disconnect,
        onSuccess: (status) => {
            qc.setQueryData(mailKeys.mailbox, status);
            toast.success("Mailbox disconnected");
        },
        onError: (e) => toast.error(errorMessage(e)),
    });

    // Google sends the browser back here with ?mailbox=connected or ?mailbox=error&reason=...
    useEffect(() => {
        const result = params.get("mailbox");
        if (!result) return;
        if (result === "connected") toast.success("Mailbox connected. New mail will appear in the Inbox.");
        else toast.error(CONNECT_ERRORS[params.get("reason") ?? ""] ?? "Connecting the mailbox failed. Try again.");
        void qc.invalidateQueries({ queryKey: mailKeys.mailbox });
        router.replace("/settings", { scroll: false });
    }, [params, qc, router]);

    const connect = async () => {
        setConnecting(true);
        try {
            window.location.href = await api.mailbox.connectUrl();
        } catch (e) {
            toast.error(errorMessage(e));
            setConnecting(false);
        }
    };

    const status = mailbox?.status;
    const badge =
        status === "connected" ? (
            <Badge variant="secondary">Connected</Badge>
        ) : status === "error" ? (
            <Badge variant="destructive">Needs attention</Badge>
        ) : (
            <Badge variant="outline">Not connected</Badge>
        );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">Mailbox {!isPending && badge}</CardTitle>
                <CardDescription>
                    The shared Google Workspace address the team sends from: {mailbox?.address ?? "sales@dynarock.in"}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-6 text-sm">
                {status === "not_configured" && (
                    <p className="text-muted-foreground">
                        The server has no Google OAuth credentials yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
                        ENCRYPTION_KEY in backend/.env, then restart the API.
                    </p>
                )}
                {status === "connected" && (
                    <p className="text-muted-foreground">
                        Connected{mailbox?.connectedBy ? ` by ${mailbox.connectedBy}` : ""}
                        {mailbox?.connectedAt ? ` on ${fullDate(mailbox.connectedAt)}` : ""}. Last checked for new mail{" "}
                        {mailbox?.lastSyncAt ? timeAgo(mailbox.lastSyncAt) : "not yet"}.
                    </p>
                )}
                {status === "error" && <p className="text-destructive">{mailbox?.lastError}</p>}
                {status === "disconnected" && (
                    <p className="text-muted-foreground">
                        Sign in with the {mailbox?.address} Google account. Other accounts are refused.
                    </p>
                )}
            </CardContent>
            <CardFooter className="justify-end gap-2 pt-6">
                {status === "connected" && (
                    <>
                        <Button
                            variant="ghost"
                            onClick={() => sync.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}
                            disabled={sync.isPending}
                        >
                            <RefreshCw
                                data-icon="inline-start"
                                className={sync.isPending ? "animate-spin" : undefined}
                            />
                            Check now
                        </Button>
                        <Button variant="outline" onClick={() => setConfirm(true)}>
                            Disconnect
                        </Button>
                    </>
                )}
                {(status === "disconnected" || status === "error") && (
                    <Button onClick={() => void connect()} disabled={connecting}>
                        {connecting ? <Spinner data-icon="inline-start" /> : <Mail data-icon="inline-start" />}
                        {status === "error" ? "Reconnect Gmail" : "Connect Gmail"}
                    </Button>
                )}
            </CardFooter>
            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Disconnect {mailbox?.address}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Nobody can send or receive email in the app until it is connected again. Existing
                            conversations stay.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep connected</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                setConfirm(false);
                                disconnect.mutate();
                            }}
                        >
                            Disconnect
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
