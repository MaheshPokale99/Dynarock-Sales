import type { Logger } from "../logger/logger.js";
import type { User } from "../../modules/users/users.types.js";

export interface AuthContext {
    user: User;
    tokenHash: string;
}

export interface AppEnv {
    Variables: {
        requestId: string;
        logger: Logger;
        auth: AuthContext | undefined;
    };
}
