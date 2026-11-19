import { env } from "@/config/env";

export const API_BASE = `${env.API_URL}/api/v1`;

export interface FieldIssue {
    path: string;
    message: string;
}

interface ErrorBody {
    error?: { code?: string; message?: string; details?: unknown };
    requestId?: string;
}

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public code = "unknown_error",
        public reasons: string[] = [],
        public fields: FieldIssue[] = [],
    ) {
        super(message);
        this.name = "ApiError";
    }

    fieldError(path: string) {
        return this.fields.find((f) => f.path === path)?.message;
    }
}

export function toApiError(status: number, body: ErrorBody | null): ApiError {
    const err = body?.error;
    const details = err?.details as { reasons?: unknown } | unknown[] | undefined;
    const reasons = !Array.isArray(details) && Array.isArray(details?.reasons) ? (details.reasons as string[]) : [];
    const fields = Array.isArray(details) ? (details as FieldIssue[]) : [];
    return new ApiError(err?.message ?? `Request failed (${status})`, status, err?.code, reasons, fields);
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            ...init,
            credentials: "include",
            headers: { "Content-Type": "application/json", ...init?.headers },
        });
    } catch {
        throw new ApiError("Cannot reach the server. Check your connection and try again.", 0, "network_error");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw toApiError(res.status, data as ErrorBody | null);
    return data as T;
}

const withBody =
    (method: string) =>
    <T>(path: string, body?: unknown) =>
        request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const post = withBody("POST");
export const patch = withBody("PATCH");

export const errorMessage = (e: unknown, fallback = "Something went wrong") =>
    e instanceof ApiError && e.reasons.length > 0
        ? `${e.message} ${e.reasons.join(" ")}`
        : e instanceof Error
          ? e.message
          : fallback;
