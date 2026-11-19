"use client";

import { usePathname } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/common/page-header";
import { navItemFor } from "@/config/navigation";

// Placeholder for sections built in later phases.
export function ComingSoon() {
    const item = navItemFor(usePathname());
    if (!item) return null;
    return (
        <>
            <PageHeader title={item.label} description={item.soon} />
            <EmptyState
                icon={item.icon}
                title="Coming soon"
                description="This part of Dynarock Sales is being built next."
            />
        </>
    );
}
