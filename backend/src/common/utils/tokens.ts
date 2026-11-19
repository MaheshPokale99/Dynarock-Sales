import { createHash, randomBytes } from "node:crypto";

// Random URL-safe secret for cookies and invite links.
export const newSecretToken = () => randomBytes(32).toString("base64url");

// We store only this hash, never the token.
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
