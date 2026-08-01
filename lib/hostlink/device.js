"use strict";

const { HostLinkProtocolError, ValueError } = require("./errors");

const SUPPORTED_FORMATS = new Set(["", ".U", ".S", ".D", ".L", ".H"]);
const BIT_BANK_DEVICE_TYPES = new Set(["R", "MR", "LR", "CR"]);
const XYM_BIT_DEVICE_TYPES = new Set(["X", "Y"]);
const DIRECT_BIT_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "VB", "X", "Y", "M", "L"]);
const NATIVE_32BIT_DEVICE_TYPES = new Set(["T", "TC", "TS", "C", "CC", "CS", "CTH", "CTC", "Z", "AT"]);

const DEVICE_NUMBER_BASE_BY_TYPE = Object.freeze({
  R: 10,
  B: 16,
  MR: 10,
  LR: 10,
  CR: 10,
  VB: 16,
  DM: 10,
  EM: 10,
  FM: 10,
  ZF: 10,
  W: 16,
  TM: 10,
  Z: 10,
  T: 10,
  TC: 10,
  TS: 10,
  C: 10,
  CC: 10,
  CS: 10,
  CTH: 10,
  CTC: 10,
  AT: 10,
  CM: 10,
  VM: 10,
  X: 10,
  Y: 10,
  M: 10,
  L: 10,
  D: 10,
  E: 10,
  F: 10
});

const FORCE_SINGLE_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "T", "C", "CTH", "CTC", "VB", "X", "Y", "M", "L"]);
const FORCE_CONSECUTIVE_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "VB", "X", "Y", "M", "L"]);
const MBS_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "T", "C", "CTH", "CTC", "VB", "X", "Y", "M", "L"]);
const MWS_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "VB", "X", "Y", "DM", "EM", "FM", "D", "E", "F", "W", "TM", "Z", "TC", "TS", "CC", "CS", "CM", "VM"]);
const RDC_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "DM", "EM", "FM", "ZF", "W", "TM", "Z", "T", "C", "CTH", "CTC", "CM", "X", "Y", "M", "L", "D", "E", "F"]);
const WR_DEVICE_TYPES = new Set(Object.keys(DEVICE_NUMBER_BASE_BY_TYPE).filter((deviceType) => deviceType !== "AT"));
const WS_DEVICE_TYPES = new Set(["T", "C", "CTH", "CTC"]);

const DEFAULT_FORMAT_BY_DEVICE_TYPE = Object.freeze({
  R: "",
  B: "",
  MR: "",
  LR: "",
  CR: "",
  VB: "",
  DM: ".U",
  EM: ".U",
  FM: ".U",
  ZF: ".U",
  W: ".U",
  TM: ".U",
  Z: ".U",
  AT: ".D",
  CM: ".U",
  VM: ".U",
  T: ".D",
  TC: ".D",
  TS: ".D",
  C: ".D",
  CC: ".D",
  CS: ".D",
  CTH: ".D",
  CTC: ".D",
  X: "",
  Y: "",
  M: "",
  L: "",
  D: ".U",
  E: ".U",
  F: ".U"
});

const FLOAT32_DEVICE_TYPES = new Set(
  Object.entries(DEFAULT_FORMAT_BY_DEVICE_TYPE)
    .filter(([deviceType, defaultFormat]) => defaultFormat === ".U" && !NATIVE_32BIT_DEVICE_TYPES.has(deviceType))
    .map(([deviceType]) => deviceType)
);

function validateFloat32DeviceType(deviceType, address) {
  if (FLOAT32_DEVICE_TYPES.has(deviceType)) {
    return;
  }
  const subject = address ? `Address '${address}'` : `Device family '${deviceType}'`;
  throw new ValueError(
    `${subject} uses Float32 on ineligible device family '${deviceType}'; direct bit and special-response families are excluded, and Float32 requires an ordinary one-word family with consecutive two-word access.`,
  );
}

const COUNT_CATEGORY_BY_DEVICE_TYPE = Object.freeze({
  R: "up_to_1000",
  B: "up_to_1000",
  MR: "up_to_1000",
  LR: "up_to_1000",
  CR: "up_to_1000",
  VB: "up_to_1000",
  DM: "up_to_1000",
  EM: "up_to_1000",
  FM: "up_to_1000",
  ZF: "up_to_1000",
  W: "up_to_1000",
  CM: "up_to_1000",
  VM: "up_to_1000",
  X: "up_to_1000",
  Y: "up_to_1000",
  M: "up_to_1000",
  L: "up_to_1000",
  D: "up_to_1000",
  E: "up_to_1000",
  F: "up_to_1000",
  TM: "tm",
  Z: "z",
  AT: "at",
  T: "t_c",
  TC: "t_c",
  TS: "t_c",
  C: "t_c",
  CC: "t_c",
  CS: "t_c",
  CTH: "t_c",
  CTC: "t_c"
});

const TYPE_PATTERN = Object.keys(DEVICE_NUMBER_BASE_BY_TYPE).sort((left, right) => right.length - left.length).join("|");
const DEVICE_RE = new RegExp(`^(?<type>${TYPE_PATTERN})(?<number>[0-9A-F]+)(?<suffix>\\.[USDLH])?$`);

function normalizeSuffix(suffix) {
  if (!suffix) {
    return "";
  }
  let normalized = String(suffix).trim().toUpperCase();
  if (!normalized.startsWith(".")) {
    normalized = `.${normalized}`;
  }
  if (!SUPPORTED_FORMATS.has(normalized)) {
    throw new HostLinkProtocolError(`Unsupported data format suffix: '${suffix}'`);
  }
  return normalized;
}

function parseDevice(text, options = {}) {
  const raw = String(text || "").trim().toUpperCase();
  const match = DEVICE_RE.exec(raw);
  if (!match) {
    const validTypes = Object.keys(DEVICE_NUMBER_BASE_BY_TYPE).sort().join(", ");
    throw new HostLinkProtocolError(`Invalid device string '${text}'. Valid device types: ${validTypes}`);
  }

  const deviceType = match.groups.type;
  const numberText = match.groups.number;
  const suffix = normalizeSuffix(match.groups.suffix || "");
  const base = DEVICE_NUMBER_BASE_BY_TYPE[deviceType];
  const number = XYM_BIT_DEVICE_TYPES.has(deviceType)
    ? parseXymBitNumber(deviceType, numberText)
    : parseDeviceNumber(deviceType, numberText, base);
  if (!Number.isSafeInteger(number)) {
    throw new HostLinkProtocolError(`Invalid device number for ${deviceType}: '${numberText}'`);
  }
  if (BIT_BANK_DEVICE_TYPES.has(deviceType) && number % 100 > 15) {
    throw new HostLinkProtocolError(`Invalid bit-bank device number: ${deviceType}${numberText} (lower two digits must be 00..15)`);
  }
  return { deviceType, number, suffix };
}

function deviceToString(device) {
  const base = DEVICE_NUMBER_BASE_BY_TYPE[device.deviceType];
  const number = BIT_BANK_DEVICE_TYPES.has(device.deviceType)
    ? formatBitBankNumber(device.number)
    : XYM_BIT_DEVICE_TYPES.has(device.deviceType) ? formatXymBitNumber(device.number)
    : base === 16 ? device.number.toString(16).toUpperCase() : String(device.number);
  return `${device.deviceType}${number}${device.suffix || ""}`;
}

function formatBitBankNumber(number) {
  const bank = Math.floor(number / 100);
  const bit = number % 100;
  return `${bank}${String(bit).padStart(2, "0")}`;
}

function bitBankLogicalNumber(number) {
  return Math.floor(number / 100) * 16 + (number % 100);
}

function formatXymBitNumber(number) {
  const bank = Math.floor(number / 16);
  const bit = number % 16;
  return `${bank}${bit.toString(16).toUpperCase()}`;
}

function parseXymBitNumber(deviceType, numberText) {
  const bankText = numberText.length === 1 ? "0" : numberText.slice(0, -1);
  if (!/^[0-9]+$/.test(bankText)) {
    throw new HostLinkProtocolError(`Invalid X/Y device number: ${deviceType}${numberText} (bank digits must be decimal and bit digit must be 0..F)`);
  }

  const bank = Number.parseInt(bankText, 10);
  const bit = Number.parseInt(numberText.slice(-1), 16);
  return bank * 16 + bit;
}

function parseDeviceNumber(deviceType, numberText, base) {
  const text = String(numberText || "");
  const valid = base === 16 ? /^[0-9A-F]+$/i.test(text) : /^\d+$/.test(text);
  if (!valid) {
    throw new HostLinkProtocolError(`Invalid device number for ${deviceType}: '${numberText}'`);
  }
  return Number.parseInt(text, base);
}

function parseDeviceText(text) {
  return deviceToString(parseDevice(text));
}

function resolveEffectiveFormat(deviceType, suffix) {
  return suffix || DEFAULT_FORMAT_BY_DEVICE_TYPE[deviceType] || "";
}

function requireExplicitFormat(device, dataFormat) {
  if (device.suffix) {
    throw new HostLinkProtocolError(
      `Low-level device '${deviceToString(device)}' must not contain a data-format suffix; pass the base device and dataFormat separately.`
    );
  }
  if (dataFormat === undefined || dataFormat === null || String(dataFormat).trim() === "") {
    if (DIRECT_BIT_DEVICE_TYPES.has(device.deviceType)) {
      return "";
    }
    const expected = resolveEffectiveFormat(device.deviceType, "") || ".U";
    throw new HostLinkProtocolError(
      `dataFormat is required for numeric device '${deviceToString(device)}'; specify '${expected}' or another supported numeric format.`
    );
  }
  const suffix = normalizeSuffix(dataFormat);
  if (!suffix) {
    if (DIRECT_BIT_DEVICE_TYPES.has(device.deviceType)) {
      return "";
    }
    return "";
  }
  return suffix;
}

function validateRange(name, value, lo, hi) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < lo || value > hi) {
    throw new ValueError(`${name} out of range or not a safe integer: '${String(value)}' (allowed: ${lo}..${hi})`);
  }
  return value;
}

function validateDeviceType(command, deviceType, allowedTypes) {
  if (!allowedTypes.has(deviceType)) {
    const supported = Array.from(allowedTypes).sort().join(", ");
    throw new HostLinkProtocolError(`Command '${command}' does not support device type '${deviceType}'. Supported types: ${supported}`);
  }
}

function validateDeviceCount(deviceType, effectiveFormat, count) {
  const category = COUNT_CATEGORY_BY_DEVICE_TYPE[deviceType];
  if (!category) {
    throw new HostLinkProtocolError(`No count constraint metadata for device type: ${deviceType}`);
  }
  const is32Bit = effectiveFormat === ".D" || effectiveFormat === ".L";
  let limits;
  switch (category) {
    case "up_to_1000":
      limits = is32Bit ? [1, 500] : [1, 1000];
      break;
    case "tm":
      limits = is32Bit ? [1, 256] : [1, 512];
      break;
    case "z":
      limits = [1, 12];
      break;
    case "at":
      limits = [1, 8];
      break;
    case "t_c":
      limits = [1, 120];
      break;
    default:
      throw new HostLinkProtocolError(`Unsupported count category: ${category}`);
  }
  validateRange("count", count, limits[0], limits[1]);
}

function validateDeviceSpan(deviceType, startNumber, effectiveFormat, count = 1) {
  if (!Object.prototype.hasOwnProperty.call(DEVICE_NUMBER_BASE_BY_TYPE, deviceType)) {
    throw new HostLinkProtocolError(`Unsupported device type: ${deviceType}`);
  }
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new HostLinkProtocolError(`count out of range: ${count} (allowed: 1..)`);
  }
  if (!Number.isSafeInteger(startNumber) || startNumber < 0) {
    throw new HostLinkProtocolError(`Device number must be a non-negative safe integer: ${deviceType}${startNumber}`);
  }

  // PROFILE_RANGE_NOT_A_TRANSPORT_GUARD: PLC/profile catalog bounds are
  // application metadata. The communication layer checks syntax, family,
  // numeric representation, span arithmetic, and command limits only.
  const deviceWidth = deviceSpanWidth(deviceType, effectiveFormat);
  const usesBitBank = BIT_BANK_DEVICE_TYPES.has(deviceType);
  const startSpanNumber = usesBitBank ? bitBankLogicalNumber(startNumber) : startNumber;
  const endSpanNumber = startSpanNumber + count * deviceWidth - 1;
  if (!Number.isSafeInteger(endSpanNumber)) {
    throw new HostLinkProtocolError("Device span exceeds the supported numeric representation");
  }
}

function packDirectBitTokens(tokens, expectedCount, context) {
  if (!Array.isArray(tokens) || tokens.length !== expectedCount) {
    throw new HostLinkProtocolError(
      `Direct-bit word response for '${context}' contained ${Array.isArray(tokens) ? tokens.length : 0} tokens; expected ${expectedCount}`
    );
  }
  let packed = 0;
  tokens.forEach((token, bit) => {
    if (token === 1 || token === "1" || token === "ON") {
      packed = (packed | (1 << bit)) >>> 0;
      return;
    }
    if (token !== 0 && token !== "0" && token !== "OFF") {
      throw new HostLinkProtocolError(`Invalid direct bit response token '${String(token)}'`);
    }
  });
  return packed >>> 0;
}

function deviceSpanWidth(deviceType, effectiveFormat) {
  if (DIRECT_BIT_DEVICE_TYPES.has(deviceType)) {
    if (effectiveFormat === ".U" || effectiveFormat === ".S" || effectiveFormat === ".H") {
      return 16;
    }
    if (effectiveFormat === ".D" || effectiveFormat === ".L") {
      return 32;
    }
    return 1;
  }

  if ((effectiveFormat === ".D" || effectiveFormat === ".L") && !NATIVE_32BIT_DEVICE_TYPES.has(deviceType)) {
    return 2;
  }
  return 1;
}

function validateExpansionBufferCount(effectiveFormat, count) {
  const hi = effectiveFormat === ".D" || effectiveFormat === ".L" ? 500 : 1000;
  validateRange("count", count, 1, hi);
}

function validateExpansionBufferSpan(address, effectiveFormat, count) {
  validateRange("address", address, 0, 59999);
  validateRange("count", count, 1, effectiveFormat === ".D" || effectiveFormat === ".L" ? 500 : 1000);
  const wordWidth = effectiveFormat === ".D" || effectiveFormat === ".L" ? 2 : 1;
  const endAddress = address + count * wordWidth - 1;
  if (address < 0 || address > 59999 || endAddress > 59999) {
    throw new HostLinkProtocolError(`Expansion buffer span out of range: ${address}..${endAddress} with format '${effectiveFormat}'`);
  }
}

module.exports = {
  BIT_BANK_DEVICE_TYPES,
  XYM_BIT_DEVICE_TYPES,
  DIRECT_BIT_DEVICE_TYPES,
  NATIVE_32BIT_DEVICE_TYPES,
  bitBankLogicalNumber,
  FORCE_SINGLE_DEVICE_TYPES,
  FORCE_CONSECUTIVE_DEVICE_TYPES,
  MBS_DEVICE_TYPES,
  MWS_DEVICE_TYPES,
  RDC_DEVICE_TYPES,
  WR_DEVICE_TYPES,
  WS_DEVICE_TYPES,
  DEFAULT_FORMAT_BY_DEVICE_TYPE,
  FLOAT32_DEVICE_TYPES,
  validateFloat32DeviceType,
  normalizeSuffix,
  parseDevice,
  deviceToString,
  parseDeviceText,
  resolveEffectiveFormat,
  requireExplicitFormat,
  validateRange,
  validateDeviceType,
  validateDeviceCount,
  validateDeviceSpan,
  packDirectBitTokens,
  validateExpansionBufferCount,
  validateExpansionBufferSpan
};
