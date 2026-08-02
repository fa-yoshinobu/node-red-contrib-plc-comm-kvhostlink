"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dgram = require("node:dgram");
const { EventEmitter } = require("node:events");
const canonicalKvProfiles = require("./fixtures/kv_device_ranges.json");

const {
  HostLinkClient,
  HostLinkCanceledError,
  HostLinkClosedError,
  HostLinkConnectionError,
  HostLinkOperationOutcomeUnknownError,
  HostLinkTimeoutError,
  buildFrame,
  decodeCommentBytes,
  decodeCommentResponse,
  decodeResponse,
  deviceToString,
  splitDataTokens,
  parseDevice,
  PLC_PROFILES,
  displayName,
  normalizePlcProfile,
  profileDescriptors,
} = require("../lib/hostlink");

const TEST_PLC_PROFILE = "keyence:kv-x500";

function createTestClient(options = {}) {
  return new HostLinkClient({ host: "127.0.0.1", port: 8501, transport: "tcp", plcProfile: TEST_PLC_PROFILE, ...options });
}

function createFrameRecorder(responseForCommand = () => "OK\r") {
  const client = createTestClient();
  const frames = [];

  client._exchange = async (payload) => {
    const frame = payload.toString("ascii");
    frames.push(frame);
    return Buffer.from(responseForCommand(frame.replace(/\r$/, "")), "ascii");
  };

  return { client, frames };
}

test("parseDevice handles decimal and hex devices", () => {
  assert.deepEqual(parseDevice("DM100"), { deviceType: "DM", number: 100, suffix: "" });
  assert.deepEqual(parseDevice("B1F"), { deviceType: "B", number: 31, suffix: "" });
  assert.equal(deviceToString({ deviceType: "B", number: 31, suffix: "" }), "B1F");
  assert.deepEqual(parseDevice("X390"), { deviceType: "X", number: 39 * 16, suffix: "" });
  assert.deepEqual(parseDevice("X400"), { deviceType: "X", number: 40 * 16, suffix: "" });
  assert.equal(deviceToString({ deviceType: "X", number: 39 * 16 + 15, suffix: "" }), "X39F");
  assert.equal(deviceToString({ deviceType: "X", number: 40 * 16, suffix: "" }), "X400");
  assert.equal(parseDevice("Y1999F").number, 1999 * 16 + 15);
  assert.equal(parseDevice("M63999").number, 63999);
  assert.equal(parseDevice("M64000").number, 64000);
  assert.equal(parseDevice("Z0").number, 0);
  assert.equal(deviceToString(parseDevice("R1")), "R001");
  assert.equal(deviceToString(parseDevice("CR0")), "CR000");
  assert.throws(() => parseDevice("DM12A"));
  assert.throws(() => parseDevice("R016"));
  assert.throws(() => parseDevice("X3F0"));
  assert.throws(() => parseDevice("Y19A0"));
  assert.throws(() => parseDevice("100"));
});

test("PLC profile input accepts canonical names only", () => {
  assert.deepEqual(PLC_PROFILES, [
    "keyence:kv-nano",
    "keyence:kv-nano-xym",
    "keyence:kv-3000",
    "keyence:kv-3000-xym",
    "keyence:kv-5000",
    "keyence:kv-5000-xym",
    "keyence:kv-7000",
    "keyence:kv-7000-xym",
    "keyence:kv-8000",
    "keyence:kv-8000-xym",
    "keyence:kv-x500",
    "keyence:kv-x500-xym",
  ]);
  assert.equal(normalizePlcProfile("keyence:kv-x500"), "keyence:kv-x500");
  assert.throws(() => normalizePlcProfile(" keyence:kv-x500 "), /Unsupported PLC profile/);
  assert.throws(() => normalizePlcProfile({ toString: () => "keyence:kv-x500" }), /Unsupported PLC profile/);
  assert.throws(() => normalizePlcProfile("KEYENCE:KV-X500"), /Unsupported PLC profile/);
  assert.throws(() => normalizePlcProfile("KV-X500"), /Unsupported PLC profile/);
});

test("PLC profile list matches canonical HostLink fixture", () => {
  assert.deepEqual(PLC_PROFILES, Object.keys(canonicalKvProfiles.profiles));
  for (const [profileId, profile] of Object.entries(canonicalKvProfiles.profiles)) {
    assert.equal(typeof profile.display_name, "string", profileId);
    assert.notEqual(profile.display_name.trim(), "", profileId);
    assert.equal(displayName(profileId), profile.display_name);
  }
});

test("profile descriptors match canonical HostLink profile metadata", () => {
  const descriptors = profileDescriptors();
  assert.deepEqual(
    descriptors.map((descriptor) => descriptor.canonicalName),
    Object.keys(canonicalKvProfiles.profiles),
  );
  for (const descriptor of descriptors) {
    const profile = canonicalKvProfiles.profiles[descriptor.canonicalName];
    assert.equal(descriptor.displayName, profile.display_name);
    assert.equal(descriptor.connectable, true);
    assert.equal(descriptor.baseProfile, profile.base_profile || null);
  }
});

test("Node-RED editor shows human-readable PLC profile labels but keeps canonical values", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "nodes", "kvhostlink-connection.html"), "utf8");
  assert.match(html, /getJSON\("plc-comm\/kvhostlink\/profiles"/);
  assert.match(html, /\.filter\(function \(profile\) \{ return profile\.connectable; \}\)/);
  assert.match(html, /\.val\(profile\.canonicalName\)/);
  assert.match(html, /\.text\(profile\.displayName\)/);
});

test("HostLinkClient requires port and transport and rejects invalid ports", () => {
  assert.throws(
    () => new HostLinkClient({ host: "127.0.0.1", transport: "tcp", plcProfile: TEST_PLC_PROFILE }),
    /port/
  );
  assert.throws(
    () => new HostLinkClient({ host: "127.0.0.1", port: 8501, plcProfile: TEST_PLC_PROFILE }),
    /transport/
  );
  assert.equal(createTestClient().port, 8501);
  assert.equal(createTestClient({ port: 8502 }).port, 8502);

  for (const port of [undefined, null, "", " ", "8502", false, true, 0, -1, "abc", "1e3", 65536, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => createTestClient({ port }),
      /port (is required|out of range)/
    );
  }
  assert.throws(() => createTestClient({ host: "[127.0.0.1]" }), /IPv4 address without brackets/);
});

test("HostLinkClient validates timeout and requires PLC profile metadata", () => {
  assert.throws(
    () => new HostLinkClient({ host: "127.0.0.1", port: 8501, transport: "tcp" }),
    /plcProfile is required/
  );
  assert.equal(createTestClient().timeout, 3000);
  assert.equal(createTestClient({ timeout: 2500 }).timeout, 2500);
  assert.equal(createTestClient({ plcProfile: "keyence:kv-5000" }).plcProfile, "keyence:kv-5000");
  assert.throws(() => createTestClient({ plcProfile: " keyence:kv-5000 " }), /Unsupported PLC profile/);

  for (const timeout of ["", " ", "2500", 0, -1, "abc", Number.POSITIVE_INFINITY, 1.5, true]) {
    assert.throws(
      () => createTestClient({ timeout }),
      /timeout/
    );
  }
  assert.throws(
    () => createTestClient({ plcProfile: "KV-X500" }),
    /Unsupported PLC profile/
  );
});

test("HostLinkClient removes public buffer/trace overrides and requires an explicit connection", async () => {
  assert.throws(() => createTestClient({ bufferSize: 1024 }), /no longer a public option/);
  assert.throws(() => createTestClient({ traceHook: () => undefined }), /not a public runtime option/);
  const client = createTestClient();
  assert.deepEqual(client.trafficStats(), { requestCount: 0, txBytes: 0, rxBytes: 0 });
  await assert.rejects(() => client.checkErrorNo(), /not connected.*connect/i);
  assert.deepEqual(client.trafficStats(), { requestCount: 0, txBytes: 0, rxBytes: 0 });
  assert.equal(client._socket, null);
  const events = [];
  const traced = createTestClient({ _maintainerTraceHook: (event) => events.push(event) });
  const tracedSource = Buffer.from("ER\r", "ascii");
  traced._emitTrace("send", tracedSource);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "send");
  events[0].data[0] = 0x58;
  assert.deepEqual(tracedSource, Buffer.from("ER\r", "ascii"));
  tracedSource[1] = 0x59;
  assert.deepEqual(events[0].data, Buffer.from("XR\r", "ascii"));
  assert.doesNotThrow(() => {
    createTestClient({ _maintainerTraceHook: () => { throw new Error("diagnostic failure"); } })
      ._emitTrace("receive", Buffer.from("OK", "ascii"));
  });
});

test("concurrent connect calls share one transport creation", async () => {
  const client = createTestClient();
  let calls = 0;
  const socket = { once() {}, destroy() {} };
  client._connectTcp = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    client._socket = socket;
  };

  await Promise.all([client.connect(), client.connect(), client.connect()]);
  assert.equal(calls, 1);
  assert.equal(client._socket, socket);
});

test("an old TCP write callback cannot destroy or feed a replacement connection", async () => {
  class FakeSocket extends EventEmitter {
    constructor() {
      super();
      this.destroyed = false;
      this.writeCallback = null;
    }

    write(_payload, callback) {
      this.writeCallback = callback;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      setImmediate(() => this.emit("close"));
    }
  }

  const client = createTestClient();
  const oldSocket = new FakeSocket();
  client._socket = oldSocket;
  const request = client.sendRaw("?K");
  const requestRejected = assert.rejects(request, HostLinkOperationOutcomeUnknownError);
  await Promise.resolve();
  assert.equal(typeof oldSocket.writeCallback, "function");

  const closing = client.close();
  const newSocket = new FakeSocket();
  client._socket = newSocket;
  client._handleTcpData(Buffer.from("STALE\r", "ascii"), oldSocket);
  oldSocket.writeCallback(new Error("old write failed"));

  await requestRejected;
  await closing;
  assert.equal(newSocket.destroyed, false);
  assert.equal(client._socket, newSocket);
  assert.equal(client._receiveBuffer.length, 0);

  const successClient = createTestClient();
  const supersededSocket = new FakeSocket();
  const currentSocket = new FakeSocket();
  successClient._socket = supersededSocket;
  const supersededRequest = successClient.sendRaw("?K");
  await Promise.resolve();
  successClient._socket = currentSocket;
  supersededSocket.writeCallback(null);

  await assert.rejects(() => supersededRequest, HostLinkOperationOutcomeUnknownError);
  assert.equal(successClient._socket, currentSocket);
  assert.equal(currentSocket.destroyed, false);
  assert.deepEqual(successClient.trafficStats(), { requestCount: 0, txBytes: 0, rxBytes: 0 });
});

test("sendRaw returns undecoded response bytes without terminators", async () => {
  const client = createTestClient();
  const transportBuffer = Buffer.from("E1\r\n", "ascii");
  client._exchange = async () => transportBuffer;
  const raw = await client.sendRaw("?E");
  assert.equal(Buffer.isBuffer(raw), true);
  assert.deepEqual(raw, Buffer.from("E1", "ascii"));
  raw[0] = 0x58;
  assert.deepEqual(transportBuffer, Buffer.from("E1\r\n", "ascii"));
});

test("TCP response cap accepts the boundary and discards one-byte overflow state", async () => {
  const atLimit = createTestClient({ timeout: 100 });
  atLimit._socket = { destroyed: false, destroy() { this.destroyed = true; } };
  const boundary = atLimit._readTcpLine();
  atLimit._handleTcpData(Buffer.alloc(32000, 0x41));
  atLimit._handleTcpData(Buffer.concat([Buffer.alloc(33536, 0x41), Buffer.from("\r", "ascii")]));
  assert.equal((await boundary).length, 65536);

  const overflow = createTestClient({ timeout: 100 });
  const fakeSocket = { destroyed: false, destroy() { this.destroyed = true; } };
  overflow._socket = fakeSocket;
  const rejected = overflow._readTcpLine();
  overflow._handleTcpData(Buffer.alloc(65537, 0x41));
  await assert.rejects(() => rejected, /Response line exceeds 65536 bytes/);
  assert.equal(overflow.trafficStats().rxBytes, 0);
  assert.equal(overflow._socket, null);
  assert.equal(overflow._receiveBuffer.length, 0);
  assert.equal(fakeSocket.destroyed, true);
});

test("TCP failure paths count only complete response lines", async () => {
  const completeError = createTestClient({ timeout: 100 });
  completeError._socket = { destroyed: false, destroy() { this.destroyed = true; } };
  const errorLine = completeError._readTcpLine();
  completeError._handleTcpData(Buffer.from("E1\r", "ascii"));
  assert.deepEqual(await errorLine, Buffer.from("E1", "ascii"));
  assert.equal(completeError.trafficStats().rxBytes, 3);

  const eof = createTestClient({ timeout: 100 });
  eof._socket = { destroyed: false, destroy() { this.destroyed = true; } };
  const eofLine = eof._readTcpLine();
  eof._handleTcpData(Buffer.from("PARTIAL", "ascii"));
  eof._failTcpConnection(new Error("Connection closed"));
  await assert.rejects(() => eofLine, /Connection closed/);
  assert.equal(eof.trafficStats().rxBytes, 0);

  const timedOut = createTestClient({ timeout: 10 });
  timedOut._socket = { destroyed: false, destroy() { this.destroyed = true; } };
  await assert.rejects(() => timedOut._readTcpLine(), HostLinkTimeoutError);
  assert.equal(timedOut.trafficStats().rxBytes, 0);
});

test("TCP traffic stats are independent of CRLF segmentation", async () => {
  const coalesced = createTestClient({ timeout: 100 });
  coalesced._socket = { destroyed: false, destroy() { this.destroyed = true; } };
  const coalescedFirst = coalesced._readTcpLine();
  coalesced._handleTcpData(Buffer.from("FIRST\r\n", "ascii"));
  assert.deepEqual(await coalescedFirst, Buffer.from("FIRST", "ascii"));
  const coalescedSecond = coalesced._readTcpLine();
  coalesced._handleTcpData(Buffer.from("SECOND\n\r", "ascii"));
  assert.deepEqual(await coalescedSecond, Buffer.from("SECOND", "ascii"));
  assert.equal(coalesced.trafficStats().rxBytes, 13);

  const split = createTestClient({ timeout: 100 });
  split._socket = { destroyed: false, destroy() { this.destroyed = true; } };
  const splitFirst = split._readTcpLine();
  split._handleTcpData(Buffer.from("FIRST\r", "ascii"));
  assert.deepEqual(await splitFirst, Buffer.from("FIRST", "ascii"));
  split._handleTcpData(Buffer.from("\n", "ascii"));
  const splitSecond = split._readTcpLine();
  split._handleTcpData(Buffer.from("SECOND\n\r", "ascii"));
  assert.deepEqual(await splitSecond, Buffer.from("SECOND", "ascii"));
  assert.equal(split.trafficStats().rxBytes, 13);
});

test("setTime requires a value and rejects invalid calendar/weekday combinations before send", async () => {
  const { client, frames } = createFrameRecorder();
  await assert.rejects(() => client.setTime(), /required/);
  await assert.rejects(() => client.setTime([24, 2, 30, 1, 2, 3, 5]), /nonexistent/);
  await assert.rejects(() => client.setTime([24, 1, 1, 1, 2, 3, 2]), /does not match/);
  await assert.rejects(() => client.setTime(["24", 1, 1, 1, 2, 3, 1]), /must be integers/);
  await assert.rejects(() => client.setTime([24, 1, 1, 1, 2, 3, false]), /must be integers/);
  await assert.rejects(() => client.setTime("2026-03-15T01:02:03"), /must be a Date/);
  await assert.rejects(() => client.setTime(0), /must be a Date/);
  await assert.rejects(() => client.setTime(new Date(1999, 0, 1)), /2000\.\.2099/);
  await assert.rejects(() => client.setTime(new Date(2100, 0, 1)), /2000\.\.2099/);
  await assert.rejects(() => client.setTime(new Date(Number.NaN)), /invalid time value/);
  assert.deepEqual(frames, []);
});

test("UDP response requires a CR/LF terminator and retires the request socket from reuse", async () => {
  class FakeUdpSocket extends EventEmitter {
    constructor(response) {
      super();
      this.response = response;
      this.closed = false;
    }
    send(_payload, callback) {
      callback(null);
      if (this.response !== null) {
        setImmediate(() => this.emit("message", Buffer.from(this.response, "ascii")));
      }
    }
    close(callback) {
      this.closed = true;
      if (callback) callback();
    }
  }

  const invalid = createTestClient({ transport: "udp", timeout: 100 });
  const invalidSocket = new FakeUdpSocket("OK");
  invalid._socket = invalidSocket;
  await assert.rejects(() => invalid._writeUdpAndRead(Buffer.from("ER\r"), invalidSocket, 0), /missing.*terminator/i);
  assert.deepEqual(invalid.trafficStats(), { requestCount: 1, txBytes: 3, rxBytes: 0 });
  assert.equal(invalid._socket, null);
  assert.equal(invalidSocket.closed, true);
  await invalid.close();
  assert.equal(invalidSocket.closed, true);

  const valid = createTestClient({ transport: "udp", timeout: 100 });
  const validSocket = new FakeUdpSocket("E1\r");
  valid._socket = validSocket;
  assert.deepEqual(await valid._writeUdpAndRead(Buffer.from("ER\r"), validSocket, 0), Buffer.from("E1\r"));
  assert.deepEqual(valid.trafficStats(), { requestCount: 1, txBytes: 3, rxBytes: 3 });
  assert.equal(valid._socket, validSocket);
  assert.equal(validSocket.closed, false);
  await valid.close();
  assert.deepEqual(valid.trafficStats(), { requestCount: 1, txBytes: 3, rxBytes: 3 });

  const timedOut = createTestClient({ transport: "udp", timeout: 10 });
  const timeoutSocket = new FakeUdpSocket(null);
  timedOut._socket = timeoutSocket;
  await assert.rejects(() => timedOut._writeUdpAndRead(Buffer.from("ER\r"), timeoutSocket, 0), HostLinkTimeoutError);
  assert.deepEqual(timedOut.trafficStats(), { requestCount: 1, txBytes: 3, rxBytes: 0 });
  assert.equal(timedOut._socket, null);
  assert.equal(timeoutSocket.closed, true);
  await timedOut.close();
  assert.equal(timeoutSocket.closed, true);

  const stateChanging = createTestClient({ transport: "udp", timeout: 10 });
  const stateChangingSocket = new FakeUdpSocket(null);
  stateChanging._socket = stateChangingSocket;
  await assert.rejects(
    () => stateChanging.write("DM0", 1, ".U"),
    (error) => error instanceof HostLinkOperationOutcomeUnknownError
      && error.reason === "timeout"
      && error.cause instanceof HostLinkTimeoutError,
  );
  assert.equal(stateChanging._socket, null);
  assert.equal(stateChangingSocket.closed, true);
});

test("buildFrame and decodeResponse handle Host Link CR framing", () => {
  const frame = buildFrame("RD DM100");
  assert.equal(frame.toString("ascii"), "RD DM100\r");
  assert.equal(decodeResponse(Buffer.from("123\r\n", "ascii")), "123");
  for (const command of ["RD DM0\rWR DM1.U 1", "RD DM0\nWR DM1.U 1", "RD DM0\r\n"]) {
    assert.throws(() => buildFrame(command), /must not contain CR or LF/);
  }
});

test("TCP maximum response in one-byte fragments uses linear scan and copy work", async () => {
  const client = createTestClient({ timeout: 1000 });
  client._socket = { destroyed: false, destroy() { this.destroyed = true; } };
  const response = client._readTcpLine();
  const byte = Buffer.from("A", "ascii");
  for (let index = 0; index < 65536; index += 1) {
    client._handleTcpData(byte);
  }
  client._handleTcpData(Buffer.from("\r", "ascii"));

  assert.equal((await response).length, 65536);
  assert.equal(client._receiveBuffer.scanByteCount, 65537);
  assert.ok(client._receiveBuffer.copyByteCount <= 65537 * 3);
});

test("operation FIFO uses constant-time linked dequeue and known-entry cancellation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "lib", "hostlink", "client.js"), "utf8");
  const start = source.indexOf("class LinkedFifo");
  const end = source.indexOf("class TcpReceiveAccumulator");
  const queueSource = source.slice(start, end);
  const enqueueStart = source.indexOf("  _enqueue(");
  const enqueueEnd = source.indexOf("  _throwIfContextUnavailable", enqueueStart);
  const admissionSource = source.slice(enqueueStart, enqueueEnd);

  assert.ok(queueSource.includes("entry.queueNode"));
  assert.ok(admissionSource.includes("this._operationQueue.remove(entry)"));
  assert.ok(admissionSource.includes("this._operationQueue.takeFirst()"));
  for (const forbidden of [".shift(", ".indexOf(", ".splice("]) {
    assert.equal(admissionSource.includes(forbidden), false);
  }
});

test("RDC comments require one explicit strict codec and retain exact raw bytes", () => {
  const cp932A = Buffer.from([0x82, 0xa0, 0x20, 0x0d, 0x0a]);
  const ambiguous = Buffer.from([0xc2, 0xa2, 0x0d]);
  const utf8BomA = Buffer.from([0xef, 0xbb, 0xbf, 0x41, 0x0d]);

  assert.throws(() => decodeResponse(cp932A), /Non-ASCII response byte 0x82 at offset 0/);
  assert.deepEqual(decodeCommentBytes(cp932A), Buffer.from([0x82, 0xa0, 0x20]));
  const ownedComment = decodeCommentBytes(cp932A);
  ownedComment[0] = 0x00;
  assert.deepEqual(cp932A, Buffer.from([0x82, 0xa0, 0x20, 0x0d, 0x0a]));
  assert.equal(decodeCommentResponse(cp932A, "cp932"), "あ ");
  assert.equal(decodeCommentResponse(ambiguous, "utf8"), "¢");
  assert.equal(decodeCommentResponse(ambiguous, "cp932"), "ﾂ｢");
  assert.equal(decodeCommentResponse(utf8BomA, "utf8"), "\uFEFFA");
  assert.throws(() => decodeCommentResponse(utf8BomA, "cp932"), /not valid cp932/i);
  assert.deepEqual(
    Array.from(decodeCommentResponse(Buffer.from([0x1a, 0x1c, 0x7f]), "cp932"), (character) => character.codePointAt(0)),
    [0x1a, 0x1c, 0x7f],
  );
  assert.equal(decodeCommentResponse(Buffer.from([0x87, 0x90]), "cp932"), "≒");
  assert.equal(decodeCommentResponse(Buffer.from([0xed, 0x40]), "cp932"), "纊");
  assert.equal(decodeCommentResponse(Buffer.from([0xfa, 0x4a]), "cp932"), "Ⅰ");
  for (const invalidByte of [0x80, 0xa0, 0xfd, 0xfe, 0xff]) {
    assert.throws(() => decodeCommentResponse(Buffer.from([invalidByte]), "cp932"), /not valid cp932/i);
  }
  assert.throws(() => decodeCommentResponse(Buffer.from([0x82, 0x20]), "cp932"), /not valid cp932/i);
  assert.throws(() => decodeCommentResponse(Buffer.from([0x81, 0xad]), "cp932"), /not valid cp932/i);
  for (const encoding of [undefined, null, "", "utf-8", "shift_jis", "windows-31j", "auto", "UTF8"]) {
    assert.throws(() => decodeCommentResponse(ambiguous, encoding), /encoding.*utf8, cp932/i);
  }
  assert.throws(() => decodeCommentResponse(Buffer.from([0x82, 0x0d]), "cp932"), /not valid cp932/i);
  assert.throws(() => decodeCommentResponse(Buffer.from([0xc2, 0x0d]), "utf8"), /not valid utf8/i);
});

test("splitDataTokens supports timer and counter comma-separated responses", () => {
  assert.deepEqual(splitDataTokens("0,0000012345,0000012345"), ["0", "0000012345", "0000012345"]);
});

test("client serializes queued requests", async () => {
  const client = createTestClient();
  let active = 0;
  let maxActive = 0;

  client._exchange = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return Buffer.from("OK\r", "ascii");
  };

  await Promise.all([client.sendRaw("ER"), client.sendRaw("ER"), client.sendRaw("ER")]);
  assert.equal(maxActive, 1);
});

test("ordinary client preserves FIFO through a PLC error and separate instances progress independently", async () => {
  const first = createTestClient();
  const second = createTestClient();
  const order = [];
  first._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    order.push(command);
    await new Promise((resolve) => setImmediate(resolve));
    return Buffer.from(command === "ER" ? "E1\r" : "63\r", "ascii");
  };
  let secondFinished = false;
  second._exchange = async () => {
    secondFinished = true;
    return Buffer.from("63\r", "ascii");
  };

  const rejected = first.clearError();
  const later = first.queryModel();
  await second.queryModel();
  assert.equal(secondFinished, true);
  await assert.rejects(rejected, (error) => error.code === "E1");
  assert.equal((await later).code, "63");
  assert.deepEqual(order, ["ER", "?K"]);
});

test("waiting cancellation removes one FIFO entry without send or delaying later work", async () => {
  const client = createTestClient();
  const frames = [];
  let releaseFirst;
  const blocker = client._runExclusive(() => new Promise((resolve) => { releaseFirst = resolve; }));
  const controller = new AbortController();
  client._exchange = async (payload) => {
    frames.push(payload.toString("ascii").trim());
    return Buffer.from("63\r", "ascii");
  };
  const canceled = client.queryModel({ signal: controller.signal });
  const later = client.queryModel();
  controller.abort(new Error("caller stopped waiting"));
  await assert.rejects(canceled, (error) => error instanceof HostLinkCanceledError && error.code === "HOSTLINK_CANCELED");
  releaseFirst();
  await blocker;
  assert.equal((await later).code, "63");
  assert.deepEqual(frames, ["?K"]);
});

test("queued values and immutable endpoint/profile state are snapshots from admission", async () => {
  const client = createTestClient();
  const frames = [];
  let releaseFirst;
  const blocker = client._runExclusive(() => new Promise((resolve) => { releaseFirst = resolve; }));
  client._exchange = async (payload) => {
    frames.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };
  const values = [true, false];
  const queued = client.writeConsecutive("R0", values);
  values[0] = false;
  values.push(true);
  assert.throws(() => { client.timeout = 1; }, TypeError);
  assert.throws(() => { client.plcProfile = "keyence:kv-nano"; }, TypeError);
  await new Promise((resolve) => setImmediate(resolve));
  releaseFirst();
  await blocker;
  await queued;
  assert.deepEqual(frames, ["WRS R000 2 1 0"]);
  assert.equal(client.timeout, 3000);
  assert.equal(client.plcProfile, TEST_PLC_PROFILE);
});

test("TCP partial-send stall and response trickle share one absolute transaction deadline", async () => {
  const stalled = createTestClient({ timeout: 20 });
  const stalledSocket = new EventEmitter();
  stalledSocket.destroyed = false;
  stalledSocket.write = (_payload, _callback) => {};
  stalledSocket.destroy = function destroy() { this.destroyed = true; this.emit("close"); };
  stalled._socket = stalledSocket;
  stalled._generation = 1;
  const stalledStart = performance.now();
  await assert.rejects(() => stalled.queryModel(), HostLinkTimeoutError);
  assert.ok(performance.now() - stalledStart < 150);
  assert.equal(stalledSocket.destroyed, true);

  const trickle = createTestClient({ timeout: 25 });
  const trickleSocket = new EventEmitter();
  trickleSocket.destroyed = false;
  trickleSocket.write = (_payload, callback) => {
    callback(null);
    setTimeout(() => trickle._handleTcpData(Buffer.from("6"), trickleSocket), 5);
    setTimeout(() => trickle._handleTcpData(Buffer.from("3"), trickleSocket), 15);
  };
  trickleSocket.destroy = function destroy() { this.destroyed = true; this.emit("close"); };
  trickle._socket = trickleSocket;
  trickle._generation = 1;
  const trickleStart = performance.now();
  await assert.rejects(() => trickle.queryModel(), HostLinkTimeoutError);
  assert.ok(performance.now() - trickleStart < 150);
  assert.equal(trickleSocket.destroyed, true);
});

test("response decoding remains inside the absolute transaction deadline", async () => {
  const client = createTestClient({ timeout: 10 });
  const socket = new EventEmitter();
  socket.destroyed = false;
  socket.write = (_payload, callback) => {
    callback(null);
    setImmediate(() => client._handleTcpData(Buffer.from("63\r"), socket));
  };
  socket.destroy = function destroy() { this.destroyed = true; this.emit("close"); };
  client._socket = socket;
  client._generation = 1;
  const originalProcess = client._processResponse.bind(client);
  client._processResponse = (...args) => {
    const until = performance.now() + 20;
    while (performance.now() < until) {}
    return originalProcess(...args);
  };
  await assert.rejects(() => client.queryModel(), HostLinkTimeoutError);
  assert.equal(socket.destroyed, true);

  const changing = createTestClient({ timeout: 10 });
  const changingSocket = new EventEmitter();
  changingSocket.destroyed = false;
  changingSocket.write = (_payload, callback) => {
    callback(null);
    setImmediate(() => changing._handleTcpData(Buffer.from("E1\r"), changingSocket));
  };
  changingSocket.destroy = function destroy() { this.destroyed = true; this.emit("close"); };
  changing._socket = changingSocket;
  changing._generation = 1;
  const changingProcess = changing._processResponse.bind(changing);
  changing._processResponse = (...args) => {
    const until = performance.now() + 20;
    while (performance.now() < until) {}
    return changingProcess(...args);
  };
  await assert.rejects(
    () => changing.clearError(),
    (error) => error instanceof HostLinkOperationOutcomeUnknownError
      && error.reason === "timeout"
      && error.cause instanceof HostLinkTimeoutError,
  );
  assert.equal(changingSocket.destroyed, true);
});

test("active cancellation and close retain distinct read/write outcome classifications", async () => {
  class NoResponseUdpSocket extends EventEmitter {
    constructor() { super(); this.closed = false; this.sent = []; }
    send(payload, callback) { this.sent.push(Buffer.from(payload)); callback(null); }
    close(callback) { this.closed = true; if (callback) callback(); }
  }

  const canceledRead = createTestClient({ transport: "udp", timeout: 1000 });
  const canceledReadSocket = new NoResponseUdpSocket();
  canceledRead._socket = canceledReadSocket;
  canceledRead._generation = 1;
  const readController = new AbortController();
  const read = canceledRead.queryModel({ signal: readController.signal });
  await new Promise((resolve) => setImmediate(resolve));
  readController.abort();
  await assert.rejects(read, HostLinkCanceledError);
  assert.equal(canceledRead._socket, null);
  assert.equal(canceledReadSocket.closed, true);

  const canceledWrite = createTestClient({ transport: "udp", timeout: 1000 });
  const canceledWriteSocket = new NoResponseUdpSocket();
  canceledWrite._socket = canceledWriteSocket;
  canceledWrite._generation = 1;
  const writeController = new AbortController();
  const write = canceledWrite.write("DM0", 1, ".U", { signal: writeController.signal });
  await new Promise((resolve) => setImmediate(resolve));
  writeController.abort();
  await assert.rejects(
    write,
    (error) => error instanceof HostLinkOperationOutcomeUnknownError
      && error.reason === "canceled"
      && error.cause instanceof HostLinkCanceledError,
  );
  assert.equal(canceledWrite._socket, null);
  assert.equal(canceledWriteSocket.closed, true);

  const closedRead = createTestClient({ transport: "udp", timeout: 1000 });
  closedRead._socket = new NoResponseUdpSocket();
  closedRead._generation = 1;
  const activeRead = closedRead.queryModel();
  const queuedRead = closedRead.queryModel();
  await new Promise((resolve) => setImmediate(resolve));
  await closedRead.close();
  await assert.rejects(activeRead, HostLinkClosedError);
  await assert.rejects(queuedRead, HostLinkClosedError);
  assert.equal(closedRead._socket, null);

  const closedWrite = createTestClient({ transport: "udp", timeout: 1000 });
  closedWrite._socket = new NoResponseUdpSocket();
  closedWrite._generation = 1;
  const ambiguousWrite = closedWrite.write("DM0", 1, ".U");
  await new Promise((resolve) => setImmediate(resolve));
  await closedWrite.close();
  await assert.rejects(
    ambiguousWrite,
    (error) => error instanceof HostLinkOperationOutcomeUnknownError
      && error.reason === "closed"
      && error.cause instanceof HostLinkClosedError,
  );
});

test("IPv6 literals are rejected and hostname resolution selects the first IPv4 result", async () => {
  for (const host of ["::1", "[::1]", "::ffff:127.0.0.1", "[::ffff:127.0.0.1]"]) {
    assert.throws(() => createTestClient({ host }), /IPv6 is unsupported/);
  }
  const dns = require("node:dns");
  const { resolveIpv4 } = require("../lib/hostlink/network");
  const originalLookup = dns.lookup;
  try {
    dns.lookup = (_host, options, callback) => {
      assert.equal(options.family, 4);
      assert.equal(options.all, true);
      callback(null, [
        { address: "192.0.2.10", family: 4 },
        { address: "192.0.2.11", family: 4 },
      ]);
    };
    assert.equal(await resolveIpv4("plc.example", performance.now() + 1000), "192.0.2.10");
  } finally {
    dns.lookup = originalLookup;
  }
});

test("DNS cancellation and close reject connect without creating a later socket", async () => {
  const dns = require("node:dns");
  const originalLookup = dns.lookup;
  const callbacks = [];
  try {
    dns.lookup = (_host, _options, callback) => callbacks.push(callback);

    const canceledClient = createTestClient({ host: "cancel.example", timeout: 1000 });
    const controller = new AbortController();
    const canceled = canceledClient.connect({ signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(new Error("stop DNS"));
    await assert.rejects(canceled, HostLinkCanceledError);
    assert.equal(canceledClient._socket, null);

    const closedClient = createTestClient({ host: "close.example", timeout: 1000 });
    const closed = closedClient.connect();
    await new Promise((resolve) => setImmediate(resolve));
    await closedClient.close();
    await assert.rejects(closed, HostLinkClosedError);
    for (const callback of callbacks) callback(null, [{ address: "192.0.2.20", family: 4 }]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(closedClient._socket, null);
  } finally {
    dns.lookup = originalLookup;
  }
});

test("monitor registration and its following read obey FIFO state order", async () => {
  const { client, frames } = createFrameRecorder((command) => command === "MBR" ? "1 0\r" : "OK\r");
  const registration = client.registerMonitorBits("R0", "R1");
  const read = client.readMonitorBits();
  await registration;
  assert.equal((await read).length, 2);
  assert.deepEqual(frames, ["MBS R000 R001\r", "MBR\r"]);
});

test("single request capacity rejects maximum plus one before request state mutation", async () => {
  const accepted = createFrameRecorder(() => "OK\r");
  assert.equal((await accepted.client.sendRaw("A".repeat(65506))).toString("ascii"), "OK");
  assert.equal(accepted.frames.length, 1);
  assert.equal(Buffer.byteLength(accepted.frames[0], "ascii"), 65507);

  const client = createTestClient();
  const before = client.trafficStats();
  assert.equal(buildFrame("A".repeat(65506)).length, 65507);
  assert.throws(() => buildFrame("A".repeat(65507)), /exceeds 65507 bytes/);
  await assert.rejects(() => client.sendRaw("A".repeat(65507)), /exceeds 65507 bytes/);
  assert.deepEqual(client.trafficStats(), before);
});

test("each active FIFO operation owns one AbortController and removes caller forwarding listeners", async () => {
  const NativeAbortController = global.AbortController;
  const caller = new NativeAbortController();
  let controllers = 0;
  let additions = 0;
  let removals = 0;
  const originalAdd = caller.signal.addEventListener.bind(caller.signal);
  const originalRemove = caller.signal.removeEventListener.bind(caller.signal);
  caller.signal.addEventListener = (...args) => {
    additions += 1;
    return originalAdd(...args);
  };
  caller.signal.removeEventListener = (...args) => {
    removals += 1;
    return originalRemove(...args);
  };
  global.AbortController = class CountingAbortController extends NativeAbortController {
    constructor() {
      super();
      controllers += 1;
    }
  };
  const client = createTestClient();
  try {
    assert.equal(await client._enqueue(async () => "ok", { signal: caller.signal }), "ok");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(controllers, 1);
    assert.equal(additions, 2);
    assert.equal(removals, 2);
  } finally {
    global.AbortController = NativeAbortController;
    await client.close().catch(() => undefined);
  }
});

test("the first active-operation abort reason wins when caller cancellation races close", async () => {
  const client = createTestClient();
  const caller = new AbortController();
  let release;
  const operation = client._enqueue(
    () => new Promise((resolve) => { release = resolve; }),
    { signal: caller.signal },
  );
  await new Promise((resolve) => setImmediate(resolve));

  caller.abort(new Error("caller canceled first"));
  await client.close();
  release("late result");

  await assert.rejects(
    operation,
    (error) => error instanceof HostLinkCanceledError
      && error.cause instanceof Error
      && error.cause.message === "caller canceled first",
  );
});

test("state-changing multi-request bit-in-word helper is removed", () => {
  const client = createTestClient();
  assert.equal(require("../lib/hostlink").QueuedKvHostLinkClient, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(HostLinkClient.prototype, "writeBitInWord"), false);
  assert.equal(client.writeBitInWord, undefined);
});

test("low-level command helpers preserve exact CR-terminated frames", async () => {
  const { client, frames } = createFrameRecorder((command) => {
    if (command === "?E") return "0\r";
    if (command === "?M") return "1\r";
    return "OK\r";
  });

  await client.sendRaw("ER");
  await client.changeMode("RUN");
  await client.changeMode("PROGRAM");
  await client.clearError();
  assert.equal(await client.checkErrorNo(), "0");
  assert.equal(await client.confirmOperatingMode(), 1);
  await assert.rejects(() => client.changeMode("STOP"), /mode must be 0\/1 or PROGRAM\/RUN/);
  for (const invalid of [null, false, [], "", {}, 0.0 + Number.EPSILON]) {
    await assert.rejects(() => client.changeMode(invalid), /mode must be 0\/1 or PROGRAM\/RUN/);
  }

  assert.deepEqual(frames, ["ER\r", "M1\r", "M0\r", "ER\r", "?E\r", "?M\r"]);
});

test("confirmOperatingMode rejects unknown mode values", async () => {
  const { client, frames } = createFrameRecorder((command) => {
    if (command === "?M") return "2\r";
    return "OK\r";
  });

  await assert.rejects(() => client.confirmOperatingMode(), /Unsupported PLC mode response/);

  assert.deepEqual(frames, ["?M\r"]);
});

test("confirmOperatingMode accepts only complete exact 0 or 1 responses", async () => {
  for (const [response, expected] of [["0", 0], ["1", 1]]) {
    const client = createTestClient();
    const socket = { destroyed: false, destroy() { this.destroyed = true; } };
    client._socket = socket;
    client._exchange = async () => Buffer.from(response, "ascii");
    assert.equal(await client.confirmOperatingMode(), expected);
    assert.equal(client._socket, socket);
  }

  for (const response of ["2", "01", " 1", "+1", "1-corrupt", "", "RUN"]) {
    const client = createTestClient();
    const socket = { destroyed: false, destroy() { this.destroyed = true; } };
    client._socket = socket;
    client._exchange = async () => Buffer.from(response, "ascii");
    await assert.rejects(() => client.confirmOperatingMode(), /Empty response|Unsupported PLC mode response/);
    assert.equal(client._socket, null, response);
    assert.equal(socket.destroyed, true, response);
  }
});

test("decoder protocol errors invalidate the exact generation but PLC errors remain reusable", async () => {
  for (const response of [Buffer.alloc(0), Buffer.from("\r", "ascii"), Buffer.from([0xff, 0x0d])]) {
    const client = createTestClient();
    const socket = { destroyed: false, destroy() { this.destroyed = true; } };
    client._socket = socket;
    client._exchange = async () => response;
    await assert.rejects(() => client.checkErrorNo(), /Empty response|Malformed response|Non-ASCII/);
    assert.equal(client._socket, null);
    assert.equal(socket.destroyed, true);
  }

  const reusable = createTestClient();
  const socket = { destroyed: false, destroy() { this.destroyed = true; } };
  reusable._socket = socket;
  let response = "E1";
  reusable._exchange = async () => Buffer.from(response, "ascii");
  await assert.rejects(() => reusable.checkErrorNo(), (error) => error.code === "E1");
  assert.equal(reusable._socket, socket);
  response = "0";
  assert.equal(await reusable.checkErrorNo(), "0");

  const raced = createTestClient();
  const oldSocket = { destroyed: false, destroy() { this.destroyed = true; } };
  const replacementSocket = { destroyed: false, destroy() { this.destroyed = true; } };
  raced._socket = oldSocket;
  raced._generation = 4;
  raced._exchange = async () => {
    raced._socket = replacementSocket;
    raced._generation = 5;
    return Buffer.from([0xff]);
  };
  await assert.rejects(() => raced.checkErrorNo(), /Non-ASCII/);
  assert.equal(raced._socket, replacementSocket);
  assert.equal(replacementSocket.destroyed, false);

  for (const [encoding, invalidPayload] of [
    ["utf8", Buffer.from([0xc2, 0x0d])],
    ["cp932", Buffer.from([0x82, 0x0d])],
  ]) {
    const commentClient = createTestClient();
    const commentSocket = { destroyed: false, destroy() { this.destroyed = true; } };
    commentClient._socket = commentSocket;
    commentClient._exchange = async () => invalidPayload;
    await assert.rejects(() => commentClient.readComments("DM0", encoding), /not valid/);
    assert.equal(commentClient._socket, null);
    assert.equal(commentSocket.destroyed, true);
  }
});

test("TCP rejects both the request and transport when one chunk contains two nonempty responses", async () => {
  const socket = { destroyed: false, writes: 0, write(_payload, callback) { this.writes += 1; callback(null); }, destroy() { this.destroyed = true; } };
  const client = createTestClient({ timeout: 100 });
  client._socket = socket;
  const first = client.sendRaw("?K");
  await Promise.resolve();
  client._handleTcpData(Buffer.from("111\r222\r", "ascii"), socket);
  await assert.rejects(
    first,
    (error) => error instanceof HostLinkOperationOutcomeUnknownError
      && error.reason === "invalid-response"
      && /Additional TCP response/.test(error.cause && error.cause.message),
  );
  assert.equal(client._socket, null);
  assert.equal(socket.destroyed, true);
  await assert.rejects(() => client.sendRaw("?K"), /not connected|generation changed/i);
  assert.equal(socket.writes, 1);

  const staleSocket = { destroyed: false, writes: 0, write(_payload, callback) { this.writes += 1; callback(null); }, destroy() { this.destroyed = true; } };
  const stale = createTestClient();
  stale._socket = staleSocket;
  stale._receiveBuffer.append(Buffer.from("PARTIAL", "ascii"));
  await assert.rejects(() => stale.sendRaw("?K"), /Stale TCP response data/);
  assert.equal(staleSocket.writes, 0);
  assert.equal(stale._socket, null);
});

test("TCP rejects a second response that arrives before the write callback without overwriting the first", async () => {
  const client = createTestClient({ timeout: 100 });
  const socket = {
    destroyed: false,
    write(_payload, callback) {
      client._handleTcpData(Buffer.from("E1\rOK\r", "ascii"), this);
      setImmediate(() => callback(null));
    },
    destroy() { this.destroyed = true; },
  };
  client._socket = socket;

  await assert.rejects(
    () => client.clearError(),
    (error) => error instanceof HostLinkOperationOutcomeUnknownError
      && error.reason === "invalid-response"
      && /Additional TCP response/.test(error.cause && error.cause.message),
  );
  assert.equal(client._socket, null);
  assert.equal(socket.destroyed, true);
});

test("UDP close invalidates active and queued old-generation work without resend", async () => {
  class FakeUdpSocket extends EventEmitter {
    constructor() {
      super();
      this.sent = [];
      this.closed = false;
    }
    send(payload, callback) {
      this.sent.push(Buffer.from(payload));
      callback(null);
    }
    close(callback) {
      this.closed = true;
      if (callback) callback();
    }
  }

  const client = createTestClient({ transport: "udp", timeout: 1000 });
  const oldSocket = new FakeUdpSocket();
  client._socket = oldSocket;
  client._udpConnected = true;
  client._generation = 1;
  const active = client.sendRaw("FIRST");
  const queued = client.sendRaw("SECOND");
  const activeRejected = assert.rejects(active, HostLinkOperationOutcomeUnknownError);
  const queuedRejected = assert.rejects(queued, HostLinkClosedError);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(oldSocket.sent.length, 1);
  await client.close();
  await Promise.all([activeRejected, queuedRejected]);
  assert.equal(oldSocket.closed, true);
  assert.equal(oldSocket.listenerCount("message"), 0);

  const newSocket = new FakeUdpSocket();
  client._socket = newSocket;
  client._udpConnected = true;
  client._generation += 1;
  const next = client.sendRaw("THIRD");
  await new Promise((resolve) => setImmediate(resolve));
  oldSocket.emit("message", Buffer.from("STALE\r", "ascii"));
  newSocket.emit("message", Buffer.from("NEW\r", "ascii"));
  assert.deepEqual(await next, Buffer.from("NEW", "ascii"));
  assert.equal(newSocket.sent.length, 1);
});

test("UDP loopback close error reinitialize and reconnect isolate request generations", async () => {
  const server = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.bind(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  const commands = [];
  const datagramWaiters = [];
  server.on("message", (message, rinfo) => {
    const command = message.toString("ascii").replace(/[\r\n]+$/, "");
    commands.push(command);
    const waiter = datagramWaiters.shift();
    if (waiter) waiter({ command, rinfo });
    if (["THIRD", "FIFTH", "NEVER", "SIXTH"].includes(command)) {
      server.send(Buffer.from(`REPLY-${command}\r`, "ascii"), rinfo.port, rinfo.address);
    }
  });
  const nextDatagram = () => new Promise((resolve) => datagramWaiters.push(resolve));
  const client = createTestClient({ transport: "udp", port, timeout: 1000 });

  try {
    await client.connect();
    const firstDatagram = nextDatagram();
    const active = client.sendRaw("FIRST");
    const queued = client.sendRaw("SECOND");
    const activeRejected = assert.rejects(active, HostLinkOperationOutcomeUnknownError);
    const queuedRejected = assert.rejects(queued, HostLinkClosedError);
    const first = await firstDatagram;
    assert.equal(first.command, "FIRST");
    await client.close();
    await Promise.all([activeRejected, queuedRejected]);
    await new Promise((resolve, reject) => {
      server.send(Buffer.from("STALE\r", "ascii"), first.rinfo.port, first.rinfo.address, (error) => error ? reject(error) : resolve());
    });

    await client.connect();
    const thirdDatagram = nextDatagram();
    const third = client.sendRaw("THIRD");
    assert.equal((await thirdDatagram).command, "THIRD");
    assert.deepEqual(await third, Buffer.from("REPLY-THIRD", "ascii"));

    const fourthDatagram = nextDatagram();
    const interruptedByReinitialize = client.sendRaw("FOURTH");
    const reinitializeRejected = assert.rejects(interruptedByReinitialize, HostLinkOperationOutcomeUnknownError);
    assert.equal((await fourthDatagram).command, "FOURTH");
    await client.close();
    await reinitializeRejected;
    await client.connect();
    const fifthDatagram = nextDatagram();
    const fifth = client.sendRaw("FIFTH");
    assert.equal((await fifthDatagram).command, "FIFTH");
    assert.deepEqual(await fifth, Buffer.from("REPLY-FIFTH", "ascii"));

    const errorDatagram = nextDatagram();
    const interruptedByError = client.sendRaw("ERROR");
    const queuedAfterError = client.sendRaw("NEVER");
    const errorRejected = assert.rejects(interruptedByError, HostLinkOperationOutcomeUnknownError);
    const neverDatagram = nextDatagram();
    assert.equal((await errorDatagram).command, "ERROR");
    client._socket.emit("error", new Error("injected loopback socket error"));
    await errorRejected;
    assert.equal((await neverDatagram).command, "NEVER");
    assert.deepEqual(await queuedAfterError, Buffer.from("REPLY-NEVER", "ascii"));
    await client.connect();
    const sixthDatagram = nextDatagram();
    const sixth = client.sendRaw("SIXTH");
    assert.equal((await sixthDatagram).command, "SIXTH");
    assert.deepEqual(await sixth, Buffer.from("REPLY-SIXTH", "ascii"));

    assert.deepEqual(commands, ["FIRST", "THIRD", "FOURTH", "FIFTH", "ERROR", "NEVER", "SIXTH"]);
  } finally {
    await client.close().catch(() => undefined);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("integer-only public API arguments reject coercion before send", async () => {
  const { client, frames } = createFrameRecorder();
  for (const value of ["1", true, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(() => client.switchBank(value), (error) => error.name === "ValueError");
    await assert.rejects(() => client.readExpansionUnitBuffer(value, 0, 1, ".U"), (error) => error.name === "ValueError");
    await assert.rejects(() => client.readExpansionUnitBuffer(1, value, 1, ".U"), (error) => error.name === "ValueError");
    await assert.rejects(() => client.readExpansionUnitBuffer(1, 0, value, ".U"), (error) => error.name === "ValueError");
  }
  for (const value of [0, 1, "0", "1", "ON", "OFF", null, undefined]) {
    await assert.rejects(() => client.write("R0", value), /must be a Boolean/i);
  }
  assert.deepEqual(frames, []);
});

test("forced bit command helpers preserve exact CR-terminated frames", async () => {
  const { client, frames } = createFrameRecorder();

  await client.forcedSet("R10");
  await client.forcedReset("MR15");
  await client.forcedSetConsecutive("R11", 3);
  await client.forcedResetConsecutive("MR00", 2);
  await client.forcedSet("X100");
  await client.forcedReset("M100");
  await client.forcedSetConsecutive("L100", 4);
  await assert.rejects(() => client.forcedSetConsecutive("T100", 4), /does not support device type 'T'/);

  assert.deepEqual(frames, [
    "ST R010\r",
    "RS MR015\r",
    "STS R011 3\r",
    "RSS MR000 2\r",
    "ST X100\r",
    "RS M100\r",
    "STS L100 4\r",
  ]);
});

test("read and write command helpers preserve exact CR-terminated frames", async () => {
  const { client, frames } = createFrameRecorder((command) => {
    if (command.startsWith("RD ")) return "123\r";
    if (command.startsWith("RDS ")) return "1 2 3\r";
    return "OK\r";
  });

  assert.equal(await client.read("DM100", ".U"), 123);
  assert.equal(await client.read("DM200", ".S"), 123);
  assert.deepEqual(await client.readConsecutive("DM300", 3, ".U"), [1, 2, 3]);
  await client.write("DM400", 255, ".H");
  await client.writeConsecutive("DM500", [1, 2, 3], ".U");
  await assert.rejects(() => client.read("DM600"), /dataFormat is required/);
  await assert.rejects(() => client.read("DM600.U", ".U"), /must not contain/);

  assert.deepEqual(frames, [
    "RD DM100.U\r",
    "RD DM200.S\r",
    "RDS DM300.U 3\r",
    "WR DM400.H FF\r",
    "WRS DM500.U 3 1 2 3\r",
  ]);
});

test("semantic reads require exact command-derived token counts and invalidate the session", async () => {
  const cases = [
    {
      invoke: (client) => client.read("DM0", ".U"),
      response: "1 2\r",
      expected: /RD response token count mismatch: expected 1, received 2/,
    },
    {
      invoke: (client) => client.readConsecutive("DM0", 2, ".U"),
      response: "1\r",
      expected: /RDS response token count mismatch: expected 2, received 1/,
    },
    {
      invoke: (client) => client.readExpansionUnitBuffer(1, 0, 2, ".U"),
      response: "1\r",
      expected: /URD response token count mismatch: expected 2, received 1/,
    },
  ];

  for (const item of cases) {
    const client = createTestClient();
    const socket = { destroyed: false, destroy() { this.destroyed = true; } };
    client._socket = socket;
    client._exchange = async () => Buffer.from(item.response, "ascii");
    await assert.rejects(() => item.invoke(client), item.expected);
    assert.equal(client._socket, null);
    assert.equal(socket.destroyed, true);
  }

  const monitor = createFrameRecorder((command) => command.startsWith("MBS ") ? "OK\r" : "1\r");
  const monitorSocket = { destroyed: false, destroy() { this.destroyed = true; } };
  monitor.client._socket = monitorSocket;
  await monitor.client.registerMonitorBits("R0", "R1");
  await assert.rejects(
    () => monitor.client.readMonitorBits(),
    /MBR response token count mismatch: expected 2, received 1/,
  );
  assert.equal(monitor.client._socket, null);
  assert.equal(monitorSocket.destroyed, true);

  const unregistered = createFrameRecorder();
  await assert.rejects(() => unregistered.client.readMonitorBits(), /must be registered/);
  await assert.rejects(() => unregistered.client.readMonitorWords(), /must be registered/);
  assert.deepEqual(unregistered.frames, []);
});

test("timer and counter reads accept only status zero or one in the shared response parser", async () => {
  for (const status of [0, 1]) {
    const { client } = createFrameRecorder(() => `${status},10,20\r`);
    assert.deepEqual(await client.read("T0", ".D"), [status, 10, 20]);
  }

  for (const status of [2, -1]) {
    const client = createTestClient();
    const socket = { destroyed: false, destroy() { this.destroyed = true; } };
    client._socket = socket;
    client._exchange = async () => Buffer.from(`${status},10,20\r`, "ascii");
    const dataFormat = status < 0 ? ".L" : ".D";
    await assert.rejects(() => client.read("C0", dataFormat), /status/i);
    assert.equal(client._socket, null);
    assert.equal(socket.destroyed, true);
  }
});

test("non-format commands reject suffix-bearing devices before transport", async () => {
  const { client, frames } = createFrameRecorder();
  for (const invoke of [
    () => client.forcedSet("R0.U"),
    () => client.forcedReset("R0.U"),
    () => client.forcedSetConsecutive("R0.U", 2),
    () => client.forcedResetConsecutive("R0.U", 2),
    () => client.registerMonitorBits("R0.U"),
    () => client.readComments("DM0.U", "utf8"),
    () => client.readCommentBytes("DM0.U"),
  ]) {
    await assert.rejects(invoke, /must not contain.*suffix/i);
  }
  assert.deepEqual(frames, []);
});

test("numeric writes reject overflow, truncation, and ambiguous values before send", async () => {
  const { client, frames } = createFrameRecorder();

  await client.write("DM0", 0xffff, ".U");
  await client.write("DM1", -0x8000, ".S");
  await client.write("DM2", 0xffffffff, ".D");
  await client.write("DM4", -0x80000000, ".L");
  await client.write("DM6", 0xbeef, ".H");
  const sent = frames.length;

  for (const [value, format] of [
    [-1, ".U"], [0x10000, ".U"], [-0x8001, ".S"], [0x8000, ".S"],
    [-1, ".D"], [0x100000000, ".D"], [-0x80000001, ".L"], [0x80000000, ".L"],
    [0x10000, ".H"], [1.5, ".U"], [NaN, ".U"], [Infinity, ".D"], ["1", ".U"],
  ]) {
    await assert.rejects(() => client.write("DM10", value, format), /outside the range/);
  }
  for (const host of [undefined, null, "", " ", 42, false]) {
    assert.throws(() => createTestClient({ host }), /host/);
  }
  assert.equal(frames.length, sent);
  assert.deepEqual(frames, [
    "WR DM0.U 65535\r",
    "WR DM1.S -32768\r",
    "WR DM2.D 4294967295\r",
    "WR DM4.L -2147483648\r",
    "WR DM6.H BEEF\r",
  ]);
});

test("typed numeric reads reject response tokens that contradict dataFormat", async () => {
  const { client } = createFrameRecorder(() => "not-a-number\r");
  await assert.rejects(() => client.read("DM0", ".U"), /Invalid numeric response token/);
  await assert.rejects(() => client.read("DM0", ".H"), /Invalid hexadecimal response token/);
  const { client: negativeUnsigned } = createFrameRecorder(() => "-1\r");
  await assert.rejects(() => negativeUnsigned.read("DM0", ".U"), /outside the range/);
  const { client: wideHex } = createFrameRecorder(() => "10000\r");
  await assert.rejects(() => wideHex.read("DM0", ".H"), /Invalid hexadecimal response token/);
  for (const token of ["TRUE", "FALSE", "2", "GARBAGE"]) {
    const { client: invalidBit } = createFrameRecorder(() => `${token}\r`);
    await assert.rejects(() => invalidBit.read("R0"), /Invalid direct bit response token/);
  }
});

test("UDP reuses one successful socket and replaces it after a malformed response", async () => {
  const server = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.bind(0, "127.0.0.1", resolve);
  });
  const client = createTestClient({ transport: "udp", port: server.address().port, timeout: 1000 });
  const endpoints = [];
  server.on("message", (message, rinfo) => {
    const command = message.toString("ascii").trim();
    endpoints.push(`${rinfo.address}:${rinfo.port}`);
    const response = command === "BAD" ? "MALFORMED" : `ACK-${command}\r`;
    server.send(Buffer.from(response, "ascii"), rinfo.port, rinfo.address);
  });

  try {
    await client.connect();
    assert.deepEqual(await client.sendRaw("ONE"), Buffer.from("ACK-ONE", "ascii"));
    assert.deepEqual(await client.sendRaw("TWO"), Buffer.from("ACK-TWO", "ascii"));
    assert.deepEqual(await client.sendRaw("THREE"), Buffer.from("ACK-THREE", "ascii"));
    await assert.rejects(
      () => client.sendRaw("BAD"),
      (error) => error instanceof HostLinkOperationOutcomeUnknownError && error.reason === "invalid-response",
    );
    assert.deepEqual(await client.sendRaw("FOUR"), Buffer.from("ACK-FOUR", "ascii"));
    assert.equal(client._udpConnected, true);
    assert.equal(endpoints.length, 5);
    assert.equal(endpoints[0], endpoints[1]);
    assert.equal(endpoints[1], endpoints[2]);
    assert.equal(endpoints[2], endpoints[3]);
    assert.notEqual(endpoints[3], endpoints[4]);
  } finally {
    await client.close().catch(() => undefined);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("UDP retires an idle socket that receives an unowned duplicate datagram", async () => {
  const server = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.bind(0, "127.0.0.1", resolve);
  });
  const client = createTestClient({ transport: "udp", port: server.address().port, timeout: 1000 });
  const endpoints = [];
  server.on("message", (message, rinfo) => {
    endpoints.push(`${rinfo.address}:${rinfo.port}`);
    server.send(Buffer.from(`ACK-${message.toString("ascii").trim()}\r`, "ascii"), rinfo.port, rinfo.address);
    if (endpoints.length === 1) {
      setTimeout(() => server.send(Buffer.from("DUPLICATE\r", "ascii"), rinfo.port, rinfo.address), 5);
    }
  });

  try {
    await client.connect();
    assert.deepEqual(await client.sendRaw("ONE"), Buffer.from("ACK-ONE", "ascii"));
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(client._socket, null);
    assert.deepEqual(await client.sendRaw("TWO"), Buffer.from("ACK-TWO", "ascii"));
    assert.notEqual(endpoints[0], endpoints[1]);
  } finally {
    await client.close().catch(() => undefined);
    await new Promise((resolve) => server.close(resolve));
  }
});

test("semantic H reads return exactly four uppercase digits while raw reads and writes remain unchanged", async () => {
  const { client, frames } = createFrameRecorder((command) => command === "RD DM0.H" || command === "?RAW" ? "a\r" : "OK\r");
  assert.equal(await client.read("DM0", ".H"), "000A");
  assert.deepEqual(await client.sendRaw("?RAW"), Buffer.from("a", "ascii"));
  await client.write("DM1", 0x000a, ".H");
  assert.deepEqual(frames, ["RD DM0.H\r", "?RAW\r", "WR DM1.H A\r"]);
});

test("UDP request-endpoint setup failure is definitive before a state-changing send", async () => {
  const client = createTestClient({ transport: "udp", timeout: 100 });
  client._udpConnected = true;
  client._prepareUdpRequestSocket = async () => {
    throw new HostLinkConnectionError("injected endpoint bind failure");
  };

  await assert.rejects(
    () => client.clearError(),
    (error) => error instanceof HostLinkConnectionError
      && !(error instanceof HostLinkOperationOutcomeUnknownError)
      && /bind failure/.test(error.message),
  );
  assert.deepEqual(client.trafficStats(), { requestCount: 0, txBytes: 0, rxBytes: 0 });
});

test("Z Float32 is rejected by every low-level numeric entrance before send", async () => {
  const { client, frames } = createFrameRecorder();
  const calls = [
    () => client.read("Z1", ".F"),
    () => client.readConsecutive("Z1", 2, ".F"),
    () => client.write("Z1", 1, ".F"),
    () => client.writeConsecutive("Z1", [1, 2], ".F"),
    () => client.registerMonitorWords([{ device: "Z1", dataFormat: ".F" }]),
  ];
  for (const call of calls) {
    await assert.rejects(call, /Float32.*ineligible.*Z|Unsupported data format suffix/i);
  }
  assert.deepEqual(frames, []);
});

test("set-value and monitor read helpers preserve exact CR-terminated frames", async () => {
  const { client, frames } = createFrameRecorder((command) => {
    if (command === "MBR") return "1 0 1\r";
    if (command === "MWR") return "10 ABC 30\r";
    return "OK\r";
  });

  await client.writeSetValue("T10", 123, ".D");
  await client.writeSetValueConsecutive("C20", [111, 222], ".D");
  await client.registerMonitorBits("R0", "R1", "R2");
  await client.registerMonitorWords([
    { device: "DM0", dataFormat: ".U" },
    { device: "DM1", dataFormat: ".H" },
    { device: "DM2", dataFormat: ".U" },
  ]);
  assert.deepEqual(await client.readMonitorBits(), [1, 0, 1]);
  assert.deepEqual(await client.readMonitorWords(), [10, "0ABC", 30]);
  await assert.rejects(() => client.writeSetValueConsecutive("T0", Array(121).fill(0), ".D"), /count out of range/);

  assert.deepEqual(frames, [
    "WS T10.D 123\r",
    "WSS C20.D 2 111 222\r",
    "MBS R000 R001 R002\r",
    "MWS DM0.U DM1.H DM2.U\r",
    "MBR\r",
    "MWR\r",
  ]);
});

test("monitor word reads validate every token with its registered format", async () => {
  let response = "OK\r";
  const { client } = createFrameRecorder((command) => command === "MWR" ? response : "OK\r");
  await client.registerMonitorWords([
    { device: "DM0", dataFormat: ".U" },
    { device: "DM1", dataFormat: ".H" },
    { device: "DM2", dataFormat: ".U" },
  ]);

  for (const invalid of ["NOT_A_NUMBER ABC 30\r", "10 10000 30\r", "10 ABC -1\r"]) {
    response = invalid;
    await assert.rejects(() => client.readMonitorWords(), /Invalid|outside the range/);
  }
});

test("readComments and readCommentBytes accept XYM alias device types", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("MAIN COMMENT                    \r", "ascii");
  };

  for (const encoding of [undefined, "", "auto", "utf-8", "shift_jis", "windows-31j", "UTF8", "CP932"]) {
    await assert.rejects(() => client.readComments("D10", encoding), /encoding.*utf8, cp932/i);
  }
  assert.deepEqual(commands, []);

  assert.equal(await client.readComments("D10", "utf8"), "MAIN COMMENT");
  assert.equal(await client.readComments("M20", "cp932"), "MAIN COMMENT");
  assert.deepEqual(await client.readCommentBytes("D10"), Buffer.from("MAIN COMMENT                    ", "ascii"));
  assert.deepEqual(commands, ["RDC D10", "RDC M20", "RDC D10"]);

  const plcErrorClient = createTestClient();
  plcErrorClient._exchange = async () => Buffer.from("E1\r", "ascii");
  await assert.rejects(() => plcErrorClient.readCommentBytes("D10"), (error) => error.code === "E1" && error.response === "E1");
});

test("monitor registration accepts XYM bit aliases verified on KV-7500", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };

  await client.registerMonitorBits("X100", "X101", "M100", "M101");
  await client.registerMonitorWords([
    "X100",
    "Y100",
    { device: "D100", dataFormat: ".U" },
    { device: "E100", dataFormat: ".U" },
    { device: "F100", dataFormat: ".U" },
    "MR100",
    "LR100",
  ]);
  await assert.rejects(() => client.registerMonitorWords(["M100"]), /does not support device type 'M'/);
  await assert.rejects(() => client.registerMonitorWords(["L100"]), /does not support device type 'L'/);
  await assert.rejects(() => client.registerMonitorWords([{ device: "D100" }]), /dataFormat is required/);

  assert.deepEqual(commands, ["MBS X100 X101 M100 M101", "MWS X100 Y100 D100.U E100.U F100.U MR100 LR100"]);
});

test("client sends addresses beyond catalog bounds while retaining command limits", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    commands.push(command);
    const count = command.startsWith("RD R") && command.endsWith(".D")
      ? 32
      : command.startsWith("RD R") && command.endsWith(".U")
        ? 16
        : command.startsWith("RDS ")
          ? Number(command.split(" ").at(-1))
          : 1;
    return Buffer.from(`${Array(count).fill("0").join(" ")}\r`, "ascii");
  };

  await client.read("DM65534", ".D");
  await client.readConsecutive("DM65535", 2, ".U");
  await client.readConsecutive("Y1999F", 2);
  await client.readConsecutive("R199900", 2, ".U");
  await client.read("R199900", ".D");
  await client.readConsecutive("CR7900", 2, ".U");
  assert.equal((await client.readConsecutive("CR7900", 16)).length, 16);
  assert.equal((await client.read("R199900", ".U")).length, 16);
  assert.equal((await client.read("R199800", ".D")).length, 32);
  assert.equal((await client.readConsecutive("CR7900", 17)).length, 17);
  assert.deepEqual(commands, [
    "RD DM65534.D", "RDS DM65535.U 2", "RDS Y1999F 2", "RDS R199900.U 2",
    "RD R199900.D", "RDS CR7900.U 2", "RDS CR7900 16", "RD R199900.U",
    "RD R199800.D", "RDS CR7900 17",
  ]);
});

test("AT 32-bit values span by AT device point", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    commands.push(command);
    const count = command === "RD AT7.D" ? 1 : 8;
    return Buffer.from(`${Array(count).fill("0000000000").join(" ")}\r`, "ascii");
  };

  await client.read("AT7", ".D");
  await client.readConsecutive("AT0", 8, ".D");
  await client.readConsecutive("AT1", 8, ".D");

  assert.deepEqual(commands, ["RD AT7.D", "RDS AT0.D 8", "RDS AT1.D 8"]);
});

test("native 32-bit device families span by device point", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    commands.push(command);
    if (command === "RD T3999.D") {
      return Buffer.from("0,0000000000,0000000100\r", "ascii");
    }
    if (command === "RD Z12.D") {
      return Buffer.from("0000070000\r", "ascii");
    }
    if (command === "RDS T3880.D 120") {
      return Buffer.from(Array.from({ length: 120 }, (_, index) => String(index)).join(" ") + "\r", "ascii");
    }
    if (command === "RDS Z1.D 12") {
      return Buffer.from(Array.from({ length: 12 }, (_, index) => String(index)).join(" ") + "\r", "ascii");
    }
    if (command === "RDS T3881.D 120") {
      return Buffer.from(Array.from({ length: 120 }, (_, index) => String(index)).join(" ") + "\r", "ascii");
    }
    if (command === "RDS Z2.D 12") {
      return Buffer.from(Array.from({ length: 12 }, (_, index) => String(index)).join(" ") + "\r", "ascii");
    }
    return Buffer.from("OK\r", "ascii");
  };

  await client.read("T3999", ".D");
  await client.read("Z12", ".D");
  await client.readConsecutive("T3880", 120, ".D");
  await client.readConsecutive("Z1", 12, ".D");
  await client.readConsecutive("T3881", 120, ".D");
  await client.readConsecutive("Z2", 12, ".D");

  assert.deepEqual(commands, [
    "RD T3999.D", "RD Z12.D", "RDS T3880.D 120", "RDS Z1.D 12",
    "RDS T3881.D 120", "RDS Z2.D 12",
  ]);
});

test("AT writes are rejected before sending WR or WRS", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };

  await assert.rejects(() => client.write("AT0", 3533, ".D"), /does not support device type 'AT'/);
  await assert.rejects(() => client.writeConsecutive("AT0", [3533, 5543], ".D"), /does not support device type 'AT'/);

  assert.deepEqual(commands, []);
});

test("expansion unit buffer uses address-suffix command form", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    commands.push(command);
    if (command.startsWith("URD ")) {
      return Buffer.from("123 456\r", "ascii");
    }
    return Buffer.from("OK\r", "ascii");
  };

  assert.deepEqual(await client.readExpansionUnitBuffer(1, 100, 2, ".U"), [123, 456]);
  await client.writeExpansionUnitBuffer(2, 200, [7, 8], ".S");
  await assert.rejects(() => client.readExpansionUnitBuffer(1, 100, 2), /dataFormat is required/);
  await assert.rejects(
    () => client.readExpansionUnitBuffer(1, 59999, 1, ".D"),
    /Expansion buffer span out of range/
  );

  assert.deepEqual(commands, ["URD 01 100.U 2", "UWR 02 200.S 2 7 8"]);
});

test("switchBank sends BE and validates the bank number", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };

  await client.switchBank(1);
  await assert.rejects(() => client.switchBank(16), /bankNo out of range/);

  assert.deepEqual(commands, ["BE 1"]);
});

test("setTime sends WRT with Sunday-based weekday", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };

  await client.setTime(new Date(2026, 2, 15, 1, 2, 3));
  await client.setTime(new Date(2026, 2, 16, 1, 2, 3));
  await client.setTime(new Date(2026, 2, 21, 1, 2, 3));
  await assert.rejects(() => client.setTime([26, 3, 15, 1, 2, 3, 7]), /week out of range/);

  assert.deepEqual(commands, [
    "WRT 26 03 15 01 02 03 0",
    "WRT 26 03 16 01 02 03 1",
    "WRT 26 03 21 01 02 03 6",
  ]);
});

test("queryModel returns the raw model code and known model label", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("63\r", "ascii");
  };

  const model = await client.queryModel();
  assert.deepEqual(model, { code: "63", model: "KV-X550" });
  assert.deepEqual(commands, ["?K"]);
});
