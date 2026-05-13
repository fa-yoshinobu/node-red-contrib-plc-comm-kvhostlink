"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HostLinkClient,
  buildFrame,
  decodeResponse,
  deviceToString,
  splitDataTokens,
  parseDevice,
} = require("../lib/hostlink");

test("parseDevice handles decimal and hex devices", () => {
  assert.deepEqual(parseDevice("DM100"), { deviceType: "DM", number: 100, suffix: "" });
  assert.deepEqual(parseDevice("B1F"), { deviceType: "B", number: 31, suffix: "" });
  assert.equal(deviceToString({ deviceType: "B", number: 31, suffix: "" }), "B1F");
  assert.deepEqual(parseDevice("X390"), { deviceType: "X", number: 39 * 16, suffix: "" });
  assert.deepEqual(parseDevice("X400"), { deviceType: "X", number: 40 * 16, suffix: "" });
  assert.equal(deviceToString({ deviceType: "X", number: 39 * 16 + 15, suffix: "" }), "X39F");
  assert.equal(deviceToString({ deviceType: "X", number: 40 * 16, suffix: "" }), "X400");
  assert.equal(parseDevice("Y1999F").number, 1999 * 16 + 15);
  assert.equal(parseDevice("M63999").number, 63999);
  assert.equal(parseDevice("M64000").number, 64000);
  assert.equal(parseDevice("Z0").number, 0);
  assert.equal(deviceToString(parseDevice("R1")), "R001");
  assert.equal(deviceToString(parseDevice("CR0")), "CR000");
  assert.throws(() => parseDevice("DM12A"));
  assert.throws(() => parseDevice("R016"));
  assert.throws(() => parseDevice("X3F0"));
  assert.throws(() => parseDevice("Y19A0"));
});

test("buildFrame and decodeResponse handle Host Link CR framing", () => {
  const frame = buildFrame("RD DM100");
  assert.equal(frame.toString("ascii"), "RD DM100\r");
  assert.equal(decodeResponse(Buffer.from("123\r\n", "ascii")), "123");
});

test("splitDataTokens supports timer and counter comma-separated responses", () => {
  assert.deepEqual(splitDataTokens("0,0000012345,0000012345"), ["0", "0000012345", "0000012345"]);
});

test("client serializes queued requests", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  let active = 0;
  let maxActive = 0;

  client._exchange = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return Buffer.from("OK\r", "ascii");
  };

  await Promise.all([client.sendRaw("ER"), client.sendRaw("ER"), client.sendRaw("ER")]);
  assert.equal(maxActive, 1);
});

test("readComments accepts XYM alias device types", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("MAIN COMMENT                    \r", "ascii");
  };

  assert.equal(await client.readComments("D10"), "MAIN COMMENT");
  assert.equal(await client.readComments("M20"), "MAIN COMMENT");
  assert.deepEqual(commands, ["RDC D10", "RDC M20"]);
});

test("monitor registration accepts XYM bit aliases verified on KV-7500", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };

  await client.registerMonitorBits("X100", "X101", "M100", "M101");
  await client.registerMonitorWords("X100", "Y100");

  assert.deepEqual(commands, ["MBS X100 X101 M100 M101", "MWS X100 Y100"]);
});

test("client rejects device spans crossing range before send", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\r", "ascii");
  };

  await assert.rejects(() => client.read("DM65534", { dataFormat: ".D" }), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("DM65535", 2), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("Y1999F", 2), /Device span out of range/);

  assert.deepEqual(commands, []);

  assert.equal((await client.readConsecutive("CR7900", 16)).length, 16);
  await assert.rejects(() => client.readConsecutive("CR7900", 17), /Device span out of range/);
  assert.deepEqual(commands, ["RDS CR7900 16"]);
});

test("queryModel returns the raw model code and known model label", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("63\r", "ascii");
  };

  const model = await client.queryModel();
  assert.deepEqual(model, { code: "63", model: "KV-X550" });
  assert.deepEqual(commands, ["?K"]);
});
