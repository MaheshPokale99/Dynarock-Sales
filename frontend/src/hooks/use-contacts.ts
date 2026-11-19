"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ContactInput, type ContactStage, type OrganizationInput } from "@/lib/api";

export const contactKeys = {
    all: ["contacts"] as const,
    list: (p: object) => ["contacts", "list", p] as const,
    detail: (id: string) => ["contacts", "detail", id] as const,
    pipeline: (p: object) => ["contacts", "pipeline", p] as const,
    orgs: ["organizations"] as const,
    orgList: (p: object) => ["organizations", "list", p] as const,
    org: (id: string) => ["organizations", "detail", id] as const,
};

export const useContacts = (p: { q?: string; stage?: ContactStage; ownerId?: string; page: number }) =>
    useQuery({ queryKey: contactKeys.list(p), queryFn: () => api.contacts.list(p), placeholderData: keepPreviousData });

export const useContact = (id: string) =>
    useQuery({ queryKey: contactKeys.detail(id), queryFn: () => api.contacts.get(id) });

export const usePipeline = (p: { q?: string; ownerId?: string }) =>
    useQuery({ queryKey: contactKeys.pipeline(p), queryFn: () => api.pipeline(p), placeholderData: keepPreviousData });

// Contacts, colleges and threads all show each other's data, so refresh them together.
function useRefresh() {
    const qc = useQueryClient();
    return () => {
        void qc.invalidateQueries({ queryKey: contactKeys.all });
        void qc.invalidateQueries({ queryKey: contactKeys.orgs });
        void qc.invalidateQueries({ queryKey: ["threads"] });
    };
}

export function useCreateContact() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: (body: ContactInput & { email: string }) => api.contacts.create(body),
        onSuccess: refresh,
    });
}

export function useUpdateContact() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: ({ id, ...body }: ContactInput & { id: string }) => api.contacts.update(id, body),
        onSuccess: refresh,
    });
}

export const useOrganizations = (p: { q?: string } = {}) =>
    useQuery({
        queryKey: contactKeys.orgList(p),
        queryFn: () => api.organizations.list(p),
        placeholderData: keepPreviousData,
    });

export const useOrganization = (id: string) =>
    useQuery({ queryKey: contactKeys.org(id), queryFn: () => api.organizations.get(id) });

export function useCreateOrganization() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: (body: OrganizationInput & { name: string }) => api.organizations.create(body),
        onSuccess: refresh,
    });
}

export function useUpdateOrganization() {
    const refresh = useRefresh();
    return useMutation({
        mutationFn: ({ id, ...body }: OrganizationInput & { id: string }) => api.organizations.update(id, body),
        onSuccess: refresh,
    });
}
