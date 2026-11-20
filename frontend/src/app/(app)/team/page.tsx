import type { Metadata } from "next";
import { TeamPage } from "@/features/team/team-page";

export const metadata: Metadata = { title: "Team" };
export const instant = false;

export default function Page() {
    return <TeamPage />;
}
