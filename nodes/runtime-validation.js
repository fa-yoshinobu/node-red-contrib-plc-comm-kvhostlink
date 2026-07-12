"use strict";

const SOURCE_TYPES = Object.freeze(["str", "msg", "flow", "global", "env"]);

function hasOwn(value, key) {
  return value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
}

function requireEnum(config, key, allowed) {
  const value = config[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${key} is required and must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function requireSourceType(config, key) {
  return requireEnum(config, key, SOURCE_TYPES);
}

function validateOutputs(config, errorHandling) {
  const expected = errorHandling === "output2" ? 2 : 1;
  if (hasOwn(config, "outputs") && config.outputs !== expected) {
    throw new Error(`outputs=${config.outputs} conflicts with errorHandling=${errorHandling}; review the node wiring and save it again`);
  }
  return expected;
}

function normalizeDisplayName(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = { hasOwn, normalizeDisplayName, requireEnum, requireSourceType, validateOutputs };
