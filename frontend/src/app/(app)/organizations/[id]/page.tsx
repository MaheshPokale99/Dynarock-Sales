import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { OrganizationDetailPage } from "@/features/organizations/organization-detail-page";

export const metadata: Metadata = { title: "College" };
export const instant = false;

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <OrganizationDetailPage />
        </Suspense>
    );
}
