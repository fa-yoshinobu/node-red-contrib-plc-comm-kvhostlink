"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HostLinkClient,
  KvDeviceRangeCategory,
  KvDeviceRangeNotation,
  availableDeviceRangeModels,
  buildFrame,
  decodeResponse,
  deviceRangeCatalogForModel,
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
  assert.equal(parseDevice("M63999").number, 63999);
  assert.equal(deviceToString(parseDevice("R1")), "R001");
  assert.equal(deviceToString(parseDevice("CR0")), "CR000");
  assert.throws(() => parseDevice("M64000"));
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

test("device range catalog resolves model families and XYM aliases", () => {
  assert.ok(availableDeviceRangeModels().includes("KV-7000(XYM)"));

  const catalog = deviceRangeCatalogForModel("KV-8000A");
  assert.equal(catalog.model, "KV-8000");
  assert.equal(catalog.modelCode, "");
  assert.equal(catalog.hasModelCode, false);
  assert.equal(catalog.entry("DM").addressRange, "DM00000-DM65534");
  assert.equal(catalog.entry("TM").category, KvDeviceRangeCategory.WORD);

  const xym = deviceRangeCatalogForModel("KV-3000/5000(XYM)");
  const entry = xym.entry("R");
  assert.equal(entry.category, KvDeviceRangeCategory.BIT);
  assert.equal(entry.notation, KvDeviceRangeNotation.HEXADECIMAL);
  assert.equal(entry.upperBound, 0x999f);
  assert.equal(entry.pointCount, 0x99a0);
  assert.equal(entry.addressRange, "X0-999F,Y0-999F");
  assert.deepEqual(entry.segments.map((segment) => segment.device), ["X", "Y"]);
  assert.equal(xym.entry("X").deviceType, "R");
  assert.equal(xym.entry("D").deviceType, "DM");
  assert.equal(xym.entry("CR").addressRange, "CR0000-CR3915");
});

test("readDeviceRangeCatalog uses queryModel response", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("63\r", "ascii");
  };

  const catalog = await client.readDeviceRangeCatalog();
  assert.equal(catalog.model, "KV-X500");
  assert.equal(catalog.modelCode, "63");
  assert.deepEqual(commands, ["?K"]);
});
