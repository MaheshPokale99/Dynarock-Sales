import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { ApprovalsPage } from "@/features/approvals/approvals-page";

export const metadata: Metadata = { title: "Approvals" };

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ApprovalsPage />
        </Suspense>
    );
}
