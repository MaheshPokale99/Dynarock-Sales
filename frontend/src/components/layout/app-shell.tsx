"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorState, PageSkeleton } from "@/components/common/page-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ComposeProvider } from "@/features/compose/compose-provider";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { navItemFor } from "@/config/navigation";
import { useMe } from "@/hooks/use-auth";
import { errorMessage } from "@/lib/api";

export function AppShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { data: me, isPending, isError, error, refetch } = useMe();

    useEffect(() => {
        if (!isPending && !isError && !me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }, [me, isPending, isError, pathname, router]);

    if (isError) {
        return (
            <main className="mx-auto max-w-lg p-6">
                <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
            </main>
        );
    }
    if (!me) {
        return (
            <main className="mx-auto max-w-7xl p-6">
                <PageSkeleton />
            </main>
        );
    }

    const section = navItemFor(pathname);
    // The inbox fills the screen edge to edge.
    const fullBleed = pathname.startsWith("/inbox");

    return (
        <ComposeProvider>
            <SidebarProvider>
                <a
                    href="#main-content"
                    className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
                >
                    Skip to content
                </a>
                <AppSidebar user={me} />
                <SidebarInset>
                    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
                        <SidebarTrigger className="-ml-1" />
                        <Separator
                            orientation="vertical"
                            className="mr-1 data-vertical:h-4 data-vertical:self-center"
                        />
                        <h2 className="truncate text-sm font-medium">{section?.label ?? "Dynarock Sales"}</h2>
                    </header>
                    <div
                        id="main-content"
                        tabIndex={-1}
                        className={
                            fullBleed
                                ? "min-w-0 flex-1 outline-none"
                                : "mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none md:px-6 md:py-8 lg:px-8"
                        }
                    >
                        {section?.adminOnly && me.role !== "admin" ? (
                            <ErrorState title="Admins only" message="Ask an admin if you need access to this page." />
                        ) : (
                            children
                        )}
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </ComposeProvider>
    );
}
