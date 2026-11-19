import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { InboxPage } from "@/features/inbox/inbox-page";

export const metadata: Metadata = { title: "Inbox" };
// The inbox loads its data in the browser after sign-in, so Next's dev-time instant check can't render it.
export const instant = false;

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <InboxPage />
        </Suspense>
    );
}
