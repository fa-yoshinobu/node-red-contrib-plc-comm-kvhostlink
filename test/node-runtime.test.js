"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

function createRuntime() {
  const types = new Map();
  const nodes = new Map();
  const RED = {
    nodes: {
      createNode(node, config) {
        const emitter = new EventEmitter();
        node.on = emitter.on.bind(emitter);
        node.emit = emitter.emit.bind(emitter);
        node.status = () => undefined;
        node.send = () => undefined;
        node.id = config.id;
      },
      registerType(name, constructor) { types.set(name, constructor); },
      getNode(id) { return nodes.get(id); },
    },
    util: {
      evaluateNodeProperty(value, type, _node, msg, callback) {
        callback(null, type === "msg" ? msg[value] : value);
      },
    },
  };
  require("../nodes/kvhostlink-read")(RED);
  require("../nodes/kvhostlink-write")(RED);
  return {
    create(name, config) { return new (types.get(name))(config); },
    setNode(id, value) { nodes.set(id, value); },
  };
}

function readConfig(overrides = {}) {
  return {
    id: "read",
    connection: "connection",
    addresses: "DM100:U",
    addressesType: "str",
    outputMode: "object",
    metadataMode: "full",
    errorHandling: "throw",
    outputs: 1,
    ...overrides,
  };
}

function writeConfig(overrides = {}) {
  return {
    id: "write",
    connection: "connection",
    updates: '{"DM100:U":1}',
    updatesType: "str",
    metadataMode: "full",
    errorHandling: "throw",
    outputs: 1,
    ...overrides,
  };
}

function invoke(node, msg) {
  return new Promise((resolve) => {
    const sent = [];
    node.emit("input", msg, (value) => sent.push(value), (error) => resolve({ error, sent }));
  });
}

test("Node-RED HostLink saved-flow contract rejects missing and contradictory mode fields", () => {
  const runtime = createRuntime();
  assert.throws(() => runtime.create("kvhostlink-read", readConfig({ addressesType: undefined })), /addressesType/);
  assert.throws(() => runtime.create("kvhostlink-read", readConfig({ outputMode: "OBJECT" })), /outputMode/);
  assert.throws(() => runtime.create("kvhostlink-read", readConfig({ metadataMode: undefined })), /metadataMode/);
  assert.throws(() => runtime.create("kvhostlink-write", writeConfig({ updatesType: "unknown" })), /updatesType/);
  assert.throws(() => runtime.create("kvhostlink-write", writeConfig({ errorHandling: "output2", outputs: 1 })), /conflicts/);
});

test("Node-RED HostLink runtime overrides never fall back after an invalid property is present", async () => {
  const runtime = createRuntime();
  let connectCalls = 0;
  runtime.setNode("connection", {
    connect: async () => { connectCalls += 1; },
    getClient: () => ({}),
    getProfile: () => ({}),
  });

  const read = runtime.create("kvhostlink-read", readConfig());
  const badRead = await invoke(read, { addresses: null });
  assert.match(badRead.error.message, /msg\.addresses/);

  const write = runtime.create("kvhostlink-write", writeConfig());
  for (const msg of [
    { updates: null },
    { updates: {}, address: "DM1", value: 1, dtype: "U" },
    { value: 1 },
    { dtype: "U" },
    { address: "DM1", value: 1 },
    { address: "DM1:U", dtype: "U", value: 1 },
    { address: "DM1", dtype: "u", value: 1 },
  ]) {
    const result = await invoke(write, msg);
    assert.ok(result.error, JSON.stringify(msg));
  }
  assert.equal(connectCalls, 0);
});

test("Node-RED HostLink explicitly connects before operations and replaces stale library metadata", async () => {
  const runtime = createRuntime();
  let connected = false;
  const client = {
    async readConsecutive() { assert.equal(connected, true); return [7]; },
  };
  runtime.setNode("connection", {
    connect: async () => { connected = true; },
    getClient: () => client,
    getProfile: () => ({ plcProfile: "keyence:kv-x500" }),
  });
  const read = runtime.create("kvhostlink-read", readConfig({ addresses: "DM100:U", outputMode: "value" }));
  const msg = { kvhostlink: { custom: "keep", updates: { stale: true }, operation: "write" } };
  const result = await invoke(read, msg);
  assert.equal(result.error, undefined);
  assert.equal(msg.payload, 7);
  assert.deepEqual(msg.kvhostlink, {
    custom: "keep",
    operation: "read",
    metadataMode: "full",
    itemCount: 1,
    addresses: ["DM100:U"],
    connection: { plcProfile: "keyence:kv-x500" },
  });
});
