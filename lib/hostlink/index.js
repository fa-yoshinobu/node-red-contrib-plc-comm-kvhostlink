"use strict";

const errors = require("./errors");
const device = require("./device");
const protocol = require("./protocol");
const client = require("./client");
const highLevel = require("./high-level");

module.exports = {
  ...errors,
  MODEL_CODES: client.MODEL_CODES,
  HostLinkClient: client.HostLinkClient,
  openAndConnect: client.openAndConnect,
  normalizeSuffix: device.normalizeSuffix,
  parseDevice: device.parseDevice,
  deviceToString: device.deviceToString,
  parseDeviceText: device.parseDeviceText,
  resolveEffectiveFormat: device.resolveEffectiveFormat,
  ...protocol,
  ...highLevel,
};
