"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type User } from "@/lib/api";

export const meKey = ["me"] as const;

// Signed-in user, or null when signed out.
export function useMe() {
    return useQuery({
        queryKey: meKey,
        queryFn: async (): Promise<User | null> => {
            try {
                return await api.auth.me();
            } catch (e) {
                if (e instanceof ApiError && e.status === 401) return null;
                throw e;
            }
        },
        staleTime: 5 * 60_000,
        retry: false,
    });
}

export function useLogin() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ email, password }: { email: string; password: string }) => api.auth.login(email, password),
        onSuccess: (user) => qc.setQueryData(meKey, user),
    });
}

export function useAcceptInvite() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ token, password }: { token: string; password: string }) =>
            api.auth.acceptInvite(token, password),
        onSuccess: (user) => qc.setQueryData(meKey, user),
    });
}

export function useLogout() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: api.auth.logout,
        onSettled: () => {
            qc.clear();
            qc.setQueryData(meKey, null);
        },
    });
}

export function useUpdateProfile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: api.auth.updateProfile,
        onSuccess: (user) => {
            qc.setQueryData(meKey, user);
            void qc.invalidateQueries({ queryKey: ["team"] });
        },
    });
}

export const useChangePassword = () =>
    useMutation({
        mutationFn: ({ current, next }: { current: string; next: string }) => api.auth.changePassword(current, next),
    });
