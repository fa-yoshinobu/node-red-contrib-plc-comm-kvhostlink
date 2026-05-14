"use strict";

const { HostLinkProtocolError } = require("./errors");

const SUPPORTED_FORMATS = new Set(["", ".U", ".S", ".D", ".L", ".H"]);
const BIT_BANK_DEVICE_TYPES = new Set(["R", "MR", "LR", "CR"]);
const XYM_BIT_DEVICE_TYPES = new Set(["X", "Y"]);

const DEVICE_RANGES = Object.freeze({
  R: { lo: 0, hi: 199915, base: 10 },
  B: { lo: 0, hi: 0x7fff, base: 16 },
  MR: { lo: 0, hi: 399915, base: 10 },
  LR: { lo: 0, hi: 99915, base: 10 },
  CR: { lo: 0, hi: 7915, base: 10 },
  VB: { lo: 0, hi: 0xf9ff, base: 16 },
  DM: { lo: 0, hi: 65534, base: 10 },
  EM: { lo: 0, hi: 65534, base: 10 },
  FM: { lo: 0, hi: 32767, base: 10 },
  ZF: { lo: 0, hi: 524287, base: 10 },
  W: { lo: 0, hi: 0x7fff, base: 16 },
  TM: { lo: 0, hi: 511, base: 10 },
  Z: { lo: 1, hi: 12, base: 10 },
  T: { lo: 0, hi: 3999, base: 10 },
  TC: { lo: 0, hi: 3999, base: 10 },
  TS: { lo: 0, hi: 3999, base: 10 },
  C: { lo: 0, hi: 3999, base: 10 },
  CC: { lo: 0, hi: 3999, base: 10 },
  CS: { lo: 0, hi: 3999, base: 10 },
  AT: { lo: 0, hi: 7, base: 10 },
  CM: { lo: 0, hi: 7599, base: 10 },
  VM: { lo: 0, hi: 589823, base: 10 },
  X: { lo: 0, hi: 1999 * 16 + 15, base: 10 },
  Y: { lo: 0, hi: 1999 * 16 + 15, base: 10 },
  M: { lo: 0, hi: 63999, base: 10 },
  L: { lo: 0, hi: 15999, base: 10 },
  D: { lo: 0, hi: 65534, base: 10 },
  E: { lo: 0, hi: 65534, base: 10 },
  F: { lo: 0, hi: 32767, base: 10 }
});

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

const FORCE_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "T", "C", "VB"]);
const MBS_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "T", "C", "VB", "X", "Y", "M", "L"]);
const MWS_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "VB", "X", "Y", "DM", "EM", "FM", "W", "TM", "Z", "TC", "TS", "CC", "CS", "CM", "VM"]);
const RDC_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "DM", "EM", "FM", "ZF", "W", "TM", "Z", "T", "C", "CM", "X", "Y", "M", "L", "D", "E", "F"]);
const WS_DEVICE_TYPES = new Set(["T", "C"]);

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
  AT: ".U",
  CM: ".U",
  VM: ".U",
  T: ".D",
  TC: ".D",
  TS: ".D",
  C: ".D",
  CC: ".D",
  CS: ".D",
  X: "",
  Y: "",
  M: "",
  L: "",
  D: ".U",
  E: ".U",
  F: ".U"
});

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
  CS: "t_c"
});

const TYPE_PATTERN = Object.keys(DEVICE_NUMBER_BASE_BY_TYPE).sort((left, right) => right.length - left.length).join("|");
const DEVICE_RE = new RegExp(`^(?<type>${TYPE_PATTERN})?(?<number>[0-9A-F]+)(?<suffix>\\.[USDLH])?$`);

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
    if (options.allowOmittedType !== false && /^\d+$/.test(raw)) {
      return parseDevice(`R${raw}`, { allowOmittedType: false });
    }
    const validTypes = Object.keys(DEVICE_NUMBER_BASE_BY_TYPE).sort().join(", ");
    throw new HostLinkProtocolError(`Invalid device string '${text}'. Valid device types: ${validTypes}`);
  }

  const deviceType = match.groups.type || "R";
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

function bitBankNumberFromLogical(number) {
  return Math.floor(number / 16) * 100 + (number % 16);
}

function formatXymBitNumber(number) {
  const bank = Math.floor(number / 16);
  const bit = number % 16;
  return `${bank}${bit.toString(16).toUpperCase()}`;
}

function formatDeviceNumber(deviceType, number) {
  if (BIT_BANK_DEVICE_TYPES.has(deviceType)) {
    return formatBitBankNumber(number);
  }
  if (XYM_BIT_DEVICE_TYPES.has(deviceType)) {
    return formatXymBitNumber(number);
  }

  const base = DEVICE_NUMBER_BASE_BY_TYPE[deviceType];
  return base === 16 ? number.toString(16).toUpperCase() : String(number);
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

function parseDeviceText(text, options = {}) {
  const device = parseDevice(text);
  const suffix = options.defaultSuffix ? normalizeSuffix(options.defaultSuffix) : device.suffix;
  return deviceToString({ ...device, suffix });
}

function resolveEffectiveFormat(deviceType, suffix) {
  return suffix || DEFAULT_FORMAT_BY_DEVICE_TYPE[deviceType] || "";
}

function validateRange(name, value, lo, hi) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < lo || numeric > hi) {
    throw new HostLinkProtocolError(`${name} out of range: ${value} (allowed: ${lo}..${hi})`);
  }
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
  const range = DEVICE_RANGES[deviceType];
  if (!range) {
    throw new HostLinkProtocolError(`Unsupported device type: ${deviceType}`);
  }
  if (count < 1) {
    throw new HostLinkProtocolError(`count out of range: ${count} (allowed: 1..)`);
  }

  const wordWidth = effectiveFormat === ".D" || effectiveFormat === ".L" ? 2 : 1;
  const usesBitBank = BIT_BANK_DEVICE_TYPES.has(deviceType);
  const startSpanNumber = usesBitBank ? bitBankLogicalNumber(startNumber) : startNumber;
  const hiSpanNumber = usesBitBank ? bitBankLogicalNumber(range.hi) : range.hi;
  const endSpanNumber = startSpanNumber + count * wordWidth - 1;

  if (startNumber < range.lo || startNumber > range.hi || endSpanNumber > hiSpanNumber) {
    const startText = formatDeviceNumber(deviceType, startNumber);
    const endNumber = usesBitBank ? bitBankNumberFromLogical(endSpanNumber) : endSpanNumber;
    const endText = formatDeviceNumber(deviceType, endNumber);
    throw new HostLinkProtocolError(
      `Device span out of range: ${deviceType}${startText}..${deviceType}${endText} with format '${effectiveFormat}'`
    );
  }
}

function validateExpansionBufferCount(effectiveFormat, count) {
  const hi = effectiveFormat === ".D" || effectiveFormat === ".L" ? 500 : 1000;
  validateRange("count", count, 1, hi);
}

function validateExpansionBufferSpan(address, effectiveFormat, count) {
  if (count < 1) {
    throw new HostLinkProtocolError(`count out of range: ${count} (allowed: 1..)`);
  }
  const wordWidth = effectiveFormat === ".D" || effectiveFormat === ".L" ? 2 : 1;
  const endAddress = address + count * wordWidth - 1;
  if (address < 0 || address > 59999 || endAddress > 59999) {
    throw new HostLinkProtocolError(`Expansion buffer span out of range: ${address}..${endAddress} with format '${effectiveFormat}'`);
  }
}

module.exports = {
  BIT_BANK_DEVICE_TYPES,
  XYM_BIT_DEVICE_TYPES,
  bitBankLogicalNumber,
  FORCE_DEVICE_TYPES,
  MBS_DEVICE_TYPES,
  MWS_DEVICE_TYPES,
  RDC_DEVICE_TYPES,
  WS_DEVICE_TYPES,
  DEFAULT_FORMAT_BY_DEVICE_TYPE,
  normalizeSuffix,
  parseDevice,
  deviceToString,
  parseDeviceText,
  resolveEffectiveFormat,
  validateRange,
  validateDeviceType,
  validateDeviceCount,
  validateDeviceSpan,
  validateExpansionBufferCount,
  validateExpansionBufferSpan
};
