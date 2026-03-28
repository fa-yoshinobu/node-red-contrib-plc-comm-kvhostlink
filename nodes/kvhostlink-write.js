"use strict";

const { writeNamed } = require("../lib/hostlink");

module.exports = function registerKvHostLinkWrite(RED) {
  function KvHostLinkWriteNode(config) {
    RED.nodes.createNode(this, config);

    this.name = config.name;
    this.connection = RED.nodes.getNode(config.connection);
    this.updates = config.updates || "";
    this.updatesType = config.updatesType || "str";
    this.errorHandling = config.errorHandling || "throw";
    this.metadataMode = normalizeMetadataMode(config.metadataMode);
    this.outputs = this.errorHandling === "output2" ? 2 : 1;

    this.on("input", async (msg, send, done) => {
      send = send || ((message) => this.send(message));

      if (!this.connection) {
        fail(this, msg, send, done, new Error("KV Host Link connection config is missing"));
        return;
      }

      try {
        const controlAction = getControlAction(msg);
        if (controlAction) {
          this.status({ fill: "yellow", shape: "ring", text: controlAction });
          await this.connection[controlAction]();
          this.status({ fill: controlAction === "disconnect" ? "red" : "green", shape: "dot", text: controlAction });
          done();
          return;
        }

        this.status({ fill: "blue", shape: "dot", text: "writing" });
        const updates = await resolveUpdates(RED, this, msg);
        const keys = Object.keys(updates);
        if (keys.length === 0) {
          throw new Error("No KV Host Link updates were provided");
        }

        const client = this.connection.getClient();
        await writeNamed(client, updates);
        const profile = this.connection.getProfile();
        applyMetadata(msg, this.metadataMode, {
          updates,
          connection: profile,
          itemCount: keys.length,
        });
        this.status({ fill: "green", shape: "dot", text: `${keys.length} item(s)` });
        send(msg);
        done();
      } catch (error) {
        fail(this, msg, send, done, error);
      }
    });
  }

  RED.nodes.registerType("kvhostlink-write", KvHostLinkWriteNode);
};

async function resolveUpdates(RED, node, msg) {
  if (isUpdateSource(msg.updates)) {
    return normalizeUpdatesSource(msg.updates);
  }
  if (isUpdateSource(msg.payload)) {
    return normalizeUpdatesSource(msg.payload);
  }
  if (typeof msg.address === "string" && msg.address.trim()) {
    return {
      [withDtype(msg.address, msg.dtype)]: msg.value !== undefined ? msg.value : msg.payload,
    };
  }
  const configured = await evaluateConfiguredValue(RED, node, msg, node.updates, node.updatesType, "updates");
  return normalizeUpdatesSource(configured);
}

function withDtype(address, dtype) {
  const trimmed = String(address).trim();
  if (!dtype || trimmed.includes(":") || trimmed.includes(".")) {
    return trimmed;
  }
  const normalizedDtype = String(dtype).trim().toUpperCase();
  const countMatch = /^(.*?)(,\s*\d+)$/.exec(trimmed);
  if (countMatch) {
    return `${countMatch[1]}:${normalizedDtype}${countMatch[2]}`;
  }
  return `${trimmed}:${normalizedDtype}`;
}

function evaluateConfiguredValue(RED, node, msg, value, type, label) {
  if (!RED.util || typeof RED.util.evaluateNodeProperty !== "function" || !type || type === "str") {
    return Promise.resolve(value);
  }
  return new Promise((resolve, reject) => {
    RED.util.evaluateNodeProperty(value, type, node, msg, (error, resolved) => {
      if (error) {
        reject(new Error(`Unable to evaluate ${label}`));
        return;
      }
      resolve(resolved);
    });
  });
}

function normalizeUpdatesSource(value) {
  if (isPlainObject(value)) {
    return value;
  }
  if (typeof value === "string") {
    return parseConfiguredUpdates(value);
  }
  return {};
}

function parseConfiguredUpdates(value) {
  const text = String(value || "").trim();
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    if (isPlainObject(parsed)) {
      return parsed;
    }
  } catch (_error) {
  }
  const updates = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid update line: ${trimmed}`);
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    updates[key] = parseScalar(rawValue);
  }
  return updates;
}

function parseScalar(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUpdateSource(value) {
  return isPlainObject(value) || typeof value === "string";
}

function normalizeMetadataMode(value) {
  const normalized = String(value || "full").trim().toLowerCase();
  return normalized === "minimal" || normalized === "off" ? normalized : "full";
}

function applyMetadata(msg, mode, metadata) {
  const normalizedMode = normalizeMetadataMode(mode);
  if (normalizedMode === "off") {
    return;
  }
  if (normalizedMode === "minimal") {
    const next = isPlainObject(msg.kvhostlink) ? { ...msg.kvhostlink } : {};
    delete next.addresses;
    delete next.updates;
    delete next.connection;
    next.itemCount = metadata.itemCount;
    next.metadataMode = "minimal";
    msg.kvhostlink = next;
    return;
  }
  msg.kvhostlink = {
    ...(isPlainObject(msg.kvhostlink) ? msg.kvhostlink : {}),
    updates: metadata.updates,
    connection: metadata.connection,
  };
}

function fail(node, msg, send, done, error) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  node.status({ fill: "red", shape: "ring", text: normalized.message });
  if (node.errorHandling === "msg") {
    msg.error = normalized;
    send(msg);
    done();
    return;
  }
  if (node.errorHandling === "output2") {
    send([null, { ...msg, error: normalized }]);
    done();
    return;
  }
  done(normalized);
}

function getControlAction(msg) {
  if (msg.disconnect === true || String(msg.topic || "").toLowerCase() === "disconnect") {
    return "disconnect";
  }
  if (msg.connect === true || String(msg.topic || "").toLowerCase() === "connect") {
    return "connect";
  }
  if (msg.reinitialize === true || String(msg.topic || "").toLowerCase() === "reinitialize") {
    return "reinitialize";
  }
  return null;
}
