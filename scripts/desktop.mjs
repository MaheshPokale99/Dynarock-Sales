import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const children = new Set();
let stopping = false;
let shutdownCode = 0;

function setting(file, name, fallback) {
  const inherited = process.env[name];
  if (inherited) return inherited;
  if (existsSync(file)) {
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.match(new RegExp(`^\\s*${name}\\s*=`)));
    if (line)
      return line
        .slice(line.indexOf("=") + 1)
        .trim()
        .replace(/^(["'])(.*)\1$/, "$2");
  }
  return fallback;
}

function start(label, script, args, cwd, env = process.env) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("error", (error) => {
    console.error(`${label} failed to start: ${error.message}`);
    void shutdown(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping) {
      console.log(
        `${label} exited${code === null ? "" : ` (${code})`}; closing the desktop app.`,
      );
      void shutdown(code ?? 1);
    } else if (children.size === 0) process.exit(shutdownCode);
  });
  return child;
}

async function waitForHttp(url, label, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!stopping) throw new Error(`${label} did not become ready at ${url}`);
}

function canConnect(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  shutdownCode = code;
  for (const child of children) child.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 5_000);
  force.unref();
  if (children.size === 0) process.exit(code);
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

const nodeModules = [
  path.join(backend, "node_modules"),
  path.join(frontend, "node_modules"),
];
if (nodeModules.some((dir) => !existsSync(dir))) {
  console.error(
    "Install the backend and frontend dependencies first (npm install in each folder).",
  );
  process.exit(1);
}

const electronCli = path.join(frontend, "node_modules", "electron", "cli.js");
if (!existsSync(electronCli)) {
  console.error(
    "Electron is not installed. Run npm install in the frontend folder.",
  );
  process.exit(1);
}

async function run() {
  if (process.env.DYNAROCK_APP_URL) {
    start(
      "Electron",
      electronCli,
      [path.join(frontend, "electron", "main.cjs")],
      frontend,
    );
    return;
  }

  const backendEnv = path.join(backend, ".env");
  const mongoUri = setting(
    backendEnv,
    "MONGODB_URI",
    "mongodb://127.0.0.1:27017/dynarock_sales",
  );
  let localMongo;
  try {
    localMongo = new URL(mongoUri);
  } catch {
    throw new Error("MONGODB_URI in backend/.env is invalid");
  }

  if (["localhost", "127.0.0.1", "::1"].includes(localMongo.hostname)) {
    const mongoPort = Number(localMongo.port || 27017);
    if (!(await canConnect(localMongo.hostname, mongoPort))) {
      if (mongoPort !== 27017)
        throw new Error(
          `Start MongoDB at ${localMongo.hostname}:${mongoPort} first.`,
        );
      start(
        "Local MongoDB",
        path.join(backend, "node_modules", "tsx", "dist", "cli.mjs"),
        ["scripts/dev-db.ts"],
        backend,
      );
      while (
        !stopping &&
        !(await canConnect(localMongo.hostname, mongoPort, 1_000))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
  }

  const apiPort = setting(backendEnv, "PORT", "5000");
  const frontendEnv = { ...process.env };
  delete frontendEnv.PORT;
  start(
    "API",
    path.join(backend, "node_modules", "tsx", "dist", "cli.mjs"),
    ["watch", "src/server.ts"],
    backend,
  );
  await waitForHttp(`http://localhost:${apiPort}/readyz`, "API");
  if (stopping) return;
  const hasProductionBuild = existsSync(path.join(frontend, ".next", "BUILD_ID"));
  const nextMode = hasProductionBuild ? "start" : "dev";
  start(
    "Next.js",
    path.join(frontend, "node_modules", "next", "dist", "bin", "next"),
    [nextMode, "--port", "3000"],
    frontend,
    frontendEnv,
  );
  await waitForHttp("http://localhost:3000", "Next.js");
  if (stopping) return;
  start(
    "Electron",
    electronCli,
    [path.join(frontend, "electron", "main.cjs")],
    frontend,
  );
}

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  void shutdown(1);
});
