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

const PLC_PROFILE_DISPLAY_NAMES = Object.freeze({
  "keyence:kv-nano": "KEYENCE KV-NANO",
  "keyence:kv-nano-xym": "KEYENCE KV-NANO (XYM)",
  "keyence:kv-3000": "KEYENCE KV-3000",
  "keyence:kv-3000-xym": "KEYENCE KV-3000 (XYM)",
  "keyence:kv-5000": "KEYENCE KV-5000",
  "keyence:kv-5000-xym": "KEYENCE KV-5000 (XYM)",
  "keyence:kv-7000": "KEYENCE KV-7000",
  "keyence:kv-7000-xym": "KEYENCE KV-7000 (XYM)",
  "keyence:kv-8000": "KEYENCE KV-8000",
  "keyence:kv-8000-xym": "KEYENCE KV-8000 (XYM)",
  "keyence:kv-x500": "KEYENCE KV-X500",
  "keyence:kv-x500-xym": "KEYENCE KV-X500 (XYM)",
});

function normalizePlcProfile(value) {
  const text = String(value || "").trim();
  if (!PLC_PROFILES.includes(text)) {
    throw new Error(`Unsupported PLC profile '${value}'. Supported PLC profiles: ${PLC_PROFILES.join(", ")}`);
  }
  return text;
}

function displayName(profileId) {
  return PLC_PROFILE_DISPLAY_NAMES[normalizePlcProfile(profileId)];
}

function profileFromName(profileId) {
  const name = normalizePlcProfile(profileId);
  return Object.freeze({
    name,
    displayName: PLC_PROFILE_DISPLAY_NAMES[name],
  });
}

function availablePlcProfiles() {
  return PLC_PROFILES.slice();
}

module.exports = {
  PLC_PROFILES,
  availablePlcProfiles,
  displayName,
  normalizePlcProfile,
  profileFromName,
};
