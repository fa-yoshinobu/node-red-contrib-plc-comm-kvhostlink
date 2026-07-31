"use strict";

const {
  BIT_BANK_DEVICE_TYPES,
  DEFAULT_FORMAT_BY_DEVICE_TYPE,
  NATIVE_32BIT_DEVICE_TYPES,
  RDC_DEVICE_TYPES,
  WR_DEVICE_TYPES,
  bitBankLogicalNumber,
  deviceToString,
  packDirectBitTokens,
  parseDevice,
  validateDeviceCount,
} = require("./device");
const { ValueError } = require("./errors");

const OPTIMIZABLE_READ_NAMED_DEVICE_TYPES = new Set(
  Object.entries(DEFAULT_FORMAT_BY_DEVICE_TYPE)
    .filter(([, defaultFormat]) => defaultFormat === ".U")
    .map(([deviceType]) => deviceType)
);
const DIRECT_BIT_DEVICE_TYPES = new Set(
  Object.entries(DEFAULT_FORMAT_BY_DEVICE_TYPE)
    .filter(([, defaultFormat]) => defaultFormat === "")
    .map(([deviceType]) => deviceType)
);

const READ_PLAN_WORD_WIDTH = Object.freeze({
  U: 1,
  S: 1,
  D: 2,
  L: 2,
  F: 2,
  BIT_IN_WORD: 1,
  DIRECT_BIT: 1,
});
const ADDRESS_DTYPES = new Set(["BIT", "U", "S", "D", "L", "F", "H", "COMMENT"]);
const TYPED_DTYPES = new Set(["BIT", "U", "S", "D", "L", "F", "H"]);

function canonicalizeDtype(dtype) {
  return String(dtype || "").trim().toUpperCase();
}

function requireAddressDtype(dtype, address) {
  const normalized = canonicalizeDtype(dtype);
  if (!normalized) {
    throw new ValueError(`Address '${address}' requires a dtype after ':'.`);
  }
  if (!ADDRESS_DTYPES.has(normalized)) {
    throw new ValueError(`Address '${address}' uses unsupported dtype '${normalized}'. Specify BIT, U, S, D, L, F, H, or COMMENT.`);
  }
  return normalized;
}

function requireTypedDtype(dtype) {
  const normalized = canonicalizeDtype(dtype);
  if (!normalized) {
    throw new ValueError("dtype is required.");
  }
  if (!TYPED_DTYPES.has(normalized)) {
    throw new ValueError(`Unsupported dtype '${normalized}'; specify BIT, U, S, D, L, F, or H.`);
  }
  return normalized;
}

function parseBooleanWriteValue(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value) && (value === 0 || value === 1)) {
    return value === 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized === "1" || normalized === "ON" || normalized === "TRUE") {
      return true;
    }
    if (normalized === "0" || normalized === "OFF" || normalized === "FALSE") {
      return false;
    }
  }
  throw new ValueError(`Invalid BIT value '${String(value)}'; use true/false, 1/0, or ON/OFF.`);
}

function parseAddress(address) {
  if (typeof address !== "string") {
    throw new ValueError("address must be a string");
  }
  const text = address.trim();
  const match = /^(?<base>[A-Z][A-Z0-9]*[0-9A-F]+)(?::(?<dtype>[A-Z_]+)|\.(?<bit>[0-9A-F]))(?:,(?<count>[0-9]+))?$/i.exec(text);
  if (!match) {
    throw new ValueError(`Address '${address}' does not match the complete DEVICE:DTYPE[,COUNT] or DEVICE.BIT grammar.`);
  }
  const baseAddress = match.groups.base;
  const parsedDevice = parseDevice(baseAddress);
  const hasCount = match.groups.count !== undefined;
  const count = hasCount ? Number(match.groups.count) : 1;
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new ValueError(`Address '${address}' has an invalid count.`);
  }

  if (match.groups.dtype !== undefined) {
    const canonicalDtype = canonicalizeDtype(match.groups.dtype);
    if (canonicalDtype === "BIT_IN_WORD") {
      throw new ValueError(`Address '${address}' uses BIT_IN_WORD but no bit index was specified. Use '.0' through '.F' notation.`);
    }
    const requiredDtype = requireAddressDtype(canonicalDtype, address);
    if (requiredDtype === "BIT" && !DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
      throw new ValueError(`Address '${address}' uses BIT, which is valid only for direct bit device families.`);
    }
    if (requiredDtype === "F" && DEFAULT_FORMAT_BY_DEVICE_TYPE[parsedDevice.deviceType] !== ".U") {
      throw new ValueError(
        `Address '${address}' uses Float32 on a direct bit device family; Float32 is valid only for word device families.`,
      );
    }
    if (requiredDtype === "COMMENT" && !RDC_DEVICE_TYPES.has(parsedDevice.deviceType)) {
      throw new ValueError(`Address '${address}' uses COMMENT with a device family that RDC does not support.`);
    }
    if (requiredDtype === "COMMENT" && hasCount) {
      throw new ValueError("comment addresses do not support ',count'.");
    }
    return { base: baseAddress, dtype: requiredDtype, bitIndex: null, count, hasCount, explicitDtype: true };
  }
  if (match.groups.bit !== undefined) {
    if (hasCount) {
      throw new ValueError("bit-in-word addresses do not support ',count'.");
    }
    return { base: baseAddress, dtype: "BIT_IN_WORD", bitIndex: Number.parseInt(match.groups.bit, 16), count, hasCount, explicitDtype: false };
  }
  throw new ValueError(`Address '${address}' requires an explicit data type such as ':U', ':D', or ':BIT'.`);
}

function formatParsedAddress(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new ValueError("parsed address must be an object");
  }
  const device = parseDevice(parsed.base);
  const base = deviceToString({ ...device, suffix: "" });
  if (parsed.bitIndex != null) {
    if (parsed.hasCount) {
      throw new ValueError("bit-in-word addresses do not support ',count'.");
    }
    if (!Number.isSafeInteger(parsed.bitIndex) || parsed.bitIndex < 0 || parsed.bitIndex > 15) {
      throw new ValueError(`bitIndex must be 0-15, got ${parsed.bitIndex}`);
    }
    return `${base}.${parsed.bitIndex.toString(16).toUpperCase()}`;
  }

  let text = base;
  const canonicalDtype = canonicalizeDtype(parsed.dtype);
  if (canonicalDtype === "BIT_IN_WORD") {
    throw new ValueError(`Address '${base}' uses BIT_IN_WORD but no bit index was specified. Use '.0' through '.F' notation.`);
  }
  const dtype = requireAddressDtype(canonicalDtype, base);
  if (dtype === "COMMENT" && parsed.hasCount) {
    throw new ValueError("comment addresses do not support ',count'.");
  }
  if (parsed.explicitDtype) {
    text += `:${dtype}`;
  }
  if (parsed.hasCount) {
    if (!Number.isSafeInteger(parsed.count) || parsed.count <= 0) {
      throw new ValueError(`Address '${base}' has an invalid count.`);
    }
    text += `,${parsed.count}`;
  }
  return text;
}

function normalizeAddress(address) {
  return formatParsedAddress(parseAddress(address));
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
  const tokens = [];
  const tokenPattern = /[A-Z][A-Z0-9]*[0-9A-F]+(?:\.[0-9A-F]|:[A-Z_]+)(?:,\d+)?/iy;
  let index = 0;
  while (index < text.length) {
    while (index < text.length && /[\s;,]/.test(text[index])) {
      index += 1;
    }
    if (index >= text.length) {
      break;
    }
    tokenPattern.lastIndex = index;
    const match = tokenPattern.exec(text);
    if (!match || match.index !== index) {
      throw new ValueError(`Invalid address list near '${text.slice(index)}'.`);
    }
    tokens.push(match[0]);
    index = tokenPattern.lastIndex;
    if (index < text.length && !/[\s;,]/.test(text[index])) {
      throw new ValueError(`Invalid address suffix near '${text.slice(index)}'.`);
    }
  }
  tokens.forEach((token) => parseAddress(token));
  return tokens;
}

async function readTyped(client, device, dtype) {
  const normalized = requireTypedDtype(dtype);
  const parsedDevice = parseDevice(device);
  if (normalized === "BIT") {
    if (!DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
      throw new ValueError("BIT reads are valid only for direct bit device families.");
    }
    return resolveDirectBitValue([await client.read(device)], 0);
  }
  if (normalized === "F") {
    if (DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
      throw new ValueError("Float reads are not defined for direct bit devices.");
    }
    const [lo, hi] = await readWords(client, device, 2);
    return decodeFloatFromWords(lo, hi);
  }
  const value = await client.read(device, `.${normalized}`);
  if (DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
    const expectedCount = normalized === "D" || normalized === "L" ? 32 : 16;
    const packed = packDirectBitTokens(Array.isArray(value) ? value : [value], expectedCount, device);
    if (normalized === "S") {
      return coerceSigned16(packed);
    }
    if (normalized === "L") {
      return packed | 0;
    }
    if (normalized === "H") {
      return (packed & 0xffff).toString(16).toUpperCase().padStart(4, "0");
    }
    return packed;
  }
  return coerceTypedReadValue(parsedDevice, value, normalized);
}

async function readTimerCounter(client, device) {
  const parsedDevice = parseDevice(device);
  if (!["T", "C"].includes(parsedDevice.deviceType)) {
    throw new ValueError("readTimerCounter requires a T or C device.");
  }
  const target = deviceToString({ ...parsedDevice, suffix: "" });
  const value = await client.read(target, ".D");
  const values = Array.isArray(value) ? value : [value];
  if (values.length < 3) {
    throw new ValueError(`Timer/counter response for '${target}' did not contain status/current/preset.`);
  }
  return {
    status: Number(values[0]),
    current: Number(values[1]),
    preset: Number(values[2]),
  };
}

async function readTimer(client, device) {
  if (parseDevice(device).deviceType !== "T") {
    throw new ValueError("readTimer requires a T device.");
  }
  return readTimerCounter(client, device);
}

async function readCounter(client, device) {
  if (parseDevice(device).deviceType !== "C") {
    throw new ValueError("readCounter requires a C device.");
  }
  return readTimerCounter(client, device);
}

async function readComments(client, device) {
  return client.readComments(device);
}

async function writeTyped(client, device, dtype, value) {
  const normalized = requireTypedDtype(dtype);
  const parsedDevice = parseDevice(device);
  if (normalized === "BIT") {
    if (!DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
      throw new ValueError("BIT writes are valid only for direct bit device families.");
    }
    await client.write(device, parseBooleanWriteValue(value));
    return;
  }
  if (normalized === "F") {
    if (DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
      throw new ValueError("Float writes are not defined for direct bit devices.");
    }
    await client.writeConsecutive(device, encodeFloatWords(value), ".U");
    return;
  }
  await client.write(device, normalizeWriteScalar(value, normalized), `.${normalized}`);
}

async function readWords(client, device, count) {
  requireSafeInteger("count", count, 1, 1000);
  const values = await client.readConsecutive(device, count, ".U");
  return values.map((value) => Number(value) & 0xffff);
}

async function readDWords(client, device, count) {
  requireSafeInteger("count", count, 1, 500);
  const words = await readWords(client, device, count * 2);
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(decodeDwordWords(words, index * 2, "D"));
  }
  return values;
}

async function writeBitInWord(client, device, bitIndex, value) {
  requireSafeInteger("bitIndex", bitIndex, 0, 15);
  const enabled = parseBooleanWriteValue(value);
  if (typeof client.writeBitInWord === "function") {
    await client.writeBitInWord(device, bitIndex, enabled);
    return;
  }
  const current = Number(await readTyped(client, device, "U")) & 0xffff;
  const next = enabled ? current | (1 << bitIndex) : current & ~(1 << bitIndex);
  await writeTyped(client, device, "U", next & 0xffff);
}

function requireBitInWordIndex(address, bitIndex) {
  if (Number.isSafeInteger(bitIndex) && bitIndex >= 0 && bitIndex <= 15) {
    return bitIndex;
  }
  throw new ValueError(`Address '${address}' uses BIT_IN_WORD but no bit index was specified. Use '.0' through '.F' notation.`);
}

async function readNamed(client, addresses) {
  const normalizedAddresses = normalizeAddressList(addresses);
  if (normalizedAddresses.length === 0) {
    throw new ValueError("readNamed addresses must not be empty.");
  }
  const plan = tryCompileReadNamedPlan(normalizedAddresses);
  if (plan) {
    return executeReadNamedPlan(client, plan);
  }
  return readNamedSequential(client, normalizedAddresses);
}

async function* poll(client, addresses, intervalMs) {
  const normalizedAddresses = normalizeAddressList(addresses);
  if (normalizedAddresses.length === 0) {
    throw new ValueError("poll addresses must not be empty.");
  }
  const plan = tryCompileReadNamedPlan(normalizedAddresses);
  const normalizedIntervalMs = requireSafeInteger("intervalMs", intervalMs, 0, Number.MAX_SAFE_INTEGER);

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
  if (updates === null || typeof updates !== "object" || Array.isArray(updates) || Object.keys(updates).length === 0) {
    throw new ValueError("writeNamed updates must be a non-empty object.");
  }
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
  operations.forEach(validateWriteOperationLimit);
  return operations;
}

function createWriteEntry(address, value) {
  const parsed = parseAddress(address);
  const device = parseDevice(parsed.base);
  const entry = { address, value, parsed, device };
  validateWriteEntry(entry);
  return entry;
}

function validateWriteEntry(entry) {
  const { address, device, parsed, value } = entry;
  if (parsed.dtype === "COMMENT") {
    throw new ValueError(`Address '${address}' is read-only.`);
  }
  if (!WR_DEVICE_TYPES.has(device.deviceType)) {
    throw new ValueError(`Address '${address}' uses read-only device family '${device.deviceType}'.`);
  }
  if (parsed.dtype === "BIT_IN_WORD") {
    if (parsed.hasCount) {
      throw new ValueError(`Address '${address}' does not support ',count' with '.bit' notation.`);
    }
    requireBitInWordIndex(address, parsed.bitIndex);
    parseBooleanWriteValue(value);
    return;
  }
  if (parsed.dtype === "F" && DIRECT_BIT_DEVICE_TYPES.has(device.deviceType)) {
    throw new ValueError(`Address '${address}' cannot use Float32 with a direct bit device.`);
  }
  const effectiveFormat = parsed.dtype === "BIT" ? "" : parsed.dtype === "F" ? ".U" : `.${parsed.dtype}`;
  const protocolCount = parsed.dtype === "F" ? parsed.count * 2 : parsed.count;
  validateDeviceCount(device.deviceType, effectiveFormat, protocolCount);
  if (parsed.count > 1) {
    if (!Array.isArray(value)) {
      throw new ValueError(`Address '${address}' expects an array value.`);
    }
    if (value.length !== parsed.count) {
      throw new ValueError(`Address '${address}' expects ${parsed.count} values.`);
    }
    value.forEach((item) => normalizeWriteScalar(item, parsed.dtype));
    return;
  }
  normalizeWriteScalar(value, parsed.dtype);
}

function validateWriteOperationLimit(operation) {
  if (operation.kind === "single") {
    return;
  }
  validateDeviceCount(operation.deviceType, operation.dataFormat, operation.values.length);
  let maximum = 1000;
  let points = operation.values.length;
  if (operation.kind === "set-value") {
    maximum = 120;
  } else if (operation.dtype === "D" || operation.dtype === "L") {
    maximum = 500;
    points = operation.kind === "packed-words" ? operation.values.length / 2 : operation.values.length;
  } else if (operation.dtype === "F") {
    maximum = 500;
    points = operation.values.length / 2;
  }
  if (!Number.isSafeInteger(points) || points < 1 || points > maximum) {
    throw new ValueError(`writeNamed ${operation.dtype} group has ${points} points; allowed 1..${maximum}.`);
  }
}

function requireSafeInteger(name, value, minimum, maximum) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ValueError(`${name} must be a safe integer in ${minimum}..${maximum}, got '${String(value)}'.`);
  }
  return value;
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
  // A typed word value on a direct-bit family occupies 16 or 32 bit
  // addresses. Adjacent typed values therefore cannot be merged using the
  // scalar device-number step used by word-device families.
  if (DIRECT_BIT_DEVICE_TYPES.has(device.deviceType) && parsed.dtype !== "BIT") {
    return null;
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
  if (
    ["U", "S", "H"].includes(parsed.dtype)
    || (NATIVE_32BIT_DEVICE_TYPES.has(device.deviceType) && device.deviceType !== "AT" && ["D", "L"].includes(parsed.dtype))
    || (device.deviceType === "AT" && ["D", "L"].includes(parsed.dtype))
  ) {
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
    await client.writeSetValueConsecutive(operation.base, operation.values, operation.dataFormat);
    return;
  }
  if (operation.kind === "bit") {
    await client.writeConsecutive(operation.base, operation.values);
    return;
  }
  await client.writeConsecutive(operation.base, operation.values, operation.dataFormat);
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
      const leftNumber = readPlanNumber(left);
      const rightNumber = readPlanNumber(right);
      if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }
      return getWordWidth(right.kind) - getWordWidth(left.kind);
    });

    let currentStart = null;
    let currentStartNumber = 0;
    let currentEndExclusive = 0;
    let currentMode = "WORDS";
    let pending = [];

    for (const request of bucket) {
      const requestStart = readPlanNumber(request);
      const requestEndExclusive = requestStart + getWordWidth(request.kind);
      const requestMode = request.kind === "DIRECT_BIT" ? "DIRECT_BITS" : "WORDS";
      const segmentLimit = readPlanSegmentLimit(request.baseAddress.deviceType, requestMode);
      const exceedsSegmentLimit = currentStart && requestEndExclusive - currentStartNumber > segmentLimit;

      if (!currentStart || requestStart > currentEndExclusive || currentMode !== requestMode || exceedsSegmentLimit) {
        if (currentStart) {
          segments.push({
            startAddress: currentStart,
            startNumber: currentStartNumber,
            count: currentEndExclusive - currentStartNumber,
            mode: currentMode,
            requests: pending,
          });
        }
        currentStart = { ...request.baseAddress, suffix: "" };
        currentStartNumber = requestStart;
        currentEndExclusive = requestEndExclusive;
        currentMode = requestMode;
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
        mode: currentMode,
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

  if (device.suffix) {
    return null;
  }
  if (parsed.dtype === "BIT" && DIRECT_BIT_DEVICE_TYPES.has(device.deviceType)) {
    return {
      index,
      address,
      baseAddress: { ...device, suffix: "" },
      kind: "DIRECT_BIT",
      bitIndex: 0,
    };
  }
  if (!OPTIMIZABLE_READ_NAMED_DEVICE_TYPES.has(device.deviceType)) {
    return null;
  }
  if (parsed.dtype === "BIT_IN_WORD") {
    return {
      index,
      address,
      baseAddress: { ...device, suffix: "" },
      kind: "BIT_IN_WORD",
      bitIndex: requireBitInWordIndex(address, parsed.bitIndex),
    };
  }
  if (!["U", "S", "D", "L", "F"].includes(parsed.dtype)) {
    return null;
  }
  if (NATIVE_32BIT_DEVICE_TYPES.has(device.deviceType) && ["D", "L"].includes(parsed.dtype)) {
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
    if (segment.mode === "DIRECT_BITS") {
      const tokens = await client.readConsecutive(deviceToString(segment.startAddress), segment.count);
      for (const request of segment.requests) {
        const offset = readPlanNumber(request) - segment.startNumber;
        resolved[request.index] = resolveDirectBitValue(tokens, offset);
      }
    } else {
      const words = await readWords(client, deviceToString(segment.startAddress), segment.count);
      for (const request of segment.requests) {
        const offset = readPlanNumber(request) - segment.startNumber;
        resolved[request.index] = resolvePlannedValue(words, offset, request.kind, request.bitIndex);
      }
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
  if (kind === "DIRECT_BIT") {
    throw new ValueError("Direct bit values must be resolved from bit tokens.");
  }
  throw new ValueError(`Unsupported read plan value kind '${kind}'.`);
}

function resolveDirectBitValue(tokens, offset) {
  if (offset < 0 || offset >= tokens.length) {
    throw new ValueError("Batched direct bit response was too short.");
  }
  const token = String(tokens[offset]).trim().toUpperCase();
  if (token === "1" || token === "ON") {
    return true;
  }
  if (token === "0" || token === "OFF") {
    return false;
  }
  throw new ValueError(`Invalid direct bit response token '${tokens[offset]}'.`);
}

function readPlanSegmentLimit(deviceType, mode) {
  if (mode === "DIRECT_BITS") {
    return 1000;
  }
  if (deviceType === "TM") {
    return 512;
  }
  if (deviceType === "Z") {
    return 12;
  }
  return 1000;
}

function getWordWidth(kind) {
  const width = READ_PLAN_WORD_WIDTH[kind];
  if (!width) {
    throw new ValueError(`Unsupported read plan value kind '${kind}'.`);
  }
  return width;
}

function readPlanNumber(request) {
  if (request.kind === "DIRECT_BIT" && BIT_BANK_DEVICE_TYPES.has(request.baseAddress.deviceType)) {
    return bitBankLogicalNumber(request.baseAddress.number);
  }
  return request.baseAddress.number;
}

async function readParsed(client, address, _device, parsed) {
  if (parsed.dtype === "BIT_IN_WORD") {
    if (parsed.hasCount) {
      throw new ValueError(`Address '${address}' does not support ',count' with '.bit' notation.`);
    }
    const bitIndex = requireBitInWordIndex(address, parsed.bitIndex);
    const word = Number(await readTyped(client, parsed.base, "U")) & 0xffff;
    return Boolean(word & (1 << bitIndex));
  }
  if (parsed.dtype === "COMMENT") {
    if (parsed.hasCount) {
      throw new ValueError(`Address '${address}' does not support ',count' with ':COMMENT' notation.`);
    }
    return readComments(client, parsed.base);
  }
  if (parsed.count > 1) {
    if (parsed.dtype === "F") {
      const words = await readWords(client, parsed.base, parsed.count * 2);
      return Array.from({ length: parsed.count }, (_, index) => decodeFloatFromWords(words[index * 2], words[index * 2 + 1]));
    }
    if (parsed.dtype === "D" || parsed.dtype === "L") {
      if (NATIVE_32BIT_DEVICE_TYPES.has(_device.deviceType)) {
        const values = await client.readConsecutive(parsed.base, parsed.count, `.${parsed.dtype}`);
        return values.map((value) => coerceScalar(value, parsed.dtype));
      }
      const words = await readWords(client, parsed.base, parsed.count * 2);
      return Array.from({ length: parsed.count }, (_, index) => decodeDwordWords(words, index * 2, parsed.dtype));
    }
    if (parsed.dtype === "BIT") {
      const values = await client.readConsecutive(parsed.base, parsed.count);
      return values.map((value, index) => resolveDirectBitValue(values, index));
    }
    const values = await client.readConsecutive(parsed.base, parsed.count, `.${parsed.dtype}`);
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
    await writeBitInWord(client, parsed.base, requireBitInWordIndex(address, parsed.bitIndex), value);
    return;
  }
  if (parsed.dtype === "COMMENT") {
    throw new ValueError(`Address '${address}' is read-only.`);
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
        words.push(...encodeFloatWords(item));
      }
      await client.writeConsecutive(parsed.base, words, ".U");
      return;
    }
    if ((device.deviceType === "T" || device.deviceType === "C") && parsed.dtype !== "BIT") {
      await client.writeSetValueConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)), `.${parsed.dtype}`);
      return;
    }
    if (NATIVE_32BIT_DEVICE_TYPES.has(device.deviceType) && (parsed.dtype === "D" || parsed.dtype === "L")) {
      await client.writeConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)), `.${parsed.dtype}`);
      return;
    }
    if (parsed.dtype === "BIT") {
      await client.writeConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)));
      return;
    }
    await client.writeConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)), `.${parsed.dtype}`);
    return;
  }
  if (device.deviceType === "T" || device.deviceType === "C") {
    await client.writeSetValue(parsed.base, normalizeWriteScalar(value, parsed.dtype), parsed.dtype === "BIT" ? undefined : `.${parsed.dtype}`);
    return;
  }
  await writeTyped(client, parsed.base, parsed.dtype === "BIT" ? "BIT" : parsed.dtype, value);
}

function normalizeWriteScalar(value, dtype) {
  const normalized = canonicalizeDtype(dtype);
  if (normalized === "BIT") {
    return parseBooleanWriteValue(value) ? 1 : 0;
  }
  if (normalized === "H") {
    return normalizeHexWriteValue(value);
  }
  if (normalized === "F") {
    encodeFloatWords(value);
    return value;
  }
  const limits = {
    U: [0, 0xffff],
    S: [-0x8000, 0x7fff],
    D: [0, 0xffffffff],
    L: [-0x80000000, 0x7fffffff],
  }[normalized];
  if (!limits || !Number.isSafeInteger(value) || value < limits[0] || value > limits[1]) {
    throw new ValueError(`Invalid ${normalized} value '${String(value)}'; expected an integer in ${limits ? `${limits[0]}..${limits[1]}` : "the supported range"}.`);
  }
  return value;
}

function normalizeHexWriteValue(value) {
  if (Number.isSafeInteger(value) && value >= 0 && value <= 0xffff) {
    return value;
  }
  if (typeof value === "string" && /^[0-9A-F]{1,4}$/i.test(value.trim())) {
    return Number.parseInt(value.trim(), 16);
  }
  throw new ValueError(`Invalid H value '${String(value)}'; use an integer 0..65535 or 1..4 hexadecimal digits.`);
}

function coerceTypedReadValue(device, value, dtype) {
  if (!Array.isArray(value)) {
    return coerceScalar(value, dtype);
  }
  if ((device.deviceType === "T" || device.deviceType === "C") && ["U", "S", "D", "L", "H"].includes(dtype)) {
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
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValueError(`Float value must be finite, got '${String(value)}'.`);
  }
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(value, 0);
  if (!Number.isFinite(buffer.readFloatLE(0))) {
    throw new ValueError(`Float value is outside the finite float32 range: '${String(value)}'.`);
  }
  return [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
}

function encodePackedWriteValue(dtype, value) {
  const normalized = canonicalizeDtype(dtype);
  if (normalized === "F") {
    return encodeFloatWords(value);
  }
  const normalizedValue = normalizeWriteScalar(value, normalized);
  const buffer = Buffer.alloc(4);
  if (normalized === "L") {
    buffer.writeInt32LE(normalizedValue, 0);
  } else {
    buffer.writeUInt32LE(normalizedValue, 0);
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
  formatParsedAddress,
  normalizeAddress,
  normalizeAddressList,
  parseAddress,
  readComments,
  readCounter,
  readTyped,
  readTimer,
  readTimerCounter,
  writeTyped,
  readWords,
  readDWords,
  writeBitInWord,
  readNamed,
  poll,
  writeNamed,
};
