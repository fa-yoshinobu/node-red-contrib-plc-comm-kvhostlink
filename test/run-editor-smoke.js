"use strict";

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(repoRoot, "package.json"));
const flowPath = path.join(repoRoot, "examples", "flows", "kvhostlink-basic-read-write.json");
const expectedTypes = new Set(["kvhostlink-connection", "kvhostlink-read", "kvhostlink-write"]);
const smokeDir = path.join(os.tmpdir(), `${packageJson.name.replace(/[^a-z0-9._-]+/gi, "-")}-editor-smoke`);
const npmCacheDir = path.join(smokeDir, ".npm-cache");
const npmRunner = resolveNpmRunner();
const nodeRedRunner = resolveNodeRedRunner();

main().catch((error) => {
  console.error(`[NG] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const port = await getFreePort();
  const flowJson = JSON.parse(fs.readFileSync(flowPath, "utf8"));

  cleanDirectory(smokeDir);
  fs.mkdirSync(smokeDir, { recursive: true });

  const stdoutPath = path.join(smokeDir, "stdout.log");
  const stderrPath = path.join(smokeDir, "stderr.log");
  const stdout = fs.createWriteStream(stdoutPath, { flags: "w" });
  const stderr = fs.createWriteStream(stderrPath, { flags: "w" });

  let child = null;
  let keepArtifacts = true;
  try {
    initializeUserDir(smokeDir);
    const packageArchive = packRepository(smokeDir);
    runCommand(npmRunner.command, [...npmRunner.args, "install", "--cache", npmCacheDir, "--no-save", "--no-package-lock", packageArchive], smokeDir, "npm install");

    child = startProcess(nodeRedRunner.command, [...nodeRedRunner.args, "--userDir", smokeDir, "--port", String(port)], smokeDir);
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);

    await waitForEditorReady(port, child);
    await postJson(port, "/flows", flowJson);
    const savedFlows = await getJson(port, "/flows");
    const foundTypes = collectNodeTypes(savedFlows);
    for (const expectedType of expectedTypes) {
      if (!foundTypes.has(expectedType)) {
        throw new Error(`Imported flow is missing node type '${expectedType}'. See ${stdoutPath} and ${stderrPath}.`);
      }
    }

    keepArtifacts = false;
    console.log(`[OK] Editor smoke passed on port ${port}.`);
  } finally {
    if (child) {
      stopProcessTree(child.pid);
    }
    stdout.end();
    stderr.end();
    if (!keepArtifacts) {
      cleanDirectory(smokeDir);
    }
  }
}

function resolveNpmRunner() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const candidate = appData ? path.join(appData, "npm", "node_modules", "npm", "bin", "npm-cli.js") : null;
    if (candidate && fs.existsSync(candidate)) {
      return { command: process.execPath, args: [candidate] };
    }
  }

  try {
    return { command: process.execPath, args: [require.resolve("npm/bin/npm-cli.js")] };
  } catch {
    return { command: "npm", args: [] };
  }
}

function resolveNodeRedRunner() {
  const explicit = process.env.NODE_RED_CMD;
  if (explicit && fs.existsSync(explicit)) {
    if (explicit.toLowerCase().endsWith(".js")) {
      return { command: process.execPath, args: [explicit] };
    }
    return { command: explicit, args: [] };
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    const candidate = appData ? path.join(appData, "npm", "node_modules", "node-red", "red.js") : null;
    if (candidate && fs.existsSync(candidate)) {
      return { command: process.execPath, args: [candidate] };
    }
  }

  return { command: "node-red", args: [] };
}

function runCommand(command, args, cwd, label = command) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed.\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
  }
}

function startProcess(command, args, cwd) {
  return spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function cleanDirectory(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function initializeUserDir(targetPath) {
  fs.writeFileSync(
    path.join(targetPath, "package.json"),
    `${JSON.stringify({ name: "node-red-editor-smoke", private: true }, null, 2)}\n`,
    "utf8"
  );
  fs.mkdirSync(npmCacheDir, { recursive: true });
}

function packRepository(targetPath) {
  runCommand(npmRunner.command, [...npmRunner.args, "pack", "--cache", npmCacheDir, "--pack-destination", targetPath], repoRoot, "npm pack");
  const archiveName = `${packageJson.name.replace(/^@/u, "").replace(/\//gu, "-")}-${packageJson.version}.tgz`;
  const archivePath = path.join(targetPath, archiveName);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`npm pack did not create the expected archive at ${archivePath}.`);
  }

  return archivePath;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate a local TCP port.")));
        return;
      }

      const port = address.port;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForEditorReady(port, child) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    if (child.exitCode !== null) {
      throw new Error(`Node-RED exited early with code ${child.exitCode}.`);
    }

    try {
      await getText(port, "/");
      return;
    } catch {
      await delay(500);
    }
  }

  throw new Error("Timed out waiting for the temporary Node-RED runtime to start.");
}

function getText(port, requestPath) {
  return request(port, requestPath, "GET");
}

async function getJson(port, requestPath) {
  const body = await request(port, requestPath, "GET");
  return JSON.parse(body);
}

async function postJson(port, requestPath, payload) {
  await request(port, requestPath, "POST", JSON.stringify(payload), {
    "Content-Type": "application/json",
    "Node-RED-Deployment-Type": "full",
  });
}

function request(port, requestPath, method, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: requestPath,
        method,
        headers: {
          Accept: "application/json, text/plain, */*",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(text);
            return;
          }

          reject(new Error(`${method} ${requestPath} failed with HTTP ${res.statusCode}: ${text}`));
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function collectNodeTypes(savedFlows) {
  const flows = Array.isArray(savedFlows) ? savedFlows : savedFlows.flows;
  const types = new Set();
  for (const node of flows ?? []) {
    if (node && typeof node.type === "string") {
      types.add(node.type);
    }
  }
  return types;
}

function stopProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}