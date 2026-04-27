"use strict";

const { HostLinkProtocolError } = require("./errors");

const SUPPORTED_FORMATS = new Set(["", ".U", ".S", ".D", ".L", ".H"]);
const BIT_BANK_DEVICE_TYPES = new Set(["R", "MR", "LR", "CR"]);

const DEVICE_RANGES = Object.freeze({
  R: [0, 199915, 10],
  B: [0, 0x7fff, 16],
  MR: [0, 399915, 10],
  LR: [0, 99915, 10],
  CR: [0, 7915, 10],
  VB: [0, 0xf9ff, 16],
  DM: [0, 65534, 10],
  EM: [0, 65534, 10],
  FM: [0, 32767, 10],
  ZF: [0, 524287, 10],
  W: [0, 0x7fff, 16],
  TM: [0, 511, 10],
  Z: [1, 12, 10],
  T: [0, 3999, 10],
  TC: [0, 3999, 10],
  TS: [0, 3999, 10],
  C: [0, 3999, 10],
  CC: [0, 3999, 10],
  CS: [0, 3999, 10],
  AT: [0, 7, 10],
  CM: [0, 7599, 10],
  VM: [0, 589823, 10],
  X: [0, 0x1999f, 16],
  Y: [0, 0x63999f, 16],
  M: [0, 63999, 10],
  L: [0, 15999, 10],
  D: [0, 65534, 10],
  E: [0, 65534, 10],
  F: [0, 32767, 10]
});

const FORCE_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "T", "C", "VB"]);
const MBS_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "T", "C", "VB"]);
const MWS_DEVICE_TYPES = new Set(["R", "B", "MR", "LR", "CR", "VB", "DM", "EM", "FM", "W", "TM", "Z", "TC", "TS", "CC", "CS", "CM", "VM"]);
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

const TYPE_PATTERN = Object.keys(DEVICE_RANGES).sort((left, right) => right.length - left.length).join("|");
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
    const validTypes = Object.keys(DEVICE_RANGES).sort().join(", ");
    throw new HostLinkProtocolError(`Invalid device string '${text}'. Valid device types: ${validTypes}`);
  }

  const deviceType = match.groups.type || "R";
  const numberText = match.groups.number;
  const suffix = normalizeSuffix(match.groups.suffix || "");
  const [lo, hi, base] = DEVICE_RANGES[deviceType];
  const number = Number.parseInt(numberText, base);
  if (Number.isNaN(number)) {
    throw new HostLinkProtocolError(`Invalid device number for ${deviceType}: '${numberText}'`);
  }
  if (number < lo || number > hi) {
    throw new HostLinkProtocolError(`Device number out of range: ${deviceType}${numberText} (allowed: ${lo}..${hi})`);
  }
  if (BIT_BANK_DEVICE_TYPES.has(deviceType) && number % 100 > 15) {
    throw new HostLinkProtocolError(`Invalid bit-bank device number: ${deviceType}${numberText} (lower two digits must be 00..15)`);
  }
  return { deviceType, number, suffix };
}

function deviceToString(device) {
  const [, , base] = DEVICE_RANGES[device.deviceType];
  const number = BIT_BANK_DEVICE_TYPES.has(device.deviceType)
    ? formatBitBankNumber(device.number)
    : base === 16 ? device.number.toString(16).toUpperCase() : String(device.number);
  return `${device.deviceType}${number}${device.suffix || ""}`;
}

function formatBitBankNumber(number) {
  const bank = Math.floor(number / 100);
  const bit = number % 100;
  return `${bank}${String(bit).padStart(2, "0")}`;
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
  if (value < lo || value > hi) {
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
  if (count < 1) {
    throw new HostLinkProtocolError(`count out of range: ${count} (allowed: 1..)`);
  }
  const [lo, hi, base] = DEVICE_RANGES[deviceType];
  const wordWidth = effectiveFormat === ".D" || effectiveFormat === ".L" ? 2 : 1;
  const endNumber = startNumber + count * wordWidth - 1;
  if (startNumber < lo || startNumber > hi || endNumber > hi) {
    const startText = base === 16 ? startNumber.toString(16).toUpperCase() : String(startNumber);
    const endText = base === 16 ? endNumber.toString(16).toUpperCase() : String(endNumber);
    throw new HostLinkProtocolError(`Device span out of range: ${deviceType}${startText}..${deviceType}${endText} with format '${effectiveFormat}'`);
  }
}

module.exports = {
  DEVICE_RANGES,
  BIT_BANK_DEVICE_TYPES,
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
  validateDeviceSpan
};
