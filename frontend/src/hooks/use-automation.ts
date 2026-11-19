"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AutomationSettings, type ScheduledStatus, type SequenceInput } from "@/lib/api";

export const automationKeys = {
    all: ["automation"] as const,
    settings: ["automation", "settings"] as const,
    sequences: ["automation", "sequences"] as const,
    thread: (id: string) => ["automation", "thread", id] as const,
    scheduled: (p: object) => ["automation", "scheduled", p] as const,
    counts: ["automation", "counts"] as const,
};

export const useAutomationSettings = () =>
    useQuery({ queryKey: automationKeys.settings, queryFn: api.automation.settings });

export const useSequences = () => useQuery({ queryKey: automationKeys.sequences, queryFn: api.automation.sequences });

export const useThreadAutomation = (threadId: string) =>
    useQuery({
        queryKey: automationKeys.thread(threadId),
        queryFn: () => api.automation.forThread(threadId),
        refetchInterval: 60_000,
    });

export const useScheduled = (p: { status?: ScheduledStatus; kind?: "follow_up" | "send_later" }) =>
    useQuery({
        queryKey: automationKeys.scheduled(p),
        queryFn: () => api.automation.scheduled(p),
        refetchInterval: 60_000,
    });

export const useScheduledCounts = () =>
    useQuery({ queryKey: automationKeys.counts, queryFn: api.automation.counts, refetchInterval: 60_000 });

// Follow-up changes also change threads (states, new messages).
function useRefresh() {
    const qc = useQueryClient();
    return () => {
        void qc.invalidateQueries({ queryKey: automationKeys.all });
        void qc.invalidateQueries({ queryKey: ["threads"] });
    };
}

const useAutomationMutation = <A, R>(fn: (args: A) => Promise<R>) => {
    const refresh = useRefresh();
    return useMutation({ mutationFn: fn, onSuccess: refresh });
};

export const useEnroll = () =>
    useAutomationMutation(({ threadId, sequenceId }: { threadId: string; sequenceId: string }) =>
        api.automation.enroll(threadId, sequenceId),
    );

export const useEnrollmentAction = () =>
    useAutomationMutation(({ id, action }: { id: string; action: "stop" | "pause" | "resume" }) =>
        api.automation.enrollment(id, action),
    );

export const useEditScheduled = () =>
    useAutomationMutation(
        ({ id, ...body }: { id: string; subject?: string; html?: string; to?: string[]; sendAt?: string }) =>
            api.automation.edit(id, body),
    );

export const useCancelScheduled = () => useAutomationMutation((id: string) => api.automation.cancel(id));

export const useSendScheduledNow = () => useAutomationMutation((id: string) => api.automation.sendNow(id));

export const useApproveScheduled = () => useAutomationMutation((id: string) => api.automation.approve(id));

export const useRegenerateScheduled = () => useAutomationMutation((id: string) => api.automation.regenerate(id));

export const useUpdateAutomationSettings = () =>
    useAutomationMutation((body: Partial<AutomationSettings>) => api.automation.updateSettings(body));

export const useSaveSequence = () =>
    useAutomationMutation(({ id, ...body }: SequenceInput & { id?: string }) =>
        id ? api.automation.updateSequence(id, body) : api.automation.createSequence(body),
    );

export const useDeleteSequence = () => useAutomationMutation((id: string) => api.automation.deleteSequence(id));
