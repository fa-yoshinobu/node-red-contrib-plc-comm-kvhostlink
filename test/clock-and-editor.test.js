"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const protocol = "kvhostlink";
const api = require("../lib/hostlink");

test("clock sample distinguishes WRT acknowledgements from delayed readback", () => {
  const flow = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "flows", "kvhostlink-set-time.json"), "utf8"));
  const byId = id => flow.find(node => node.id === "kvhostlink-clock-" + id);
  const ids = new Set(flow.map(node => node.id));
  assert.equal(ids.size, flow.length);
  for (const node of flow) {
    for (const id of [...(node.wires || []).flat(), ...(node.scope || []), ...[node.z, node.connection].filter(Boolean)]) {
      assert.ok(ids.has(id), `missing flow reference ${id}`);
    }
    if (node.type === "inject") {
      assert.equal(node.once, false);
      assert.equal(node.repeat, "");
      assert.equal(node.crontab, "");
    }
  }
  assert.equal(flow.find(node => node.type === "kvhostlink-connection").host, "127.0.0.1");
  assert.deepEqual(byId("settime").wires[0], [byId("ack-format").id, byId("delay").id]);
  assert.deepEqual(byId("delay").wires[0], [byId("read").id]);
  assert.equal(byId("delay").timeout, "1.5");
  assert.equal(byId("read").addresses, "CM700:U,7");
  assert.deepEqual(byId("read-button").wires[0], [byId("read").id]);

  const now = new Date(2026, 10, 1, 12, 19, 30, 100).getTime();
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const errors = [];
  const compare = payload => vm.runInNewContext("(function(msg,node){" + byId("check").func + "})(msg,node)", {
    msg: {payload}, Date: FixedDate, node: {error: message => errors.push(message)}
  });
  const result = compare([26, 11, 1, 12, 19, 29, 0]).payload;
  assert.equal(result.result, "PASS");
  assert.equal(result.deltaMs, -1100);
  assert.equal(compare([26, 11, 1, 12, 0, 0, 0]).payload.result, "CHECK");
  assert.equal(compare([26, 11, 1, 12, 19, 29, 1]).payload.result, "CHECK");
  assert.equal(compare([]), null);
  assert.match(errors[0], /clock readback/);
});

function client() {
  return new api.HostLinkClient({ host: "127.0.0.1", port: 8501, transport: "tcp", plcProfile: "keyence:kv-8000-xym" });
}

// Run the real editor callback with an initially unpopulated select and delayed profile response.
test("saved PLC profiles survive asynchronous option creation and reopening", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "nodes", protocol + "-connection.html"), "utf8");
  const source = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1];
  let definition, callback, selected, validated;
  const options = new Set([""]);
  const select = {
    val(value) { if (!arguments.length) return selected; selected = options.has(value) ? value : null; return this; },
    trigger(event) { if (event === "change") validated = definition.defaults.plcProfile.validate(selected); return this; },
    find() { return { remove() { options.clear(); options.add(""); } }; }
  };
  const stub = { is() { return false; }, prop() { return this; }, on() { return this; }, val() { return ""; } };
  const $ = (selector) => {
    if (selector === "#node-config-input-plcProfile") return select;
    if (selector !== "<option>") return stub;
    let value;
    return { val(v) { value = v; return this; }, text() { return this; }, appendTo() { options.add(value); return this; } };
  };
  $.getJSON = (_url, cb) => { callback = cb; };
  vm.runInNewContext(source, { RED: { nodes: { registerType(_type, def) { definition = def; } } }, $ });
  const profiles = api.profileDescriptors();
  for (const profile of profiles.filter(p => p.connectable)) {
    options.clear(); options.add(""); selected = null; validated = false;
    definition.oneditprepare.call({ plcProfile: profile.canonicalName });
    callback(profiles);
    assert.equal(selected, profile.canonicalName);
    assert.equal(validated, true, "restored selection must clear the initial validation error");
    // Reopening starts with a fresh select, just as the editor does.
    options.clear(); options.add(""); selected = "";
    definition.oneditprepare.call({ plcProfile: profile.canonicalName });
    callback(profiles);
    assert.equal(selected, profile.canonicalName);
  }
});

test("set-time node forwards explicit input, preserves messages, and reports failures through done", async () => {
  let Constructor;
  const calls = [];
  const c = client();
  c._expectOk = async (body) => { calls.push(body); };
  let connected = false;
  let connection = {
    async connect() { connected = true; },
    getClient() { assert.equal(connected, true, "connect before issuing a clock request"); return c; }
  };
  const RED = { nodes: {
    createNode(node) { const e = new EventEmitter(); node.on = e.on.bind(e); node.emit = e.emit.bind(e); node.status = s => { node.lastStatus = s; }; },
    getNode() { return connection; },
    registerType(type, ctor) { assert.equal(type, protocol + "-set-time"); Constructor = ctor; }
  } };
  require("../nodes/" + protocol + "-set-time")(RED);
  const node = new Constructor({ connection: "c" });
  const invoke = msg => new Promise(resolve => { const sent = []; node.emit("input", msg, m => sent.push(m), error => resolve({ error, sent })); });
  const msg = { payload: [26, 10, 31, 12, 34, 56, 6], topic: "original", custom: true };
  const result = await invoke(msg);
  assert.equal(result.error, undefined);
  assert.equal(result.sent[0], msg);
  assert.equal(msg.topic, "original");
  assert.equal(node.lastStatus.fill, "green");
  assert.equal(calls.length, 1);
  connected = false;
  const sandboxDate = vm.runInNewContext("new Date(2026, 9, 31, 12, 34, 56)");
  assert.equal((await invoke({ payload: sandboxDate })).error, undefined, "Function-node Date must cross the VM boundary");
  assert.deepEqual(calls, ["WRT 26 10 31 12 34 56 6", "WRT 26 10 31 12 34 56 6"]);
  const count = calls.length;
  for (const payload of [undefined, null, 0, "2026-10-31", [], [26, 2, 30, 1, 2, 3, 1], [26, 10, 31, 12, 34, 56, 0], new Date(NaN)]) {
    const failed = await invoke({ payload });
    assert.ok(failed.error);
    assert.equal(failed.sent.length, 0);
    assert.equal(node.lastStatus.fill, "red");
  }
  assert.equal(calls.length, count, "invalid inputs must not send");
  connection.connect = async () => { throw new Error("connect failed"); };
  const connectFailed = await invoke({ payload: new Date(2026, 9, 31) });
  assert.match(connectFailed.error.message, /connect failed/);
  assert.deepEqual(connectFailed.sent, []);
  assert.equal(calls.length, count);
  connection.connect = async () => { connected = true; };
  c.setTime = async () => { throw new Error("transport failure"); };
  const failed = await invoke({ payload: new Date(2026, 9, 31) });
  assert.match(failed.error.message, /transport failure/);
  assert.deepEqual(failed.sent, []);
  connection = undefined;
  const missing = new Constructor({});
  await new Promise(resolve => missing.emit("input", msg, () => assert.fail("unexpected output"), error => { assert.match(error.message, /connection/); resolve(); }));
});


