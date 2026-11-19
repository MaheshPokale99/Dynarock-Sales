import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM; output is iv.tag.ciphertext in base64url.
export function encrypt(plain: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string, key: Buffer): string {
    const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !data) throw new Error("Malformed encrypted value");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// Tamper-proof, expiring payload (used for the OAuth state).
export function sign(payload: object, key: Buffer, ttlMs: number): string {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
    const mac = createHmac("sha256", key).update(body).digest("base64url");
    return `${body}.${mac}`;
}

export function verifySigned<T>(token: string, key: Buffer): T | null {
    const [body, mac] = token.split(".");
    if (!body || !mac) return null;
    const expected = createHmac("sha256", key).update(body).digest();
    const given = Buffer.from(mac, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return payload.exp > Date.now() ? payload : null;
}
