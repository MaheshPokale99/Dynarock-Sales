import type { UserRole, UserStatus } from "./user.model.js";

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    signatureHtml: string;
    invitedBy: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserWithSecret extends User {
    passwordHash: string | null;
    lockedUntil: Date | null;
}

export interface TeamMember extends User {
    invite: { expiresAt: Date; expired: boolean } | null;
}

export interface Invitation {
    user: User;
    // Shown once; only its hash is stored.
    inviteUrl: string;
    expiresAt: Date;
}
