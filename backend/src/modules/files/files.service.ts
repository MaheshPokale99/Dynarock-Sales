import mongoose, { Types, type Connection } from "mongoose";
import { NotFoundError, ValidationError } from "../../common/errors/app-error.js";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

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

// Compose attachments, kept in MongoDB GridFS ("uploads" bucket).
export class FilesService {
    constructor(private readonly connection: Connection) {}

    private get bucket() {
        const db = this.connection.db;
        if (!db) throw new Error("Database is not connected");
        return new mongoose.mongo.GridFSBucket(db, { bucketName: "uploads" });
    }

    async upload(userId: string, file: File): Promise<StoredFile> {
        if (file.size === 0) throw new ValidationError("The file is empty");
        if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError("Files can be at most 20 MB");
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

    async info(id: string): Promise<StoredFile> {
        if (!Types.ObjectId.isValid(id)) throw new NotFoundError("File not found");
        const [doc] = await this.bucket.find({ _id: new Types.ObjectId(id) }).toArray();
        if (!doc) throw new NotFoundError("File not found");
        const meta = doc.metadata as FileMeta | undefined;
        return { id, filename: doc.filename, mimeType: meta?.mimeType ?? "application/octet-stream", size: doc.length };
    }

    async read(id: string): Promise<StoredFile & { content: Buffer }> {
        const info = await this.info(id);
        const chunks: Buffer[] = [];
        for await (const chunk of this.bucket.openDownloadStream(new Types.ObjectId(id))) chunks.push(chunk as Buffer);
        return { ...info, content: Buffer.concat(chunks) };
    }
}
