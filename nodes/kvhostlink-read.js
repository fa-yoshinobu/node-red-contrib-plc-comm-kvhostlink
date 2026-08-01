"use strict";

const { normalizeAddress, normalizeAddressList, parseAddress, readNamed } = require("../lib/hostlink");
const { hasOwn, normalizeDisplayName, requireEnum, requireSourceType, validateOutputs } = require("./runtime-validation");

module.exports = function registerKvHostLinkRead(RED) {
  function KvHostLinkReadNode(config) {
    RED.nodes.createNode(this, config);

    this.name = normalizeDisplayName(config.name);
    this.connection = RED.nodes.getNode(config.connection);
    this.addresses = config.addresses || "";
    this.addressesType = requireSourceType(config, "addressesType");
    this.outputMode = requireEnum(config, "outputMode", ["object", "array", "value"]);
    const commentConfig = normalizeCommentConfig(config);
    this.commentOutput = commentConfig.commentOutput;
    this.commentEncoding = commentConfig.commentEncoding;
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

        this.status({ fill: "blue", shape: "dot", text: "reading" });
        const addresses = await resolveAddresses(RED, this, msg);
        if (addresses.length === 0) {
          throw new Error("No KV Host Link addresses were provided");
        }
        if (this.outputMode === "value" && addresses.length !== 1) {
          throw new Error("outputMode=value requires exactly one address");
        }
        const commentOptions = resolveCommentOptions(addresses, this.commentOutput, this.commentEncoding);

        await this.connection.connect();
        const client = this.connection.getClient();
        const snapshot = await readNamed(client, addresses, commentOptions);
        const profile = this.connection.getProfile();
        msg.payload = formatPayload(snapshot, addresses, this.outputMode);
        applyMetadata(msg, this.metadataMode, {
          addresses,
          connection: profile,
          itemCount: addresses.length,
        });
        this.status({ fill: "green", shape: "dot", text: `${addresses.length} item(s)` });
        send(msg);
        done();
      } catch (error) {
        fail(this, msg, send, done, error);
      }
    });
  }

  RED.nodes.registerType("kvhostlink-read", KvHostLinkReadNode);
};

function normalizeCommentConfig(config) {
  const commentOutput = config.commentOutput === undefined ? "" : config.commentOutput;
  const commentEncoding = config.commentEncoding === undefined ? "" : config.commentEncoding;
  if (typeof commentOutput !== "string" || !["", "text", "buffer"].includes(commentOutput)) {
    throw new Error("commentOutput must be empty or one of: text, buffer");
  }
  if (typeof commentEncoding !== "string" || !["", "utf8", "cp932"].includes(commentEncoding)) {
    throw new Error("commentEncoding must be empty or one of: utf8, cp932");
  }
  if (commentOutput === "text" && !commentEncoding) {
    throw new Error("commentEncoding is required when commentOutput is text");
  }
  if (commentOutput !== "text" && commentEncoding) {
    throw new Error("commentEncoding must be empty unless commentOutput is text");
  }
  return Object.freeze({ commentOutput, commentEncoding });
}

function resolveCommentOptions(addresses, commentOutput, commentEncoding) {
  const hasComment = addresses.some((address) => parseAddress(address).dtype === "COMMENT");
  if (!hasComment) return undefined;
  if (!commentOutput) {
    throw new Error("COMMENT reads require an explicit commentOutput of text or buffer");
  }
  if (commentOutput === "buffer") return Object.freeze({ commentOutput: "buffer" });
  return Object.freeze({ commentOutput: "text", commentEncoding });
}

async function resolveAddresses(RED, node, msg) {
  if (hasOwn(msg, "addresses")) {
    if (!Array.isArray(msg.addresses) && typeof msg.addresses !== "string") {
      throw new Error("msg.addresses must be a non-empty string or array");
    }
    if ((typeof msg.addresses === "string" && !msg.addresses.trim())
        || (Array.isArray(msg.addresses) && msg.addresses.length === 0)) {
      throw new Error("msg.addresses must not be empty");
    }
    if (Array.isArray(msg.addresses)
        && msg.addresses.some((address) => typeof address !== "string" || !address.trim())) {
      throw new Error("msg.addresses must contain only non-empty address strings");
    }
    const addresses = normalizeAddressList(msg.addresses);
    if (addresses.length === 0) {
      throw new Error("msg.addresses must not be empty");
    }
    return addresses.map((address) => normalizeAddress(address));
  }
  const configured = await evaluateConfiguredValue(RED, node, msg, node.addresses, node.addressesType, "addresses");
  return normalizeAddressList(configured).map((address) => normalizeAddress(address));
}

function evaluateConfiguredValue(RED, node, msg, value, type, label) {
  if (type === "str") {
    return Promise.resolve(value);
  }
  if (!RED.util || typeof RED.util.evaluateNodeProperty !== "function") {
    return Promise.reject(new Error(`Unable to evaluate ${label}: Node-RED property evaluator is unavailable`));
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

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function applyMetadata(msg, mode, metadata) {
  if (mode === "off") {
    return;
  }
  if (mode === "minimal") {
    const next = clearOwnedMetadata(msg.kvhostlink);
    next.operation = "read";
    next.itemCount = metadata.itemCount;
    next.metadataMode = "minimal";
    msg.kvhostlink = next;
    return;
  }
  msg.kvhostlink = {
    ...clearOwnedMetadata(msg.kvhostlink),
    operation: "read",
    metadataMode: "full",
    itemCount: metadata.itemCount,
    addresses: metadata.addresses,
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

function formatPayload(snapshot, addresses, outputMode) {
  if (outputMode === "array") {
    return addresses.map((address) => snapshot[address]);
  }
  if (outputMode === "value") {
    return snapshot[addresses[0]];
  }
  return snapshot;
}
