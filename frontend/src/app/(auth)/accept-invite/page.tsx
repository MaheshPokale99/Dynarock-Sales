import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptInvitePage } from "@/features/auth/accept-invite-page";

export const metadata: Metadata = { title: "Join the team" };

export default function Page() {
    return (
        <Suspense>
            <AcceptInvitePage />
        </Suspense>
    );
}
