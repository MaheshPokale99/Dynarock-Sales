"use client";

import { Download, FileText, Sparkles } from "lucide-react";
import { IntentBadge } from "@/components/common/intent-badge";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { api, type Message } from "@/lib/api";
import { displayName, fileSize, fullTime, listTime } from "@/lib/mail-format";
import { cn } from "@/lib/utils";
import { EmailBody } from "./email-body";

function SenderBadge({ message, teamNames }: { message: Message; teamNames: Map<string, string> }) {
    if (message.isAutoReply) return <Badge variant="outline">Auto-reply</Badge>;
    if (message.direction === "inbound") return null;
    if (message.sentByUserId) {
        return <Badge variant="secondary">Sent by {teamNames.get(message.sentByUserId) ?? "a team member"}</Badge>;
    }
    return <Badge variant="outline">Sent from Gmail</Badge>;
}

const recipientLine = (m: Message) => {
    const list = [...m.to, ...m.cc].map(displayName);
    return list.length > 3 ? `${list.slice(0, 3).join(", ")} +${list.length - 3}` : list.join(", ");
};

export function MessageCard({
    message,
    expanded,
    onToggle,
    teamNames,
}: {
    message: Message;
    expanded: boolean;
    onToggle: () => void;
    teamNames: Map<string, string>;
}) {
    const fromName =
        message.direction === "outbound" && message.sentByUserId
            ? (teamNames.get(message.sentByUserId) ?? displayName(message.from))
            : displayName(message.from);

    return (
        <article className={cn("rounded-xl border bg-card", !expanded && "hover:bg-muted/40")}>
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-start gap-3 p-3 text-left sm:p-4"
                aria-expanded={expanded}
            >
                <UserAvatar name={fromName} className="size-9" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-medium">{fromName}</span>
                        {expanded && (
                            <span className="truncate text-xs text-muted-foreground">&lt;{message.from.email}&gt;</span>
                        )}
                        <SenderBadge message={message} teamNames={teamNames} />
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                        {expanded ? `to ${recipientLine(message)}` : message.snippet}
                    </p>
                </div>
                <time
                    dateTime={message.sentAt}
                    title={fullTime(message.sentAt)}
                    className="shrink-0 text-xs text-muted-foreground"
                >
                    {expanded ? fullTime(message.sentAt) : listTime(message.sentAt)}
                </time>
            </button>

            {expanded && (
                <div className="space-y-3 px-3 pb-3 sm:px-4 sm:pb-4">
                    {message.cc.length > 0 && (
                        <p className="text-xs text-muted-foreground">cc {message.cc.map((a) => a.email).join(", ")}</p>
                    )}
                    {message.bcc.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            bcc {message.bcc.map((a) => a.email).join(", ")}
                        </p>
                    )}
                    {message.classification && message.direction === "inbound" && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <Sparkles className="size-3.5" aria-hidden />
                            <IntentBadge intent={message.classification.intent} />
                            <span>{message.classification.summary}</span>
                        </div>
                    )}
                    <EmailBody html={message.html} />
                    {message.attachments.length > 0 && (
                        <ul className="flex flex-wrap gap-2" aria-label="Attachments">
                            {message.attachments.map((a) => (
                                <li key={a.index}>
                                    <a
                                        href={api.emails.attachmentUrl(message.id, a.index)}
                                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                                        download
                                    >
                                        <FileText className="size-4 text-muted-foreground" aria-hidden />
                                        <span className="max-w-48 truncate">{a.filename}</span>
                                        <span className="text-xs text-muted-foreground">{fileSize(a.size)}</span>
                                        <Download className="size-3.5 text-muted-foreground" aria-hidden />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </article>
    );
}
