"use client";

import { Users } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMe } from "@/hooks/use-auth";
import { useTeam } from "@/hooks/use-team";
import { errorMessage, type Invitation, type TeamMember } from "@/lib/api";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/labels";
import { fullDate, timeAgo } from "@/lib/time";
import { InviteDialog } from "./invite-dialog";
import { InviteLinkDialog } from "./invite-link-dialog";
import { MemberActions } from "./member-actions";

function StatusBadge({ member }: { member: TeamMember }) {
    if (member.status === "invited") {
        return member.invite?.expired ? (
            <Badge variant="destructive">Invite expired</Badge>
        ) : (
            <Badge variant="outline">Invited</Badge>
        );
    }
    return (
        <Badge
            variant={member.status === "active" ? "secondary" : "outline"}
            className={member.status === "disabled" ? "text-muted-foreground" : undefined}
        >
            {STATUS_LABELS[member.status]}
        </Badge>
    );
}

function lastSeen(member: TeamMember) {
    if (member.status === "invited" && member.invite) {
        return member.invite.expired ? "Link expired" : `Link valid until ${fullDate(member.invite.expiresAt)}`;
    }
    return member.lastLoginAt ? timeAgo(member.lastLoginAt) : "Never";
}

export function TeamPage() {
    const { data: me } = useMe();
    const team = useTeam();
    const [invitation, setInvitation] = useState<Invitation | null>(null);

    const active = team.data?.filter((m) => m.status === "active").length ?? 0;

    return (
        <>
            <PageHeader
                title="Team"
                description="Everyone here can see every client and conversation. Admins also manage the team, mailbox and automation."
                actions={<InviteDialog onInvited={setInvitation} />}
            />

            {team.isError ? (
                <ErrorState message={errorMessage(team.error)} onRetry={() => void team.refetch()} />
            ) : team.isPending ? (
                <Skeleton className="h-64 rounded-xl" />
            ) : team.data.length <= 1 ? (
                <div className="space-y-4">
                    <MembersTable members={team.data} meId={me?.id} onInvite={setInvitation} />
                    <EmptyState
                        icon={Users}
                        title="Invite your sales team"
                        description="Add each salesperson so their emails and results are tracked under their name."
                    />
                </div>
            ) : (
                <>
                    <p className="mb-3 text-sm text-muted-foreground">
                        {active} active of {team.data.length} members
                    </p>
                    <MembersTable members={team.data} meId={me?.id} onInvite={setInvitation} />
                </>
            )}

            <InviteLinkDialog invitation={invitation} onClose={() => setInvitation(null)} />
        </>
    );
}

function MembersTable({
    members,
    meId,
    onInvite,
}: {
    members: TeamMember[];
    meId: string | undefined;
    onInvite: (invitation: Invitation) => void;
}) {
    return (
        <Card className="py-0">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="pl-4">Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
                        <TableHead className="w-12 pr-4">
                            <span className="sr-only">Actions</span>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {members.map((member) => (
                        <TableRow key={member.id} className={member.status === "disabled" ? "opacity-60" : undefined}>
                            <TableCell className="pl-4">
                                <div className="flex items-center gap-3">
                                    <UserAvatar name={member.name} className="size-8" />
                                    <div className="min-w-0">
                                        <div className="truncate font-medium">
                                            {member.name}
                                            {member.id === meId && (
                                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                                    (you)
                                                </span>
                                            )}
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant={member.role === "admin" ? "default" : "outline"}>
                                    {ROLE_LABELS[member.role]}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <StatusBadge member={member} />
                            </TableCell>
                            <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                                {lastSeen(member)}
                            </TableCell>
                            <TableCell className="pr-4 text-right">
                                <MemberActions member={member} isSelf={member.id === meId} onInvite={onInvite} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    );
}
