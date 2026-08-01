"use strict";

const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HostLinkClient,
  formatParsedAddress,
  normalizeAddress,
  normalizeAddressList,
  parseAddress,
  poll,
  readCommentBytes,
  readComments,
  readNamed,
  readTimerCounter,
  readTyped,
  writeNamed,
  writeTyped,
} = require("../lib/hostlink");
const {
  DEFAULT_FORMAT_BY_DEVICE_TYPE,
  DIRECT_BIT_DEVICE_TYPES,
  FLOAT32_DEVICE_TYPES,
  RDC_DEVICE_TYPES,
  WR_DEVICE_TYPES,
} = require("../lib/hostlink/device");

test("parseAddress supports dtype, count, and bit-in-word", () => {
  assert.deepEqual(parseAddress("DM100:U"), {
    base: "DM100",
    dtype: "U",
    bitIndex: null,
    count: 1,
    hasCount: false,
    explicitDtype: true,
  });
  assert.deepEqual(parseAddress("DM100:F"), {
    base: "DM100",
    dtype: "F",
    bitIndex: null,
    count: 1,
    hasCount: false,
    explicitDtype: true,
  });
  assert.deepEqual(parseAddress("DM50.3"), {
    base: "DM50",
    dtype: "BIT_IN_WORD",
    bitIndex: 3,
    count: 1,
    hasCount: false,
    explicitDtype: false,
  });
  assert.deepEqual(parseAddress("DM50.D"), {
    base: "DM50",
    dtype: "BIT_IN_WORD",
    bitIndex: 13,
    count: 1,
    hasCount: false,
    explicitDtype: false,
  });
  assert.deepEqual(parseAddress("DM200:D,4"), {
    base: "DM200",
    dtype: "D",
    bitIndex: null,
    count: 4,
    hasCount: true,
    explicitDtype: true,
  });
  assert.deepEqual(parseAddress("DM250:COMMENT"), {
    base: "DM250",
    dtype: "COMMENT",
    bitIndex: null,
    count: 1,
    hasCount: false,
    explicitDtype: true,
  });
  assert.deepEqual(parseAddress("AT0:D,8"), {
    base: "AT0",
    dtype: "D",
    bitIndex: null,
    count: 8,
    hasCount: true,
    explicitDtype: true,
  });
  assert.throws(() => parseAddress("DM100"), /complete.*grammar/i);
  assert.throws(() => parseAddress("DM100:"), /complete.*grammar/i);
  assert.throws(() => parseAddress("DM100:BOGUS"), /unsupported dtype/i);
});

test("normalizeAddress and formatParsedAddress keep one canonical spelling", () => {
  assert.equal(normalizeAddress(" dm200:d,4 "), "DM200:D,4");
  assert.throws(() => normalizeAddress("100"), /complete.*grammar/i);
  assert.equal(normalizeAddress("dm50.3"), "DM50.3");
  assert.equal(normalizeAddress("dm50.d"), "DM50.D");
  assert.equal(normalizeAddress(" dm250:comment "), "DM250:COMMENT");
  assert.equal(formatParsedAddress(parseAddress("R10:BIT,4")), "R010:BIT,4");
  assert.throws(() => normalizeAddress("dm100:bogus"), /unsupported dtype/i);
  assert.throws(() => normalizeAddress("dm50.s"), /complete.*grammar/i);
  assert.throws(() => parseAddress("DM50:BIT_IN_WORD"), /no bit index/i);
  for (const parsed of [
    { base: "DM0", dtype: "BIT", bitIndex: null, count: 1, hasCount: false, explicitDtype: true },
    { base: "R0", dtype: "F", bitIndex: null, count: 1, hasCount: false, explicitDtype: true },
    { base: "AT0", dtype: "COMMENT", bitIndex: null, count: 1, hasCount: false, explicitDtype: true },
  ]) {
    assert.throws(() => formatParsedAddress(parsed), /only for|Float32|RDC/i);
  }
});

test("runtime and editor apply the same complete address grammar vectors", () => {
  const valid = ["DM100:U", "DM200:D,4", "DM50.3", "R010:BIT", "R010.3", "T0:D", "CTH0:D", "ZF1:F"];
  const invalid = [
    "DM100:U:COMMENT",
    "DM200.3.extra",
    "DM100:",
    "DM100:U.3",
    "DM100:BIT",
    "T0:BIT",
    "T0:F",
    "R0:F",
    "Z1:F",
    "VB0:COMMENT",
    "DM100:BIT_IN_WORD",
    "DM100:U,0",
    "DM100:COMMENT,2",
    "DM100.3,2",
    "DM100:U trailing",
  ];
  const readEditor = loadEditorFunctions("kvhostlink-read.html");
  const writeEditor = loadEditorFunctions("kvhostlink-write.html");

  for (const address of valid) {
    assert.doesNotThrow(() => parseAddress(address), address);
    assert.equal(readEditor.kvValidateAddressToken(address, { allowComment: true }), true, address);
    assert.equal(writeEditor.kvValidateWriteAddressToken(address), true, address);
  }
  for (const address of invalid) {
    assert.throws(() => parseAddress(address), undefined, address);
    assert.equal(readEditor.kvValidateAddressToken(address, { allowComment: true }), false, address);
    assert.equal(writeEditor.kvValidateWriteAddressToken(address), false, address);
  }
  assert.doesNotThrow(() => parseAddress("AT0:D"));
  assert.equal(readEditor.kvValidateAddressToken("AT0:D", { allowComment: true }), true);
  assert.equal(writeEditor.kvValidateWriteAddressToken("AT0:D"), false);
});

test("editor device and dtype compatibility matches runtime metadata exhaustively", () => {
  const readEditor = loadEditorFunctions("kvhostlink-read.html");
  const writeEditor = loadEditorFunctions("kvhostlink-write.html");
  for (const deviceType of Object.keys(DEFAULT_FORMAT_BY_DEVICE_TYPE)) {
    const base = `${deviceType}0`;
    for (const dtype of ["U", "S", "D", "L", "H"]) {
      const address = `${base}:${dtype}`;
      assert.doesNotThrow(() => parseAddress(address), address);
      assert.equal(readEditor.kvValidateAddressToken(address, { allowComment: true }), true, address);
      assert.equal(writeEditor.kvValidateWriteAddressToken(address), WR_DEVICE_TYPES.has(deviceType), address);
    }

    const floatAddress = `${base}:F`;
    const floatAllowed = FLOAT32_DEVICE_TYPES.has(deviceType);
    assert.equal(succeeds(() => parseAddress(floatAddress)), floatAllowed, floatAddress);
    assert.equal(readEditor.kvValidateAddressToken(floatAddress, { allowComment: true }), floatAllowed, floatAddress);
    assert.equal(writeEditor.kvValidateWriteAddressToken(floatAddress), floatAllowed && WR_DEVICE_TYPES.has(deviceType), floatAddress);

    const bitAddress = `${base}:BIT`;
    const bitAllowed = DIRECT_BIT_DEVICE_TYPES.has(deviceType);
    assert.equal(succeeds(() => parseAddress(bitAddress)), bitAllowed, bitAddress);
    assert.equal(readEditor.kvValidateAddressToken(bitAddress, { allowComment: true }), bitAllowed, bitAddress);
    assert.equal(writeEditor.kvValidateWriteAddressToken(bitAddress), bitAllowed && WR_DEVICE_TYPES.has(deviceType), bitAddress);

    const commentAddress = `${base}:COMMENT`;
    const commentAllowed = RDC_DEVICE_TYPES.has(deviceType);
    assert.equal(succeeds(() => parseAddress(commentAddress)), commentAllowed, commentAddress);
    assert.equal(readEditor.kvValidateAddressToken(commentAddress, { allowComment: true }), commentAllowed, commentAddress);
    assert.equal(writeEditor.kvValidateWriteAddressToken(commentAddress), false, commentAddress);

    const wordBitAddress = `${base}.3`;
    assert.doesNotThrow(() => parseAddress(wordBitAddress), wordBitAddress);
    assert.equal(readEditor.kvValidateAddressToken(wordBitAddress, { allowComment: true }), true, wordBitAddress);
    assert.equal(writeEditor.kvValidateWriteAddressToken(wordBitAddress), WR_DEVICE_TYPES.has(deviceType), wordBitAddress);
  }
});

test("Float32 eligibility is the complete canonical ordinary-word family set", () => {
  const expected = ["CM", "D", "DM", "E", "EM", "F", "FM", "TM", "VM", "W", "ZF"];
  const derived = Array.from(FLOAT32_DEVICE_TYPES).sort();

  assert.deepEqual(Array.from(FLOAT32_DEVICE_TYPES).sort(), expected);
  assert.deepEqual(derived, expected);
});

function succeeds(action) {
  try {
    action();
    return true;
  } catch (_error) {
    return false;
  }
}

function loadEditorFunctions(fileName) {
  const html = fs.readFileSync(path.join(__dirname, "..", "nodes", fileName), "utf8");
  const script = /<script type="text\/javascript">([\s\S]*?)<\/script>/.exec(html)[1];
  const context = {
    RED: { nodes: { registerType() {} }, editor: null },
    console,
    Set,
    Object,
    Number,
    String,
    Array,
    JSON,
  };
  vm.runInNewContext(script, context, { filename: fileName });
  return context;
}

test("readNamed and writeNamed reject BIT_IN_WORD without an explicit bit index", async () => {
  const fakeClient = {
    async read() {
      throw new Error("unexpected read");
    },
    async write() {
      throw new Error("unexpected write");
    },
  };

  await assert.rejects(() => readNamed(fakeClient, ["DM50:BIT_IN_WORD"]), /no bit index/i);
  await assert.rejects(() => writeNamed(fakeClient, { "DM50:BIT_IN_WORD": true }), /no bit index/i);
});

test("readNamed and writeNamed reject unknown dtype suffixes", async () => {
  const fakeClient = {
    async read() {
      throw new Error("unexpected read");
    },
    async write() {
      throw new Error("unexpected write");
    },
  };

  await assert.rejects(() => readNamed(fakeClient, ["DM100:BOGUS"]), /unsupported dtype/i);
  await assert.rejects(() => writeNamed(fakeClient, { "DM100:BOGUS": 7 }), /unsupported dtype/i);
  await assert.rejects(() => readTyped(fakeClient, "DM100", "BOGUS"), /unsupported dtype/i);
  await assert.rejects(() => writeTyped(fakeClient, "DM100", "BOGUS", 7), /unsupported dtype/i);
});

test("writeTyped and writeNamed accept Boolean-only BIT values", async () => {
  const writes = [];
  const fakeClient = {
    async write(device, value) {
      writes.push([device, value]);
    },
  };

  await writeTyped(fakeClient, "R0", "BIT", false);
  await writeTyped(fakeClient, "R1", "BIT", true);

  assert.deepEqual(writes, [
    ["R0", false],
    ["R1", true],
  ]);
  for (const value of [0, 1, "0", "1", "ON", "OFF", "true", "false", null]) {
    await assert.rejects(() => writeTyped(fakeClient, "R2", "BIT", value), /invalid BIT value/i);
  }
  await assert.rejects(() => writeNamed(fakeClient, { "R10:BIT,2": [true, 0] }), /invalid BIT value/i);
  await assert.rejects(() => writeNamed(fakeClient, { "DM50.3": true }), /multi-request/i);
});

test("Float32 writes reject every direct bit family before client send", async () => {
  let calls = 0;
  const fakeClient = {
    async writeConsecutive() { calls += 1; },
    async write() { calls += 1; },
  };
  for (const device of ["Y0", "R0", "B0", "MR0", "LR0", "CR0", "VB0", "X0", "M0", "L0"]) {
    await assert.rejects(() => writeTyped(fakeClient, device, "F", 1.0), (error) => error.name === "ValueError");
    await assert.rejects(() => writeNamed(fakeClient, { [`${device}:F`]: 1.0 }), (error) => error.name === "ValueError");
  }
  assert.equal(calls, 0);
});

test("Float32 special-response families fail every high-level entry before FIFO or transport", async () => {
  let admissions = 0;
  let sends = 0;
  const fakeClient = {
    async _runExclusive(action) { admissions += 1; return action(); },
    async read() { sends += 1; return 0; },
    async readConsecutive() { sends += 1; return [0, 0]; },
    async write() { sends += 1; },
    async writeConsecutive() { sends += 1; },
    async writeSetValue() { sends += 1; },
    async writeSetValueConsecutive() { sends += 1; },
  };

  for (const device of ["R0", "T0", "C0", "Z1", "AT0"]) {
    const address = `${device}:F`;
    assert.throws(() => parseAddress(address), /Float32.*ordinary one-word/i);
    assert.throws(() => normalizeAddress(address), /Float32.*ordinary one-word/i);
    assert.throws(() => normalizeAddressList([address]), /Float32.*ordinary one-word/i);
    assert.throws(
      () => formatParsedAddress({ base: device, dtype: "F", bitIndex: null, count: 1, hasCount: false, explicitDtype: true }),
      /Float32.*ordinary one-word/i,
    );
    await assert.rejects(() => readTyped(fakeClient, device, "F"), /Float32.*ordinary one-word/i);
    await assert.rejects(() => writeTyped(fakeClient, device, "F", 1.25), /Float32.*ordinary one-word/i);
    await assert.rejects(() => readNamed(fakeClient, [address]), /Float32.*ordinary one-word/i);
    await assert.rejects(() => writeNamed(fakeClient, { [address]: 1.25 }), /Float32.*ordinary one-word/i);
    const iterator = poll(fakeClient, [address], 1);
    await assert.rejects(() => iterator.next(), /Float32.*ordinary one-word/i);
  }

  assert.equal(admissions, 0);
  assert.equal(sends, 0);
});

test("DM Float32 remains available through parser, formatter, typed, named, and poll paths", async () => {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(1.25, 0);
  const words = [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
  const writes = [];
  const fakeClient = {
    async _runExclusive(action) { return action(); },
    async readConsecutive(device, count, dataFormat) {
      assert.equal(device, "DM0");
      assert.equal(count, 2);
      assert.equal(dataFormat, ".U");
      return words;
    },
    async writeConsecutive(device, values, dataFormat) {
      writes.push({ device, values, dataFormat });
    },
  };

  assert.deepEqual(parseAddress("DM0:F"), {
    base: "DM0", dtype: "F", bitIndex: null, count: 1, hasCount: false, explicitDtype: true,
  });
  assert.equal(normalizeAddress(" dm0:f "), "DM0:F");
  assert.equal(formatParsedAddress(parseAddress("DM0:F")), "DM0:F");
  assert.equal(await readTyped(fakeClient, "DM0", "F"), 1.25);
  assert.deepEqual(await readNamed(fakeClient, ["DM0:F"]), { "DM0:F": 1.25 });
  const iterator = poll(fakeClient, ["DM0:F"], 1);
  assert.deepEqual((await iterator.next()).value, { "DM0:F": 1.25 });
  await iterator.return();
  await writeTyped(fakeClient, "DM0", "F", 1.25);
  await writeNamed(fakeClient, { "DM0:F": 1.25 });
  assert.deepEqual(writes, [
    { device: "DM0", values: words, dataFormat: ".U" },
    { device: "DM0", values: words, dataFormat: ".U" },
  ]);
});

test("high-level H reads normalize to exactly four uppercase digits", async () => {
  const fakeClient = {
    async read() { return "a"; },
  };
  assert.equal(await readTyped(fakeClient, "DM0", "H"), "000A");
  assert.deepEqual(await readNamed(fakeClient, ["DM0:H"]), { "DM0:H": "000A" });
});

test("readTyped parses explicit Host Link BIT response tokens", async () => {
  for (const [token, expected] of [["ON", true], ["1", true], ["OFF", false], ["0", false]]) {
    const fakeClient = { async read() { return token; } };
    assert.equal(await readTyped(fakeClient, "R0", "BIT"), expected);
  }
  await assert.rejects(
    () => readTyped({ async read() { return "UNKNOWN"; } }, "R0", "BIT"),
    /Invalid direct bit response token/
  );
});

test("direct-bit typed and bit-in-word reads pack all sixteen response tokens", async () => {
  const calls = [];
  const fakeClient = {
    async read(device, dataFormat) {
      calls.push({ kind: "read", device, dataFormat });
      const setBits = device === "M100" ? [0, 3, 15] : [3, 8];
      return Array.from({ length: 16 }, (_, bit) => setBits.includes(bit) ? 1 : 0);
    },
    async readConsecutive(device, count, dataFormat) {
      calls.push({ kind: "readConsecutive", device, count, dataFormat });
      return [0x8009, 0x0108];
    },
  };

  assert.equal(await readTyped(fakeClient, "M100", "U"), 0x8009);
  assert.deepEqual(await readNamed(fakeClient, ["M100:U", "R010.3"]), {
    "M100:U": 0x8009,
    "R010.3": true,
  });
  assert.deepEqual(await readNamed(fakeClient, ["M100:U,2"]), {
    "M100:U,2": [0x8009, 0x0108],
  });
  assert.equal(calls.some((call) => call.kind === "readConsecutive"), true);
});

test("BIT dtype rejects timer and counter devices before client execution", async () => {
  let calls = 0;
  const fakeClient = {
    async read() { calls += 1; },
    async write() { calls += 1; },
  };
  for (const address of ["T0:BIT", "C0:BIT", "TC0:BIT", "CC0:BIT"]) {
    assert.throws(() => parseAddress(address), /only for direct bit device/i);
    await assert.rejects(() => readNamed(fakeClient, [address]), /only for direct bit device/i);
    await assert.rejects(() => writeNamed(fakeClient, { [address]: true }), /only for direct bit device/i);
  }
  await assert.rejects(() => readTyped(fakeClient, "T0", "BIT"), /only for direct bit device/i);
  await assert.rejects(() => writeTyped(fakeClient, "C0", "BIT", true), /only for direct bit device/i);
  assert.equal(calls, 0);
});

test("normalizeAddressList keeps count suffixes intact", () => {
  assert.deepEqual(normalizeAddressList("DM100:U,10 DM200:F DM50.3"), ["DM100:U,10", "DM200:F", "DM50.3"]);
  assert.deepEqual(normalizeAddressList('["DM100:U","DM200:D,2"]'), ["DM100:U", "DM200:D,2"]);
  assert.deepEqual(normalizeAddressList([" dm100:u ", "R010:BIT"]), ["dm100:u", "R010:BIT"]);
  assert.throws(() => normalizeAddressList("DM100:Ugarbage"), /unsupported dtype/i);
  assert.throws(() => normalizeAddressList("DM100:U @ DM200:U"), /invalid address list/i);
  for (const invalid of ["garbage", "DM0:BIT", "R0:F", "AT0:COMMENT"]) {
    assert.throws(() => normalizeAddressList([invalid]), /grammar|only for|Float32|RDC/i);
    assert.throws(() => normalizeAddressList(JSON.stringify([invalid])), /grammar|only for|Float32|RDC/i);
  }
});

test("named operations reject empty inputs and compile every write before transport", async () => {
  let calls = 0;
  const fakeClient = {
    async read() { calls += 1; return 0; },
    async write() { calls += 1; },
    async writeConsecutive() { calls += 1; },
  };

  await assert.rejects(() => readNamed(fakeClient, []), /must not be empty/i);
  await assert.rejects(() => writeNamed(fakeClient, {}), /must be a non-empty object/i);
  const iterator = poll(fakeClient, [], 0);
  await assert.rejects(() => iterator.next(), /must not be empty/i);
  await assert.rejects(
    () => writeNamed(fakeClient, { "DM100:U": 123, "DM101:U": "123" }),
    /invalid U value/i,
  );
  assert.equal(calls, 0);
});

test("numeric writes reject coercion, fractions, wrapping, and float32 overflow before transport", async () => {
  let calls = 0;
  const fakeClient = {
    async write() { calls += 1; },
    async writeConsecutive() { calls += 1; },
    async writeSetValue() { calls += 1; },
    async writeSetValueConsecutive() { calls += 1; },
  };
  const invalid = [
    ["DM100:U", null], ["DM100:U", false], ["DM100:U", "1"], ["DM100:U", []],
    ["DM100:U", 1.5], ["DM100:U", -1], ["DM100:U", 0x10000],
    ["DM100:S", -0x8001], ["DM100:S", 0x8000],
    ["DM100:D", -1], ["DM100:D", 0x100000000],
    ["DM100:L", -0x80000001], ["DM100:L", 0x80000000],
    ["DM100:F", "1.5"], ["DM100:F", false], ["DM100:F", null],
    ["DM100:F", Number.NaN], ["DM100:F", Number.POSITIVE_INFINITY], ["DM100:F", 1e39],
  ];
  for (const [address, value] of invalid) {
    await assert.rejects(() => writeNamed(fakeClient, { [address]: value }), /invalid|finite|float32|range/i, `${address}=${String(value)}`);
  }
  assert.equal(calls, 0);
});

test("readTyped reads float through two words", async () => {
  const fakeClient = {
    async readConsecutive() {
      const buffer = Buffer.alloc(4);
      buffer.writeFloatLE(12.5, 0);
      return [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
    },
  };

  assert.equal(await readTyped(fakeClient, "DM100", "F"), 12.5);
});

test("comment helpers delegate explicit text encoding or exact raw bytes", async () => {
  const fakeClient = {
    async readComments(device, encoding) {
      assert.equal(device, "DM250");
      assert.equal(encoding, "cp932");
      return "MAIN COMMENT";
    },
    async readCommentBytes(device) {
      assert.equal(device, "DM250");
      return Buffer.from([0x82, 0xa0, 0x20]);
    },
  };

  assert.equal(await readComments(fakeClient, "DM250", "cp932"), "MAIN COMMENT");
  assert.deepEqual(await readCommentBytes(fakeClient, "DM250"), Buffer.from([0x82, 0xa0, 0x20]));
  await assert.rejects(() => readComments(fakeClient, "DM250"), /encoding.*utf8, cp932/i);
});

test("readTyped uses preset value from timer and counter composite responses", async () => {
  const fakeClient = {
    async read(device) {
      if (device === "T10") {
        return [0, 12345, 12345];
      }
      if (device === "C10") {
        return [0, 0, 12345];
      }
      throw new Error(`unexpected read ${device}`);
    },
  };

  assert.equal(await readTyped(fakeClient, "T10", "D"), 12345);
  assert.equal(await readTyped(fakeClient, "T10", "U"), 12345);
  assert.equal(await readTyped(fakeClient, "C10", "D"), 12345);
});

test("readNamed uses preset value from timer and counter composite responses", async () => {
  const fakeClient = {
    async read(device) {
      if (device === "T10") {
        return [0, 10, 20];
      }
      if (device === "C10") {
        return [0, 0, 30];
      }
      throw new Error(`unexpected read ${device}`);
    },
  };

  assert.deepEqual(await readNamed(fakeClient, ["T10:D", "C10:D"]), {
    "T10:D": 20,
    "C10:D": 30,
  });
});

test("readTimerCounter returns status current and preset", async () => {
  const fakeClient = {
    async read(device, dataFormat) {
      assert.equal(device, "T10");
      assert.equal(dataFormat, ".D");
      return [1, 10, 20];
    },
  };

  assert.deepEqual(await readTimerCounter(fakeClient, "T10"), {
    status: 1,
    current: 10,
    preset: 20,
  });
});

test("readNamed reads native 32-bit Z dword through native dword read", async () => {
  const calls = [];
  const fakeClient = {
    async read(device, dataFormat) {
      calls.push({ device, dataFormat: dataFormat || "" });
      if (device === "Z1" && dataFormat === ".D") {
        return 70000;
      }
      throw new Error(`unexpected read ${device} ${dataFormat || ""}`);
    },
  };

  assert.deepEqual(await readNamed(fakeClient, ["Z1:D"]), {
    "Z1:D": 70000,
  });
  assert.deepEqual(calls, [{ device: "Z1", dataFormat: ".D" }]);
});

test("readNamed batches optimizable contiguous word requests", async () => {
  const calls = [];
  const fakeClient = {
    async readConsecutive(device, count, dataFormat) {
      calls.push({ device, count, dataFormat: dataFormat || "" });
      if (device === "DM100" && count === 7 && dataFormat === ".U") {
        const values = [123, 0xfffb];
        const dword = Buffer.alloc(4);
        dword.writeUInt32LE(0x12345678, 0);
        values.push(dword.readUInt16LE(0), dword.readUInt16LE(2));
        const float = Buffer.alloc(4);
        float.writeFloatLE(3.5, 0);
        values.push(float.readUInt16LE(0), float.readUInt16LE(2));
        values.push(8);
        return values;
      }
      throw new Error(`unexpected readConsecutive ${device} ${count} ${dataFormat || ""}`);
    },
  };

  const snapshot = await readNamed(fakeClient, ["DM100:U", "DM101:S", "DM102:D", "DM104:F", "DM106.3"]);
  assert.deepEqual(snapshot, {
    "DM100:U": 123,
    "DM101:S": -5,
    "DM102:D": 0x12345678,
    "DM104:F": 3.5,
    "DM106.3": true,
  });
  assert.deepEqual(calls, [{ device: "DM100", count: 7, dataFormat: ".U" }]);
});

test("readNamed splits contiguous plans at the RDS point limit", async () => {
  const calls = [];
  const fakeClient = {
    async readConsecutive(device, count, dataFormat) {
      calls.push({ device, count, dataFormat });
      return Array(count).fill(7);
    },
  };
  const addresses = Array.from({ length: 2001 }, (_, index) => `DM${index}:U`);

  const snapshot = await readNamed(fakeClient, addresses);

  assert.equal(Object.keys(snapshot).length, 2001);
  assert.equal(addresses.every((address) => snapshot[address] === 7), true);
  assert.deepEqual(calls, [
    { device: "DM0", count: 1000, dataFormat: ".U" },
    { device: "DM1000", count: 1000, dataFormat: ".U" },
    { device: "DM2000", count: 1, dataFormat: ".U" },
  ]);
});

test("readNamed preserves declared wire order and never sorts descending entries", async () => {
  const calls = [];
  const fakeClient = {
    async readConsecutive(device, count, dataFormat) {
      calls.push({ device, count, dataFormat });
      return Array(count).fill(device === "DM10" ? 10 : device === "DM2" ? 2 : 7);
    },
  };
  const result = await readNamed(fakeClient, ["DM10:U", "DM2:U", "DM3:U"]);
  assert.deepEqual(result, { "DM10:U": 10, "DM2:U": 2, "DM3:U": 2 });
  assert.deepEqual(calls, [
    { device: "DM10", count: 1, dataFormat: ".U" },
    { device: "DM2", count: 2, dataFormat: ".U" },
  ]);
});

test("readNamed splits only before an input entry and keeps a dword whole", async () => {
  const calls = [];
  const fakeClient = {
    async readConsecutive(device, count, dataFormat) {
      calls.push({ device, count, dataFormat });
      return Array(count).fill(0);
    },
  };
  const addresses = [
    ...Array.from({ length: 999 }, (_, index) => `DM${index}:U`),
    "DM999:D",
  ];
  await readNamed(fakeClient, addresses);
  assert.deepEqual(calls, [
    { device: "DM0", count: 999, dataFormat: ".U" },
    { device: "DM999", count: 2, dataFormat: ".U" },
  ]);
});

test("readNamed rejects semantic duplicates but permits distinct and overlapping interpretations", async () => {
  let calls = 0;
  const fakeClient = {
    async read() { calls += 1; return 1; },
    async readConsecutive(_device, count) {
      calls += 1;
      return Array.from({ length: count }, (_, index) => index + 1);
    },
  };
  await assert.rejects(() => readNamed(fakeClient, ["DM0:U", "DM1:U,1001"]), /out of range/i);
  for (const addresses of [
    ["DM0:U", "DM0:U"],
    ["dm0:u", "DM0000:U"],
    ["DM0:U", "DM0:U,1"],
  ]) {
    await assert.rejects(() => readNamed(fakeClient, addresses), /semantically duplicate address/i);
  }
  assert.equal(calls, 0);

  const result = await readNamed(fakeClient, ["dm0:u", "DM0:S", "DM0.0", "DM0.1", "DM0:U,2", "DM1:U,2"]);
  assert.deepEqual(Object.keys(result), ["dm0:u", "DM0:S", "DM0.0", "DM0.1", "DM0:U,2", "DM1:U,2"]);
  assert.equal(calls > 0, true);
});

test("readNamed snapshots the admitted address list before FIFO waiting", async () => {
  const client = new HostLinkClient({
    host: "127.0.0.1",
    port: 8501,
    transport: "tcp",
    plcProfile: "keyence:kv-x500",
  });
  client._socket = {};
  client._generation = 1;
  let release;
  const blocker = client._runExclusive(() => new Promise((resolve) => { release = resolve; }));
  const calls = [];
  client._exchange = async (payload) => {
    calls.push(payload.toString("ascii").trim());
    return Buffer.from("1 2", "ascii");
  };
  const addresses = ["DM0:U", "DM1:U"];
  const pending = readNamed(client, addresses);
  addresses[0] = "DM100:U";
  addresses.push("DM200:U");
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await blocker;
  assert.deepEqual(await pending, { "DM0:U": 1, "DM1:U": 2 });
  assert.deepEqual(calls, ["RDS DM0.U 2"]);
});

test("multi-request readNamed keeps one exclusive FIFO turn", async () => {
  const client = new HostLinkClient({
    host: "127.0.0.1",
    port: 8501,
    transport: "tcp",
    plcProfile: "keyence:kv-x500",
  });
  client._socket = {};
  client._generation = 1;
  const commands = [];
  let releaseFirst;
  let firstStartedResolve;
  const firstStarted = new Promise((resolve) => { firstStartedResolve = resolve; });
  const firstBlocked = new Promise((resolve) => { releaseFirst = resolve; });
  client._exchange = async (payload) => {
    const command = payload.toString("ascii").replace(/\r$/, "");
    commands.push(command);
    if (commands.length === 1) {
      firstStartedResolve();
      await firstBlocked;
    }
    return Buffer.from(command === "?K" ? "63" : "7", "ascii");
  };

  const aggregate = readNamed(client, ["DM0:U", "DM1000:U"]);
  await firstStarted;
  const later = client.queryModel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(commands.length, 1);
  releaseFirst();

  assert.deepEqual(await aggregate, { "DM0:U": 7, "DM1000:U": 7 });
  assert.equal((await later).code, "63");
  assert.deepEqual(commands, ["RDS DM0.U 1", "RDS DM1000.U 1", "?K"]);
});

test("readNamed batches direct bit requests", async () => {
  const calls = [];
  const fakeClient = {
    async readConsecutive(device, count, dataFormat) {
      calls.push({ device, count, dataFormat: dataFormat || "" });
      if (device === "X100" && count === 2) {
        return [1, 0];
      }
      if (device === "R000" && count === 4) {
        return [1, 0, 1, 0];
      }
      throw new Error(`unexpected readConsecutive ${device} ${count} ${dataFormat || ""}`);
    },
  };

  const snapshot = await readNamed(fakeClient, ["X100:BIT", "X101:BIT", "R0:BIT", "R1:BIT", "R2:BIT", "R3:BIT"]);

  assert.deepEqual(snapshot, {
    "X100:BIT": true,
    "X101:BIT": false,
    "R0:BIT": true,
    "R1:BIT": false,
    "R2:BIT": true,
    "R3:BIT": false,
  });
  assert.deepEqual(calls, [
    { device: "X100", count: 2, dataFormat: "" },
    { device: "R000", count: 4, dataFormat: "" },
  ]);
});

test("readNamed batches bit-bank direct bits across display bank boundary", async () => {
  const calls = [];
  const fakeClient = {
    async readConsecutive(device, count, dataFormat) {
      calls.push({ device, count, dataFormat: dataFormat || "" });
      if (device === "CR3614" && count === 4) {
        return [0, 1, 0, 1];
      }
      throw new Error(`unexpected readConsecutive ${device} ${count} ${dataFormat || ""}`);
    },
  };

  const snapshot = await readNamed(fakeClient, ["CR3614:BIT", "CR3615:BIT", "CR3700:BIT", "CR3701:BIT"]);

  assert.deepEqual(snapshot, {
    "CR3614:BIT": false,
    "CR3615:BIT": true,
    "CR3700:BIT": false,
    "CR3701:BIT": true,
  });
  assert.deepEqual(calls, [{ device: "CR3614", count: 4, dataFormat: "" }]);
});

test("readNamed falls back for mixed scalar, dword, float, bit, and array reads", async () => {
  const fakeClient = {
    async read(device, dataFormat) {
      if (device === "DM100" && dataFormat === ".U") {
        return 123;
      }
      if (device === "DM101" && dataFormat === ".S") {
        return 65531;
      }
      if (device === "DM200" && dataFormat === ".D") {
        return 0x12345678;
      }
      if (device === "R010") {
        return 1;
      }
      if (device === "DM50" && dataFormat === ".U") {
        return 8;
      }
      throw new Error(`unexpected read ${device} ${dataFormat || ""}`);
    },
    async readConsecutive(device, count, dataFormat) {
      if (device === "DM300" && count === 2 && dataFormat === ".U") {
        const buffer = Buffer.alloc(4);
        buffer.writeFloatLE(3.5, 0);
        return [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
      }
      if (device === "DM400" && count === 3 && dataFormat === ".U") {
        return [1, 2, 3];
      }
      if (device === "R010" && count === 4) {
        return [1, 0, 1, 0];
      }
      throw new Error(`unexpected readConsecutive ${device} ${count} ${dataFormat || ""}`);
    },
    async readComments(device, encoding) {
      if (device === "DM250") {
        assert.equal(encoding, "utf8");
        return "MAIN COMMENT";
      }
      throw new Error(`unexpected readComments ${device}`);
    },
  };

  const snapshot = await readNamed(
    fakeClient,
    ["DM100:U", "DM101:S", "DM200:D", "DM300:F", "DM50.3", "R010:BIT", "DM250:COMMENT", "DM400:U,3", "R010:BIT,4"],
    { commentOutput: "text", commentEncoding: "utf8" },
  );
  assert.deepEqual(snapshot, {
    "DM100:U": 123,
    "DM101:S": -5,
    "DM200:D": 0x12345678,
    "DM300:F": 3.5,
    "DM50.3": true,
    "R010:BIT": true,
    "DM250:COMMENT": "MAIN COMMENT",
    "DM400:U,3": [1, 2, 3],
    "R010:BIT,4": [true, false, true, false],
  });
});

test("readNamed preflights explicit comment mode and supports raw Buffer output", async () => {
  let calls = 0;
  const fakeClient = {
    async readComments() { calls += 1; return "unexpected"; },
    async readCommentBytes(device) {
      calls += 1;
      assert.equal(device, "DM250");
      return Buffer.from([0xc2, 0xa2, 0x20]);
    },
  };

  for (const options of [
    undefined,
    {},
    { commentOutput: "text" },
    { commentOutput: "text", commentEncoding: "auto" },
    { commentOutput: "buffer", commentEncoding: "utf8" },
    { commentOutput: "raw" },
  ]) {
    await assert.rejects(() => readNamed(fakeClient, ["DM250:COMMENT"], options), /commentOutput|commentEncoding/i);
  }
  assert.equal(calls, 0);

  const snapshot = await readNamed(fakeClient, ["DM250:COMMENT"], { commentOutput: "buffer" });
  assert.deepEqual(snapshot, { "DM250:COMMENT": Buffer.from([0xc2, 0xa2, 0x20]) });
  assert.equal(calls, 1);
  await assert.rejects(
    () => readNamed(fakeClient, ["DM100:U"], { commentOutput: "text", commentEncoding: "utf8" }),
    /require at least one :COMMENT/i,
  );
});

test("readNamed reads native 32-bit dword arrays as device points", async () => {
  const calls = [];
  const fakeClient = {
    async readConsecutive(device, count, dataFormat) {
      calls.push({ device, count, dataFormat: dataFormat || "" });
      if (device === "AT0" && count === 2 && dataFormat === ".D") {
        return [3533, 5543];
      }
      if (device === "Z1" && count === 2 && dataFormat === ".D") {
        return [70000, 80000];
      }
      throw new Error(`unexpected readConsecutive ${device} ${count} ${dataFormat || ""}`);
    },
  };

  assert.deepEqual(await readNamed(fakeClient, ["AT0:D,2", "Z1:D,2"]), {
    "AT0:D,2": [3533, 5543],
    "Z1:D,2": [70000, 80000],
  });
  assert.deepEqual(calls, [
    { device: "AT0", count: 2, dataFormat: ".D" },
    { device: "Z1", count: 2, dataFormat: ".D" },
  ]);
});

test("poll reuses compiled read plan", async () => {
  let callCount = 0;
  const fakeClient = {
    async readConsecutive(device, count, dataFormat) {
      assert.equal(device, "DM100");
      assert.equal(count, 2);
      assert.equal(dataFormat, ".U");
      callCount += 1;
      return [10 + callCount, 20 + callCount];
    },
  };

  const iterator = poll(fakeClient, ["DM100:U", "DM101:U"], 1);
  const first = await iterator.next();
  const second = await iterator.next();

  assert.deepEqual(first.value, { "DM100:U": 11, "DM101:U": 21 });
  assert.deepEqual(second.value, { "DM100:U": 12, "DM101:U": 22 });
  await iterator.return();
});

test("poll requires one millisecond and rejects values beyond the native timer range before read", async () => {
  let calls = 0;
  const fakeClient = {
    async readConsecutive() {
      calls += 1;
      return [1];
    },
  };

  for (const interval of [0, -1, 2147483648, Number.MAX_SAFE_INTEGER]) {
    const iterator = poll(fakeClient, ["DM0:U"], interval);
    await assert.rejects(() => iterator.next(), /intervalMs.*1\.\.2147483647/i);
  }
  assert.equal(calls, 0);

  for (const interval of [1, 2147483647]) {
    const iterator = poll(fakeClient, ["DM0:U"], interval);
    assert.deepEqual((await iterator.next()).value, { "DM0:U": 1 });
    await iterator.return();
  }
  assert.equal(calls, 2);
});

test("poll requires the explicit RDC output contract before the first read", async () => {
  let calls = 0;
  const fakeClient = {
    async readComments(device, encoding) {
      calls += 1;
      assert.equal(device, "DM250");
      assert.equal(encoding, "cp932");
      return "MAIN COMMENT";
    },
    async readCommentBytes(device) {
      calls += 1;
      assert.equal(device, "DM250");
      return Buffer.from([0x82, 0xa0, 0x20]);
    },
  };

  for (const options of [undefined, {}, { commentOutput: "text" }, { commentOutput: "buffer", commentEncoding: "cp932" }]) {
    const invalidIterator = poll(fakeClient, ["DM250:COMMENT"], 1, options);
    await assert.rejects(() => invalidIterator.next(), /commentOutput|commentEncoding/i);
  }
  assert.equal(calls, 0);

  const textIterator = poll(fakeClient, ["DM250:COMMENT"], 1, { commentOutput: "text", commentEncoding: "cp932" });
  assert.deepEqual((await textIterator.next()).value, { "DM250:COMMENT": "MAIN COMMENT" });
  await textIterator.return();

  const bufferIterator = poll(fakeClient, ["DM250:COMMENT"], 1, { commentOutput: "buffer" });
  assert.deepEqual((await bufferIterator.next()).value, { "DM250:COMMENT": Buffer.from([0x82, 0xa0, 0x20]) });
  await bufferIterator.return();
  assert.equal(calls, 2);
});

test("kvhostlink-connection validates runtime options and exposes PLC profile", async () => {
  const constructorOptions = [];

  class FakeHostLinkClient {
    constructor(options) {
      constructorOptions.push(options);
    }

    async connect() {}

    async close() {}
  }

  await withMockedHostlink({ HostLinkClient: FakeHostLinkClient }, async () => {
    const { RED, create } = createMockRed();
    require("../nodes/kvhostlink-connection")(RED);

    assert.throws(() => create("kvhostlink-connection", {
      id: "conn-missing-port",
      host: "192.168.0.10",
      plcProfile: "keyence:kv-5000",
      transport: "tcp",
    }), /port/);

    const node = create("kvhostlink-connection", {
      id: "conn-explicit-port",
      host: "192.168.0.10",
      port: 8501,
      transport: "tcp",
      plcProfile: "keyence:kv-5000",
    });

    assert.equal(constructorOptions[0].port, 8501);
    assert.equal(constructorOptions[0].timeout, 3000);
    assert.equal(constructorOptions[0].plcProfile, "keyence:kv-5000");
    assert.deepEqual(node.getProfile(), {
      host: "192.168.0.10",
      port: 8501,
      transport: "tcp",
      timeout: 3000,
      plcProfile: "keyence:kv-5000",
    });
    assert.throws(
      () =>
        create("kvhostlink-connection", {
          id: "conn-blank-port",
          host: "192.168.0.10",
          port: "",
          transport: "tcp",
          plcProfile: "keyence:kv-5000",
        }),
      /kvhostlink-connection port is required/
    );
    assert.throws(
      () =>
        create("kvhostlink-connection", {
          id: "conn-out-of-range-port",
          host: "192.168.0.10",
          port: "65536",
          transport: "tcp",
          plcProfile: "keyence:kv-5000",
        }),
      /kvhostlink-connection port out of range/
    );
    assert.throws(
      () =>
        create("kvhostlink-connection", {
          id: "conn-invalid-timeout",
          host: "192.168.0.10",
          port: 8501,
          transport: "tcp",
          timeout: "0",
          plcProfile: "keyence:kv-5000",
        }),
      /kvhostlink-connection timeout/
    );
  });
});

test("writeNamed batches consecutive writes and keeps special cases correct", async () => {
  const calls = [];
  const fakeClient = {
    async read() {
      return 0;
    },
    async write(device, value, dataFormat) {
      calls.push({ kind: "write", device, value, dataFormat: dataFormat || "" });
    },
    async writeConsecutive(device, values, dataFormat) {
      calls.push({ kind: "writeConsecutive", device, values: Array.from(values), dataFormat: dataFormat || "" });
    },
    async writeSetValueConsecutive(device, values, dataFormat) {
      calls.push({ kind: "writeSetValueConsecutive", device, values: Array.from(values), dataFormat: dataFormat || "" });
    },
  };

  const explicitWrites = [
    { "DM100:U": 123, "DM101:U": 456 },
    { "DM102:S": -5, "DM103:S": -6 },
    { "DM200:F": 2.5, "DM202:F": 3.5 },
    { "DM300:U,3": [1, 2, 3] },
    { "R010:BIT": true, "R011:BIT": false },
    { "R100:BIT,4": [true, false, true, false] },
    { "T10:D": 111, "T11:D": 222 },
    { "C10:D": 333, "C11:D": 444 },
    { "Z1:D": 70000, "Z2:D": 80000 },
    { "TC0:D": 90000, "TC1:D": 100000 },
    { "T20:D,2": [555, 666] },
  ];
  for (const updates of explicitWrites) await writeNamed(fakeClient, updates);

  assert.deepEqual(calls, [
    { kind: "writeConsecutive", device: "DM100", values: [123, 456], dataFormat: ".U" },
    { kind: "writeConsecutive", device: "DM102", values: [-5, -6], dataFormat: ".S" },
    { kind: "writeConsecutive", device: "DM200", values: [0, 16416, 0, 16480], dataFormat: ".U" },
    { kind: "writeConsecutive", device: "DM300", values: [1, 2, 3], dataFormat: ".U" },
    { kind: "writeConsecutive", device: "R010", values: [true, false], dataFormat: "" },
    { kind: "writeConsecutive", device: "R100", values: [true, false, true, false], dataFormat: "" },
    { kind: "writeSetValueConsecutive", device: "T10", values: [111, 222], dataFormat: ".D" },
    { kind: "writeSetValueConsecutive", device: "C10", values: [333, 444], dataFormat: ".D" },
    { kind: "writeConsecutive", device: "Z1", values: [70000, 80000], dataFormat: ".D" },
    { kind: "writeConsecutive", device: "TC0", values: [90000, 100000], dataFormat: ".D" },
    { kind: "writeSetValueConsecutive", device: "T20", values: [555, 666], dataFormat: ".D" },
  ]);
});

test("writeNamed batches R MR LR and CR bits across display-bank boundaries", async () => {
  const calls = [];
  const fakeClient = {
    async writeConsecutive(device, values, dataFormat) {
      calls.push({ device, values: Array.from(values), dataFormat });
    },
  };

  for (const family of ["R", "MR", "LR", "CR"]) {
    await writeNamed(fakeClient, {
      [`${family}115:BIT`]: true,
      [`${family}200:BIT`]: false,
    });
  }
  await writeNamed(fakeClient, { "R114:BIT": false, "R115:BIT": true });
  await writeNamed(fakeClient, {
    "CR3614:BIT": false,
    "CR3615:BIT": true,
    "CR3700:BIT": false,
    "CR3701:BIT": true,
  });

  assert.deepEqual(calls, [
    { device: "R115", values: [true, false], dataFormat: undefined },
    { device: "MR115", values: [true, false], dataFormat: undefined },
    { device: "LR115", values: [true, false], dataFormat: undefined },
    { device: "CR115", values: [true, false], dataFormat: undefined },
    { device: "R114", values: [false, true], dataFormat: undefined },
    { device: "CR3614", values: [false, true, false, true], dataFormat: undefined },
  ]);
});

test("writeNamed rejects bit-bank gaps duplicates reverse order and mixed batches atomically", async () => {
  let sends = 0;
  const fakeClient = {
    async write() { sends += 1; },
    async writeConsecutive() { sends += 1; },
    async writeSetValueConsecutive() { sends += 1; },
  };
  const rejectedUpdates = [
    { "R115:BIT": true, "R201:BIT": false },
    { "R0:BIT": true, "R000:BIT": false },
    { "R200:BIT": true, "R115:BIT": false },
    { "R115:BIT": true, "MR200:BIT": false },
    { "R115:BIT": true, "R200:U": 1 },
    { "R115:BIT": true, "M32:BIT": false },
  ];
  for (const updates of rejectedUpdates) {
    await assert.rejects(() => writeNamed(fakeClient, updates), /must fit one Host Link request/i);
  }

  for (const address of ["R116:BIT", "MR199:BIT", "LR999:BIT", "CR900719925474099100:BIT"]) {
    await assert.rejects(() => writeNamed(fakeClient, { [address]: true }), /invalid|safe integer/i);
  }
  await assert.rejects(
    () => writeNamed(fakeClient, { "R115:BIT_IN_WORD": true }),
    /no bit index/i,
  );

  await writeNamed(fakeClient, { "M115:BIT": true, "M116:BIT": false });
  await writeNamed(fakeClient, { "R115:U": 123 });
  assert.equal(sends, 2);
});

test("writeNamed preserves the 1000-bit request limit across bit-bank boundaries", async () => {
  const calls = [];
  const fakeClient = {
    async writeConsecutive(device, values, dataFormat) {
      calls.push({ device, values: Array.from(values), dataFormat });
    },
  };
  const bitBankAddress = (logicalNumber) => {
    const bank = Math.floor(logicalNumber / 16);
    const bit = logicalNumber % 16;
    return `R${bank}${String(bit).padStart(2, "0")}:BIT`;
  };
  const makeUpdates = (count) => Object.fromEntries(
    Array.from({ length: count }, (_, index) => [bitBankAddress(15 + index), index % 2 === 0]),
  );

  await writeNamed(fakeClient, makeUpdates(1000));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].device, "R015");
  assert.equal(calls[0].values.length, 1000);
  assert.deepEqual(calls[0].values.slice(0, 4), [true, false, true, false]);

  await assert.rejects(() => writeNamed(fakeClient, makeUpdates(1001)), /allowed:? 1\.\.1000/i);
  assert.equal(calls.length, 1);
});

test("writeNamed preflights complete word dword and timer groups before any send", async () => {
  let calls = 0;
  const fakeClient = {
    async writeConsecutive() { calls += 1; },
    async writeSetValueConsecutive() { calls += 1; },
  };
  const wordTooLarge = Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [`DM${index}:U`, index & 0xffff]));
  const dwordTooLarge = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`DM${index * 2}:D`, index]));
  const timerTooLarge = Object.fromEntries(Array.from({ length: 121 }, (_, index) => [`T${index}:D`, index]));
  for (const updates of [wordTooLarge, dwordTooLarge, timerTooLarge, { "DM0:U": 1, ...timerTooLarge }]) {
    await assert.rejects(() => writeNamed(fakeClient, updates), /allowed|out of range/i);
  }
  await assert.rejects(
    () => writeNamed(fakeClient, { "DM0:U": 1, "AT0:D": 2 }),
    /read-only device family 'AT'/i,
  );
  await assert.rejects(
    () => writeNamed(fakeClient, { "DM0:U": 1, "DM2:S": -1 }),
    /must fit one Host Link request/i,
  );
  assert.equal(calls, 0);

  await writeNamed(fakeClient, Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`DM${index}:U`, index & 0xffff])));
  await writeNamed(fakeClient, Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`DM${index * 2}:D`, index])));
  await writeNamed(fakeClient, Object.fromEntries(Array.from({ length: 120 }, (_, index) => [`T${index}:D`, index])));
  assert.equal(calls, 3);
});

test("writeNamed does not merge typed word values on direct-bit device families", async () => {
  const calls = [];
  const fakeClient = {
    async write(device, value, dataFormat) {
      calls.push({ kind: "write", device, value, dataFormat });
    },
    async writeConsecutive(device, values, dataFormat) {
      calls.push({ kind: "writeConsecutive", device, values: Array.from(values), dataFormat });
    },
  };

  const explicitWrites = [
    { "M100:U": 1 },
    { "M101:U": 2 },
    { "M102:S": -1 },
    { "M103:S": -2 },
    { "M104:H": 0x1234 },
    { "M105:H": 0x5678 },
    { "M200:D": 0x12345678 },
    { "M202:D": 0x23456789 },
    { "M300:L": -2 },
    { "M302:L": -3 },
    { "M500:BIT": true, "M501:BIT": false },
  ];
  for (const updates of explicitWrites) await writeNamed(fakeClient, updates);

  assert.deepEqual(calls.slice(0, 10).map(({ kind, device, dataFormat }) => ({ kind, device, dataFormat })), [
    { kind: "write", device: "M100", dataFormat: ".U" },
    { kind: "write", device: "M101", dataFormat: ".U" },
    { kind: "write", device: "M102", dataFormat: ".S" },
    { kind: "write", device: "M103", dataFormat: ".S" },
    { kind: "write", device: "M104", dataFormat: ".H" },
    { kind: "write", device: "M105", dataFormat: ".H" },
    { kind: "write", device: "M200", dataFormat: ".D" },
    { kind: "write", device: "M202", dataFormat: ".D" },
    { kind: "write", device: "M300", dataFormat: ".L" },
    { kind: "write", device: "M302", dataFormat: ".L" },
  ]);
  assert.deepEqual(calls.slice(10), [
    { kind: "writeConsecutive", device: "M500", values: [true, false], dataFormat: undefined },
  ]);
  await assert.rejects(
    () => writeNamed(fakeClient, { "M400:F": 1.5, "M402:F": 2.5 }),
    /Float32.*direct bit/i,
  );
});

function createMockRed() {
  const registeredTypes = new Map();
  const nodes = new Map();

  const RED = {
    nodes: {
      createNode(node, config) {
        const emitter = new EventEmitter();
        node.on = emitter.on.bind(emitter);
        node.once = emitter.once.bind(emitter);
        node.emit = emitter.emit.bind(emitter);
        node.removeListener = emitter.removeListener.bind(emitter);
        node.statusCalls = [];
        node.status = (status) => node.statusCalls.push(status);
        node.id = config.id;
        node.credentials = config.credentials || {};
        if (config.id) {
          nodes.set(config.id, node);
        }
      },
      registerType(name, constructor) {
        registeredTypes.set(name, constructor);
      },
      getNode(id) {
        return nodes.get(id);
      },
    },
  };

  return {
    RED,
    create(name, config) {
      const Constructor = registeredTypes.get(name);
      assert.ok(Constructor, `Node type ${name} is not registered`);
      return new Constructor(config);
    },
  };
}

async function withMockedHostlink(overrides, work) {
  const hostlinkModulePath = require.resolve("../lib/hostlink");
  const originalHostlinkModule = require.cache[hostlinkModulePath];
  const nodeModulePaths = [require.resolve("../nodes/kvhostlink-connection")];
  const originalNodeModules = new Map(nodeModulePaths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  const actual = require("../lib/hostlink");

  require.cache[hostlinkModulePath] = {
    id: hostlinkModulePath,
    filename: hostlinkModulePath,
    loaded: true,
    exports: { ...actual, ...overrides },
  };

  for (const modulePath of nodeModulePaths) {
    delete require.cache[modulePath];
  }

  try {
    await work();
  } finally {
    if (originalHostlinkModule) {
      require.cache[hostlinkModulePath] = originalHostlinkModule;
    } else {
      delete require.cache[hostlinkModulePath];
    }
    for (const [modulePath, cachedModule] of originalNodeModules.entries()) {
      if (cachedModule) {
        require.cache[modulePath] = cachedModule;
      } else {
        delete require.cache[modulePath];
      }
    }
  }
}
