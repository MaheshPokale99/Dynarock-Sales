"use client";

import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type InfiniteData,
    type Query,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, type SendInput, type ThreadDetail, type ThreadFolder, type ThreadPage } from "@/lib/api";

const POLL_MS = 30_000;

export const mailKeys = {
    mailbox: ["mailbox"] as const,
    threads: ["threads"] as const,
    list: (folder: ThreadFolder, q: string, sentBy: string) => ["threads", "list", folder, q, sentBy] as const,
    counts: ["threads", "counts"] as const,
    thread: (id: string) => ["threads", "detail", id] as const,
    drafts: ["drafts"] as const,
};

export const useMailbox = () =>
    useQuery({ queryKey: mailKeys.mailbox, queryFn: api.mailbox.status, staleTime: 30_000 });

export function useThreads(folder: ThreadFolder, q: string, sentBy: string) {
    return useInfiniteQuery({
        queryKey: mailKeys.list(folder, q, sentBy),
        queryFn: ({ pageParam }) =>
            api.threads.list({ folder, q: q || undefined, sentBy: sentBy || undefined, before: pageParam }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => last.nextBefore ?? undefined,
    });
}

export const useThreadCounts = () =>
    useQuery({
        queryKey: mailKeys.counts,
        queryFn: api.threads.counts,
        refetchInterval: POLL_MS,
        refetchOnWindowFocus: true,
    });

export const useThread = (id: string | null) =>
    useQuery({ queryKey: mailKeys.thread(id ?? ""), queryFn: () => api.threads.get(id!), enabled: Boolean(id) });

const isBehind = (q: Query, seen: string | null | undefined, latest: string) =>
    q.state.data !== undefined && (!seen || seen < latest);
const keepInFlight = { cancelRefetch: false };

export function useMailChanges() {
    const qc = useQueryClient();
    const { data } = useThreadCounts();
    const version = data?.version ?? null;
    const previous = useRef(version);

    useEffect(() => {
        if (!version) return;
        const changed = previous.current !== null && previous.current !== version;
        previous.current = version;
        void qc.invalidateQueries(
            {
                queryKey: ["threads", "list"],
                predicate: (q: Query) =>
                    isBehind(
                        q,
                        (q.state.data as InfiniteData<ThreadPage> | undefined)?.pages[0]?.counts.version,
                        version,
                    ),
            },
            keepInFlight,
        );
        void qc.invalidateQueries(
            {
                queryKey: ["threads", "detail"],
                predicate: (q: Query) => isBehind(q, (q.state.data as ThreadDetail | undefined)?.version, version),
            },
            keepInFlight,
        );
        if (changed) {
            void qc.invalidateQueries({ queryKey: ["ai", "suggestions"] }, keepInFlight);
            void qc.invalidateQueries({ queryKey: ["automation", "thread"] }, keepInFlight);
        }
    }, [qc, version]);
}

export function useUpdateThread() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...body }: { id: string; unread?: boolean; closed?: boolean }) =>
            api.threads.update(id, body),
        onSuccess: (thread) => {
            qc.setQueryData<ThreadDetail>(mailKeys.thread(thread.id), (old) =>
                old ? { ...old, thread, version: thread.updatedAt } : old,
            );
            void qc.invalidateQueries({ queryKey: ["threads", "list"] });
            void qc.invalidateQueries({ queryKey: mailKeys.counts });
        },
    });
}

export function useSendEmail() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: SendInput) => api.emails.send(input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: mailKeys.threads });
            void qc.invalidateQueries({ queryKey: mailKeys.drafts });
        },
    });
}

export function useSyncNow() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: api.mailbox.sync,
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: mailKeys.counts });
            void qc.invalidateQueries({ queryKey: mailKeys.mailbox });
        },
    });
}

export const useDrafts = () => useQuery({ queryKey: mailKeys.drafts, queryFn: api.drafts.list });

export function useDeleteDraft() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.drafts.remove(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: mailKeys.drafts }),
    });
}
