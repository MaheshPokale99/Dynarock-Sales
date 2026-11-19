import { hash, verify } from "@node-rs/argon2";

export const hashPassword = (plain: string) => hash(plain);

export const verifyPassword = async (passwordHash: string, plain: string) => {
    try {
        return await verify(passwordHash, plain);
    } catch {
        return false;
    }
};

let dummyHash: Promise<string> | undefined;

// Same delay as a real check, so timing doesn't reveal which emails exist.
export async function burnPasswordCheck(plain: string): Promise<false> {
    dummyHash ??= hashPassword("dynarock-timing-equaliser");
    await verifyPassword(await dummyHash, plain);
    return false;
}
