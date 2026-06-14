"use strict";

const PLC_PROFILES = Object.freeze([
  "keyence:kv-nano",
  "keyence:kv-nano-xym",
  "keyence:kv-3000",
  "keyence:kv-3000-xym",
  "keyence:kv-5000",
  "keyence:kv-5000-xym",
  "keyence:kv-7000",
  "keyence:kv-7000-xym",
  "keyence:kv-8000",
  "keyence:kv-8000-xym",
  "keyence:kv-x500",
  "keyence:kv-x500-xym",
]);

function normalizePlcProfile(value) {
  const text = String(value || "").trim();
  if (!PLC_PROFILES.includes(text)) {
    throw new Error(`Unsupported PLC profile '${value}'. Supported PLC profiles: ${PLC_PROFILES.join(", ")}`);
  }
  return text;
}

module.exports = {
  PLC_PROFILES,
  normalizePlcProfile,
};
