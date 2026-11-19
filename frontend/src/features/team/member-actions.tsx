"use client";

import { MoreHorizontal, Send, ShieldCheck, UserCheck, UserRound, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResendInvite, useUpdateMember } from "@/hooks/use-team";
import { errorMessage, type Invitation, type TeamMember } from "@/lib/api";

export function MemberActions({
    member,
    isSelf,
    onInvite,
}: {
    member: TeamMember;
    isSelf: boolean;
    onInvite: (invitation: Invitation) => void;
}) {
    const update = useUpdateMember();
    const resend = useResendInvite();
    const [confirmDisable, setConfirmDisable] = useState(false);

    const run = (body: Parameters<typeof update.mutate>[0], done: string) =>
        update.mutate(body, {
            onSuccess: () => toast.success(done),
            onError: (e) => toast.error(errorMessage(e)),
        });

    const makeRole = member.role === "admin" ? "sales_rep" : "admin";

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`} />}
                >
                    <MoreHorizontal aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                    {member.status === "invited" && (
                        <DropdownMenuItem
                            onClick={() =>
                                resend.mutate(member.id, {
                                    onSuccess: onInvite,
                                    onError: (e) => toast.error(errorMessage(e)),
                                })
                            }
                        >
                            <Send aria-hidden />
                            Resend invite
                        </DropdownMenuItem>
                    )}
                    {!isSelf && member.status !== "disabled" && (
                        <DropdownMenuItem
                            onClick={() =>
                                run(
                                    { id: member.id, role: makeRole },
                                    `${member.name} is now ${makeRole === "admin" ? "an admin" : "a sales rep"}`,
                                )
                            }
                        >
                            {makeRole === "admin" ? <ShieldCheck aria-hidden /> : <UserRound aria-hidden />}
                            {makeRole === "admin" ? "Make admin" : "Make sales rep"}
                        </DropdownMenuItem>
                    )}
                    {!isSelf && member.status === "disabled" && (
                        <DropdownMenuItem
                            onClick={() => run({ id: member.id, status: "active" }, `${member.name} enabled`)}
                        >
                            <UserCheck aria-hidden />
                            Enable account
                        </DropdownMenuItem>
                    )}
                    {!isSelf && member.status !== "disabled" && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDisable(true)}>
                                <UserX aria-hidden />
                                {member.status === "invited" ? "Cancel invite" : "Disable account"}
                            </DropdownMenuItem>
                        </>
                    )}
                    {isSelf && <DropdownMenuItem disabled>This is you</DropdownMenuItem>}
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {member.status === "invited" ? "Cancel this invite?" : `Disable ${member.name}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {member.status === "invited"
                                ? "The invite link stops working. You can enable them later and send a new one."
                                : "They’re signed out everywhere and can’t sign in. Their emails and history stay. You can enable them again any time."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => {
                                setConfirmDisable(false);
                                run({ id: member.id, status: "disabled" }, `${member.name} disabled`);
                            }}
                        >
                            {member.status === "invited" ? "Cancel invite" : "Disable"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
