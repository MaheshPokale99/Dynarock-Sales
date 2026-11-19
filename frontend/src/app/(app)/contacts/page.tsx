import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { ContactsPage } from "@/features/contacts/contacts-page";

export const metadata: Metadata = { title: "Contacts" };

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ContactsPage />
        </Suspense>
    );
}
