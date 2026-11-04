import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverUrl = "http://127.0.0.1:3202";
const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");

async function isServerReady() {
  try {
    const response = await fetch(serverUrl, { redirect: "manual" });
    return response.status > 0;
  } catch {
    return false;
  }
}

if (await isServerReady()) {
  console.error(`Refusing to run: ${serverUrl} is already in use.`);
  process.exit(1);
}

const server = spawn(process.execPath, [nextCli, "start", "-p", "3202"], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next.js server exited with code ${server.exitCode}.`);
    if (await isServerReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js test server did not become ready within 30 seconds.");
}

function stopServer() {
  if (server.exitCode !== null || server.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
}

let exitCode = 1;
try {
  await waitForServer();
  const tests = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  exitCode = await new Promise((resolve) => tests.once("exit", (code) => resolve(code ?? 1)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  stopServer();
}

process.exit(exitCode);
