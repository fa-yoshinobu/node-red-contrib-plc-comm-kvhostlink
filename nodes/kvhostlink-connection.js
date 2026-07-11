"use strict";

const {
  HostLinkClient,
  normalizePlcProfile,
  profileDescriptors,
} = require("../lib/hostlink");

const DEFAULT_TIMEOUT = 3000;

function parseRequiredInteger(value, name, min, max) {
  if (typeof value === "boolean" || value === null || value === undefined || (typeof value === "string" && !/^\d+$/.test(value.trim()))) {
    throw new Error(`kvhostlink-connection ${name} is required and must be an integer in the range ${min}..${max}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`kvhostlink-connection ${name} out of range (${min}..${max}): ${value}`);
  }
  return parsed;
}

function parseTimeout(value) {
  if (typeof value === "boolean" || value === null || value === undefined || (typeof value === "string" && !/^\d+$/.test(value.trim()))) {
    throw new Error("kvhostlink-connection timeout must be an integer in the range 1..2147483647");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 0x7fffffff) {
    throw new Error(`kvhostlink-connection timeout out of range (1..2147483647): ${value}`);
  }
  return parsed;
}

module.exports = function registerKvHostLinkConnection(RED) {
  if (RED.httpAdmin && typeof RED.httpAdmin.get === "function") {
    const needsPermission =
      RED.auth && typeof RED.auth.needsPermission === "function"
        ? RED.auth.needsPermission("flows.read")
        : (_request, _response, next) => next();
    RED.httpAdmin.get(
      "/plc-comm/kvhostlink/profiles",
      needsPermission,
      (_request, response) => {
        response.json(profileDescriptors());
      },
    );
  }

  function KvHostLinkConnectionNode(config) {
    RED.nodes.createNode(this, config);

    this.name = typeof config.name === "string" ? config.name.trim() : "";
    if (typeof config.host !== "string" || !config.host.trim()) {
      throw new Error("kvhostlink-connection host is required and must be a non-empty string");
    }
    this.host = config.host.trim();
    this.port = parseRequiredInteger(config.port, "port", 1, 65535);
    if (typeof config.transport !== "string" || !["tcp", "udp"].includes(config.transport)) {
      throw new Error("kvhostlink-connection transport is required and must be 'tcp' or 'udp'");
    }
    this.transport = config.transport;
    this.timeout = Object.prototype.hasOwnProperty.call(config, "timeout") ? parseTimeout(config.timeout) : DEFAULT_TIMEOUT;
    this.plcProfile = normalizePlcProfile(config.plcProfile);

    this.client = new HostLinkClient({
      host: this.host,
      port: this.port,
      transport: this.transport,
      timeout: this.timeout,
      plcProfile: this.plcProfile,
    });

    this._setState = (fill, shape, text) => this.status({ fill, shape, text });
    this.getClient = () => this.client;
    this.getProfile = () => ({
      host: this.host,
      port: this.port,
      transport: this.transport,
      timeout: this.timeout,
      plcProfile: this.plcProfile,
    });
    this.connect = async () => {
      this._setState("yellow", "ring", "connecting");
      await this.client.connect();
      this._setState("green", "dot", "connected");
    };
    this.disconnect = async () => {
      this._setState("yellow", "ring", "disconnecting");
      await this.client.close();
      this._setState("red", "ring", "disconnected");
    };
    this.reinitialize = async () => {
      this._setState("yellow", "ring", "reinitializing");
      await this.client.close();
      await this.client.connect();
      this._setState("green", "dot", "connected");
    };

    this._setState("grey", "ring", "ready");

    this.on("close", (_removed, done) => {
      this.client
        .close()
        .catch(() => undefined)
        .finally(() => {
          this._setState("grey", "ring", "closed");
          done();
        });
    });
  }

  RED.nodes.registerType("kvhostlink-connection", KvHostLinkConnectionNode);
};
