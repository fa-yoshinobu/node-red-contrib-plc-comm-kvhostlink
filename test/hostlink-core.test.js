"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const canonicalKvProfiles = require("./fixtures/kv_device_ranges.json");

const {
  HostLinkClient,
  buildFrame,
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
  assert.equal(normalizePlcProfile(" keyence:kv-x500 "), "keyence:kv-x500");
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
  assert.equal(createTestClient({ port: "8502" }).port, 8502);

  for (const port of [undefined, null, "", " ", false, true, 0, -1, "abc", "1e3", 65536, 1.5]) {
    assert.throws(
      () => createTestClient({ port }),
      /port (is required|out of range)/
    );
  }
});

test("HostLinkClient validates timeout and requires PLC profile metadata", () => {
  assert.throws(
    () => new HostLinkClient({ host: "127.0.0.1", port: 8501, transport: "tcp" }),
    /plcProfile is required/
  );
  assert.equal(createTestClient().timeout, 3000);
  assert.equal(createTestClient({ timeout: "2500" }).timeout, 2500);
  assert.equal(
    createTestClient({ plcProfile: " keyence:kv-5000 " }).plcProfile,
    "keyence:kv-5000"
  );

  for (const timeout of ["", " ", 0, -1, "abc", Number.POSITIVE_INFINITY]) {
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
  traced._emitTrace("send", Buffer.from("ER\r", "ascii"));
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "send");
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
  await Promise.resolve();
  assert.equal(typeof oldSocket.writeCallback, "function");

  const closing = client.close();
  const newSocket = new FakeSocket();
  client._socket = newSocket;
  client._handleTcpData(Buffer.from("STALE\r", "ascii"), oldSocket);
  oldSocket.writeCallback(new Error("old write failed"));

  await assert.rejects(() => request, /old write failed/);
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

  await assert.rejects(() => supersededRequest, /connection changed/);
  assert.equal(successClient._socket, currentSocket);
  assert.equal(currentSocket.destroyed, false);
  assert.deepEqual(successClient.trafficStats(), { requestCount: 0, txBytes: 0, rxBytes: 0 });
});

test("sendRaw returns undecoded response bytes without terminators", async () => {
  const client = createTestClient();
  client._exchange = async () => Buffer.from("E1\r\n", "ascii");
  const raw = await client.sendRaw("?E");
  assert.equal(Buffer.isBuffer(raw), true);
  assert.deepEqual(raw, Buffer.from("E1", "ascii"));
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
  await assert.rejects(() => timedOut._readTcpLine(), /Timeout/);
  assert.equal(timedOut.trafficStats().rxBytes, 0);
});

test("TCP traffic stats are independent of CRLF segmentation", async () => {
  const coalesced = createTestClient({ timeout: 100 });
  const coalescedFirst = coalesced._readTcpLine();
  coalesced._handleTcpData(Buffer.from("FIRST\r\n", "ascii"));
  assert.deepEqual(await coalescedFirst, Buffer.from("FIRST", "ascii"));
  const coalescedSecond = coalesced._readTcpLine();
  coalesced._handleTcpData(Buffer.from("SECOND\n\r", "ascii"));
  assert.deepEqual(await coalescedSecond, Buffer.from("SECOND", "ascii"));
  assert.equal(coalesced.trafficStats().rxBytes, 13);

  const split = createTestClient({ timeout: 100 });
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

test("UDP response requires a CR/LF terminator and invalidates the socket", async () => {
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
  await assert.rejects(() => invalid._writeUdpAndRead(Buffer.from("ER\r")), /missing.*terminator/i);
  assert.deepEqual(invalid.trafficStats(), { requestCount: 1, txBytes: 3, rxBytes: 0 });
  assert.equal(invalid._socket, null);
  assert.equal(invalidSocket.closed, true);

  const valid = createTestClient({ transport: "udp", timeout: 100 });
  const validSocket = new FakeUdpSocket("E1\r");
  valid._socket = validSocket;
  assert.deepEqual(await valid._writeUdpAndRead(Buffer.from("ER\r")), Buffer.from("E1\r"));
  assert.deepEqual(valid.trafficStats(), { requestCount: 1, txBytes: 3, rxBytes: 3 });
  assert.equal(valid._socket, validSocket);
  assert.equal(validSocket.closed, false);
  await valid.close();
  assert.deepEqual(valid.trafficStats(), { requestCount: 1, txBytes: 3, rxBytes: 3 });

  const timedOut = createTestClient({ transport: "udp", timeout: 10 });
  const timeoutSocket = new FakeUdpSocket(null);
  timedOut._socket = timeoutSocket;
  await assert.rejects(() => timedOut._writeUdpAndRead(Buffer.from("ER\r")), /timeout/i);
  assert.deepEqual(timedOut.trafficStats(), { requestCount: 1, txBytes: 3, rxBytes: 0 });
  assert.equal(timeoutSocket.closed, true);
});

test("buildFrame and decodeResponse handle Host Link CR framing", () => {
  const frame = buildFrame("RD DM100");
  assert.equal(frame.toString("ascii"), "RD DM100\r");
  assert.equal(decodeResponse(Buffer.from("123\r\n", "ascii")), "123");
});

test("decodeResponse rejects non-ASCII normal responses but comments can be Shift_JIS", () => {
  const sjisA = Buffer.from([0x82, 0xa0, 0x0d]);

  assert.throws(() => decodeResponse(sjisA), /Non-ASCII response byte 0x82 at offset 0/);
  assert.equal(decodeCommentResponse(sjisA), "あ");
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

test("writeBitInWord serializes the complete read-modify-write operation", async () => {
  const client = createTestClient();
  const frames = [];
  let word = 0;
  client._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    frames.push(command);
    if (command === "RD DM100.U") {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return Buffer.from(`${word}\r`, "ascii");
    }
    const match = /^WR DM100\.U (\d+)$/.exec(command);
    if (match) {
      word = Number(match[1]);
      return Buffer.from("OK\r", "ascii");
    }
    throw new Error(`unexpected command ${command}`);
  };

  await Promise.all([
    client.writeBitInWord("DM100", 0, true),
    client.writeBitInWord("DM100", 1, true),
  ]);

  assert.equal(word, 3);
  assert.deepEqual(frames, ["RD DM100.U", "WR DM100.U 1", "RD DM100.U", "WR DM100.U 3"]);
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

test("non-format commands reject suffix-bearing devices before transport", async () => {
  const { client, frames } = createFrameRecorder();
  for (const invoke of [
    () => client.forcedSet("R0.U"),
    () => client.forcedReset("R0.U"),
    () => client.forcedSetConsecutive("R0.U", 2),
    () => client.forcedResetConsecutive("R0.U", 2),
    () => client.registerMonitorBits("R0.U"),
    () => client.readComments("DM0.U"),
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
  assert.deepEqual(await client.readMonitorWords(), ["10", "ABC", "30"]);
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

test("readComments accepts XYM alias device types", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("MAIN COMMENT                    \r", "ascii");
  };

  assert.equal(await client.readComments("D10"), "MAIN COMMENT");
  assert.equal(await client.readComments("M20"), "MAIN COMMENT");
  assert.deepEqual(commands, ["RDC D10", "RDC M20"]);
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

test("client rejects device spans crossing range before send", async () => {
  const client = createTestClient();
  const commands = [];

  client._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    commands.push(command);
    const count = command === "RD R199800.D" ? 32 : 16;
    return Buffer.from(`${Array(count).fill("0").join(" ")}\r`, "ascii");
  };

  await assert.rejects(() => client.read("DM65534", ".D"), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("DM65535", 2, ".U"), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("Y1999F", 2), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("R199900", 2, ".U"), /Device span out of range/);
  await assert.rejects(() => client.read("R199900", ".D"), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("CR7900", 2, ".U"), /Device span out of range/);

  assert.deepEqual(commands, []);

  assert.equal((await client.readConsecutive("CR7900", 16)).length, 16);
  assert.equal((await client.read("R199900", ".U")).length, 16);
  assert.equal((await client.read("R199800", ".D")).length, 32);
  await assert.rejects(() => client.readConsecutive("CR7900", 17), /Device span out of range/);
  assert.deepEqual(commands, ["RDS CR7900 16", "RD R199900.U", "RD R199800.D"]);
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
  await assert.rejects(() => client.readConsecutive("AT1", 8, ".D"), /Device span out of range/);

  assert.deepEqual(commands, ["RD AT7.D", "RDS AT0.D 8"]);
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
    return Buffer.from("OK\r", "ascii");
  };

  await client.read("T3999", ".D");
  await client.read("Z12", ".D");
  await client.readConsecutive("T3880", 120, ".D");
  await client.readConsecutive("Z1", 12, ".D");
  await assert.rejects(() => client.readConsecutive("T3881", 120, ".D"), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("Z2", 12, ".D"), /Device span out of range/);

  assert.deepEqual(commands, ["RD T3999.D", "RD Z12.D", "RDS T3880.D 120", "RDS Z1.D 12"]);
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
