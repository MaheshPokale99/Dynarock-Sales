import { ServiceUnavailableError } from "../../common/errors/app-error.js";
import type { AppConfig } from "../../config/env.js";
import type { Database } from "../../database/database.js";

export class SystemService {
    constructor(
        private readonly database: Database,
        private readonly config: AppConfig,
    ) {}

    status() {
        return {
            ok: true,
            gemini: { configured: this.config.gemini.enabled, model: this.config.gemini.model },
        };
    }

    async assertReady(): Promise<void> {
        try {
            await this.database.ping();
        } catch {
            throw new ServiceUnavailableError("Database is not reachable");
        }
    }
}
