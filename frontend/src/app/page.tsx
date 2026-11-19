"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { HOME_PATH } from "@/config/navigation";
import { useMe } from "@/hooks/use-auth";

export default function Page() {
    const router = useRouter();
    const { data: me, isPending, isError } = useMe();

    useEffect(() => {
        if (isPending) return;
        router.replace(me ? HOME_PATH : "/login");
    }, [me, isPending, router]);

    return (
        <main className="flex min-h-svh items-center justify-center" role="status" aria-label="Loading">
            {isError ? <p className="text-sm text-muted-foreground">Cannot reach the server.</p> : <Spinner />}
        </main>
    );
}
