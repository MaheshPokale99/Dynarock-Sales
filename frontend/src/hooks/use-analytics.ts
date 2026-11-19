"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const useDashboard = (days: 7 | 30 | 90) =>
    useQuery({
        queryKey: ["analytics", "dashboard", days],
        queryFn: () => api.analytics.dashboard(days),
        placeholderData: keepPreviousData,
        refetchInterval: 5 * 60_000,
    });
