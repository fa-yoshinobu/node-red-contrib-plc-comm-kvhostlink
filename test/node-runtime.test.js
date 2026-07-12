"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");

function createRuntime() {
  const types = new Map();
  const nodes = new Map();
  const flowValues = new Map();
  const globalValues = new Map();
  const envValues = new Map();
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
        try {
          if (type === "msg") callback(null, msg[value]);
          else if (type === "flow") callback(null, flowValues.get(String(value)));
          else if (type === "global") callback(null, globalValues.get(String(value)));
          else if (type === "env") callback(null, envValues.get(String(value)));
          else throw new Error(`Unsupported type ${type}`);
        } catch (error) {
          callback(error);
        }
      },
    },
  };
  require("../nodes/kvhostlink-connection")(RED);
  require("../nodes/kvhostlink-read")(RED);
  require("../nodes/kvhostlink-write")(RED);
  return {
    RED,
    create(name, config) { return new (types.get(name))(config); },
    setNode(id, value) { nodes.set(id, value); },
    setFlow(key, value) { flowValues.set(key, value); },
    setGlobal(key, value) { globalValues.set(key, value); },
    setEnv(key, value) { envValues.set(key, value); },
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
  for (const invalidType of [undefined, null, "", false, 0, "STR", "Msg", "unknown", {}, []]) {
    assert.throws(() => runtime.create("kvhostlink-read", readConfig({ addressesType: invalidType })), /addressesType/);
    assert.throws(() => runtime.create("kvhostlink-write", writeConfig({ updatesType: invalidType })), /updatesType/);
  }
  for (const invalidMode of [undefined, null, "", false, 0, "OBJECT", "Value", "unknown", {}, []]) {
    assert.throws(() => runtime.create("kvhostlink-read", readConfig({ outputMode: invalidMode })), /outputMode/);
  }
  for (const invalidMode of [undefined, null, "", false, 0, "FULL", "Minimal", "unknown", {}, []]) {
    assert.throws(() => runtime.create("kvhostlink-read", readConfig({ metadataMode: invalidMode })), /metadataMode/);
    assert.throws(() => runtime.create("kvhostlink-write", writeConfig({ metadataMode: invalidMode })), /metadataMode/);
  }
  assert.throws(() => runtime.create("kvhostlink-write", writeConfig({ errorHandling: "output2", outputs: 1 })), /conflicts/);

  const readHtml = fs.readFileSync(path.join(__dirname, "..", "nodes", "kvhostlink-read.html"), "utf8");
  const writeHtml = fs.readFileSync(path.join(__dirname, "..", "nodes", "kvhostlink-write.html"), "utf8");
  assert.match(readHtml, /addressesType:\s*\{\s*value:\s*"str",\s*required:\s*true\s*\}/);
  assert.match(writeHtml, /updatesType:\s*\{\s*value:\s*"str",\s*required:\s*true\s*\}/);
  assert.match(readHtml, /outputMode:\s*\{\s*value:\s*"object",\s*required:\s*true\s*\}/);
  assert.doesNotMatch(readHtml, /this\.addressesType\s*\|\|\s*"str"/);
  assert.doesNotMatch(writeHtml, /this\.updatesType\s*\|\|\s*"str"/);
  assert.match(readHtml, /metadataMode:\s*\{\s*value:\s*"full",\s*required:\s*true\s*\}/);
  assert.match(writeHtml, /metadataMode:\s*\{\s*value:\s*"full",\s*required:\s*true\s*\}/);
  assert.doesNotMatch(readHtml, /metadataMode\s*\|\|\s*"full"/);
  assert.doesNotMatch(writeHtml, /metadataMode\s*\|\|\s*"full"/);
});

test("Node-RED HostLink evaluates every explicit source type without literal fallback", async () => {
  const runtime = createRuntime();
  let readCalls = 0;
  let writeCalls = 0;
  let connectCalls = 0;
  runtime.setNode("connection", {
    connect: async () => { connectCalls += 1; },
    getClient: () => ({
      async readConsecutive() { readCalls += 1; return [7]; },
      async writeConsecutive() { writeCalls += 1; },
    }),
    getProfile: () => ({ plcProfile: "keyence:kv-x500" }),
  });
  runtime.setFlow("read-source", "DM100:U");
  runtime.setGlobal("read-source", ["DM100:U"]);
  runtime.setEnv("read-source", "DM100:U");
  runtime.setFlow("write-source", { "DM100:U": 1 });
  runtime.setGlobal("write-source", { "DM100:U": 2 });
  runtime.setEnv("write-source", { "DM100:U": 3 });
  const cases = [
    { type: "str", readValue: "DM100:U", writeValue: "{\"DM100:U\":1}", msg: {} },
    { type: "msg", readValue: "sourceAddresses", writeValue: "sourceUpdates", msg: { sourceAddresses: "DM100:U", sourceUpdates: { "DM100:U": 1 } } },
    { type: "flow", readValue: "read-source", writeValue: "write-source", msg: {} },
    { type: "global", readValue: "read-source", writeValue: "write-source", msg: {} },
    { type: "env", readValue: "read-source", writeValue: "write-source", msg: {} },
  ];
  for (const sourceCase of cases) {
    const read = runtime.create("kvhostlink-read", readConfig({ addresses: sourceCase.readValue, addressesType: sourceCase.type }));
    const write = runtime.create("kvhostlink-write", writeConfig({ updates: sourceCase.writeValue, updatesType: sourceCase.type }));
    assert.equal((await invoke(read, structuredClone(sourceCase.msg))).error, undefined);
    assert.equal((await invoke(write, structuredClone(sourceCase.msg))).error, undefined);
  }
  assert.equal(readCalls, 5);
  assert.equal(writeCalls, 5);
  assert.equal(connectCalls, 10);

  const missingRead = runtime.create("kvhostlink-read", readConfig({ addresses: "missing", addressesType: "msg" }));
  const missingWrite = runtime.create("kvhostlink-write", writeConfig({ updates: "missing", updatesType: "msg" }));
  assert.ok((await invoke(missingRead, {})).error instanceof Error);
  assert.ok((await invoke(missingWrite, {})).error instanceof Error);
  assert.equal(readCalls, 5);
  assert.equal(writeCalls, 5);
  assert.equal(connectCalls, 10);

  const evaluatorRead = runtime.create("kvhostlink-read", readConfig({ addresses: "sourceAddresses", addressesType: "msg" }));
  delete runtime.RED.util;
  const evaluatorResult = await invoke(evaluatorRead, { sourceAddresses: "DM100:U" });
  assert.match(evaluatorResult.error.message, /property evaluator is unavailable/);
  assert.equal(connectCalls, 10);
});

test("Node-RED HostLink read output modes have fixed payload types", async () => {
  const runtime = createRuntime();
  let connectCalls = 0;
  let readCalls = 0;
  runtime.setNode("connection", {
    connect: async () => { connectCalls += 1; },
    getClient: () => ({
      async readConsecutive(_device, count) {
        readCalls += 1;
        return Array.from({ length: count }, (_, index) => index + 7);
      },
    }),
    getProfile: () => ({ plcProfile: "keyence:kv-x500" }),
  });
  const cases = [
    { mode: "object", addresses: ["DM100:U"], check: (payload) => assert.deepEqual(payload, { "DM100:U": 7 }) },
    { mode: "object", addresses: ["DM100:U", "DM101:U"], check: (payload) => assert.deepEqual(payload, { "DM100:U": 7, "DM101:U": 8 }) },
    { mode: "array", addresses: ["DM100:U"], check: (payload) => assert.deepEqual(payload, [7]) },
    { mode: "array", addresses: ["DM100:U", "DM101:U"], check: (payload) => assert.deepEqual(payload, [7, 8]) },
    { mode: "value", addresses: ["DM100:U"], check: (payload) => assert.equal(payload, 7) },
  ];
  for (const outputCase of cases) {
    const node = runtime.create("kvhostlink-read", readConfig({ addresses: "addresses", addressesType: "msg", outputMode: outputCase.mode }));
    const msg = { addresses: outputCase.addresses };
    const result = await invoke(node, msg);
    assert.equal(result.error, undefined);
    outputCase.check(msg.payload);
  }
  const callsBeforeError = { connectCalls, readCalls };
  const valueNode = runtime.create("kvhostlink-read", readConfig({ addresses: "addresses", addressesType: "msg", outputMode: "value" }));
  const multipleResult = await invoke(valueNode, { addresses: ["DM100:U", "DM101:U"] });
  const emptyResult = await invoke(valueNode, { addresses: [] });
  assert.match(multipleResult.error.message, /exactly one address/);
  assert.match(emptyResult.error.message, /must not be empty/);
  assert.equal(multipleResult.sent.length, 0);
  assert.equal(emptyResult.sent.length, 0);
  assert.deepEqual({ connectCalls, readCalls }, callsBeforeError);
});

test("Node-RED HostLink metadata modes replace only current owned fields", async () => {
  const runtime = createRuntime();
  runtime.setNode("connection", {
    connect: async () => undefined,
    getClient: () => ({
      async readConsecutive() { return [7]; },
      async writeConsecutive() {},
    }),
    getProfile: () => ({ plcProfile: "keyence:kv-x500", host: "127.0.0.1" }),
  });
  const fullRead = runtime.create("kvhostlink-read", readConfig({ id: "read-metadata-full", metadataMode: "full" }));
  const fullWrite = runtime.create("kvhostlink-write", writeConfig({ id: "write-metadata-full", metadataMode: "full" }));
  const msg = {
    kvhostlink: {
      custom: "keep",
      operation: "write",
      updates: { stale: true },
      addresses: ["STALE"],
      connection: { stale: true },
      itemCount: 99,
      metadataMode: "minimal",
    },
  };
  assert.equal((await invoke(fullRead, msg)).error, undefined);
  assert.equal(msg.kvhostlink.custom, "keep");
  assert.equal(msg.kvhostlink.operation, "read");
  assert.deepEqual(msg.kvhostlink.addresses, ["DM100:U"]);
  assert.equal(Object.prototype.hasOwnProperty.call(msg.kvhostlink, "updates"), false);
  assert.equal(msg.kvhostlink.itemCount, 1);
  assert.equal(msg.kvhostlink.metadataMode, "full");

  assert.equal((await invoke(fullWrite, msg)).error, undefined);
  assert.equal(msg.kvhostlink.custom, "keep");
  assert.equal(msg.kvhostlink.operation, "write");
  assert.deepEqual(msg.kvhostlink.updates, { "DM100:U": 1 });
  assert.equal(Object.prototype.hasOwnProperty.call(msg.kvhostlink, "addresses"), false);
  assert.equal(msg.kvhostlink.itemCount, 1);
  assert.equal(msg.kvhostlink.metadataMode, "full");

  const minimalRead = runtime.create("kvhostlink-read", readConfig({ id: "read-metadata-minimal", metadataMode: "minimal" }));
  assert.equal((await invoke(minimalRead, msg)).error, undefined);
  assert.deepEqual(msg.kvhostlink, {
    custom: "keep",
    operation: "read",
    itemCount: 1,
    metadataMode: "minimal",
  });

  const offRead = runtime.create("kvhostlink-read", readConfig({ id: "read-metadata-off", metadataMode: "off" }));
  const existing = { custom: "unchanged", operation: "old", updates: { stale: true } };
  const offMsg = { kvhostlink: existing };
  assert.equal((await invoke(offRead, offMsg)).error, undefined);
  assert.equal(offMsg.kvhostlink, existing);
  assert.deepEqual(offMsg.kvhostlink, { custom: "unchanged", operation: "old", updates: { stale: true } });
});

test("Node-RED HostLink error modes and output counts define one exact route", async () => {
  const runtime = createRuntime();
  const state = { fail: false };
  runtime.setNode("connection", {
    connect: async () => {
      if (state.fail) throw new Error("transport failed");
    },
    getClient: () => ({
      async readConsecutive() { return [7]; },
      async writeConsecutive() {},
    }),
    getProfile: () => ({ plcProfile: "keyence:kv-x500" }),
  });

  for (const invalidMode of [undefined, null, "", false, 0, "THROW", "Msg", "unknown", {}, []]) {
    assert.throws(() => runtime.create("kvhostlink-read", readConfig({ errorHandling: invalidMode })), /errorHandling/);
    assert.throws(() => runtime.create("kvhostlink-write", writeConfig({ errorHandling: invalidMode })), /errorHandling/);
  }
  for (const [mode, outputs] of [["throw", 1], ["msg", 1], ["output2", 2]]) {
    const readWithoutOutputs = readConfig({ errorHandling: mode });
    const writeWithoutOutputs = writeConfig({ errorHandling: mode });
    delete readWithoutOutputs.outputs;
    delete writeWithoutOutputs.outputs;
    assert.equal(runtime.create("kvhostlink-read", readWithoutOutputs).outputs, outputs);
    assert.equal(runtime.create("kvhostlink-write", writeWithoutOutputs).outputs, outputs);
    for (const invalidOutputs of [null, "", false, true, 0, "1", "2", outputs === 1 ? 2 : 1, {}, []]) {
      assert.throws(
        () => runtime.create("kvhostlink-read", readConfig({ errorHandling: mode, outputs: invalidOutputs })),
        /conflicts/,
      );
      assert.throws(
        () => runtime.create("kvhostlink-write", writeConfig({ errorHandling: mode, outputs: invalidOutputs })),
        /conflicts/,
      );
    }
    const read = runtime.create("kvhostlink-read", readConfig({ id: `read-error-${mode}`, errorHandling: mode, outputs }));
    const write = runtime.create("kvhostlink-write", writeConfig({ id: `write-error-${mode}`, errorHandling: mode, outputs }));
    state.fail = false;
    for (const node of [read, write]) {
      const success = await invoke(node, {});
      assert.equal(success.error, undefined);
      assert.equal(success.sent.length, 1);
      assert.equal(Array.isArray(success.sent[0]), false);
    }
    state.fail = true;
    for (const node of [read, write]) {
      const failedMsg = {};
      const failed = await invoke(node, failedMsg);
      if (mode === "throw") {
        assert.ok(failed.error instanceof Error);
        assert.equal(failed.sent.length, 0);
      } else if (mode === "msg") {
        assert.equal(failed.error, undefined);
        assert.equal(failed.sent.length, 1);
        assert.equal(failed.sent[0], failedMsg);
        assert.ok(failedMsg.error instanceof Error);
      } else {
        assert.equal(failed.error, undefined);
        assert.equal(failed.sent.length, 1);
        assert.equal(Array.isArray(failed.sent[0]), true);
        assert.equal(failed.sent[0][0], null);
        assert.ok(failed.sent[0][1].error instanceof Error);
      }
    }
  }

  const readHtml = fs.readFileSync(path.join(__dirname, "..", "nodes", "kvhostlink-read.html"), "utf8");
  const writeHtml = fs.readFileSync(path.join(__dirname, "..", "nodes", "kvhostlink-write.html"), "utf8");
  for (const html of [readHtml, writeHtml]) {
    assert.match(html, /errorHandling:\s*\{\s*value:\s*"throw",\s*required:\s*true\s*\}/);
    assert.match(html, /this\.outputs\s*=\s*\$\("#node-input-errorHandling"\)\.val\(\)\s*===\s*"output2"\s*\?\s*2\s*:\s*1/);
    assert.doesNotMatch(html, /errorHandling\s*\|\|\s*"throw"/);
  }
});

test("Node-RED HostLink runtime overrides never fall back after an invalid property is present", async () => {
  const runtime = createRuntime();
  let connectCalls = 0;
  let readCalls = 0;
  let writeCalls = 0;
  runtime.setNode("connection", {
    connect: async () => { connectCalls += 1; },
    getClient: () => ({
      async readConsecutive() { readCalls += 1; return [7]; },
      async writeConsecutive() { writeCalls += 1; },
    }),
    getProfile: () => ({ plcProfile: "keyence:kv-x500" }),
  });

  const read = runtime.create("kvhostlink-read", readConfig());
  for (const addresses of [undefined, null, "", " ", false, 0, {}, [], [null], [""]]) {
    const result = await invoke(read, { addresses });
    assert.ok(result.error instanceof Error, `invalid msg.addresses ${String(addresses)}`);
    assert.equal(result.sent.length, 0);
  }

  const write = runtime.create("kvhostlink-write", writeConfig());
  for (const updates of [undefined, null, "", " ", false, 0, [], {}, "{bad", "{}"]) {
    const result = await invoke(write, { updates });
    assert.ok(result.error instanceof Error, `invalid msg.updates ${String(updates)}`);
    assert.equal(result.sent.length, 0);
  }
  for (const address of [undefined, null, "", " ", false, 0, {}, []]) {
    const result = await invoke(write, { address, value: 1, dtype: "U" });
    assert.ok(result.error instanceof Error, `invalid msg.address ${String(address)}`);
    assert.equal(result.sent.length, 0);
  }
  for (const msg of [
    { address: "DM1", dtype: "U" },
    { updates: { "DM1:U": 1 }, address: "DM2", value: 2, dtype: "U" },
    { updates: { "DM1:U": 1 }, value: 2 },
    { updates: { "DM1:U": 1 }, dtype: "U" },
    { value: 1 },
    { dtype: "U" },
    { value: 1, dtype: "U" },
  ]) {
    const result = await invoke(write, msg);
    assert.ok(result.error instanceof Error, JSON.stringify(msg));
    assert.equal(result.sent.length, 0);
  }
  assert.equal(connectCalls, 0);
  assert.equal(readCalls, 0);
  assert.equal(writeCalls, 0);

  assert.equal((await invoke(read, { addresses: ["DM100:U"] })).error, undefined);
  assert.equal((await invoke(write, { updates: { "DM100:U": 1 } })).error, undefined);
  assert.equal((await invoke(write, { address: "DM101", value: 2, dtype: "U" })).error, undefined);
  assert.equal(connectCalls, 3);
  assert.equal(readCalls, 1);
  assert.equal(writeCalls, 2);
});

test("Node-RED HostLink single write requires one exact writable dtype source", async () => {
  const runtime = createRuntime();
  let connectCalls = 0;
  const writes = [];
  runtime.setNode("connection", {
    connect: async () => { connectCalls += 1; },
    getClient: () => ({
      async write(...args) { writes.push(["write", ...args]); },
      async writeConsecutive(...args) { writes.push(["writeConsecutive", ...args]); },
      async writeBitInWord(...args) { writes.push(["writeBitInWord", ...args]); },
    }),
    getProfile: () => ({ plcProfile: "keyence:kv-x500" }),
  });
  const node = runtime.create("kvhostlink-write", writeConfig({ id: "write-single-dtype" }));
  const valid = [
    { address: "R000", dtype: "BIT", value: true },
    { address: "DM100", dtype: "U", value: 65535 },
    { address: "DM101", dtype: "S", value: -32768 },
    { address: "DM102", dtype: "D", value: 0xffffffff },
    { address: "DM104", dtype: "L", value: -2147483648 },
    { address: "DM106", dtype: "F", value: 1.5 },
    { address: "DM108", dtype: "H", value: "FFFF" },
    { address: "DM110:U", value: 1 },
    { address: "DM111.3", value: true },
  ];
  for (const item of valid) {
    const msg = { address: item.address, value: item.value };
    if (Object.prototype.hasOwnProperty.call(item, "dtype")) msg.dtype = item.dtype;
    const result = await invoke(node, msg);
    assert.equal(result.error, undefined, JSON.stringify(item));
  }
  assert.equal(connectCalls, valid.length);
  assert.equal(writes.length, valid.length);

  const connectsBeforeInvalid = connectCalls;
  const writesBeforeInvalid = writes.length;
  for (const dtype of [undefined, null, "", " ", false, true, 0, "u", "I", "COMMENT", "unknown", {}, []]) {
    const result = await invoke(node, { address: "DM200", value: 1, dtype });
    assert.ok(result.error instanceof Error, `invalid bare dtype ${String(dtype)}`);
  }
  assert.ok((await invoke(node, { address: "DM200", value: 1 })).error instanceof Error);
  for (const address of ["DM200:U", "DM200.3"]) {
    for (const dtype of [undefined, null, "", false, "U", "D"]) {
      const result = await invoke(node, { address, value: 1, dtype });
      assert.match(result.error.message, /exactly once/);
    }
  }
  assert.equal(connectCalls, connectsBeforeInvalid);
  assert.equal(writes.length, writesBeforeInvalid);
});

test("Node-RED HostLink name is optional display-only state", async () => {
  const { normalizeDisplayName } = require("../nodes/runtime-validation");
  for (const value of [undefined, null, "", "   ", false, 0, {}, []]) {
    assert.equal(normalizeDisplayName(value), "", `display name ${String(value)}`);
  }
  assert.equal(normalizeDisplayName("  Line A  "), "Line A");

  const runtime = createRuntime();
  const connectionBase = {
    host: "192.0.2.10",
    port: 8501,
    transport: "tcp",
    plcProfile: "keyence:kv-x500",
  };
  const connectionWithoutName = runtime.create("kvhostlink-connection", {
    ...connectionBase,
    id: "connection-a",
  });
  const connectionWithWhitespace = runtime.create("kvhostlink-connection", {
    ...connectionBase,
    id: "connection-b",
    name: "   ",
  });
  const connectionWithInvalidName = runtime.create("kvhostlink-connection", {
    ...connectionBase,
    id: "connection-c",
    name: { host: "must-not-be-used" },
  });
  assert.equal(connectionWithoutName.name, "");
  assert.equal(connectionWithWhitespace.name, "");
  assert.equal(connectionWithInvalidName.name, "");
  assert.equal(connectionWithoutName.id, "connection-a");
  assert.equal(connectionWithWhitespace.id, "connection-b");
  assert.equal(connectionWithInvalidName.id, "connection-c");
  assert.deepEqual(connectionWithoutName.getProfile(), connectionWithWhitespace.getProfile());
  assert.deepEqual(connectionWithoutName.getProfile(), connectionWithInvalidName.getProfile());

  const calls = [];
  const connection = {
    connect: async () => undefined,
    getClient: () => ({
      async readConsecutive(...args) { calls.push(["read", ...args]); return [7]; },
      async writeConsecutive(...args) { calls.push(["write", ...args]); },
    }),
    getProfile: () => ({ plcProfile: "keyence:kv-x500" }),
  };
  runtime.setNode("shared-connection", connection);
  const readA = runtime.create("kvhostlink-read", readConfig({ id: "read-a", connection: "shared-connection" }));
  const readB = runtime.create("kvhostlink-read", readConfig({ id: "read-b", connection: "shared-connection", name: " duplicate " }));
  const writeA = runtime.create("kvhostlink-write", writeConfig({ id: "write-a", connection: "shared-connection", name: false }));
  const writeB = runtime.create("kvhostlink-write", writeConfig({ id: "write-b", connection: "shared-connection", name: "duplicate" }));
  assert.equal(readA.name, "");
  assert.equal(readB.name, "duplicate");
  assert.equal(writeA.name, "");
  assert.equal(writeB.name, "duplicate");
  assert.equal(readA.connection, connection);
  assert.equal(readB.connection, connection);
  assert.equal(writeA.connection, connection);
  assert.equal(writeB.connection, connection);
  assert.deepEqual([readA.id, readB.id, writeA.id, writeB.id], ["read-a", "read-b", "write-a", "write-b"]);

  const readMessageA = {};
  const readMessageB = {};
  const writeMessageA = {};
  const writeMessageB = {};
  assert.equal((await invoke(readA, readMessageA)).error, undefined);
  assert.equal((await invoke(readB, readMessageB)).error, undefined);
  assert.equal((await invoke(writeA, writeMessageA)).error, undefined);
  assert.equal((await invoke(writeB, writeMessageB)).error, undefined);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[2], calls[3]);
  for (const message of [readMessageA, readMessageB, writeMessageA, writeMessageB]) {
    assert.equal(JSON.stringify(message).includes("duplicate"), false);
  }

  for (const file of ["kvhostlink-connection.html", "kvhostlink-read.html", "kvhostlink-write.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", "nodes", file), "utf8");
    assert.match(html, /name:\s*\{\s*value:\s*""\s*\}/);
    assert.doesNotMatch(html, /name:\s*\{[^}]*required:\s*true/);
  }
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
