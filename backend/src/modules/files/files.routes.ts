import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { PayloadTooLargeError, ValidationError } from "../../common/errors/app-error.js";
import type { AppEnv } from "../../common/http/app-env.js";
import { download } from "../../common/http/download.js";
import { parseParams } from "../../common/http/request.js";
import { idParams } from "../../common/http/schemas.js";
import { currentAuth, requireAuth } from "../auth/auth.middleware.js";
import { MAX_UPLOAD_BYTES, type FilesService } from "./files.service.js";

export class FilesController {
    constructor(private readonly files: FilesService) {}

    upload = async (c: Context<AppEnv>) => {
        const body = await c.req.parseBody();
        const file = body.file;
        if (!(file instanceof File)) throw new ValidationError("Send the file in a form field named “file”");
        return c.json(await this.files.upload(currentAuth(c).user.id, file), 201);
    };

    download = async (c: Context<AppEnv>) =>
        download(c, await this.files.read(parseParams(c, idParams).id, currentAuth(c).user));
}

export const createFilesRoutes = (controller: FilesController) =>
    new Hono<AppEnv>()
        .post(
            "/",
            requireAuth,
            bodyLimit({
                maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
                onError: () => {
                    throw new PayloadTooLargeError();
                },
            }),
            controller.upload,
        )
        .get("/:id", requireAuth, controller.download);
