import { GmailError, type GmailOAuth, type OAuthTokens } from "./gmail.types.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    error?: string;
    error_description?: string;
}

interface OAuthClientConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

async function postForm(url: string, form: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok) {
        throw new GmailError(
            body.error_description ?? body.error ?? `Google OAuth ${res.status}`,
            res.status,
            body.error,
        );
    }
    return body;
}

const expiry = (seconds: number) => new Date(Date.now() + (seconds - 60) * 1000);

export function createGmailOAuth(config: OAuthClientConfig): GmailOAuth {
    return {
        authUrl(state, loginHint) {
            const params = new URLSearchParams({
                client_id: config.clientId,
                redirect_uri: config.redirectUri,
                response_type: "code",
                scope: GMAIL_SCOPES.join(" "),
                access_type: "offline",
                prompt: "consent",
                login_hint: loginHint,
                state,
            });
            return `${AUTH_URL}?${params}`;
        },

        async exchangeCode(code): Promise<OAuthTokens> {
            const t = await postForm(TOKEN_URL, {
                code,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                grant_type: "authorization_code",
            });
            if (!t.refresh_token)
                throw new GmailError("Google did not return a refresh token", 400, "no_refresh_token");
            return {
                accessToken: t.access_token,
                refreshToken: t.refresh_token,
                expiresAt: expiry(t.expires_in),
                scopes: (t.scope ?? "").split(" ").filter(Boolean),
            };
        },

        async refresh(refreshToken) {
            const t = await postForm(TOKEN_URL, {
                refresh_token: refreshToken,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: "refresh_token",
            });
            return { accessToken: t.access_token, expiresAt: expiry(t.expires_in) };
        },

        async revoke(token) {
            await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
                method: "POST",
                signal: AbortSignal.timeout(10_000),
            }).catch(() => undefined);
        },
    };
}
