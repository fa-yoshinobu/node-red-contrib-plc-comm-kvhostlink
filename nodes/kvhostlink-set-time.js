"use strict";

const { types } = require("node:util");
const { normalizeDisplayName } = require("./runtime-validation");

module.exports = function (RED) {
  function SetTimeNode(config) {
    RED.nodes.createNode(this, config);
    this.name = normalizeDisplayName(config.name);
    this.connection = RED.nodes.getNode(config.connection);
    this.on("input", async (msg, send, done) => {
      send = send || ((message) => this.send(message));
      try {
        if (!this.connection) throw new Error("KV Host Link connection config is missing");
        if (!types.isDate(msg.payload) && !Array.isArray(msg.payload)) {
          throw new Error("msg.payload must be a Date or [YY, month, day, hour, minute, second, weekday] array");
        }
        this.status({ fill: "blue", shape: "dot", text: "setting time" });
        const value = types.isDate(msg.payload) ? new Date(msg.payload.getTime()) : msg.payload;
        await this.connection.connect();
        await this.connection.getClient().setTime(value);
        this.status({ fill: "green", shape: "dot", text: "clock request acknowledged" });
        send(msg);
        if (done) done();
      } catch (error) {
        this.status({ fill: "red", shape: "ring", text: error.message });
        if (done) done(error);
        else this.error(error, msg);
      }
    });
  }
  RED.nodes.registerType("kvhostlink-set-time", SetTimeNode);
};
