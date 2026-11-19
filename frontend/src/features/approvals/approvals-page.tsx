"use client";

import { CheckCircle2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page-header";
import { IntentBadge } from "@/components/common/intent-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAiStatus, useSuggestionCounts, useSuggestions } from "@/hooks/use-ai";
import { useTeam } from "@/hooks/use-team";
import { errorMessage, type SuggestionStatus } from "@/lib/api";
import { displayName, listTime } from "@/lib/mail-format";
import { SuggestionCard } from "./suggestion-card";

function History({ status }: { status: Extract<SuggestionStatus, "sent" | "rejected"> }) {
    const list = useSuggestions({ status });
    const { data: team } = useTeam();
    const names = new Map((team ?? []).map((m) => [m.id, m.name]));

    if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />;
    if (list.isPending) return <Skeleton className="h-40 rounded-xl" />;
    if (list.data.length === 0) {
        return <EmptyState icon={Sparkles} title={status === "sent" ? "Nothing sent yet" : "Nothing rejected"} />;
    }
    return (
        <ul className="divide-y rounded-xl border">
            {list.data.map((s) => (
                <li key={s.id}>
                    <Link
                        href={`/inbox?f=all&t=${s.threadId}`}
                        className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-muted/60"
                    >
                        <span className="text-sm font-medium">
                            {s.forMessage ? displayName(s.forMessage.from) : "Client"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                            {s.thread?.subject}
                        </span>
                        {s.intent && <IntentBadge intent={s.intent} />}
                        {status === "sent" && s.editedBeforeSend && <Badge variant="secondary">Edited</Badge>}
                        {status === "rejected" && s.rejectionReason && (
                            <span className="text-xs text-muted-foreground">“{s.rejectionReason}”</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                            {s.reviewedBy ? `${names.get(s.reviewedBy) ?? "Someone"} · ` : ""}
                            {s.reviewedAt ? listTime(s.reviewedAt) : ""}
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}

export function ApprovalsPage() {
    const [tab, setTab] = useState("pending");
    const pending = useSuggestions({ status: "pending" });
    const counts = useSuggestionCounts();
    const { data: ai } = useAiStatus();

    return (
        <>
            <PageHeader
                title="Approvals"
                description="When a client replies, the AI drafts an answer. Nothing is sent until someone here edits and approves it."
            />
            {ai && !ai.enabled && (
                <Alert className="mb-4">
                    <Sparkles aria-hidden />
                    <AlertTitle>AI is off</AlertTitle>
                    <AlertDescription>
                        Add GEMINI_API_KEY to backend/.env and restart the API to get suggested replies.
                    </AlertDescription>
                </Alert>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
                <TabsList>
                    <TabsTrigger value="pending">
                        Waiting{(counts.data?.pending ?? 0) > 0 ? ` (${counts.data?.pending})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="sent">Sent</TabsTrigger>
                    <TabsTrigger value="rejected">Rejected</TabsTrigger>
                </TabsList>
                <TabsContent value="pending" className="space-y-4 pt-4">
                    {pending.isError ? (
                        <ErrorState message={errorMessage(pending.error)} onRetry={() => void pending.refetch()} />
                    ) : pending.isPending ? (
                        <Skeleton className="h-80 rounded-xl" />
                    ) : pending.data.length === 0 ? (
                        <EmptyState
                            icon={CheckCircle2}
                            title="Nothing to approve"
                            description="New AI reply drafts show up here as clients write back."
                        />
                    ) : (
                        pending.data.map((s) => <SuggestionCard key={s.id} suggestion={s} />)
                    )}
                </TabsContent>
                <TabsContent value="sent" className="pt-4">
                    <History status="sent" />
                </TabsContent>
                <TabsContent value="rejected" className="pt-4">
                    <History status="rejected" />
                </TabsContent>
            </Tabs>
        </>
    );
}
