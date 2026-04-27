"use strict";

const { DEFAULT_FORMAT_BY_DEVICE_TYPE } = require("./device");
const { HostLinkProtocolError } = require("./errors");

const RANGE_CSV_DATA = `DeviceType,Base,KV-NANO,KV-NANO(XYM),KV-3000/5000,KV-3000/5000(XYM),KV-7000,KV-7000(XYM),KV-8000,KV-8000(XYM),KV-X500,KV-X500(XYM)
R,10,R00000-R59915,"X0-599F,Y0-599F",R00000-R99915,"X0-999F,Y0-999F",R00000-R199915,"X0-1999F,Y0-1999F",R00000-R199915,"X0-1999F,Y0-1999F",R00000-R199915,"X0-1999F,Y0-1999F"
B,16,B0000-B1FFF,B0000-B1FFF,B0000-B3FFF,B0000-B3FFF,B0000-B7FFF,B0000-B7FFF,B0000-B7FFF,B0000-B7FFF,B0000-B7FFF,B0000-B7FFF
MR,10,MR00000-MR59915,M0-9599,MR00000-MR99915,M0-15999,MR000000-MR399915,M000000-M63999,MR000000-MR399915,M000000-M63999,MR000000-MR399915,M000000-M63999
LR,10,LR00000-LR19915,L0-3199,LR00000-LR99915,L0-15999,LR00000-LR99915,L00000-L15999,LR00000-LR99915,L00000-L15999,LR00000-LR99915,L00000-L15999
CR,10,CR0000-CR8915,CR0000-CR8915,CR0000-CR3915,CR0000-CR3915,CR0000-CR7915,CR0000-CR7915,CR0000-CR7915,CR0000-CR7915,CR0000-CR7915,CR0000-CR7915
CM,10,CM0000-CM8999,CM0000-CM8999,CM0000-CM5999,CM0000-CM5999,CM0000-CM5999,CM0000-CM5999,CM0000-CM7599,CM0000-CM7599,CM0000-CM7599,CM0000-CM7599
T,10,T0000-T0511,T0000-T0511,T0000-T3999,T0000-T3999,T0000-T3999,T0000-T3999,T0000-T3999,T0000-T3999,T0000-T3999,T0000-T3999
C,10,C0000-C0255,C0000-C0255,C0000-C3999,C0000-C3999,C0000-C3999,C0000-C3999,C0000-C3999,C0000-C3999,C0000-C3999,C0000-C3999
DM,10,DM00000-DM32767,D0-32767,DM00000-DM65534,D0-65534,DM00000-DM65534,D00000-D65534,DM00000-DM65534,D00000-D65534,DM00000-DM65534,D00000-D65534
EM,10,-,-,EM00000-EM65534,E0-65534,EM00000-EM65534,E00000-E65534,EM00000-EM65534,E00000-E65534,EM00000-EM65534,E00000-E65534
FM,10,-,-,FM00000-FM32767,F0-32767,FM00000-FM32767,F00000-F32767,FM00000-FM32767,F00000-F32767,FM00000-FM32767,F00000-F32767
ZF,10,-,-,ZF000000-ZF131071,ZF000000-ZF131071,ZF000000-ZF524287,ZF000000-ZF524287,ZF000000-ZF524287,ZF000000-ZF524287,ZF000000-ZF524287,ZF000000-ZF524287
W,16,W0000-W3FFF,W0000-W3FFF,W0000-W3FFF,W0000-W3FFF,W0000-W7FFF,W0000-W7FFF,W0000-W7FFF,W0000-W7FFF,W0000-W7FFF,W0000-W7FFF
TM,10,TM000-TM511,TM000-TM511,TM000-TM511,TM000-TM511,TM000-TM511,TM000-TM511,TM000-TM511,TM000-TM511,TM000-TM511,TM000-TM511
VM,10,VM0-9499,VM0-9499,VM0-49999,VM0-49999,VM0-63999,VM0-63999,VM0-589823,VM0-589823,-,-
VB,16,VB0-1FFF,VB0-1FFF,VB0-3FFF,VB0-3FFF,VB0-F9FF,VB0-F9FF,VB0-F9FF,VB0-F9FF,-,-
Z,10,Z1-12,Z1-12,Z1-12,Z1-12,Z1-12,Z1-12,Z1-12,Z1-12,-,-
CTH,10,CTH0-3,CTH0-3,CTH0-1,CTH0-3,-,-,-,-,-,-
CTC,10,CTC0-7,CTC0-7,CTC0-3,CTC0-3,-,-,-,-,-,-
AT,10,-,-,AT0-7,AT0-7,AT0-7,AT0-7,AT0-7,AT0-7,-,-`;

const KvDeviceRangeNotation = Object.freeze({
  DECIMAL: "decimal",
  HEXADECIMAL: "hexadecimal",
});

const KvDeviceRangeCategory = Object.freeze({
  BIT: "bit",
  WORD: "word",
  TIMER_COUNTER: "timer_counter",
  INDEX: "index",
  FILE_REFRESH: "file_refresh",
});

let parsedRangeTable = null;

function availableDeviceRangeModels() {
  return Array.from(rangeTable().modelHeaders);
}

function deviceRangeCatalogForModel(model) {
  return buildCatalog(model, null);
}

function deviceRangeCatalogForQueryModel(modelInfo) {
  const code = modelInfo && modelInfo.code ? String(modelInfo.code) : "";
  if (!modelInfo || !modelInfo.model) {
    throw new HostLinkProtocolError(`Unsupported model code '${code}'; cannot resolve device range catalog.`);
  }
  return buildCatalog(String(modelInfo.model), code);
}

function buildCatalog(model, modelCode) {
  const requestedModel = String(model || "").trim();
  if (!requestedModel) {
    throw new HostLinkProtocolError("Model name must not be empty.");
  }

  const table = rangeTable();
  const resolvedModel = resolveModelColumn(table, requestedModel);
  const modelIndex = table.modelHeaders.indexOf(resolvedModel);
  if (modelIndex < 0) {
    throw new HostLinkProtocolError(`Resolved model column '${resolvedModel}' was not found in the embedded device range table.`);
  }

  const entries = table.rows.map((row) => buildEntry(row, modelIndex, resolvedModel));
  const catalog = {
    model: resolvedModel,
    modelCode: modelCode || "",
    hasModelCode: modelCode != null,
    requestedModel,
    resolvedModel,
    entries,
  };
  Object.defineProperty(catalog, "entry", {
    value(deviceType) {
      return findDeviceRangeEntry(catalog, deviceType);
    },
    enumerable: false,
  });
  return Object.freeze(catalog);
}

function findDeviceRangeEntry(catalog, deviceType) {
  const wanted = String(deviceType || "").trim().toUpperCase();
  return catalog.entries.find((entry) => entry.deviceType.toUpperCase() === wanted)
    || catalog.entries.find((entry) => entry.device.toUpperCase() === wanted)
    || catalog.entries.find((entry) => entry.segments.some((segment) => segment.device.toUpperCase() === wanted))
    || null;
}

function buildEntry(row, modelIndex, resolvedModel) {
  const rangeText = row.ranges[modelIndex].trim();
  const supported = Boolean(rangeText) && rangeText !== "-";
  const addressRange = supported ? rangeText : null;
  const segments = addressRange ? parseSegments(row, addressRange) : [];
  const primaryDevice = primaryDeviceName(row, segments);
  const [category, isBitDevice] = deviceMetadata(primaryDevice);
  const notation = entryNotation(row.notation, segments);
  const [lowerBound, upperBound, pointCount] = summarizeEntryBounds(segments);

  return Object.freeze({
    device: primaryDevice,
    deviceType: row.deviceType,
    category,
    isBitDevice,
    notation,
    supported,
    lowerBound,
    upperBound,
    pointCount,
    addressRange,
    source: `Embedded device range table (${resolvedModel})`,
    notes: segments.length > 1 ? "Published address range expands to multiple alias devices; inspect segments." : null,
    segments: Object.freeze(segments),
  });
}

function parseSegments(row, rangeText) {
  return rangeText.split(",").map((text) => text.trim()).filter(Boolean).map((segment) => {
    const device = segmentDevice(segment) || row.deviceType;
    const [category, isBitDevice] = deviceMetadata(device);
    const notation = notationForDevice(row.notation, device);
    const [lowerBound, upperBound, pointCount] = parseSegmentBounds(segment, notation, device);
    return Object.freeze({
      device,
      category,
      isBitDevice,
      notation,
      lowerBound,
      upperBound,
      pointCount,
      addressRange: segment,
    });
  });
}

function segmentDevice(segment) {
  let result = "";
  for (const char of segment) {
    if (!/[A-Za-z]/.test(char)) {
      break;
    }
    result += char;
  }
  return result;
}

function primaryDeviceName(row, segments) {
  const uniqueDevices = [];
  for (const segment of segments) {
    if (!uniqueDevices.some((device) => device.toUpperCase() === segment.device.toUpperCase())) {
      uniqueDevices.push(segment.device);
    }
  }
  return uniqueDevices.length === 1 ? uniqueDevices[0] : row.deviceType;
}

function summarizeEntryBounds(segments) {
  if (segments.length === 0) {
    return [0, null, null];
  }
  const first = segments[0];
  const allSame = segments.slice(1).every((segment) => (
    segment.lowerBound === first.lowerBound
    && segment.upperBound === first.upperBound
    && segment.pointCount === first.pointCount
  ));
  return allSame ? [first.lowerBound, first.upperBound, first.pointCount] : [first.lowerBound, null, null];
}

function entryNotation(fallback, segments) {
  if (segments.length === 0) {
    return fallback;
  }
  const first = segments[0];
  return segments.slice(1).every((segment) => segment.notation === first.notation) ? first.notation : fallback;
}

function parseSegmentBounds(segment, notation, defaultDevice) {
  const parts = segment.split("-", 2).map((part) => part.trim());
  if (parts.length !== 2) {
    return [0, null, null];
  }
  const lower = parseSegmentNumber(parts[0], notation, defaultDevice);
  const upper = parseSegmentNumber(parts[1], notation, defaultDevice);
  const pointCount = lower != null && upper != null && upper >= lower ? upper - lower + 1 : null;
  return [lower || 0, upper, pointCount];
}

function parseSegmentNumber(text, notation, defaultDevice) {
  let normalized = String(text || "").trim();
  if (normalized.startsWith(defaultDevice)) {
    normalized = normalized.slice(defaultDevice.length);
  }
  normalized = trimLeadingAsciiLetters(normalized);
  if (!normalized) {
    return null;
  }
  return Number.parseInt(normalized, notation === KvDeviceRangeNotation.HEXADECIMAL ? 16 : 10);
}

function trimLeadingAsciiLetters(value) {
  return String(value || "").replace(/^[A-Za-z]+/, "");
}

function deviceMetadata(deviceType) {
  if (deviceType === "Z") {
    return [KvDeviceRangeCategory.INDEX, false];
  }
  if (deviceType === "ZF") {
    return [KvDeviceRangeCategory.FILE_REFRESH, false];
  }
  if (["T", "C", "AT", "CTH", "CTC"].includes(deviceType)) {
    return [KvDeviceRangeCategory.TIMER_COUNTER, false];
  }
  if (isDirectBitDeviceType(deviceType)) {
    return [KvDeviceRangeCategory.BIT, true];
  }
  return DEFAULT_FORMAT_BY_DEVICE_TYPE[deviceType] === ""
    ? [KvDeviceRangeCategory.BIT, true]
    : [KvDeviceRangeCategory.WORD, false];
}

function isDirectBitDeviceType(deviceType) {
  return ["R", "B", "MR", "LR", "CR", "VB", "X", "Y", "M", "L"].includes(deviceType);
}

function notationForDevice(fallback, deviceType) {
  return ["B", "W", "VB", "X", "Y"].includes(deviceType) ? KvDeviceRangeNotation.HEXADECIMAL : fallback;
}

function resolveModelColumn(table, requestedModel) {
  const normalized = normalizeModelKey(requestedModel);
  const direct = directModelMatch(table, normalized);
  if (direct) {
    return direct;
  }

  const xymSuffix = "(XYM)";
  const wantsXym = normalized.endsWith(xymSuffix);
  const baseModel = wantsXym ? normalized.slice(0, -xymSuffix.length) : normalized;
  let resolvedFamily = null;
  if (baseModel.startsWith("KV-NANO") || baseModel.startsWith("KV-N")) {
    resolvedFamily = "KV-NANO";
  } else if (baseModel.startsWith("KV-3000") || baseModel.startsWith("KV-5000") || baseModel.startsWith("KV-5500")) {
    resolvedFamily = "KV-3000/5000";
  } else if (baseModel.startsWith("KV-7000") || baseModel.startsWith("KV-7300") || baseModel.startsWith("KV-7500")) {
    resolvedFamily = "KV-7000";
  } else if (baseModel.startsWith("KV-8000")) {
    resolvedFamily = "KV-8000";
  } else if (baseModel.startsWith("KV-X5") || baseModel.startsWith("KV-X3")) {
    resolvedFamily = "KV-X500";
  }

  if (!resolvedFamily) {
    throw new HostLinkProtocolError(`Unsupported model '${requestedModel}'. Supported range models: ${table.modelHeaders.join(", ")}.`);
  }

  const resolvedKey = wantsXym ? `${resolvedFamily}(XYM)` : resolvedFamily;
  const resolved = directModelMatch(table, resolvedKey);
  if (!resolved) {
    throw new HostLinkProtocolError(`Resolved model '${resolvedKey}' was not found in the embedded device range table.`);
  }
  return resolved;
}

function directModelMatch(table, normalized) {
  return table.modelHeaders.find((header) => normalizeModelKey(header) === normalized) || null;
}

function normalizeModelKey(text) {
  return String(text || "").trim().replace(/\0+$/g, "").replace(/\s+/g, "").toUpperCase();
}

function rangeTable() {
  if (parsedRangeTable) {
    return parsedRangeTable;
  }
  parsedRangeTable = parseRangeTable();
  return parsedRangeTable;
}

function parseRangeTable() {
  const lines = RANGE_CSV_DATA.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    throw new HostLinkProtocolError("Embedded device range table is empty.");
  }
  const headers = parseCsvLine(lines[0]).map((field) => field.trim());
  if (headers.length < 3) {
    throw new HostLinkProtocolError("Embedded device range table must contain at least DeviceType, Base, and one model column.");
  }

  const modelHeaders = headers.slice(2);
  const rows = lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    if (fields.length !== headers.length) {
      throw new HostLinkProtocolError(`Embedded device range row has ${fields.length} columns but ${headers.length} were expected: ${line}`);
    }
    return Object.freeze({
      deviceType: fields[0].trim(),
      notation: notationFromBase(fields[1]),
      ranges: Object.freeze(fields.slice(2).map((field) => field.trim())),
    });
  });
  return Object.freeze({
    modelHeaders: Object.freeze(modelHeaders),
    rows: Object.freeze(rows),
  });
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuote && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === "," && !inQuote) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (inQuote) {
    throw new HostLinkProtocolError(`Embedded device range table contains an unterminated quoted field: ${line}`);
  }
  fields.push(current);
  return fields;
}

function notationFromBase(baseText) {
  const normalized = String(baseText || "").trim();
  if (normalized.startsWith("10")) {
    return KvDeviceRangeNotation.DECIMAL;
  }
  if (normalized.startsWith("16")) {
    return KvDeviceRangeNotation.HEXADECIMAL;
  }
  throw new HostLinkProtocolError(`Unsupported base cell '${baseText}' in the embedded device range table.`);
}

module.exports = {
  KvDeviceRangeNotation,
  KvDeviceRangeCategory,
  availableDeviceRangeModels,
  deviceRangeCatalogForModel,
  deviceRangeCatalogForQueryModel,
  findDeviceRangeEntry,
};
