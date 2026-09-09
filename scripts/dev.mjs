#!/usr/bin/env node
/**
 * Dev orchestrator: builds/launches the Rust backend (MovieBox-Tui/server)
 * and the Next.js dev server together, restarting neither if the backend
 * port is already serving.
 *
 * Env overrides: MB_BACKEND_URL (default http://127.0.0.1:9797),
 * MOVIEBOX_SERVER_PORT (default 9797), MOVIEBOX_PROXY_BASE (default
 * http://localhost:3000 — the external origin that browsers use, needed to
 * rewrite DASH manifest URLs when running behind the Next dev server).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";

const HOST = "127.0.0.1";
const PORT = Number(process.env.MOVIEBOX_SERVER_PORT ?? 9797);
const WEB_PORT = 3000;
const MANIFEST = new URL("../MovieBox-Tui/server/Cargo.toml", import.meta.url).pathname;
const BACKEND_URL = process.env.MB_BACKEND_URL ?? `http://${HOST}:${PORT}`;

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

  const web = spawn("next", ["dev", "-p", String(WEB_PORT)], {
    env: { ...process.env, MB_BACKEND_URL: BACKEND_URL },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(web);
  prefix(web, "web");
  console.log(`Web: http://localhost:${WEB_PORT} (backend: ${BACKEND_URL})`);
}

void main();
