import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { FollowUpsPage } from "@/features/followups/followups-page";

export const metadata: Metadata = { title: "Follow-ups" };

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <FollowUpsPage />
        </Suspense>
    );
}
