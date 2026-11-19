// Zero-install local MongoDB on port 27017; data is kept in backend/data/mongo.
import { mkdirSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";

const dbPath = new URL("../data/mongo", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
    instance: { port: 27017, ip: "127.0.0.1", dbPath, storageEngine: "wiredTiger" },
});

console.log(`MongoDB running at ${server.getUri()}dynarock_sales`);
console.log(`Data folder: ${dbPath}`);
console.log("Press Ctrl+C to stop.");

const stop = async () => {
    await server.stop({ doCleanup: false });
    process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
