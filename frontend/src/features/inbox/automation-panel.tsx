"use client";

import { CalendarClock, Pause, Play, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
    useAutomationSettings,
    useEnroll,
    useEnrollmentAction,
    useSequences,
    useThreadAutomation,
} from "@/hooks/use-automation";
import { errorMessage, type ThreadAutomation } from "@/lib/api";
import { ScheduledItem } from "../followups/scheduled-item";

const STOPPED: Record<NonNullable<NonNullable<ThreadAutomation["enrollment"]>["stopReason"]>, string> = {
    replied: "the client replied",
    unsubscribed: "the contact can’t be emailed",
    bounced: "the email bounced",
    manual: "a team member stopped them",
    failed: "sending kept failing",
};

function StartFollowUps({ threadId }: { threadId: string }) {
    const { data: plans } = useSequences();
    const { data: settings } = useAutomationSettings();
    const active = (plans ?? []).filter((p) => p.active);
    const [picked, setPicked] = useState<string | null>(null);
    const enroll = useEnroll();
    const planId = picked ?? settings?.defaultSequenceId ?? active[0]?.id ?? null;
    if (active.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3 text-sm">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">No reply yet? Follow up automatically:</span>
            <Select
                value={planId ?? ""}
                onValueChange={(v) => setPicked(v as string)}
                items={active.map((p) => ({ value: p.id, label: p.name }))}
            >
                <SelectTrigger size="sm" className="min-w-44" aria-label="Follow-up plan">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {active.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                            {p.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button
                size="sm"
                disabled={!planId || enroll.isPending}
                onClick={() =>
                    planId &&
                    enroll.mutate(
                        { threadId, sequenceId: planId },
                        {
                            onSuccess: () => toast.success("Follow-ups scheduled"),
                            onError: (e) => toast.error(errorMessage(e)),
                        },
                    )
                }
            >
                {enroll.isPending && <Spinner data-icon="inline-start" />}
                Start follow-ups
            </Button>
        </div>
    );
}

// Follow-ups for one conversation: the plan, what's scheduled, and controls.
export function AutomationPanel({ threadId, canStart }: { threadId: string; canStart: boolean }) {
    const { data } = useThreadAutomation(threadId);
    const action = useEnrollmentAction();
    if (!data) return null;
    const { enrollment, scheduled } = data;
    const running = enrollment && (enrollment.status === "active" || enrollment.status === "paused");

    const run = (a: "stop" | "pause" | "resume", done: string) =>
        enrollment &&
        action.mutate(
            { id: enrollment.id, action: a },
            { onSuccess: () => toast.success(done), onError: (e) => toast.error(errorMessage(e)) },
        );

    return (
        <section aria-label="Follow-ups" className="space-y-3">
            {running && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                    <span className="font-medium">{enrollment.sequence?.name ?? "Follow-ups"}</span>
                    <Badge variant="outline">
                        {enrollment.currentStep} of {enrollment.totalSteps} sent
                    </Badge>
                    {enrollment.status === "paused" && <Badge variant="secondary">Paused</Badge>}
                    <div className="ml-auto flex gap-1">
                        {enrollment.status === "active" ? (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => run("pause", "Follow-ups paused")}
                                disabled={action.isPending}
                            >
                                <Pause data-icon="inline-start" />
                                Pause
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => run("resume", "Follow-ups resumed")}
                                disabled={action.isPending}
                            >
                                <Play data-icon="inline-start" />
                                Resume
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => run("stop", "Follow-ups stopped")}
                            disabled={action.isPending}
                        >
                            <Square data-icon="inline-start" />
                            Stop
                        </Button>
                    </div>
                </div>
            )}
            {scheduled.map((s) => (
                <ScheduledItem key={s.id} item={s} showThread={false} />
            ))}
            {!running && enrollment?.status === "stopped" && enrollment.stopReason && (
                <p className="text-xs text-muted-foreground">
                    Follow-ups stopped because {STOPPED[enrollment.stopReason]}.
                </p>
            )}
            {!running && enrollment?.status === "completed" && (
                <p className="text-xs text-muted-foreground">All follow-ups in the plan were sent.</p>
            )}
            {!running && canStart && <StartFollowUps threadId={threadId} />}
        </section>
    );
}
