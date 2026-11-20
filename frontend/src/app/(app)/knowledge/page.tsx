import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { KnowledgePage } from "@/features/knowledge/knowledge-page";

export const metadata: Metadata = { title: "Knowledge" };
export const instant = false;

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <KnowledgePage />
        </Suspense>
    );
}
