import { z } from "zod";
import { MAX_NAME_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../constants.js";

export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "must be a valid id");

export const idParams = z.object({ id: objectId });

export const emailAddress = z.string().trim().toLowerCase().pipe(z.email("must be a valid email address").max(254));

export const personName = z.string().trim().min(1, "is required").max(MAX_NAME_LENGTH);

export const password = z
    .string()
    .min(MIN_PASSWORD_LENGTH, `must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH, `must be at most ${MAX_PASSWORD_LENGTH} characters`);
