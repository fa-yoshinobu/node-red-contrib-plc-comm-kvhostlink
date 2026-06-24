"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HostLinkClient,
  buildFrame,
  decodeCommentResponse,
  decodeResponse,
  deviceToString,
  splitDataTokens,
  parseDevice,
  PLC_PROFILES,
  normalizePlcProfile,
} = require("../lib/hostlink");

function createFrameRecorder(responseForCommand = () => "OK\r") {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const frames = [];

  client._exchange = async (payload) => {
    const frame = payload.toString("ascii");
    frames.push(frame);
    return Buffer.from(responseForCommand(frame.replace(/\r$/, "")), "ascii");
  };

  return { client, frames };
}

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

test("PLC profile input accepts canonical names only", () => {
  assert.deepEqual(PLC_PROFILES, [
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
  assert.equal(normalizePlcProfile(" keyence:kv-x500 "), "keyence:kv-x500");
  assert.throws(() => normalizePlcProfile("KEYENCE:KV-X500"), /Unsupported PLC profile/);
  assert.throws(() => normalizePlcProfile("KV-X500"), /Unsupported PLC profile/);
});

test("HostLinkClient defaults missing port to 8501 but rejects invalid ports", () => {
  assert.equal(new HostLinkClient({ host: "127.0.0.1" }).port, 8501);
  assert.equal(new HostLinkClient({ host: "127.0.0.1", port: "8502" }).port, 8502);

  for (const port of ["", " ", 0, -1, "abc", 65536, 1.5]) {
    assert.throws(
      () => new HostLinkClient({ host: "127.0.0.1", port }),
      /port (is required|out of range)/
    );
  }
});

test("buildFrame and decodeResponse handle Host Link CR framing", () => {
  const frame = buildFrame("RD DM100");
  assert.equal(frame.toString("ascii"), "RD DM100\r");
  assert.equal(decodeResponse(Buffer.from("123\r\n", "ascii")), "123");
});

test("decodeResponse rejects non-ASCII normal responses but comments can be Shift_JIS", () => {
  const sjisA = Buffer.from([0x82, 0xa0, 0x0d]);

  assert.throws(() => decodeResponse(sjisA), /Non-ASCII response byte 0x82 at offset 0/);
  assert.equal(decodeCommentResponse(sjisA), "あ");
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

test("low-level command helpers preserve exact CR-terminated frames", async () => {
  const { client, frames } = createFrameRecorder((command) => {
    if (command === "?E") return "0\r";
    if (command === "?M") return "1\r";
    return "OK\r";
  });

  await client.sendRaw("ER");
  await client.changeMode("RUN");
  await client.changeMode("PROGRAM");
  await client.clearError();
  assert.equal(await client.checkErrorNo(), "0");
  assert.equal(await client.confirmOperatingMode(), 1);
  await assert.rejects(() => client.changeMode("STOP"), /mode must be 0\/1 or PROGRAM\/RUN/);

  assert.deepEqual(frames, ["ER\r", "M1\r", "M0\r", "ER\r", "?E\r", "?M\r"]);
});

test("confirmOperatingMode rejects unknown mode values", async () => {
  const { client, frames } = createFrameRecorder((command) => {
    if (command === "?M") return "2\r";
    return "OK\r";
  });

  await assert.rejects(() => client.confirmOperatingMode(), /Unsupported PLC mode response/);

  assert.deepEqual(frames, ["?M\r"]);
});

test("forced bit command helpers preserve exact CR-terminated frames", async () => {
  const { client, frames } = createFrameRecorder();

  await client.forcedSet("R10");
  await client.forcedReset("MR15");
  await client.forcedSetConsecutive("R11", 3);
  await client.forcedResetConsecutive("MR00", 2);
  await client.forcedSet("X100");
  await client.forcedReset("M100");
  await client.forcedSetConsecutive("L100", 4);
  await assert.rejects(() => client.forcedSetConsecutive("T100", 4), /does not support device type 'T'/);

  assert.deepEqual(frames, [
    "ST R010\r",
    "RS MR015\r",
    "STS R011 3\r",
    "RSS MR000 2\r",
    "ST X100\r",
    "RS M100\r",
    "STS L100 4\r",
  ]);
});

test("read and write command helpers preserve exact CR-terminated frames", async () => {
  const { client, frames } = createFrameRecorder((command) => {
    if (command.startsWith("RD ")) return "123\r";
    if (command.startsWith("RDS ")) return "1 2 3\r";
    return "OK\r";
  });

  assert.equal(await client.read("DM100"), 123);
  assert.equal(await client.read("DM200", { dataFormat: ".S" }), 123);
  assert.deepEqual(await client.readConsecutive("DM300", 3), [1, 2, 3]);
  await client.write("DM400", 255, { dataFormat: ".H" });
  await client.writeConsecutive("DM500", [1, 2, 3]);

  assert.deepEqual(frames, [
    "RD DM100.U\r",
    "RD DM200.S\r",
    "RDS DM300.U 3\r",
    "WR DM400.H FF\r",
    "WRS DM500.U 3 1 2 3\r",
  ]);
});

test("set-value and monitor read helpers preserve exact CR-terminated frames", async () => {
  const { client, frames } = createFrameRecorder((command) => {
    if (command === "MBR") return "1 0 1\r";
    if (command === "MWR") return "10 ABC 30\r";
    return "OK\r";
  });

  await client.writeSetValue("T10", 123);
  await client.writeSetValueConsecutive("C20", [111, 222]);
  assert.deepEqual(await client.readMonitorBits(), [1, 0, 1]);
  assert.deepEqual(await client.readMonitorWords(), ["10", "ABC", "30"]);
  await assert.rejects(() => client.writeSetValueConsecutive("T0", Array(121).fill(0)), /count out of range/);

  assert.deepEqual(frames, ["WS T10.D 123\r", "WSS C20.D 2 111 222\r", "MBR\r", "MWR\r"]);
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
  await client.registerMonitorWords("X100", "Y100", "D100", "E100", "F100", "MR100", "LR100");
  await assert.rejects(() => client.registerMonitorWords("M100"), /does not support device type 'M'/);
  await assert.rejects(() => client.registerMonitorWords("L100"), /does not support device type 'L'/);

  assert.deepEqual(commands, ["MBS X100 X101 M100 M101", "MWS X100 Y100 D100.U E100.U F100.U MR100 LR100"]);
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
  await assert.rejects(() => client.readConsecutive("R199900", 2, { dataFormat: ".U" }), /Device span out of range/);
  await assert.rejects(() => client.read("R199900", { dataFormat: ".D" }), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("CR7900", 2, { dataFormat: ".U" }), /Device span out of range/);

  assert.deepEqual(commands, []);

  assert.equal((await client.readConsecutive("CR7900", 16)).length, 16);
  assert.equal((await client.read("R199900", { dataFormat: ".U" })).length, 16);
  assert.equal((await client.read("R199800", { dataFormat: ".D" })).length, 16);
  await assert.rejects(() => client.readConsecutive("CR7900", 17), /Device span out of range/);
  assert.deepEqual(commands, ["RDS CR7900 16", "RD R199900.U", "RD R199800.D"]);
});

test("AT defaults to 32-bit values but spans by AT device point", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("0000000000 0000000000 0000000000 0000000000 0000000000 0000000000 0000000000 0000000000\r", "ascii");
  };

  await client.read("AT7");
  await client.readConsecutive("AT0", 8);
  await assert.rejects(() => client.readConsecutive("AT1", 8), /Device span out of range/);

  assert.deepEqual(commands, ["RD AT7.D", "RDS AT0.D 8"]);
});

test("native 32-bit device families span by device point", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    commands.push(command);
    if (command === "RD T3999.D") {
      return Buffer.from("0,0000000000,0000000100\r", "ascii");
    }
    if (command === "RD Z12.D") {
      return Buffer.from("0000070000\r", "ascii");
    }
    if (command === "RDS T3880.D 120") {
      return Buffer.from(Array.from({ length: 120 }, (_, index) => String(index)).join(" ") + "\r", "ascii");
    }
    if (command === "RDS Z1.D 12") {
      return Buffer.from(Array.from({ length: 12 }, (_, index) => String(index)).join(" ") + "\r", "ascii");
    }
    return Buffer.from("OK\r", "ascii");
  };

  await client.read("T3999");
  await client.read("Z12", { dataFormat: ".D" });
  await client.readConsecutive("T3880", 120);
  await client.readConsecutive("Z1", 12, { dataFormat: ".D" });
  await assert.rejects(() => client.readConsecutive("T3881", 120), /Device span out of range/);
  await assert.rejects(() => client.readConsecutive("Z2", 12, { dataFormat: ".D" }), /Device span out of range/);

  assert.deepEqual(commands, ["RD T3999.D", "RD Z12.D", "RDS T3880.D 120", "RDS Z1.D 12"]);
});

test("AT writes are rejected before sending WR or WRS", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };

  await assert.rejects(() => client.write("AT0", 3533), /does not support device type 'AT'/);
  await assert.rejects(() => client.writeConsecutive("AT0", [3533, 5543]), /does not support device type 'AT'/);

  assert.deepEqual(commands, []);
});

test("expansion unit buffer uses address-suffix command form", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    const command = payload.toString("ascii").trim();
    commands.push(command);
    if (command.startsWith("URD ")) {
      return Buffer.from("123 456\r", "ascii");
    }
    return Buffer.from("OK\r", "ascii");
  };

  assert.deepEqual(await client.readExpansionUnitBuffer(1, 100, 2), [123, 456]);
  await client.writeExpansionUnitBuffer(2, 200, [7, 8], { dataFormat: ".S" });
  await assert.rejects(
    () => client.readExpansionUnitBuffer(1, 59999, 1, { dataFormat: ".D" }),
    /Expansion buffer span out of range/
  );

  assert.deepEqual(commands, ["URD 01 100.U 2", "UWR 02 200.S 2 7 8"]);
});

test("switchBank sends BE and validates the bank number", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };

  await client.switchBank(1);
  await assert.rejects(() => client.switchBank(16), /bankNo out of range/);

  assert.deepEqual(commands, ["BE 1"]);
});

test("setTime sends WRT with Sunday-based weekday", async () => {
  const client = new HostLinkClient({ host: "127.0.0.1" });
  const commands = [];

  client._exchange = async (payload) => {
    commands.push(payload.toString("ascii").trim());
    return Buffer.from("OK\r", "ascii");
  };

  await client.setTime(new Date(2026, 2, 15, 1, 2, 3));
  await client.setTime(new Date(2026, 2, 16, 1, 2, 3));
  await client.setTime(new Date(2026, 2, 21, 1, 2, 3));
  await assert.rejects(() => client.setTime([26, 3, 15, 1, 2, 3, 7]), /week out of range/);

  assert.deepEqual(commands, [
    "WRT 26 03 15 01 02 03 0",
    "WRT 26 03 16 01 02 03 1",
    "WRT 26 03 21 01 02 03 6",
  ]);
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
