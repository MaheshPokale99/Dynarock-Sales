import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { TemplatesPage } from "@/features/templates/templates-page";

export const metadata: Metadata = { title: "Templates" };
export const instant = false;

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <TemplatesPage />
        </Suspense>
    );
}
