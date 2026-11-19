"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type TemplateInput } from "@/lib/api";

const key = ["templates"] as const;

export const useTemplates = () => useQuery({ queryKey: key, queryFn: api.templates.list });

export function useSaveTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...body }: TemplateInput & { id?: string }) =>
            id ? api.templates.update(id, body) : api.templates.create(body),
        onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    });
}

export function useDeleteTemplate() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.templates.remove(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    });
}
