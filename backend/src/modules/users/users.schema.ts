import { z } from "zod";
import { emailAddress, personName } from "../../common/http/schemas.js";
import { USER_ROLES } from "./user.model.js";

export const inviteBody = z.object({ name: personName, email: emailAddress, role: z.enum(USER_ROLES) });

export const updateUserBody = z
    .object({ name: personName, role: z.enum(USER_ROLES), status: z.enum(["active", "disabled"]) })
    .partial()
    .refine((b) => Object.keys(b).length > 0, "Nothing to update");
