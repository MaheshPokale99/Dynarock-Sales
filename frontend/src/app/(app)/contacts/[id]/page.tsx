import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { ContactDetailPage } from "@/features/contacts/contact-detail-page";

export const metadata: Metadata = { title: "Contact" };
export const instant = false;

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ContactDetailPage />
        </Suspense>
    );
}
