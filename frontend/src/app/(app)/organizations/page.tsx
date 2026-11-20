import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { OrganizationsPage } from "@/features/organizations/organizations-page";

export const metadata: Metadata = { title: "Colleges" };
export const instant = false;

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <OrganizationsPage />
        </Suspense>
    );
}
