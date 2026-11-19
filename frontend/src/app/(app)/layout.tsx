import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
    return (
        <Suspense
            fallback={
                <main className="mx-auto max-w-7xl p-6">
                    <PageSkeleton />
                </main>
            }
        >
            <AppShell>{children}</AppShell>
        </Suspense>
    );
}
