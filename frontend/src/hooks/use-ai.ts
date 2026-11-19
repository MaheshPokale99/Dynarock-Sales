"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type KnowledgeInput, type SuggestionStatus } from "@/lib/api";

export const aiKeys = {
    status: ["ai", "status"] as const,
    suggestions: ["ai", "suggestions"] as const,
    list: (p: object) => ["ai", "suggestions", "list", p] as const,
    counts: ["ai", "suggestions", "counts"] as const,
    knowledge: ["knowledge"] as const,
};

export const useAiStatus = () => useQuery({ queryKey: aiKeys.status, queryFn: api.ai.status, staleTime: 5 * 60_000 });

export const useSuggestions = (p: { status?: SuggestionStatus; threadId?: string }) =>
    useQuery({ queryKey: aiKeys.list(p), queryFn: () => api.ai.suggestions(p), refetchInterval: 30_000 });

export const useSuggestionCounts = () =>
    useQuery({ queryKey: aiKeys.counts, queryFn: api.ai.counts, refetchInterval: 30_000 });

// Suggestions change threads and contacts too, so refresh them together.
function useRefresh() {
    const qc = useQueryClient();
    return () => {
        void qc.invalidateQueries({ queryKey: aiKeys.suggestions });
        void qc.invalidateQueries({ queryKey: ["threads"] });
        void qc.invalidateQueries({ queryKey: ["contacts"] });
    };
}

export function useSendSuggestion() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: ({
            id,
            ...body
        }: {
            id: string;
            to: string[];
            cc: string[];
            bcc: string[];
            subject: string;
            html: string;
        }) => api.ai.send(id, body),
        onSuccess: refresh,
    });
}

export function useRejectSuggestion() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => api.ai.reject(id, reason),
        onSuccess: refresh,
    });
}

export function useSuggestReply() {
    const refresh = useRefresh();
    return useMutation({ mutationFn: (threadId: string) => api.ai.suggestReply(threadId), onSuccess: refresh });
}

export const useKnowledge = () => useQuery({ queryKey: aiKeys.knowledge, queryFn: api.knowledge.list });

export function useSaveKnowledge() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...body }: KnowledgeInput & { id?: string }) =>
            id ? api.knowledge.update(id, body) : api.knowledge.create(body),
        onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.knowledge }),
    });
}

export function useDeleteKnowledge() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.knowledge.remove(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.knowledge }),
    });
}
