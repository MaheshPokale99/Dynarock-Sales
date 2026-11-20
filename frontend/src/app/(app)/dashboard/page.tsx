import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { DashboardPage } from "@/features/dashboard/dashboard-page";

export const metadata: Metadata = { title: "Dashboard" };
export const instant = false;

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <DashboardPage />
        </Suspense>
    );
}
