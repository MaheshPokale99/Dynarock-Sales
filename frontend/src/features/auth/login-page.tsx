"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { HOME_PATH } from "@/config/navigation";
import { useLogin, useMe } from "@/hooks/use-auth";
import { errorMessage } from "@/lib/api";
import { AuthLayout } from "./auth-layout";

// Only allow redirects inside the app.
const safeNext = (next: string | null) => (next?.startsWith("/") && !next.startsWith("//") ? next : HOME_PATH);

export function LoginPage() {
    const router = useRouter();
    const next = safeNext(useSearchParams().get("next"));
    const { data: me } = useMe();
    const login = useLogin();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {
        if (me) router.replace(next);
    }, [me, next, router]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        login.mutate({ email, password }, { onSuccess: () => router.replace(next) });
    };

    return (
        <AuthLayout title="Sign in" description="Use the email your admin invited.">
            <form onSubmit={submit} noValidate>
                <FieldGroup>
                    {login.isError && (
                        <Alert variant="destructive">
                            <AlertDescription>{errorMessage(login.error)}</AlertDescription>
                        </Alert>
                    )}
                    <Field>
                        <FieldLabel htmlFor="email">Email</FieldLabel>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@dynarock.in"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoFocus
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="password">Password</FieldLabel>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </Field>
                    <Button type="submit" size="lg" disabled={login.isPending || !email || !password}>
                        {login.isPending && <Spinner data-icon="inline-start" />}
                        Sign in
                    </Button>
                </FieldGroup>
            </form>
        </AuthLayout>
    );
}
