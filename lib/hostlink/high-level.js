"use strict";

const { DEFAULT_FORMAT_BY_DEVICE_TYPE, deviceToString, parseDevice, resolveEffectiveFormat } = require("./device");
const { ValueError } = require("./errors");

const OPTIMIZABLE_READ_NAMED_DEVICE_TYPES = new Set(
  Object.entries(DEFAULT_FORMAT_BY_DEVICE_TYPE)
    .filter(([, defaultFormat]) => defaultFormat === ".U")
    .map(([deviceType]) => deviceType)
);

const READ_PLAN_WORD_WIDTH = Object.freeze({
  U: 1,
  S: 1,
  D: 2,
  L: 2,
  F: 2,
  BIT_IN_WORD: 1,
});

function canonicalizeDtype(dtype) {
  return String(dtype || "U").trim().toUpperCase();
}

function defaultDtypeForDevice(deviceType) {
  const suffix = resolveEffectiveFormat(deviceType, "");
  return suffix ? suffix.slice(1) : "BIT";
}

function parseAddress(address) {
  const text = String(address || "").trim();
  let core = text;
  let count = 1;
  let hasCount = false;
  const countMatch = /^(.*?),\s*(\d+)$/.exec(text);
  if (countMatch) {
    core = countMatch[1].trim();
    count = Number.parseInt(countMatch[2], 10);
    hasCount = true;
    if (!Number.isInteger(count) || count <= 0) {
      throw new ValueError(`Address '${address}' has an invalid count.`);
    }
  }

  if (core.includes(":")) {
    const [base, dtype] = core.split(":", 2);
    return { base: base.trim(), dtype: canonicalizeDtype(dtype), bitIndex: null, count, hasCount };
  }
  if (core.includes(".")) {
    const [base, bitText] = core.split(".", 2);
    if (!/^[0-9A-F]$/i.test(bitText)) {
      throw new ValueError(`Address '${address}' has an invalid bit-in-word index.`);
    }
    return { base: base.trim(), dtype: "BIT_IN_WORD", bitIndex: Number.parseInt(bitText, 16), count, hasCount };
  }
  const device = parseDevice(core);
  return { base: core, dtype: defaultDtypeForDevice(device.deviceType), bitIndex: null, count, hasCount };
}

function normalizeAddressList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return normalizeAddressList(parsed);
      }
    } catch (_error) {
    }
  }
  const matches = text.match(/[A-Z][A-Z0-9]*[0-9A-F]+(?:\.[0-9A-F])?(?::[A-Z]+)?(?:,\d+)?/gi);
  return matches ? matches.map((item) => item.trim()) : text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

async function readTyped(client, device, dtype) {
  const normalized = canonicalizeDtype(dtype);
  const parsedDevice = parseDevice(device);
  if (normalized === "BIT") {
    return Boolean(Number(await client.read(device)));
  }
  if (normalized === "F") {
    const [lo, hi] = await readWords(client, device, 2);
    return decodeFloatFromWords(lo, hi);
  }
  const value = await client.read(device, { dataFormat: `.${normalized}` });
  return coerceTypedReadValue(parsedDevice, value, normalized);
}

async function writeTyped(client, device, dtype, value) {
  const normalized = canonicalizeDtype(dtype);
  if (normalized === "BIT") {
    await client.write(device, value ? 1 : 0);
    return;
  }
  if (normalized === "F") {
    await client.writeConsecutive(device, encodeFloatWords(Number(value)), { dataFormat: ".U" });
    return;
  }
  await client.write(device, normalized === "H" ? String(value).toUpperCase() : value, { dataFormat: `.${normalized}` });
}

async function readWords(client, device, count) {
  const values = await client.readConsecutive(device, count, { dataFormat: ".U" });
  return values.map((value) => Number(value) & 0xffff);
}

async function readDWords(client, device, count) {
  const words = await readWords(client, device, count * 2);
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(decodeDwordWords(words, index * 2, "D"));
  }
  return values;
}

async function writeBitInWord(client, device, bitIndex, value) {
  if (!Number.isInteger(bitIndex) || bitIndex < 0 || bitIndex > 15) {
    throw new ValueError(`bitIndex must be 0-15, got ${bitIndex}`);
  }
  const current = Number(await readTyped(client, device, "U")) & 0xffff;
  const next = value ? current | (1 << bitIndex) : current & ~(1 << bitIndex);
  await writeTyped(client, device, "U", next & 0xffff);
}

async function readNamed(client, addresses) {
  const normalizedAddresses = normalizeAddressList(addresses);
  if (normalizedAddresses.length === 0) {
    return {};
  }
  const plan = tryCompileReadNamedPlan(normalizedAddresses);
  if (plan) {
    return executeReadNamedPlan(client, plan);
  }
  return readNamedSequential(client, normalizedAddresses);
}

async function* poll(client, addresses, intervalMs) {
  const normalizedAddresses = normalizeAddressList(addresses);
  const plan = normalizedAddresses.length > 0 ? tryCompileReadNamedPlan(normalizedAddresses) : null;
  const normalizedIntervalMs = Number(intervalMs);
  if (!Number.isFinite(normalizedIntervalMs) || normalizedIntervalMs < 0) {
    throw new ValueError(`intervalMs must be a non-negative number, got ${intervalMs}`);
  }

  while (true) {
    yield plan ? await executeReadNamedPlan(client, plan) : await readNamedSequential(client, normalizedAddresses);
    await delay(normalizedIntervalMs);
  }
}

async function writeNamed(client, updates) {
  const operations = compileWriteOperations(updates);
  for (const operation of operations) {
    await executeWriteOperation(client, operation);
  }
}

function compileWriteOperations(updates) {
  const operations = [];
  let batch = null;

  for (const [address, value] of Object.entries(updates || {})) {
    const entry = createWriteEntry(address, value);
    const spec = getBatchableWriteSpec(entry);
    if (!spec) {
      if (batch) {
        operations.push(batch);
        batch = null;
      }
      operations.push({ kind: "single", entry });
      continue;
    }
    if (batch && canAppendWriteBatch(batch, entry, spec)) {
      appendWriteBatchValue(batch, entry, spec);
      continue;
    }
    if (batch) {
      operations.push(batch);
    }
    batch = createWriteBatch(entry, spec);
  }

  if (batch) {
    operations.push(batch);
  }
  return operations;
}

function createWriteEntry(address, value) {
  const parsed = parseAddress(address);
  const device = parseDevice(parsed.base);
  return { address, value, parsed, device };
}

function getBatchableWriteSpec(entry) {
  const { device, parsed } = entry;
  if (parsed.count !== 1 || parsed.dtype === "BIT_IN_WORD") {
    return null;
  }
  if (device.deviceType === "T" || device.deviceType === "C") {
    return {
      kind: "set-value",
      deviceType: device.deviceType,
      dtype: parsed.dtype,
      dataFormat: parsed.dtype === "BIT" ? undefined : "." + parsed.dtype,
      step: 1,
    };
  }
  if (parsed.dtype === "BIT") {
    return {
      kind: "bit",
      deviceType: device.deviceType,
      dtype: parsed.dtype,
      dataFormat: "",
      step: 1,
    };
  }
  if (["U", "S", "H"].includes(parsed.dtype)) {
    return {
      kind: "scalar",
      deviceType: device.deviceType,
      dtype: parsed.dtype,
      dataFormat: "." + parsed.dtype,
      step: 1,
    };
  }
  if (["D", "L", "F"].includes(parsed.dtype)) {
    return {
      kind: "packed-words",
      deviceType: device.deviceType,
      dtype: parsed.dtype,
      dataFormat: ".U",
      step: 2,
    };
  }
  return null;
}

function createWriteBatch(entry, spec) {
  const batch = {
    kind: spec.kind,
    deviceType: spec.deviceType,
    dtype: spec.dtype,
    dataFormat: spec.dataFormat,
    base: entry.parsed.base,
    nextNumber: entry.device.number,
    values: [],
  };
  appendWriteBatchValue(batch, entry, spec);
  return batch;
}

function canAppendWriteBatch(batch, entry, spec) {
  return batch.kind === spec.kind
    && batch.deviceType === spec.deviceType
    && batch.dtype === spec.dtype
    && entry.device.number === batch.nextNumber;
}

function appendWriteBatchValue(batch, entry, spec) {
  if (spec.kind === "packed-words") {
    batch.values.push(...encodePackedWriteValue(entry.parsed.dtype, entry.value));
  } else {
    batch.values.push(normalizeWriteScalar(entry.value, entry.parsed.dtype));
  }
  batch.nextNumber = entry.device.number + spec.step;
}

async function executeWriteOperation(client, operation) {
  if (operation.kind === "single") {
    const { entry } = operation;
    await writeParsed(client, entry.address, entry.device, entry.parsed, entry.value);
    return;
  }
  if (operation.kind === "set-value") {
    await client.writeSetValueConsecutive(operation.base, operation.values, {
      dataFormat: operation.dataFormat,
    });
    return;
  }
  if (operation.kind === "bit") {
    await client.writeConsecutive(operation.base, operation.values);
    return;
  }
  await client.writeConsecutive(operation.base, operation.values, {
    dataFormat: operation.dataFormat,
  });
}

async function readNamedSequential(client, addresses) {
  const snapshot = {};
  for (const address of addresses) {
    const parsed = parseAddress(address);
    const device = parseDevice(parsed.base);
    snapshot[address] = await readParsed(client, address, device, parsed);
  }
  return snapshot;
}

function tryCompileReadNamedPlan(addresses) {
  const requestsByDeviceType = new Map();
  const requestsInInputOrder = [];

  for (let index = 0; index < addresses.length; index += 1) {
    const request = tryParseOptimizableReadNamedRequest(addresses[index], index);
    if (!request) {
      return null;
    }
    requestsInInputOrder.push(request);
    if (!requestsByDeviceType.has(request.baseAddress.deviceType)) {
      requestsByDeviceType.set(request.baseAddress.deviceType, []);
    }
    requestsByDeviceType.get(request.baseAddress.deviceType).push(request);
  }

  const segments = [];
  for (const bucket of requestsByDeviceType.values()) {
    bucket.sort((left, right) => {
      if (left.baseAddress.number !== right.baseAddress.number) {
        return left.baseAddress.number - right.baseAddress.number;
      }
      return getWordWidth(right.kind) - getWordWidth(left.kind);
    });

    let currentStart = null;
    let currentStartNumber = 0;
    let currentEndExclusive = 0;
    let pending = [];

    for (const request of bucket) {
      const requestStart = request.baseAddress.number;
      const requestEndExclusive = requestStart + getWordWidth(request.kind);

      if (!currentStart || requestStart > currentEndExclusive) {
        if (currentStart) {
          segments.push({
            startAddress: currentStart,
            startNumber: currentStartNumber,
            count: currentEndExclusive - currentStartNumber,
            requests: pending,
          });
        }
        currentStart = { ...request.baseAddress, suffix: "" };
        currentStartNumber = requestStart;
        currentEndExclusive = requestEndExclusive;
        pending = [];
      } else if (requestEndExclusive > currentEndExclusive) {
        currentEndExclusive = requestEndExclusive;
      }

      pending.push(request);
    }

    if (currentStart) {
      segments.push({
        startAddress: currentStart,
        startNumber: currentStartNumber,
        count: currentEndExclusive - currentStartNumber,
        requests: pending,
      });
    }
  }

  return { requestsInInputOrder, segments };
}

function tryParseOptimizableReadNamedRequest(address, index) {
  let parsed;
  let device;
  try {
    parsed = parseAddress(address);
    if (parsed.hasCount) {
      return null;
    }
    device = parseDevice(parsed.base);
  } catch (_error) {
    return null;
  }

  if (device.suffix || !OPTIMIZABLE_READ_NAMED_DEVICE_TYPES.has(device.deviceType)) {
    return null;
  }
  if (parsed.dtype === "BIT_IN_WORD") {
    return {
      index,
      address,
      baseAddress: { ...device, suffix: "" },
      kind: "BIT_IN_WORD",
      bitIndex: parsed.bitIndex || 0,
    };
  }
  if (!["U", "S", "D", "L", "F"].includes(parsed.dtype)) {
    return null;
  }
  return {
    index,
    address,
    baseAddress: { ...device, suffix: "" },
    kind: parsed.dtype,
    bitIndex: 0,
  };
}

async function executeReadNamedPlan(client, plan) {
  const resolved = new Array(plan.requestsInInputOrder.length).fill(undefined);

  for (const segment of plan.segments) {
    const words = await readWords(client, deviceToString(segment.startAddress), segment.count);
    for (const request of segment.requests) {
      const offset = request.baseAddress.number - segment.startNumber;
      resolved[request.index] = resolvePlannedValue(words, offset, request.kind, request.bitIndex);
    }
  }

  const snapshot = {};
  for (const request of plan.requestsInInputOrder) {
    if (resolved[request.index] === undefined) {
      throw new ValueError(`No value resolved for '${request.address}'.`);
    }
    snapshot[request.address] = resolved[request.index];
  }
  return snapshot;
}

function resolvePlannedValue(words, offset, kind, bitIndex) {
  if (kind === "U") {
    return words[offset];
  }
  if (kind === "S") {
    return coerceSigned16(words[offset]);
  }
  if (kind === "D") {
    return decodeDwordWords(words, offset, "D");
  }
  if (kind === "L") {
    return decodeDwordWords(words, offset, "L");
  }
  if (kind === "F") {
    return decodeFloatFromWords(words[offset], words[offset + 1]);
  }
  if (kind === "BIT_IN_WORD") {
    return Boolean((words[offset] >> bitIndex) & 1);
  }
  throw new ValueError(`Unsupported read plan value kind '${kind}'.`);
}

function getWordWidth(kind) {
  const width = READ_PLAN_WORD_WIDTH[kind];
  if (!width) {
    throw new ValueError(`Unsupported read plan value kind '${kind}'.`);
  }
  return width;
}

async function readParsed(client, address, _device, parsed) {
  if (parsed.dtype === "BIT_IN_WORD") {
    if (parsed.hasCount) {
      throw new ValueError(`Address '${address}' does not support ',count' with '.bit' notation.`);
    }
    const word = Number(await readTyped(client, parsed.base, "U")) & 0xffff;
    return Boolean(word & (1 << parsed.bitIndex));
  }
  if (parsed.count > 1) {
    if (parsed.dtype === "F") {
      const words = await readWords(client, parsed.base, parsed.count * 2);
      return Array.from({ length: parsed.count }, (_, index) => decodeFloatFromWords(words[index * 2], words[index * 2 + 1]));
    }
    if (parsed.dtype === "D" || parsed.dtype === "L") {
      const words = await readWords(client, parsed.base, parsed.count * 2);
      return Array.from({ length: parsed.count }, (_, index) => decodeDwordWords(words, index * 2, parsed.dtype));
    }
    if (parsed.dtype === "BIT") {
      const values = await client.readConsecutive(parsed.base, parsed.count);
      return values.map((value) => Boolean(Number(value)));
    }
    const values = await client.readConsecutive(parsed.base, parsed.count, { dataFormat: `.${parsed.dtype}` });
    return values.map((value) => coerceScalar(value, parsed.dtype));
  }
  if (parsed.dtype === "BIT") {
    return readTyped(client, parsed.base, "BIT");
  }
  return readTyped(client, parsed.base, parsed.dtype);
}

async function writeParsed(client, address, device, parsed, value) {
  if (parsed.dtype === "BIT_IN_WORD") {
    if (parsed.hasCount) {
      throw new ValueError(`Address '${address}' does not support ',count' with '.bit' notation.`);
    }
    await writeBitInWord(client, parsed.base, parsed.bitIndex, Boolean(value));
    return;
  }
  if (parsed.count > 1) {
    if (!Array.isArray(value)) {
      throw new ValueError(`Address '${address}' expects an array value.`);
    }
    if (value.length !== parsed.count) {
      throw new ValueError(`Address '${address}' expects ${parsed.count} values.`);
    }
    if (parsed.dtype === "F") {
      const words = [];
      for (const item of value) {
        words.push(...encodeFloatWords(Number(item)));
      }
      await client.writeConsecutive(parsed.base, words, { dataFormat: ".U" });
      return;
    }
    if (parsed.dtype === "BIT") {
      await client.writeConsecutive(parsed.base, value.map((item) => (item ? 1 : 0)));
      return;
    }
    await client.writeConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)), { dataFormat: `.${parsed.dtype}` });
    return;
  }
  if (device.deviceType === "T" || device.deviceType === "C") {
    await client.writeSetValue(parsed.base, normalizeWriteScalar(value, parsed.dtype), {
      dataFormat: parsed.dtype === "BIT" ? undefined : `.${parsed.dtype}`,
    });
    return;
  }
  await writeTyped(client, parsed.base, parsed.dtype === "BIT" ? "BIT" : parsed.dtype, value);
}

function normalizeWriteScalar(value, dtype) {
  const normalized = canonicalizeDtype(dtype);
  if (normalized === "BIT") {
    return value ? 1 : 0;
  }
  if (normalized === "H") {
    return String(value).toUpperCase();
  }
  return Number(value);
}

function coerceTypedReadValue(device, value, dtype) {
  if (!Array.isArray(value)) {
    return coerceScalar(value, dtype);
  }
  if ((device.deviceType === "T" || device.deviceType === "C") && (dtype === "D" || dtype === "L")) {
    const presetValue = value.length >= 3 ? value[value.length - 1] : (value.length > 1 ? value[1] : value[0]);
    return coerceScalar(presetValue, dtype);
  }
  if (value.length === 0) {
    throw new ValueError(`No value returned for '${deviceToString(device)}'.`);
  }
  return coerceScalar(value[0], dtype);
}

function coerceScalar(value, dtype) {
  const normalized = canonicalizeDtype(dtype);
  if (normalized === "BIT") {
    return Boolean(Number(value));
  }
  if (normalized === "H") {
    return String(value).toUpperCase();
  }
  if (normalized === "S") {
    return coerceSigned16(value);
  }
  if (normalized === "L") {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(Number(value) >>> 0, 0);
    return buffer.readInt32LE(0);
  }
  return Number(value);
}

function coerceSigned16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(Number(value) & 0xffff, 0);
  return buffer.readInt16LE(0);
}

function encodeFloatWords(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(Number(value), 0);
  return [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
}

function encodePackedWriteValue(dtype, value) {
  const normalized = canonicalizeDtype(dtype);
  if (normalized === "F") {
    return encodeFloatWords(Number(value));
  }
  const buffer = Buffer.alloc(4);
  if (normalized === "L") {
    buffer.writeInt32LE(Number(value), 0);
  } else {
    buffer.writeUInt32LE(Number(value) >>> 0, 0);
  }
  return [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
}

function decodeFloatFromWords(lo, hi) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt16LE(Number(lo) & 0xffff, 0);
  buffer.writeUInt16LE(Number(hi) & 0xffff, 2);
  return buffer.readFloatLE(0);
}

function decodeDwordWords(words, offset, dtype) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt16LE(Number(words[offset]) & 0xffff, 0);
  buffer.writeUInt16LE(Number(words[offset + 1]) & 0xffff, 2);
  return canonicalizeDtype(dtype) === "L" ? buffer.readInt32LE(0) : buffer.readUInt32LE(0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  normalizeAddressList,
  parseAddress,
  readTyped,
  writeTyped,
  readWords,
  readDWords,
  writeBitInWord,
  readNamed,
  poll,
  writeNamed,
};
