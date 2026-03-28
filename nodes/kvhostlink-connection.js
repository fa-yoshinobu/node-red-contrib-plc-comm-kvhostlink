"use strict";

const { HostLinkClient } = require("../lib/hostlink");

module.exports = function registerKvHostLinkConnection(RED) {
  function KvHostLinkConnectionNode(config) {
    RED.nodes.createNode(this, config);

    this.name = config.name;
    this.host = config.host;
    this.port = Number(config.port || 8501);
    this.transport = config.transport || "tcp";
    this.timeout = Number(config.timeout || 3000);
    this.appendLfOnSend = Boolean(config.appendLfOnSend);

    this.client = new HostLinkClient({
      host: this.host,
      port: this.port,
      transport: this.transport,
      timeout: this.timeout,
      appendLfOnSend: this.appendLfOnSend,
    });

    this._setState = (fill, shape, text) => this.status({ fill, shape, text });
    this.getClient = () => this.client;
    this.getProfile = () => ({
      host: this.host,
      port: this.port,
      transport: this.transport,
      timeout: this.timeout,
      appendLfOnSend: this.appendLfOnSend,
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
