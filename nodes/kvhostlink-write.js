"use strict";

const { writeNamed } = require("../lib/hostlink");
const { hasOwn, normalizeDisplayName, requireEnum, requireSourceType, validateOutputs } = require("./runtime-validation");
const SINGLE_WRITE_DTYPES = new Set(["BIT", "U", "S", "D", "L", "F", "H", "COMMENT"]);

module.exports = function registerKvHostLinkWrite(RED) {
  function KvHostLinkWriteNode(config) {
    RED.nodes.createNode(this, config);

    this.name = normalizeDisplayName(config.name);
    this.connection = RED.nodes.getNode(config.connection);
    this.updates = config.updates || "";
    this.updatesType = requireSourceType(config, "updatesType");
    this.errorHandling = requireEnum(config, "errorHandling", ["throw", "msg", "output2"]);
    this.metadataMode = requireEnum(config, "metadataMode", ["full", "minimal", "off"]);
    this.outputs = validateOutputs(config, this.errorHandling);

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

        await this.connection.connect();
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
  const hasUpdates = hasOwn(msg, "updates");
  const hasAddress = hasOwn(msg, "address");
  const hasValue = hasOwn(msg, "value");
  const hasDtype = hasOwn(msg, "dtype");
  if (hasUpdates && hasAddress) {
    throw new Error("msg.updates and msg.address are mutually exclusive");
  }
  if (hasUpdates) {
    const updates = normalizeUpdatesSource(msg.updates, "msg.updates");
    if (Object.keys(updates).length === 0) {
      throw new Error("msg.updates must not be empty");
    }
    if (hasValue || hasDtype) {
      throw new Error("msg.value and msg.dtype may only be used with msg.address");
    }
    return updates;
  }
  if (hasAddress) {
    if (typeof msg.address !== "string" || !msg.address.trim()) {
      throw new Error("msg.address must be a non-empty string");
    }
    if (!hasValue) {
      throw new Error("msg.value is required when msg.address is used");
    }
    return {
      [withDtype(msg.address, msg.dtype)]: msg.value,
    };
  }
  if (hasValue || hasDtype) {
    throw new Error("msg.value and msg.dtype require msg.address");
  }
  const configured = await evaluateConfiguredValue(RED, node, msg, node.updates, node.updatesType, "updates");
  return normalizeUpdatesSource(configured);
}

function withDtype(address, dtype) {
  const trimmed = String(address).trim();
  const embedded = trimmed.includes(":") || trimmed.includes(".");
  const hasDtype = dtype !== undefined;
  if (embedded && hasDtype) {
    throw new Error("dtype must be specified exactly once: either in msg.address or msg.dtype");
  }
  if (embedded) {
    return trimmed;
  }
  if (!hasDtype || typeof dtype !== "string" || !SINGLE_WRITE_DTYPES.has(dtype)) {
    throw new Error("msg.dtype is required for a bare address and must be an exact supported uppercase dtype");
  }
  const normalizedDtype = dtype;
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

function normalizeUpdatesSource(value, label = "updates") {
  if (isPlainObject(value)) {
    return value;
  }
  if (typeof value === "string") {
    return parseConfiguredUpdates(value);
  }
  throw new Error(`${label} must be a JSON object or JSON object string`);
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
    throw new Error("Static updates must be a JSON object");
  } catch (error) {
    throw new Error(`Unable to parse updates JSON: ${error.message}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUpdateSource(value) {
  return isPlainObject(value) || typeof value === "string";
}

function applyMetadata(msg, mode, metadata) {
  if (mode === "off") {
    return;
  }
  if (mode === "minimal") {
    const next = clearOwnedMetadata(msg.kvhostlink);
    next.operation = "write";
    next.itemCount = metadata.itemCount;
    next.metadataMode = "minimal";
    msg.kvhostlink = next;
    return;
  }
  msg.kvhostlink = {
    ...clearOwnedMetadata(msg.kvhostlink),
    operation: "write",
    metadataMode: "full",
    itemCount: metadata.itemCount,
    updates: metadata.updates,
    connection: metadata.connection,
  };
}

function clearOwnedMetadata(existing) {
  const next = isPlainObject(existing) ? { ...existing } : {};
  for (const key of ["addresses", "updates", "connection", "itemCount", "metadataMode", "operation"]) {
    delete next[key];
  }
  return next;
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
