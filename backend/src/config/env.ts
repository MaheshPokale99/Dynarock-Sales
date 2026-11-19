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
});

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
    };
    gemini: { apiKey: string; model: string; enabled: boolean };
    rateLimit: { perMinute: number; authPerMinute: number; aiPerMinute: number; trustProxy: boolean };
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
        },
        gemini: { apiKey: e.GEMINI_API_KEY, model: e.GEMINI_MODEL, enabled: e.GEMINI_API_KEY.length > 0 },
        rateLimit: {
            perMinute: e.RATE_LIMIT_PER_MINUTE,
            authPerMinute: e.AUTH_RATE_LIMIT_PER_MINUTE,
            aiPerMinute: e.AI_RATE_LIMIT_PER_MINUTE,
            trustProxy: e.TRUST_PROXY === "true",
        },
    };
}
