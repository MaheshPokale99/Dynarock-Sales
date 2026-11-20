import "dotenv/config";
import { z } from "zod";

const flag = z.enum(["true", "false"]);

const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    LOG_FILE: z.string().min(1).optional(),
    PORT: z.coerce.number().int().positive().default(5000),
    FRONTEND_ORIGIN: z.string().min(1).default("http://localhost:3000"),

    MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/dynarock_sales"),

    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
    INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),
    COOKIE_SECURE: flag.optional(),
    BOOTSTRAP_ADMIN_NAME: z.string().min(1).default("Admin"),
    BOOTSTRAP_ADMIN_EMAIL: z.email().optional(),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().min(8, "must be at least 8 characters").optional(),

    API_PUBLIC_URL: z.url().optional(),
    MAILBOX_ADDRESS: z.email().default("sales@dynarock.in"),
    GOOGLE_CLIENT_ID: z.string().default(""),
    GOOGLE_CLIENT_SECRET: z.string().default(""),
    GOOGLE_REDIRECT_URI: z.url().optional(),
    ENCRYPTION_KEY: z
        .string()
        .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64 encoded")
        .optional(),
    GMAIL_SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(15).default(60),

    GEMINI_API_KEY: z.string().default(""),
    GEMINI_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),

    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
    AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    TRUST_PROXY: flag.default("false"),

    USER_DAILY_SEND_LIMIT: z.coerce.number().int().positive().default(200),
    MAILBOX_DAILY_SEND_LIMIT: z.coerce.number().int().positive().default(1500),
    AI_DAILY_CALL_LIMIT: z.coerce.number().int().positive().default(1500),

    WORKER_MODE: z.enum(["timers", "cron"]).default("timers"),
    CRON_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
});

// Shipped example values that must never reach production.
const EXAMPLE_PASSWORDS = new Set(["change-me-now"]);
const MIN_PRODUCTION_ADMIN_PASSWORD = 16;

export const ENV_KEYS = Object.keys(schema.shape);

export interface AppConfig {
    env: "development" | "test" | "production";
    isProduction: boolean;
    logLevel: string;
    logFile: string | undefined;
    port: number;
    corsOrigins: string[];
    // First FRONTEND_ORIGIN; used for invite links.
    appUrl: string;
    // Public base URL of this API (unsubscribe links).
    apiUrl: string;
    mongoUri: string;
    auth: {
        sessionTtlDays: number;
        inviteTtlDays: number;
        cookieSecure: boolean;
        bootstrapAdmin: { name: string; email: string; password: string } | null;
    };
    gmail: {
        enabled: boolean;
        mailboxAddress: string;
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        encryptionKey: Buffer | null;
        syncIntervalMs: number;
        // "Check for new mail" is skipped when a sync ran this recently (off in tests).
        manualSyncCooldownMs: number;
    };
    gemini: { apiKey: string; model: string; enabled: boolean };
    rateLimit: { perMinute: number; authPerMinute: number; aiPerMinute: number; trustProxy: boolean };
    limits: { userDailySends: number; mailboxDailySends: number; aiDailyCalls: number };
    workers: { mode: "timers" | "cron"; cronSecret: string | null };
}

// Empty variables count as not set.
const withoutBlanks = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv =>
    Object.fromEntries(Object.entries(source).filter(([, value]) => value?.trim() !== ""));

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
    const parsed = schema.safeParse(withoutBlanks(source));
    if (!parsed.success) {
        const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
        throw new Error(`Invalid environment configuration:\n${problems}`);
    }
    const e = parsed.data;
    const isProduction = e.NODE_ENV === "production";
    const corsOrigins = e.FRONTEND_ORIGIN.split(",")
        .map((o) => o.trim().replace(/\/+$/, ""))
        .filter(Boolean);

    if (Boolean(e.BOOTSTRAP_ADMIN_EMAIL) !== Boolean(e.BOOTSTRAP_ADMIN_PASSWORD)) {
        throw new Error(
            "Invalid environment configuration:\n  BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together",
        );
    }

    const adminPassword = e.BOOTSTRAP_ADMIN_PASSWORD;
    if (
        isProduction &&
        adminPassword &&
        (EXAMPLE_PASSWORDS.has(adminPassword) || adminPassword.length < MIN_PRODUCTION_ADMIN_PASSWORD)
    ) {
        throw new Error(
            `Invalid environment configuration:\n  BOOTSTRAP_ADMIN_PASSWORD must be your own password of at least ${MIN_PRODUCTION_ADMIN_PASSWORD} characters in production`,
        );
    }

    if (e.WORKER_MODE === "cron" && !e.CRON_SECRET) {
        throw new Error("Invalid environment configuration:\n  CRON_SECRET is required when WORKER_MODE=cron");
    }

    const googleSet = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
    if (googleSet && !e.ENCRYPTION_KEY) {
        throw new Error(
            "Invalid environment configuration:\n  ENCRYPTION_KEY is required when GOOGLE_CLIENT_ID is set (it protects the Gmail tokens)",
        );
    }

    return {
        env: e.NODE_ENV,
        isProduction,
        logLevel: e.LOG_LEVEL,
        logFile: e.LOG_FILE,
        port: e.PORT,
        corsOrigins,
        appUrl: corsOrigins[0] ?? "http://localhost:3000",
        apiUrl: (e.API_PUBLIC_URL ?? `http://localhost:${e.PORT}`).replace(/\/+$/, ""),
        mongoUri: e.MONGODB_URI,
        auth: {
            sessionTtlDays: e.SESSION_TTL_DAYS,
            inviteTtlDays: e.INVITE_TTL_DAYS,
            cookieSecure: (e.COOKIE_SECURE ?? (isProduction ? "true" : "false")) === "true",
            bootstrapAdmin:
                e.BOOTSTRAP_ADMIN_EMAIL && e.BOOTSTRAP_ADMIN_PASSWORD
                    ? {
                          name: e.BOOTSTRAP_ADMIN_NAME,
                          email: e.BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),
                          password: e.BOOTSTRAP_ADMIN_PASSWORD,
                      }
                    : null,
        },
        gmail: {
            enabled: googleSet,
            mailboxAddress: e.MAILBOX_ADDRESS.toLowerCase(),
            clientId: e.GOOGLE_CLIENT_ID,
            clientSecret: e.GOOGLE_CLIENT_SECRET,
            redirectUri: e.GOOGLE_REDIRECT_URI ?? `http://localhost:${e.PORT}/api/v1/mailbox/oauth/callback`,
            encryptionKey: e.ENCRYPTION_KEY ? Buffer.from(e.ENCRYPTION_KEY, "base64") : null,
            syncIntervalMs: e.GMAIL_SYNC_INTERVAL_SECONDS * 1000,
            manualSyncCooldownMs: e.NODE_ENV === "test" ? 0 : 15_000,
        },
        gemini: { apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL, enabled: e.GEMINI_API_KEY.length > 0 },
        rateLimit: {
            perMinute: e.RATE_LIMIT_PER_MINUTE,
            authPerMinute: e.AUTH_RATE_LIMIT_PER_MINUTE,
            aiPerMinute: e.AI_RATE_LIMIT_PER_MINUTE,
            trustProxy: e.TRUST_PROXY === "true",
        },
        limits: {
            userDailySends: e.USER_DAILY_SEND_LIMIT,
            mailboxDailySends: e.MAILBOX_DAILY_SEND_LIMIT,
            aiDailyCalls: e.AI_DAILY_CALL_LIMIT,
        },
        workers: { mode: e.WORKER_MODE, cronSecret: e.CRON_SECRET ?? null },
    };
}
