"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatParsedAddress,
  normalizeAddress,
  normalizeAddressList,
  parseAddress,
  poll,
  readComments,
  readNamed,
  readTyped,
  writeNamed,
} = require("../lib/hostlink");

test("parseAddress supports dtype, count, and bit-in-word", () => {
  assert.deepEqual(parseAddress("DM100"), {
    base: "DM100",
    dtype: "U",
    bitIndex: null,
    count: 1,
    hasCount: false,
    explicitDtype: false,
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
});

test("normalizeAddress and formatParsedAddress keep one canonical spelling", () => {
  assert.equal(normalizeAddress(" dm200:d,4 "), "DM200:D,4");
  assert.equal(normalizeAddress("100"), "R100");
  assert.equal(normalizeAddress("dm50.3"), "DM50.3");
  assert.equal(normalizeAddress(" dm250:comment "), "DM250:COMMENT");
  assert.equal(formatParsedAddress(parseAddress("R10,4")), "R010,4");
});

test("normalizeAddressList keeps count suffixes intact", () => {
  assert.deepEqual(normalizeAddressList("DM100,10 DM200:F DM50.3"), ["DM100,10", "DM200:F", "DM50.3"]);
  assert.deepEqual(normalizeAddressList('["DM100","DM200:D,2"]'), ["DM100", "DM200:D,2"]);
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

test("readComments delegates to the low-level RDC command", async () => {
  const fakeClient = {
    async readComments(device, options = {}) {
      assert.equal(device, "DM250");
      assert.equal(options.stripPadding, true);
      return "MAIN COMMENT";
    },
  };

  assert.equal(await readComments(fakeClient, "DM250", { stripPadding: true }), "MAIN COMMENT");
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
  assert.equal(await readTyped(fakeClient, "C10", "D"), 12345);
});

test("readNamed batches optimizable contiguous word requests", async () => {
  const calls = [];
  const fakeClient = {
    async readConsecutive(device, count, options = {}) {
      calls.push({ device, count, dataFormat: options.dataFormat || "" });
      if (device === "DM100" && count === 7 && options.dataFormat === ".U") {
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
      throw new Error(`unexpected readConsecutive ${device} ${count} ${options.dataFormat || ""}`);
    },
  };

  const snapshot = await readNamed(fakeClient, ["DM100", "DM101:S", "DM102:D", "DM104:F", "DM106.3"]);
  assert.deepEqual(snapshot, {
    DM100: 123,
    "DM101:S": -5,
    "DM102:D": 0x12345678,
    "DM104:F": 3.5,
    "DM106.3": true,
  });
  assert.deepEqual(calls, [{ device: "DM100", count: 7, dataFormat: ".U" }]);
});

test("readNamed falls back for mixed scalar, dword, float, bit, and array reads", async () => {
  const fakeClient = {
    async read(device, options = {}) {
      if (device === "DM100" && options.dataFormat === ".U") {
        return 123;
      }
      if (device === "DM101" && options.dataFormat === ".S") {
        return 65531;
      }
      if (device === "DM200" && options.dataFormat === ".D") {
        return 0x12345678;
      }
      if (device === "R010") {
        return 1;
      }
      if (device === "DM50" && options.dataFormat === ".U") {
        return 8;
      }
      throw new Error(`unexpected read ${device} ${options.dataFormat || ""}`);
    },
    async readConsecutive(device, count, options = {}) {
      if (device === "DM300" && count === 2 && options.dataFormat === ".U") {
        const buffer = Buffer.alloc(4);
        buffer.writeFloatLE(3.5, 0);
        return [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
      }
      if (device === "DM400" && count === 3 && options.dataFormat === ".U") {
        return [1, 2, 3];
      }
      if (device === "R010" && count === 4) {
        return [1, 0, 1, 0];
      }
      throw new Error(`unexpected readConsecutive ${device} ${count} ${options.dataFormat || ""}`);
    },
    async readComments(device) {
      if (device === "DM250") {
        return "MAIN COMMENT";
      }
      throw new Error(`unexpected readComments ${device}`);
    },
  };

  const snapshot = await readNamed(fakeClient, ["DM100", "DM101:S", "DM200:D", "DM300:F", "DM50.3", "R010", "DM250:COMMENT", "DM400,3", "R010,4"]);
  assert.deepEqual(snapshot, {
    DM100: 123,
    "DM101:S": -5,
    "DM200:D": 0x12345678,
    "DM300:F": 3.5,
    "DM50.3": true,
    R010: true,
    "DM250:COMMENT": "MAIN COMMENT",
    "DM400,3": [1, 2, 3],
    "R010,4": [true, false, true, false],
  });
});

test("poll reuses compiled read plan", async () => {
  let callCount = 0;
  const fakeClient = {
    async readConsecutive(device, count, options = {}) {
      assert.equal(device, "DM100");
      assert.equal(count, 2);
      assert.equal(options.dataFormat, ".U");
      callCount += 1;
      return [10 + callCount, 20 + callCount];
    },
  };

  const iterator = poll(fakeClient, ["DM100", "DM101"], 0);
  const first = await iterator.next();
  const second = await iterator.next();

  assert.deepEqual(first.value, { DM100: 11, DM101: 21 });
  assert.deepEqual(second.value, { DM100: 12, DM101: 22 });
  await iterator.return();
});

test("writeNamed batches consecutive writes and keeps special cases correct", async () => {
  const calls = [];
  const fakeClient = {
    async read() {
      return 0;
    },
    async write(device, value, options = {}) {
      calls.push({ kind: "write", device, value, dataFormat: options.dataFormat || "" });
    },
    async writeConsecutive(device, values, options = {}) {
      calls.push({ kind: "writeConsecutive", device, values: Array.from(values), dataFormat: options.dataFormat || "" });
    },
    async writeSetValueConsecutive(device, values, options = {}) {
      calls.push({ kind: "writeSetValueConsecutive", device, values: Array.from(values), dataFormat: options.dataFormat || "" });
    },
  };

  await writeNamed(fakeClient, {
    DM100: 123,
    DM101: 456,
    "DM102:S": -5,
    "DM103:S": -6,
    "DM200:F": 2.5,
    "DM202:F": 3.5,
    "DM50.3": true,
    "DM300,3": [1, 2, 3],
    R010: true,
    R011: false,
    "R100,4": [true, false, true, false],
    "T10:D": 111,
    "T11:D": 222,
    "C10:D": 333,
    "C11:D": 444
  });

  assert.deepEqual(calls, [
    { kind: "writeConsecutive", device: "DM100", values: [123, 456], dataFormat: ".U" },
    { kind: "writeConsecutive", device: "DM102", values: [-5, -6], dataFormat: ".S" },
    { kind: "writeConsecutive", device: "DM200", values: [0, 16416, 0, 16480], dataFormat: ".U" },
    { kind: "write", device: "DM50", value: 8, dataFormat: ".U" },
    { kind: "writeConsecutive", device: "DM300", values: [1, 2, 3], dataFormat: ".U" },
    { kind: "writeConsecutive", device: "R010", values: [1, 0], dataFormat: "" },
    { kind: "writeConsecutive", device: "R100", values: [1, 0, 1, 0], dataFormat: "" },
    { kind: "writeSetValueConsecutive", device: "T10", values: [111, 222], dataFormat: ".D" },
    { kind: "writeSetValueConsecutive", device: "C10", values: [333, 444], dataFormat: ".D" },
  ]);
});
