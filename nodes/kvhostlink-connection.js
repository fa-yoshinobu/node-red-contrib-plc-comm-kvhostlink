"use strict";

const { HostLinkClient, normalizePlcProfile } = require("../lib/hostlink");

const DEFAULT_PORT = 8501;
const DEFAULT_TIMEOUT = 3000;

function parseRequiredInteger(value, name, min, max, fallback) {
  const source = value === undefined || value === null ? fallback : value;
  if (String(source).trim() === "") {
    throw new Error(`kvhostlink-connection ${name} is required`);
  }
  const parsed = Number(source);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`kvhostlink-connection ${name} out of range (${min}..${max}): ${source}`);
  }
  return parsed;
}

function parsePositiveNumber(value, name, fallback) {
  const source = value === undefined || value === null ? fallback : value;
  if (String(source).trim() === "") {
    throw new Error(`kvhostlink-connection ${name} is required`);
  }
  const parsed = Number(source);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`kvhostlink-connection ${name} must be > 0: ${source}`);
  }
  return parsed;
}

module.exports = function registerKvHostLinkConnection(RED) {
  function KvHostLinkConnectionNode(config) {
    RED.nodes.createNode(this, config);

    this.name = config.name;
    this.host = config.host;
    this.port = parseRequiredInteger(config.port, "port", 1, 65535, DEFAULT_PORT);
    this.transport = config.transport || "tcp";
    this.timeout = parsePositiveNumber(config.timeout, "timeout", DEFAULT_TIMEOUT);
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
