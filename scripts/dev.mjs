#!/usr/bin/env node
/**
 * Dev orchestrator: builds/launches the Rust backend (MovieBox-Tui/server),
 * the NestJS account service (auth/) and the Next.js dev server together,
 * restarting none of them if their port is already serving.
 *
 * Env overrides: MB_BACKEND_URL (default http://127.0.0.1:9797),
 * MOVIEBOX_SERVER_PORT (default 9797), MOVIEBOX_PROXY_BASE (default
 * http://localhost:3000 — the external origin that browsers use, needed to
 * rewrite DASH manifest URLs when running behind the Next dev server),
 * AUTH_PORT (default 4100, the Nest service), AUTH_SECRET, DATABASE_URL,
 * REDIS_URL.
 *
 * The account service needs Postgres + Redis; when they are not running the
 * script still boots everything and prints `docker compose up -d db redis`.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Minimal .env loader (no dependency): the compose file already reads the
 * same file, so `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` overrides and the
 * matching DATABASE_URL / REDIS_URL stay in one place. Existing process env
 * always wins.
 */
function loadDotEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* no .env — defaults below apply */
  }
}
loadDotEnv(join(ROOT, ".env"));

const HOST = "127.0.0.1";
const PORT = Number(process.env.MOVIEBOX_SERVER_PORT ?? 9797);
const WEB_PORT = 3000;
const MANIFEST = new URL("../MovieBox-Tui/server/Cargo.toml", import.meta.url).pathname;
const BACKEND_URL = process.env.MB_BACKEND_URL ?? `http://${HOST}:${PORT}`;

const AUTH_DIR = join(ROOT, "auth");
const AUTH_PORT = Number(process.env.AUTH_PORT ?? 4100);
const AUTH_URL = `http://${HOST}:${AUTH_PORT}`;
const PG_PORT = process.env.POSTGRES_HOST_PORT ?? "5432";
const REDIS_HOST_PORT = process.env.REDIS_HOST_PORT ?? "6379";
const DATABASE_URL =
  process.env.DATABASE_URL ?? `postgres://moviebox:moviebox@127.0.0.1:${PG_PORT}/moviebox`;
const REDIS_URL = process.env.REDIS_URL ?? `redis://127.0.0.1:${REDIS_HOST_PORT}`;
const COMPOSE_HINT = "docker compose up -d db redis";

function portOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(700);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function prefix(child, tag) {
  child.stdout?.on("data", (d) => process.stdout.write(`[${tag}] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[${tag}] ${d}`));
  child.on("exit", (code) => {
    process.stderr.write(`[${tag}] exited (${code})\n`);
  });
}

if (!existsSync(MANIFEST)) {
  console.error(
    "MovieBox-Tui/server not found. Clone the backend fork next to this repo:\n" +
      "  git clone https://github.com/algochad/MovieBox-Tui\n" +
      "or run: npm run sync:backend",
  );
  process.exit(1);
}

const children = [];
const shutdown = () => {
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(0), 400).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/** Newest mtime (ms) of any file under `dir`. */
function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const mtime = statSync(join(entry.parentPath ?? entry.path, entry.name)).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

/** dist/main.js is stale when any source or config is newer than the build. */
function authBuildStale() {
  const main = join(AUTH_DIR, "dist", "main.js");
  if (!existsSync(main)) return true;
  const built = statSync(main).mtimeMs;
  const configs = [
    join(AUTH_DIR, "package.json"),
    join(AUTH_DIR, "tsconfig.json"),
    join(AUTH_DIR, "tsconfig.build.json"),
  ]
    .filter(existsSync)
    .map((file) => statSync(file).mtimeMs);
  const newest = Math.max(
    newestMtime(join(AUTH_DIR, "src")),
    newestMtime(join(AUTH_DIR, "prisma")),
    ...configs,
  );
  return newest > built;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    prefix(child, "auth:setup");
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      process.stderr.write(`[auth:setup] ${error.message}\n`);
      resolve(1);
    });
  });
}

/** First-run install + prisma generate + build (skipped when dist is fresh). */
async function prepareAuth() {
  if (!existsSync(join(AUTH_DIR, "node_modules"))) {
    console.log("Installing account-service dependencies (auth/)…");
    if ((await run("npm", ["ci", "--prefix", "auth"])) !== 0) return false;
  }
  const generated = join(AUTH_DIR, "node_modules", ".prisma", "client", "index.js");
  const schema = join(AUTH_DIR, "prisma", "schema.prisma");
  if (!existsSync(generated) || statSync(schema).mtimeMs > statSync(generated).mtimeMs) {
    if ((await run("npm", ["run", "prisma:generate", "--prefix", "auth"])) !== 0) return false;
  }
  if (authBuildStale()) {
    console.log("Building account service (auth/)…");
    if ((await run("npm", ["run", "build", "--prefix", "auth"])) !== 0) return false;
  }
  return true;
}

/** Poll /v1/health until it answers or `timeoutMs` elapses. */
async function waitForAuthHealth(timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${AUTH_URL}/v1/health`, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return null;
}

async function startAuth() {
  if (!existsSync(AUTH_DIR)) return;
  if (await portOpen(AUTH_PORT)) {
    console.log(`Account service already listening on ${HOST}:${AUTH_PORT} — reusing it.`);
    return;
  }
  if (!(await prepareAuth())) {
    console.error("Account service unavailable (auth/ install or build failed) — continuing.");
    return;
  }

  const auth = spawn(process.execPath, [join(AUTH_DIR, "dist", "main.js")], {
    env: {
      ...process.env,
      AUTH_HOST: process.env.AUTH_HOST ?? HOST,
      AUTH_PORT: String(AUTH_PORT),
      AUTH_SECRET: process.env.AUTH_SECRET ?? "moviebox-dev-secret",
      DATABASE_URL,
      REDIS_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(auth);
  prefix(auth, "auth");

  const health = await waitForAuthHealth(120_000);
  if (health?.ok) {
    console.log(`Account service ready on ${AUTH_URL} (db + redis ok).`);
    return;
  }
  console.error(
    `Account service degraded (${health ? `db=${health.db} redis=${health.redis}` : "no response in 120s"}).`,
  );
  console.error(`Start Postgres + Redis with: ${COMPOSE_HINT}`);
}

async function main() {
  const already = await portOpen(PORT);
  if (already) {
    console.log(`Backend already listening on ${HOST}:${PORT} — reusing it.`);
  } else {
    console.log(`Building & starting Rust backend on ${HOST}:${PORT}…`);
    const backend = spawn("cargo", ["run", "--manifest-path", MANIFEST], {
      env: {
        ...process.env,
        MOVIEBOX_SERVER_HOST: HOST,
        MOVIEBOX_SERVER_PORT: String(PORT),
        MOVIEBOX_REGION: process.env.MOVIEBOX_REGION ?? "ph",
        MOVIEBOX_PROXY_BASE: process.env.MOVIEBOX_PROXY_BASE ?? `http://localhost:${WEB_PORT}`,
        RUST_LOG: process.env.RUST_LOG ?? "warn",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(backend);
    prefix(backend, "backend");

    const ready = await new Promise((resolve) => {
      const until = Date.now() + 180_000;
      const poll = async () => {
        if (await portOpen(PORT)) return resolve(true);
        if (Date.now() > until || backend.exitCode != null) return resolve(false);
        setTimeout(poll, 500);
      };
      void poll();
    });
    if (!ready) {
      console.error("Backend failed to become ready — is cargo installed?");
      shutdown();
      return;
    }
    console.log("Backend ready.");
  }

  await startAuth();

  const web = spawn("next", ["dev", "-p", String(WEB_PORT)], {
    env: { ...process.env, MB_BACKEND_URL: BACKEND_URL, AUTH_URL },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(web);
  prefix(web, "web");
  console.log(
    `Web: http://localhost:${WEB_PORT} (backend: ${BACKEND_URL}, account: ${AUTH_URL})`,
  );
}

void main();
