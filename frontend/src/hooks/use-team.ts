"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type UserRole } from "@/lib/api";

const teamKey = ["team"] as const;

export const useTeam = () => useQuery({ queryKey: teamKey, queryFn: api.users.list });

function useTeamMutation<A, R>(fn: (args: A) => Promise<R>) {
    const qc = useQueryClient();
    return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: teamKey }) });
}

export const useInvite = () => useTeamMutation(api.users.invite);

export const useResendInvite = () => useTeamMutation((id: string) => api.users.resendInvite(id));

export const useUpdateMember = () =>
    useTeamMutation(({ id, ...body }: { id: string; name?: string; role?: UserRole; status?: "active" | "disabled" }) =>
        api.users.update(id, body),
    );
