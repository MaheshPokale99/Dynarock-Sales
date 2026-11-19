import { ArrowRight, Inbox, Pencil, Send, UserPlus } from "lucide-react";
import Link from "next/link";
import { StageBadge } from "@/components/common/stage-badge";
import type { Activity, ContactStage } from "@/lib/api";
import { fullTime, listTime } from "@/lib/mail-format";

function describe(a: Activity, who: string) {
    const m = a.meta;
    switch (a.action) {
        case "contact.created":
            return {
                icon: UserPlus,
                text:
                    m.source === "manual"
                        ? `${who} added this contact`
                        : `Added automatically from ${m.source === "inbound" ? "their email" : "an email we sent"}`,
            };
        case "contact.stage_changed":
            return {
                icon: ArrowRight,
                text: (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                        {m.automatic ? "Moved automatically" : `${who} moved`}{" "}
                        <StageBadge stage={m.from as ContactStage} /> → <StageBadge stage={m.to as ContactStage} />
                        {typeof m.reason === "string" && m.reason && (
                            <span className="text-muted-foreground">“{m.reason}”</span>
                        )}
                    </span>
                ),
            };
        case "contact.updated":
            return {
                icon: Pencil,
                text: `${who} updated ${(m.fields as string[] | undefined)?.join(", ") ?? "details"}`,
            };
        case "email.sent":
            return { icon: Send, text: `${who} sent an email` };
        case "email.received":
            return { icon: Inbox, text: "They replied" };
        default:
            return { icon: Pencil, text: a.action };
    }
}

export function Timeline({ activities, teamNames }: { activities: Activity[]; teamNames: Map<string, string> }) {
    if (activities.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
    return (
        <ol className="relative space-y-4 border-l pl-6">
            {activities.map((a) => {
                const who = a.actor.userId ? (teamNames.get(a.actor.userId) ?? "Someone") : "System";
                const { icon: Icon, text } = describe(a, who);
                return (
                    <li key={a.id} className="relative">
                        <span className="absolute top-0.5 -left-[33px] flex size-6 items-center justify-center rounded-full border bg-background">
                            <Icon className="size-3 text-muted-foreground" aria-hidden />
                        </span>
                        <div className="text-sm">{text}</div>
                        <div className="text-xs text-muted-foreground">
                            <time dateTime={a.createdAt} title={fullTime(a.createdAt)}>
                                {listTime(a.createdAt)}
                            </time>
                            {a.threadId && (
                                <>
                                    {" · "}
                                    <Link href={`/inbox?f=all&t=${a.threadId}`} className="hover:underline">
                                        open conversation
                                    </Link>
                                </>
                            )}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
