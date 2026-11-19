import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/common/page-header";
import { PipelinePage } from "@/features/pipeline/pipeline-page";

export const metadata: Metadata = { title: "Pipeline" };

export default function Page() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <PipelinePage />
        </Suspense>
    );
}
