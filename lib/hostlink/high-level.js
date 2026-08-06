"use strict";

const {
  BIT_BANK_DEVICE_TYPES,
  DEFAULT_FORMAT_BY_DEVICE_TYPE,
  FLOAT32_DEVICE_TYPES,
  NATIVE_32BIT_DEVICE_TYPES,
  RDC_DEVICE_TYPES,
  WR_DEVICE_TYPES,
  bitBankLogicalNumber,
  deviceToString,
  parseDevice,
  validateDeviceCount,
  validateDeviceSpan,
  validateFloat32DeviceType,
} = require("./device");
const { HostLinkCanceledError, ValueError } = require("./errors");
const { requireCommentEncoding } = require("./comment-codec");

const OPTIMIZABLE_READ_NAMED_DEVICE_TYPES = new Set(FLOAT32_DEVICE_TYPES);
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
const MAX_POLL_INTERVAL_MS = 0x7fffffff;

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
  if (typeof value === "boolean") return value;
  throw new ValueError(`Invalid BIT value '${String(value)}'; use the Boolean values true or false.`);
}

function validateAddressSemantics(address, parsedDevice, dtype, hasCount) {
  if (dtype === "BIT" && !DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
    throw new ValueError(`Address '${address}' uses BIT, which is valid only for direct bit device families.`);
  }
  if (dtype === "F") {
    validateFloat32DeviceType(parsedDevice.deviceType, address);
  }
  if (dtype === "COMMENT" && !RDC_DEVICE_TYPES.has(parsedDevice.deviceType)) {
    throw new ValueError(`Address '${address}' uses COMMENT with a device family that RDC does not support.`);
  }
  if (dtype === "COMMENT" && hasCount) {
    throw new ValueError("comment addresses do not support ',count'.");
  }
}

function parseAddressDetailed(address) {
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
    validateAddressSemantics(address, parsedDevice, requiredDtype, hasCount);
    return {
      parsed: { base: baseAddress, dtype: requiredDtype, bitIndex: null, count, hasCount, explicitDtype: true },
      device: parsedDevice,
    };
  }
  if (match.groups.bit !== undefined) {
    if (hasCount) {
      throw new ValueError("bit-in-word addresses do not support ',count'.");
    }
    return {
      parsed: {
        base: baseAddress,
        dtype: "BIT_IN_WORD",
        bitIndex: Number.parseInt(match.groups.bit, 16),
        count,
        hasCount,
        explicitDtype: false,
      },
      device: parsedDevice,
    };
  }
  throw new ValueError(`Address '${address}' requires an explicit data type such as ':U', ':D', or ':BIT'.`);
}

function parseAddress(address) {
  return parseAddressDetailed(address).parsed;
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
    const text = `${base}.${parsed.bitIndex.toString(16).toUpperCase()}`;
    parseAddress(text);
    return text;
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
  parseAddress(text);
  return text;
}

function normalizeAddress(address) {
  return formatParsedAddress(parseAddress(address));
}

function snapshotAddressTokens(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (typeof item !== "string" || !item.trim()) {
        throw new ValueError(`addresses[${index}] must be a non-empty string.`);
      }
      return item.trim();
    });
  }
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
    }
    if (Array.isArray(parsed)) {
      return snapshotAddressTokens(parsed);
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
  return tokens;
}

function normalizeAddressList(value) {
  const tokens = snapshotAddressTokens(value);
  tokens.forEach((token) => parseAddress(token));
  return tokens;
}

async function readTyped(client, device, dtype, options) {
  const normalized = requireTypedDtype(dtype);
  const parsedDevice = parseDevice(device);
  return readPreparedTyped(client, device, parsedDevice, normalized, options);
}

async function readPreparedTyped(client, device, parsedDevice, normalized, options) {
  if (normalized === "BIT") {
    if (!DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
      throw new ValueError("BIT reads are valid only for direct bit device families.");
    }
    return resolveDirectBitValue([await client.read(device, undefined, options)], 0);
  }
  if (normalized === "F") {
    validateFloat32DeviceType(parsedDevice.deviceType, device);
    const [lo, hi] = await readWords(client, device, 2, options);
    return decodeFloatFromWords(lo, hi);
  }
  const value = await client.read(device, `.${normalized}`, options);
  return coerceTypedReadValue(parsedDevice, value, normalized);
}

async function readTimerCounter(client, device, options) {
  const parsedDevice = parseDevice(device);
  if (!["T", "C"].includes(parsedDevice.deviceType)) {
    throw new ValueError("readTimerCounter requires a T or C device.");
  }
  const target = deviceToString({ ...parsedDevice, suffix: "" });
  const value = await client.read(target, ".D", options);
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

async function readTimer(client, device, options) {
  if (parseDevice(device).deviceType !== "T") {
    throw new ValueError("readTimer requires a T device.");
  }
  return readTimerCounter(client, device, options);
}

async function readCounter(client, device, options) {
  if (parseDevice(device).deviceType !== "C") {
    throw new ValueError("readCounter requires a C device.");
  }
  return readTimerCounter(client, device, options);
}

async function readComments(client, device, encoding, options) {
  const normalizedEncoding = requireCommentEncoding(encoding, "readComments encoding");
  return client.readComments(device, normalizedEncoding, options);
}

async function readCommentBytes(client, device, options) {
  return client.readCommentBytes(device, options);
}

async function writeTyped(client, device, dtype, value, options) {
  const normalized = requireTypedDtype(dtype);
  const parsedDevice = parseDevice(device);
  if (normalized === "BIT") {
    if (!DIRECT_BIT_DEVICE_TYPES.has(parsedDevice.deviceType)) {
      throw new ValueError("BIT writes are valid only for direct bit device families.");
    }
    await client.write(device, parseBooleanWriteValue(value), undefined, options);
    return;
  }
  if (normalized === "F") {
    validateFloat32DeviceType(parsedDevice.deviceType, device);
    await client.writeConsecutive(device, encodeFloatWords(value), ".U", options);
    return;
  }
  await client.write(device, normalizeWriteScalar(value, normalized), `.${normalized}`, options);
}

/**
 * Perform the client's explicit Boolean-only, non-PLC-atomic word-bit update.
 *
 * The client validates the complete plan before admission and retains one FIFO
 * turn and one absolute deadline across exactly one read and one write. This
 * helper adds no fallback, retry, or readback.
 */
async function writeBitInWord(client, device, bitIndex, value, options) {
  requireSafeInteger("bitIndex", bitIndex, 0, 15);
  const enabled = parseBooleanWriteValue(value);
  if (!client || typeof client.writeBitInWord !== "function") {
    throw new ValueError("writeBitInWord requires a HostLink client with explicit compound-write support.");
  }
  await client.writeBitInWord(device, bitIndex, enabled, options);
}

/** Perform an explicit Boolean-only expansion-buffer word-bit update. */
async function writeBitInExpansionUnitBuffer(client, unitNo, address, bitIndex, value, options) {
  requireSafeInteger("unitNo", unitNo, 0, 48);
  requireSafeInteger("address", address, 0, 59999);
  requireSafeInteger("bitIndex", bitIndex, 0, 15);
  const enabled = parseBooleanWriteValue(value);
  if (!client || typeof client.writeBitInExpansionUnitBuffer !== "function") {
    throw new ValueError(
      "writeBitInExpansionUnitBuffer requires a HostLink client with explicit compound-write support.",
    );
  }
  await client.writeBitInExpansionUnitBuffer(unitNo, address, bitIndex, enabled, options);
}

async function readWords(client, device, count, options) {
  requireSafeInteger("count", count, 1, 1000);
  const values = await client.readConsecutive(device, count, ".U", options);
  return values.map((value) => Number(value) & 0xffff);
}

async function readDWords(client, device, count, options) {
  requireSafeInteger("count", count, 1, 500);
  const words = await readWords(client, device, count * 2, options);
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(decodeDwordWords(words, index * 2, "D"));
  }
  return values;
}

function requireBitInWordIndex(address, bitIndex) {
  if (Number.isSafeInteger(bitIndex) && bitIndex >= 0 && bitIndex <= 15) {
    return bitIndex;
  }
  throw new ValueError(`Address '${address}' uses BIT_IN_WORD but no bit index was specified. Use '.0' through '.F' notation.`);
}

async function readNamed(client, addresses, options) {
  const normalizedAddresses = snapshotAddressTokens(addresses);
  if (normalizedAddresses.length === 0) {
    throw new ValueError("readNamed addresses must not be empty.");
  }
  const plan = compileReadNamedPlan(normalizedAddresses);
  const readOptions = snapshotNamedReadOptions(plan, options, "readNamed");
  const execute = () => stageReadNamedPlan(client, plan, readOptions);
  const staged = typeof client._runExclusive === "function"
    ? await client._runExclusive(execute, readOptions.operationOptions)
    : await execute();
  return materializeReadNamedResult(plan, staged);
}

async function* poll(client, addresses, intervalMs, options) {
  const normalizedAddresses = snapshotAddressTokens(addresses);
  if (normalizedAddresses.length === 0) {
    throw new ValueError("poll addresses must not be empty.");
  }
  const plan = compileReadNamedPlan(normalizedAddresses);
  const normalizedIntervalMs = requireSafeInteger("intervalMs", intervalMs, 1, MAX_POLL_INTERVAL_MS);
  const readOptions = snapshotNamedReadOptions(plan, options, "poll");

  while (true) {
    const execute = () => stageReadNamedPlan(client, plan, readOptions);
    const staged = typeof client._runExclusive === "function"
      ? await client._runExclusive(execute, readOptions.operationOptions)
      : await execute();
    yield materializeReadNamedResult(plan, staged);
    await delay(normalizedIntervalMs, readOptions.operationOptions.signal);
  }
}

async function writeNamed(client, updates, options) {
  const prepared = prepareWriteNamed(updates);
  await prepared.execute(client, options);
}

function prepareWriteNamed(updates) {
  const updatesSnapshot = snapshotNamedUpdates(updates);
  const operations = compileWriteOperations(updatesSnapshot);
  if (operations.length !== 1) {
    throw new ValueError(
      "writeNamed must fit one Host Link request; issue separate explicit writes for multi-request updates.",
    );
  }
  return Object.freeze({
    updates: updatesSnapshot,
    execute: (client, options) => executeWriteOperation(client, operations[0], options),
  });
}

function snapshotNamedUpdates(updates) {
  if (updates === null || typeof updates !== "object" || Array.isArray(updates) || Object.keys(updates).length === 0) {
    throw new ValueError("writeNamed updates must be a non-empty object.");
  }
  const snapshot = {};
  for (const [address, value] of Object.entries(updates)) {
    snapshot[address] = Array.isArray(value) ? Object.freeze(Array.from(value)) : value;
  }
  return Object.freeze(snapshot);
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
  const entry = { address, value: Array.isArray(value) ? Array.from(value) : value, parsed, device };
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
    throw new ValueError(
      `Address '${address}' requires a read-modify-write sequence; state-changing multi-request helpers are not supported.`,
    );
  }
  if (parsed.dtype === "F") {
    validateFloat32DeviceType(device.deviceType, address);
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

function snapshotOperationOptions(value, operation) {
  if (value === undefined) return Object.freeze({ signal: null });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValueError(`${operation} options must be an object when provided.`);
  }
  for (const key of Object.keys(value)) {
    if (key !== "signal") throw new ValueError(`${operation} options contain unsupported key '${key}'.`);
  }
  const signal = value.signal === undefined ? null : value.signal;
  if (
    signal !== null
    && (
      typeof signal !== "object"
      || typeof signal.aborted !== "boolean"
      || typeof signal.addEventListener !== "function"
      || typeof signal.removeEventListener !== "function"
    )
  ) {
    throw new ValueError(`${operation} signal must be an AbortSignal.`);
  }
  return Object.freeze({ signal });
}

function snapshotNamedReadOptions(plan, value, operation) {
  if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value))) {
    throw new ValueError(`${operation} options must be an object when provided.`);
  }
  const options = value || {};
  for (const key of Object.keys(options)) {
    if (!["signal", "commentOutput", "commentEncoding"].includes(key)) {
      throw new ValueError(`${operation} options contain unsupported key '${key}'.`);
    }
  }
  const operationOptions = snapshotOperationOptions(
    Object.prototype.hasOwnProperty.call(options, "signal") ? { signal: options.signal } : undefined,
    operation,
  );
  const hasComments = plan.entries.some((entry) => entry.parsed.dtype === "COMMENT");
  const hasOutput = Object.prototype.hasOwnProperty.call(options, "commentOutput");
  const hasEncoding = Object.prototype.hasOwnProperty.call(options, "commentEncoding");

  if (!hasComments) {
    if (hasOutput || hasEncoding) {
      throw new ValueError(`${operation} comment options require at least one :COMMENT address.`);
    }
    return Object.freeze({ operationOptions, commentOutput: null, commentEncoding: null });
  }
  if (options.commentOutput !== "text" && options.commentOutput !== "buffer") {
    throw new ValueError(`${operation} commentOutput is required and must be one of: text, buffer.`);
  }
  if (options.commentOutput === "text") {
    const commentEncoding = requireCommentEncoding(options.commentEncoding, `${operation} commentEncoding`);
    return Object.freeze({ operationOptions, commentOutput: "text", commentEncoding });
  }
  if (hasEncoding) {
    throw new ValueError(`${operation} commentEncoding must be omitted when commentOutput is 'buffer'.`);
  }
  return Object.freeze({ operationOptions, commentOutput: "buffer", commentEncoding: null });
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
    nextNumber: writeBatchNumber(entry, spec),
    values: [],
  };
  appendWriteBatchValue(batch, entry, spec);
  return batch;
}

function canAppendWriteBatch(batch, entry, spec) {
  return batch.kind === spec.kind
    && batch.deviceType === spec.deviceType
    && batch.dtype === spec.dtype
    && writeBatchNumber(entry, spec) === batch.nextNumber;
}

function writeBatchNumber(entry, spec) {
  if (spec.kind === "bit" && BIT_BANK_DEVICE_TYPES.has(entry.device.deviceType)) {
    return bitBankLogicalNumber(entry.device.number);
  }
  return entry.device.number;
}

function appendWriteBatchValue(batch, entry, spec) {
  if (spec.kind === "packed-words") {
    batch.values.push(...encodePackedWriteValue(entry.parsed.dtype, entry.value));
  } else {
    batch.values.push(normalizeWriteScalar(entry.value, entry.parsed.dtype));
  }
  batch.nextNumber = writeBatchNumber(entry, spec) + spec.step;
}

async function executeWriteOperation(client, operation, options) {
  if (operation.kind === "single") {
    const { entry } = operation;
    await writeParsed(client, entry.address, entry.device, entry.parsed, entry.value, options);
    return;
  }
  if (operation.kind === "set-value") {
    await client.writeSetValueConsecutive(operation.base, operation.values, operation.dataFormat, options);
    return;
  }
  if (operation.kind === "bit") {
    await client.writeConsecutive(operation.base, operation.values, undefined, options);
    return;
  }
  await client.writeConsecutive(operation.base, operation.values, operation.dataFormat, options);
}

function compileReadNamedPlan(addresses) {
  const seen = new Set();
  const entries = addresses.map((address, index) => {
    const { parsed, device } = parseAddressDetailed(address);
    const semanticIdentity = JSON.stringify([
      device.deviceType,
      device.number,
      parsed.dtype,
      parsed.bitIndex,
      parsed.count,
    ]);
    if (seen.has(semanticIdentity)) {
      throw new ValueError(`readNamed contains semantically duplicate address '${address}', which cannot have two result mappings.`);
    }
    seen.add(semanticIdentity);
    validateReadEntry(address, device, parsed);
    return { index, address, parsed, device };
  });

  const operations = [];
  const groups = [];
  const compatibleGroups = new Map();
  for (const entry of entries) {
    const request = tryParseOptimizableReadNamedRequest(entry);
    if (!request) {
      groups.push({ kind: "entry", entry });
      continue;
    }
    const mode = request.kind === "DIRECT_BIT" ? "DIRECT_BITS" : "WORDS";
    const key = `${request.baseAddress.deviceType}\u0000${mode}`;
    let group = compatibleGroups.get(key);
    if (!group) {
      group = { kind: "compatible", mode, requests: [] };
      compatibleGroups.set(key, group);
      groups.push(group);
    }
    group.requests.push(request);
  }

  for (const group of groups) {
    if (group.kind === "entry") {
      operations.push({ kind: "entry", entry: group.entry });
      continue;
    }
    const sorted = group.requests.slice().sort((left, right) => {
      const numberDifference = readPlanNumber(left) - readPlanNumber(right);
      return numberDifference || left.index - right.index;
    });
    let segment = null;
    const flushSegment = () => {
      if (!segment) return;
      operations.push({
        kind: "segment",
        startAddress: segment.startAddress,
        startNumber: segment.startNumber,
        count: segment.endExclusive - segment.startNumber,
        mode: segment.mode,
        requests: segment.requests,
      });
      segment = null;
    };
    for (const request of sorted) {
      const requestStart = readPlanNumber(request);
      const requestEndExclusive = requestStart + getWordWidth(request.kind);
      const limit = readPlanSegmentLimit(request.baseAddress.deviceType, group.mode);
      const canAppend = segment
        && requestStart <= segment.endExclusive
        && requestEndExclusive - segment.startNumber <= limit;
      if (!canAppend) {
        flushSegment();
        segment = {
          startAddress: { ...request.baseAddress, suffix: "" },
          startNumber: requestStart,
          endExclusive: requestEndExclusive,
          mode: group.mode,
          requests: [],
        };
      } else if (requestEndExclusive > segment.endExclusive) {
        segment.endExclusive = requestEndExclusive;
      }
      segment.requests.push(request);
    }
    flushSegment();
  }
  return freezeReadNamedPlan(entries, operations);
}

function freezeReadNamedPlan(entries, operations) {
  for (const entry of entries) {
    Object.freeze(entry.parsed);
    Object.freeze(entry.device);
    Object.freeze(entry);
  }
  for (const operation of operations) {
    if (operation.kind === "segment") {
      Object.freeze(operation.startAddress);
      for (const request of operation.requests) {
        Object.freeze(request.baseAddress);
        Object.freeze(request);
      }
      Object.freeze(operation.requests);
    }
    Object.freeze(operation);
  }
  Object.freeze(entries);
  Object.freeze(operations);
  return Object.freeze({ entries, operations });
}

function validateReadEntry(address, device, parsed) {
  if (parsed.dtype === "COMMENT") {
    if (!RDC_DEVICE_TYPES.has(device.deviceType)) {
      throw new ValueError(`Address '${address}' uses COMMENT with a device family that RDC does not support.`);
    }
    return;
  }
  if (parsed.dtype === "BIT_IN_WORD") {
    requireBitInWordIndex(address, parsed.bitIndex);
    validateDeviceSpan(device.deviceType, device.number, ".U", 1);
    return;
  }
  let effectiveFormat;
  let protocolCount;
  if (parsed.dtype === "BIT") {
    effectiveFormat = "";
    protocolCount = parsed.count;
  } else if (parsed.dtype === "F") {
    validateFloat32DeviceType(device.deviceType, address);
    effectiveFormat = ".U";
    protocolCount = parsed.count * 2;
  } else if (["D", "L"].includes(parsed.dtype) && !NATIVE_32BIT_DEVICE_TYPES.has(device.deviceType)) {
    effectiveFormat = ".U";
    protocolCount = parsed.count * 2;
  } else {
    effectiveFormat = `.${parsed.dtype}`;
    protocolCount = parsed.count;
  }
  if (!Number.isSafeInteger(protocolCount)) {
    throw new ValueError(`Address '${address}' exceeds the supported point-count representation.`);
  }
  validateDeviceCount(device.deviceType, effectiveFormat, protocolCount);
  validateDeviceSpan(device.deviceType, device.number, effectiveFormat, protocolCount);
}

function tryParseOptimizableReadNamedRequest(entry) {
  const {
    address, index, parsed, device,
  } = entry;
  if (parsed.hasCount) {
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

async function stageReadNamedPlan(client, plan, readOptions) {
  const staged = new Array(plan.operations.length);
  const options = readOptions.operationOptions;

  for (const [operationIndex, operation] of plan.operations.entries()) {
    if (operation.kind === "entry") {
      const { entry } = operation;
      staged[operationIndex] = await readParsed(client, entry.address, entry.device, entry.parsed, readOptions);
      continue;
    }
    staged[operationIndex] = operation.mode === "DIRECT_BITS"
      ? await client.readConsecutive(deviceToString(operation.startAddress), operation.count, undefined, options)
      : await readWords(client, deviceToString(operation.startAddress), operation.count, options);
  }
  return staged;
}

function materializeReadNamedResult(plan, staged) {
  const resolved = new Array(plan.entries.length).fill(undefined);
  for (const [operationIndex, operation] of plan.operations.entries()) {
    if (operation.kind === "entry") {
      resolved[operation.entry.index] = staged[operationIndex];
      continue;
    }
    const values = staged[operationIndex];
    for (const request of operation.requests) {
      const offset = readPlanNumber(request) - operation.startNumber;
      resolved[request.index] = operation.mode === "DIRECT_BITS"
        ? resolveDirectBitValue(values, offset)
        : resolvePlannedValue(values, offset, request.kind, request.bitIndex);
    }
  }
  const snapshot = {};
  for (const entry of plan.entries) {
    if (resolved[entry.index] === undefined) {
      throw new ValueError(`No value resolved for '${entry.address}'.`);
    }
    snapshot[entry.address] = resolved[entry.index];
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

async function readParsed(client, address, device, parsed, readOptions) {
  const options = readOptions.operationOptions;
  if (parsed.dtype === "BIT_IN_WORD") {
    if (parsed.hasCount) {
      throw new ValueError(`Address '${address}' does not support ',count' with '.bit' notation.`);
    }
    const bitIndex = requireBitInWordIndex(address, parsed.bitIndex);
    const word = Number(await readPreparedTyped(client, parsed.base, device, "U", options)) & 0xffff;
    return Boolean(word & (1 << bitIndex));
  }
  if (parsed.dtype === "COMMENT") {
    if (parsed.hasCount) {
      throw new ValueError(`Address '${address}' does not support ',count' with ':COMMENT' notation.`);
    }
    return readOptions.commentOutput === "buffer"
      ? readCommentBytes(client, parsed.base, options)
      : readComments(client, parsed.base, readOptions.commentEncoding, options);
  }
  if (parsed.count > 1) {
    if (parsed.dtype === "F") {
      const words = await readWords(client, parsed.base, parsed.count * 2, options);
      return Array.from({ length: parsed.count }, (_, index) => decodeFloatFromWords(words[index * 2], words[index * 2 + 1]));
    }
    if (parsed.dtype === "D" || parsed.dtype === "L") {
      if (NATIVE_32BIT_DEVICE_TYPES.has(device.deviceType)) {
        const values = await client.readConsecutive(parsed.base, parsed.count, `.${parsed.dtype}`, options);
        return values.map((value) => coerceScalar(value, parsed.dtype));
      }
      const words = await readWords(client, parsed.base, parsed.count * 2, options);
      return Array.from({ length: parsed.count }, (_, index) => decodeDwordWords(words, index * 2, parsed.dtype));
    }
    if (parsed.dtype === "BIT") {
      const values = await client.readConsecutive(parsed.base, parsed.count, undefined, options);
      return values.map((value, index) => resolveDirectBitValue(values, index));
    }
    const values = await client.readConsecutive(parsed.base, parsed.count, `.${parsed.dtype}`, options);
    return values.map((value) => coerceScalar(value, parsed.dtype));
  }
  if (parsed.dtype === "BIT") {
    return readPreparedTyped(client, parsed.base, device, "BIT", options);
  }
  return readPreparedTyped(client, parsed.base, device, parsed.dtype, options);
}

async function writeParsed(client, address, device, parsed, value, options) {
  if (parsed.dtype === "BIT_IN_WORD") {
    throw new ValueError(`Address '${address}' requires an unsupported state-changing multi-request sequence.`);
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
      await client.writeConsecutive(parsed.base, words, ".U", options);
      return;
    }
    if ((device.deviceType === "T" || device.deviceType === "C") && parsed.dtype !== "BIT") {
      await client.writeSetValueConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)), `.${parsed.dtype}`, options);
      return;
    }
    if (NATIVE_32BIT_DEVICE_TYPES.has(device.deviceType) && (parsed.dtype === "D" || parsed.dtype === "L")) {
      await client.writeConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)), `.${parsed.dtype}`, options);
      return;
    }
    if (parsed.dtype === "BIT") {
      await client.writeConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)), undefined, options);
      return;
    }
    await client.writeConsecutive(parsed.base, value.map((item) => normalizeWriteScalar(item, parsed.dtype)), `.${parsed.dtype}`, options);
    return;
  }
  if (device.deviceType === "T" || device.deviceType === "C") {
    await client.writeSetValue(parsed.base, normalizeWriteScalar(value, parsed.dtype), parsed.dtype === "BIT" ? undefined : `.${parsed.dtype}`, options);
    return;
  }
  await writeTyped(client, parsed.base, parsed.dtype === "BIT" ? "BIT" : parsed.dtype, value, options);
}

function normalizeWriteScalar(value, dtype) {
  const normalized = canonicalizeDtype(dtype);
  if (normalized === "BIT") {
    return parseBooleanWriteValue(value);
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
    const text = String(value).trim().toUpperCase();
    if (!/^[0-9A-F]{1,4}$/.test(text)) {
      throw new ValueError(`Invalid H response value '${String(value)}'; expected 1..4 hexadecimal digits.`);
    }
    return text.padStart(4, "0");
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

function delay(ms, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.reject(new HostLinkCanceledError());
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutHandle);
      signal.removeEventListener("abort", onAbort);
      reject(new HostLinkCanceledError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

module.exports = {
  formatParsedAddress,
  normalizeAddress,
  normalizeAddressList,
  parseAddress,
  readCommentBytes,
  readComments,
  readCounter,
  readTyped,
  readTimer,
  readTimerCounter,
  writeTyped,
  writeBitInWord,
  writeBitInExpansionUnitBuffer,
  readWords,
  readDWords,
  readNamed,
  poll,
  writeNamed,
  _prepareWriteNamed: prepareWriteNamed,
};
