"use strict";

const errors = require("./errors");
const device = require("./device");
const protocol = require("./protocol");
const client = require("./client");
const highLevel = require("./high-level");
const plcProfile = require("./plc-profile");
const publicHighLevel = { ...highLevel };
delete publicHighLevel._prepareWriteNamed;

module.exports = {
  ...errors,
  MODEL_CODES: client.MODEL_CODES,
  HostLinkClient: client.HostLinkClient,
  openAndConnect: client.openAndConnect,
  normalizeSuffix: device.normalizeSuffix,
  parseDevice: device.parseDevice,
  deviceToString: device.deviceToString,
  parseDeviceText: device.parseDeviceText,
  ...protocol,
  ...publicHighLevel,
  ...plcProfile,
};
