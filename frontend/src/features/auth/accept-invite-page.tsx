"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/common/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { HOME_PATH } from "@/config/navigation";
import { useAcceptInvite } from "@/hooks/use-auth";
import { api, errorMessage } from "@/lib/api";
import { AuthLayout } from "./auth-layout";

const MIN_PASSWORD = 8;

export function AcceptInvitePage() {
    const router = useRouter();
    const token = useSearchParams().get("token") ?? "";
    const invite = useQuery({
        queryKey: ["invite", token],
        queryFn: () => api.auth.inviteDetails(token),
        enabled: token.length > 0,
        retry: false,
    });
    const accept = useAcceptInvite();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [touched, setTouched] = useState(false);

    const tooShort = password.length < MIN_PASSWORD;
    const mismatch = confirm !== password;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (tooShort || mismatch) return;
        accept.mutate({ token, password }, { onSuccess: () => router.replace(HOME_PATH) });
    };

    if (!token || invite.isError) {
        return (
            <AuthLayout title="Invitation not valid">
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {invite.isError
                            ? errorMessage(invite.error)
                            : "This link is missing its code. Open the full link from your invitation."}
                    </p>
                    <Button variant="outline" className="w-full" render={<Link href="/login" />}>
                        Go to sign in
                    </Button>
                </div>
            </AuthLayout>
        );
    }

    if (invite.isPending) {
        return (
            <AuthLayout title="Join Dynarock Sales">
                <div className="space-y-3" role="status" aria-label="Loading invitation">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title={`Welcome, ${invite.data.name.split(" ")[0]}`}
            description={
                <>
                    Choose a password for <span className="font-medium text-foreground">{invite.data.email}</span>.
                </>
            }
        >
            <form onSubmit={submit} noValidate>
                <FieldGroup>
                    {accept.isError && (
                        <Alert variant="destructive">
                            <AlertDescription>{errorMessage(accept.error)}</AlertDescription>
                        </Alert>
                    )}
                    <Field data-invalid={touched && tooShort}>
                        <FieldLabel htmlFor="password">Password</FieldLabel>
                        <PasswordInput
                            id="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            aria-invalid={touched && tooShort}
                            autoFocus
                        />
                        <FieldDescription>At least {MIN_PASSWORD} characters.</FieldDescription>
                    </Field>
                    <Field data-invalid={touched && mismatch}>
                        <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
                        <PasswordInput
                            id="confirm"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            aria-invalid={touched && mismatch}
                        />
                        {touched && mismatch && <FieldError>Passwords don’t match.</FieldError>}
                    </Field>
                    <Button type="submit" size="lg" disabled={accept.isPending}>
                        {accept.isPending && <Spinner data-icon="inline-start" />}
                        Join the team
                    </Button>
                </FieldGroup>
            </form>
        </AuthLayout>
    );
}
