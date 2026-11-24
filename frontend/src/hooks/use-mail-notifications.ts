"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, type ThreadPage } from "@/lib/api";
import { mailNotificationsEnabled, resumeMailAudio, sendMailNotification } from "@/lib/mail-notifications";
import { toast } from "sonner";

const POLL_MS = 30_000;
const STORAGE_PREFIX = "dynarock.mailNotifications.cursor.";
type Cursor = { lastInboundAt: string; messageCount?: number; bounceNotified: boolean };

function readCursor(userId: string): Map<string, Cursor> | null {
    try {
        const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
        if (!saved) return null;
        return new Map(Object.entries(JSON.parse(saved) as Record<string, Cursor>));
    } catch {
        return null;
    }
}

function saveCursor(userId: string, cursor: Map<string, Cursor>) {
    const recent = [...cursor.entries()].slice(-200);
    try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(Object.fromEntries(recent)));
    } catch {
        // Notifications still work for the current session when storage is unavailable.
    }
}

export function useMailNotifications(userId: string) {
    const { data } = useQuery({
        queryKey: ["mail-notifications", userId],
        queryFn: () => api.threads.list({ folder: "all" }),
        refetchInterval: POLL_MS,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true,
    });
    const cursor = useRef<Map<string, Cursor> | null>(null);
    const firstFetch = useRef(true);

    useEffect(() => {
        if (!data) return;
        const next = new Map(cursor.current ?? readCursor(userId) ?? []);
        const initial = firstFetch.current;
        firstFetch.current = false;

        for (const thread of data.threads) {
            if (!thread.lastInboundAt) continue;
            const old = next.get(thread.id);
            const changed = Boolean(
                old &&
                (old.lastInboundAt !== thread.lastInboundAt ||
                    (thread.lastMessageDirection === "inbound" &&
                        old.messageCount !== undefined &&
                        thread.messageCount > old.messageCount)),
            );
            const firstSeenAfterSetup = !initial && !old && Date.parse(thread.lastInboundAt) >= Date.now() - POLL_MS;
            const bounced = thread.latestIntent === "bounce";

            if (changed || firstSeenAfterSetup) {
                const sender = thread.participants[0]?.name || thread.participants[0]?.email || "A contact";
                const title = bounced ? "Email bounced" : "New email";
                const body = bounced ? thread.subject : `${sender} · ${thread.subject}`;
                if (mailNotificationsEnabled()) {
                    sendMailNotification({ title, body, threadId: thread.id });
                    toast.info(title, { description: body });
                }
                next.set(thread.id, {
                    lastInboundAt: thread.lastInboundAt,
                    messageCount: thread.messageCount,
                    bounceNotified: bounced,
                });
            } else if (bounced && old && !old.bounceNotified) {
                if (mailNotificationsEnabled()) {
                    sendMailNotification({ title: "Email bounced", body: thread.subject, threadId: thread.id });
                    toast.warning("Email bounced", { description: thread.subject });
                }
                next.set(thread.id, {
                    lastInboundAt: thread.lastInboundAt,
                    messageCount: thread.messageCount,
                    bounceNotified: true,
                });
            } else if (!old || old.lastInboundAt !== thread.lastInboundAt) {
                next.set(thread.id, {
                    lastInboundAt: thread.lastInboundAt,
                    messageCount: thread.messageCount,
                    bounceNotified: bounced,
                });
            } else if (old.messageCount !== thread.messageCount) {
                next.set(thread.id, { ...old, messageCount: thread.messageCount });
            }
        }

        cursor.current = next;
        saveCursor(userId, next);
    }, [data, userId]);

    // Resume audio after the first interaction when alerts were enabled in an earlier session.
    useEffect(() => {
        const resume = () => {
            if (!mailNotificationsEnabled()) return;
            void resumeMailAudio();
            window.removeEventListener("pointerdown", resume);
        };
        window.addEventListener("pointerdown", resume, { once: true });
        return () => window.removeEventListener("pointerdown", resume);
    }, []);

    return data as ThreadPage | undefined;
}
