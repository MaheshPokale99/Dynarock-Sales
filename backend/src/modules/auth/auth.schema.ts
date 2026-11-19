import { z } from "zod";
import { MAX_SIGNATURE_LENGTH } from "../../common/constants.js";
import { emailAddress, password, personName } from "../../common/http/schemas.js";

export const loginBody = z.object({ email: emailAddress, password: z.string().min(1, "is required").max(256) });

export const tokenParams = z.object({ token: z.string().min(20).max(200) });

export const acceptInviteBody = z.object({ token: z.string().min(20).max(200), password });

export const changePasswordBody = z.object({
    currentPassword: z.string().min(1, "is required"),
    newPassword: password,
});

export const updateProfileBody = z
    .object({ name: personName, signatureHtml: z.string().max(MAX_SIGNATURE_LENGTH) })
    .partial()
    .refine((b) => Object.keys(b).length > 0, "Nothing to update");
