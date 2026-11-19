import type { TestStack } from "./test-stack.js";

const ORIGIN = "http://localhost:3000";

// A tiny browser: keeps the session cookie between requests.
export class Client {
    cookie = "";

    constructor(private readonly stack: TestStack) {}

    async request(method: string, path: string, body?: unknown) {
        const res = await this.stack.app.request(`/api/v1${path}`, {
            method,
            headers: {
                origin: ORIGIN,
                ...(body === undefined ? {} : { "content-type": "application/json" }),
                ...(this.cookie ? { cookie: this.cookie } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = res.headers.get("set-cookie");
        if (setCookie) {
            const pair = setCookie.split(";")[0] ?? "";
            this.cookie = pair.endsWith("=") ? "" : pair;
        }
        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("json")) return { status: res.status, body: null as any, headers: res.headers, raw: res };
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers, raw: res };
    }

    get = (path: string) => this.request("GET", path);
    del = (path: string) => this.request("DELETE", path);

    async upload(filename: string, content: string, type = "text/plain") {
        const form = new FormData();
        form.append("file", new File([content], filename, { type }));
        const res = await this.stack.app.request("/api/v1/files", {
            method: "POST",
            headers: { origin: ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}) },
            body: form,
        });
        return { status: res.status, body: await res.json() };
    }
    post = (path: string, body?: unknown) => this.request("POST", path, body ?? {});
    patch = (path: string, body: unknown) => this.request("PATCH", path, body);

    async login(email: string, password: string) {
        const res = await this.post("/auth/login", { email, password });
        if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
        return res;
    }
}

export const tokenFrom = (inviteUrl: string) => new URL(inviteUrl).searchParams.get("token") ?? "";
