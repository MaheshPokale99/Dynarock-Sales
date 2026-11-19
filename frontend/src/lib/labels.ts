import type { UserRole, UserStatus } from "@/lib/api";

export const ROLE_LABELS: Record<UserRole, string> = { admin: "Admin", sales_rep: "Sales rep" };

export const STATUS_LABELS: Record<UserStatus, string> = {
    invited: "Invited",
    active: "Active",
    disabled: "Disabled",
};
