"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeAddressList,
  parseAddress,
  poll,
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
  });
  assert.deepEqual(parseAddress("DM100:F"), {
    base: "DM100",
    dtype: "F",
    bitIndex: null,
    count: 1,
    hasCount: false,
  });
  assert.deepEqual(parseAddress("DM50.3"), {
    base: "DM50",
    dtype: "BIT_IN_WORD",
    bitIndex: 3,
    count: 1,
    hasCount: false,
  });
  assert.deepEqual(parseAddress("DM200:D,4"), {
    base: "DM200",
    dtype: "D",
    bitIndex: null,
    count: 4,
    hasCount: true,
  });
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
      if (device === "R10") {
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
      if (device === "R20" && count === 4) {
        return [1, 0, 1, 0];
      }
      throw new Error(`unexpected readConsecutive ${device} ${count} ${options.dataFormat || ""}`);
    },
  };

  const snapshot = await readNamed(fakeClient, ["DM100", "DM101:S", "DM200:D", "DM300:F", "DM50.3", "R10", "DM400,3", "R20,4"]);
  assert.deepEqual(snapshot, {
    DM100: 123,
    "DM101:S": -5,
    "DM200:D": 0x12345678,
    "DM300:F": 3.5,
    "DM50.3": true,
    R10: true,
    "DM400,3": [1, 2, 3],
    "R20,4": [true, false, true, false],
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

test("writeNamed supports scalar, bit-in-word, and array writes", async () => {
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
  };

  await writeNamed(fakeClient, {
    DM100: 123,
    "DM101:S": -5,
    "DM200:F": 2.5,
    "DM50.3": true,
    "DM300,3": [1, 2, 3],
    "R20,4": [true, false, true, false],
  });

  assert.deepEqual(calls, [
    { kind: "write", device: "DM100", value: 123, dataFormat: ".U" },
    { kind: "write", device: "DM101", value: -5, dataFormat: ".S" },
    { kind: "writeConsecutive", device: "DM200", values: [0, 16416], dataFormat: ".U" },
    { kind: "write", device: "DM50", value: 8, dataFormat: ".U" },
    { kind: "writeConsecutive", device: "DM300", values: [1, 2, 3], dataFormat: ".U" },
    { kind: "writeConsecutive", device: "R20", values: [1, 0, 1, 0], dataFormat: "" },
  ]);
});
