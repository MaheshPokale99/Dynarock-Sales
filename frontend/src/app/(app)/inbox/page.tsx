import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { InboxPage } from "@/features/inbox/inbox-page";

export const metadata: Metadata = { title: "Inbox" };

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <InboxPage />
        </Suspense>
    );
}
