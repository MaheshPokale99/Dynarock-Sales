import mongoose, { Types, type Connection } from "mongoose";
import { NotFoundError, ValidationError } from "../../common/errors/app-error.js";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Total stored uploads per person.
export const USER_STORAGE_QUOTA_BYTES = 200 * 1024 * 1024;

export interface StoredFile {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
}

interface FileMeta {
    uploadedBy: string;
    mimeType: string;
}

// Who may use a file: the person who uploaded it, or an admin.
export interface FileUser {
    id: string;
    role: "admin" | "sales_rep";
}

// Compose attachments, kept in MongoDB GridFS ("uploads" bucket).
export class FilesService {
    constructor(private readonly connection: Connection) {}

    private get bucket() {
        const db = this.connection.db;
        if (!db) throw new Error("Database is not connected");
        return new mongoose.mongo.GridFSBucket(db, { bucketName: "uploads" });
    }

    private async usedBytes(userId: string): Promise<number> {
        const docs = await this.bucket
            .find({ "metadata.uploadedBy": userId })
            .project<{ length: number }>({ length: 1 })
            .toArray();
        return docs.reduce((sum, d) => sum + d.length, 0);
    }

    async upload(userId: string, file: File): Promise<StoredFile> {
        if (file.size === 0) throw new ValidationError("The file is empty");
        if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError("Files can be at most 20 MB");
        if ((await this.usedBytes(userId)) + file.size > USER_STORAGE_QUOTA_BYTES) {
            throw new ValidationError(
                "You've reached your 200 MB upload limit. Ask an admin to clear old attachments.",
            );
        }
        const filename = file.name.replace(/[\r\n"\\/]/g, "").slice(0, 200) || "attachment";
        const mimeType = file.type || "application/octet-stream";
        const metadata: FileMeta = { uploadedBy: userId, mimeType };

        const buffer = Buffer.from(await file.arrayBuffer());
        const stream = this.bucket.openUploadStream(filename, { metadata });
        await new Promise<void>((resolve, reject) => {
            stream.once("finish", () => resolve()).once("error", reject);
            stream.end(buffer);
        });
        return { id: stream.id.toHexString(), filename, mimeType, size: buffer.length };
    }

    // Metadata only (no content), and only for a file this person may use.
    async info(id: string, user: FileUser): Promise<StoredFile> {
        if (!Types.ObjectId.isValid(id)) throw new NotFoundError("File not found");
        const [doc] = await this.bucket.find({ _id: new Types.ObjectId(id) }).toArray();
        const meta = doc?.metadata as FileMeta | undefined;
        // Someone else's file looks exactly like a missing one.
        if (!doc || (user.role !== "admin" && meta?.uploadedBy !== user.id)) throw new NotFoundError("File not found");
        return { id, filename: doc.filename, mimeType: meta?.mimeType ?? "application/octet-stream", size: doc.length };
    }

    async read(id: string, user: FileUser): Promise<StoredFile & { content: Buffer }> {
        const info = await this.info(id, user);
        const chunks: Buffer[] = [];
        for await (const chunk of this.bucket.openDownloadStream(new Types.ObjectId(id))) chunks.push(chunk as Buffer);
        return { ...info, content: Buffer.concat(chunks) };
    }

    // Loads attachments for sending: owner-checked, de-duplicated, and size-checked before any content is read.
    async readForSending(ids: string[], user: FileUser, maxTotalBytes: number) {
        const unique = [...new Set(ids)];
        const infos = await Promise.all(unique.map((id) => this.info(id, user)));
        if (infos.reduce((sum, f) => sum + f.size, 0) > maxTotalBytes) {
            throw new ValidationError("Attachments can be at most 20 MB in total");
        }
        return Promise.all(unique.map((id) => this.read(id, user)));
    }
}
