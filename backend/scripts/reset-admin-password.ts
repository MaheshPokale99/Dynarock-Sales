import { loadConfig } from "../src/config/env.js";
import { Database } from "../src/database/database.js";
import { hashPassword } from "../src/modules/auth/password.js";

const config = loadConfig();
const admin = config.auth.bootstrapAdmin;
if (!admin) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in backend/.env first");

const database = Database.create(config.mongoUri);
await database.connection.asPromise();
const { User, Session } = database.models;
const user = await User.findOneAndUpdate(
    { email: admin.email.toLowerCase() },
    { $set: { passwordHash: await hashPassword(admin.password), loginFailures: 0, lockedUntil: null } },
);
if (user) {
    await Session.deleteMany({ userId: user._id });
    console.log(`Password reset for ${admin.email}. Sign in with the password from .env.`);
} else {
    console.log(`No user ${admin.email}. Start the API once and it will be created.`);
}
await database.disconnect();
