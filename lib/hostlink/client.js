"use strict";

const dgram = require("node:dgram");
const net = require("node:net");

const {
  FORCE_SINGLE_DEVICE_TYPES,
  FORCE_CONSECUTIVE_DEVICE_TYPES,
  MBS_DEVICE_TYPES,
  MWS_DEVICE_TYPES,
  RDC_DEVICE_TYPES,
  WR_DEVICE_TYPES,
  WS_DEVICE_TYPES,
  deviceToString,
  normalizeSuffix,
  parseDevice,
  requireExplicitFormat,
  resolveEffectiveFormat,
  validateDeviceCount,
  validateDeviceSpan,
  validateExpansionBufferCount,
  validateExpansionBufferSpan,
  validateDeviceType,
  validateRange,
} = require("./device");
const { HostLinkConnectionError, HostLinkProtocolError, ValueError } = require("./errors");
const { normalizePlcProfile } = require("./plc-profile");
const { buildFrame, decodeCommentResponse, decodeResponse, ensureSuccess, parseDataTokens, splitDataTokens } = require("./protocol");

const MODEL_CODES = Object.freeze({
  "134": "KV-N24nn",
  "133": "KV-N40nn",
  "132": "KV-N60nn",
  "128": "KV-NC32T",
  "63": "KV-X550",
  "61": "KV-X530",
  "60": "KV-X520",
  "62": "KV-X500",
  "59": "KV-X310",
  "58": "KV-8000A",
  "57": "KV-8000",
  "55": "KV-7500",
  "54": "KV-7300",
  "53": "KV-5500",
  "52": "KV-5000",
  "51": "KV-3000",
  "50": "KV-1000",
  "49": "KV-700 (With expansion memory)",
  "48": "KV-700 (No expansion memory)",
});

const DEFAULT_PORT = 8501;
const DEFAULT_TIMEOUT = 3000;

function parsePort(value) {
  const source = value === undefined || value === null ? DEFAULT_PORT : value;
  if (String(source).trim() === "") {
    throw new ValueError("port is required");
  }
  const parsed = Number(source);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new ValueError(`port out of range (1..65535): ${source}`);
  }
  return parsed;
}

function parseTimeout(value) {
  const source = value === undefined || value === null ? DEFAULT_TIMEOUT : value;
  const parsed = Number(source);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ValueError(`timeout must be > 0: ${source}`);
  }
  return parsed;
}

function normalizeRequiredPlcProfile(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error("plcProfile is required. Specify a canonical PLC profile such as keyence:kv-x500.");
  }
  return normalizePlcProfile(text);
}

class HostLinkClient {
  constructor(options = {}) {
    this.host = options.host;
    this.port = parsePort(options.port);
    this.transport = String(options.transport || "tcp").toLowerCase();
    this.timeout = parseTimeout(options.timeout);
    this.bufferSize = Number(options.bufferSize || 8192);
    this.plcProfile = normalizeRequiredPlcProfile(options.plcProfile);
    this.traceHook = typeof options.traceHook === "function" ? options.traceHook : null;

    if (!this.host) {
      throw new ValueError("host is required");
    }
    if (!["tcp", "udp"].includes(this.transport)) {
      throw new ValueError("transport must be 'tcp' or 'udp'");
    }

    this._socket = null;
    this._receiveBuffer = Buffer.alloc(0);
    this._lineWaiters = [];
    this._lineQueue = [];
    this._queue = Promise.resolve();
  }

  async connect() {
    if (this._socket) {
      return;
    }
    if (this.transport === "tcp") {
      await this._connectTcp();
      return;
    }
    await this._connectUdp();
  }

  async close() {
    const socket = this._socket;
    this._socket = null;
    this._receiveBuffer = Buffer.alloc(0);
    this._lineQueue = [];
    while (this._lineWaiters.length > 0) {
      this._lineWaiters.shift().reject(new HostLinkConnectionError("Connection closed"));
    }
    if (!socket) {
      return;
    }
    await new Promise((resolve) => {
      if (this.transport === "tcp") {
        socket.once("close", resolve);
        socket.destroy();
      } else {
        socket.close(() => resolve());
      }
    });
  }

  async sendRaw(body) {
    return this.sendRawDecoded(body, decodeResponse);
  }

  async sendRawDecoded(body, decoder) {
    return this._enqueue(async () => {
      const response = await this._exchange(this._buildCommand(body));
      return this._processResponse(response, decoder);
    });
  }

  async changeMode(mode) {
    const modeText = typeof mode === "string" ? String(mode).trim().toUpperCase() : "";
    const modeNo = typeof mode === "string"
      ? (modeText === "RUN" ? 1 : modeText === "PROGRAM" ? 0 : NaN)
      : Number(mode);
    if (![0, 1].includes(modeNo)) {
      throw new HostLinkProtocolError("mode must be 0/1 or PROGRAM/RUN");
    }
    await this._expectOk(`M${modeNo}`);
  }

  async clearError() {
    await this._expectOk("ER");
  }

  async checkErrorNo() {
    return this.sendRaw("?E");
  }

  async queryModel() {
    const code = await this.sendRaw("?K");
    return { code, model: MODEL_CODES[code] || null };
  }

  async confirmOperatingMode() {
    const response = await this.sendRaw("?M");
    const modeNo = Number.parseInt(response, 10);
    if (![0, 1].includes(modeNo)) {
      throw new HostLinkProtocolError(`Unsupported PLC mode response: ${response}`);
    }
    return modeNo;
  }

  async setTime(value = new Date()) {
    await this._expectOk(this._buildSetTimeCommand(value));
  }

  async forcedSet(device) {
    const addr = parseDevice(device);
    validateDeviceType("ST", addr.deviceType, FORCE_SINGLE_DEVICE_TYPES);
    await this._expectOk(`ST ${this._deviceToken(device, { dropSuffix: true })}`);
  }

  async forcedReset(device) {
    const addr = parseDevice(device);
    validateDeviceType("RS", addr.deviceType, FORCE_SINGLE_DEVICE_TYPES);
    await this._expectOk(`RS ${this._deviceToken(device, { dropSuffix: true })}`);
  }

  async forcedSetConsecutive(device, count) {
    validateRange("count", count, 1, 16);
    const addr = parseDevice(device);
    validateDeviceType("STS", addr.deviceType, FORCE_CONSECUTIVE_DEVICE_TYPES);
    await this._expectOk(`STS ${this._deviceToken(device, { dropSuffix: true })} ${count}`);
  }

  async forcedResetConsecutive(device, count) {
    validateRange("count", count, 1, 16);
    const addr = parseDevice(device);
    validateDeviceType("RSS", addr.deviceType, FORCE_CONSECUTIVE_DEVICE_TYPES);
    await this._expectOk(`RSS ${this._deviceToken(device, { dropSuffix: true })} ${count}`);
  }

  async read(device, options = {}) {
    const [token, suffix] = this._deviceWithFormat(device, options.dataFormat, 1);
    const response = await this.sendRaw(`RD ${token}`);
    const values = parseDataTokens(splitDataTokens(response), { dataFormat: suffix });
    return values.length === 1 ? values[0] : values;
  }

  async readConsecutive(device, count, options = {}) {
    const [token, suffix] = this._deviceWithFormat(device, options.dataFormat, count);
    const addr = parseDevice(token);
    const effectiveFormat = resolveEffectiveFormat(addr.deviceType, suffix);
    validateDeviceCount(addr.deviceType, effectiveFormat, count);
    const response = await this.sendRaw(`RDS ${token} ${count}`);
    return parseDataTokens(splitDataTokens(response), { dataFormat: suffix });
  }

  async write(device, value, options = {}) {
    const [token, suffix] = this._deviceWithFormat(device, options.dataFormat, 1);
    const addr = parseDevice(token);
    validateDeviceType("WR", addr.deviceType, WR_DEVICE_TYPES);
    await this._expectOk(`WR ${token} ${this._formatValue(value, suffix)}`);
  }

  async writeConsecutive(device, values, options = {}) {
    const normalized = Array.from(values || []);
    if (normalized.length === 0) {
      throw new HostLinkProtocolError("values must not be empty");
    }
    const [token, suffix] = this._deviceWithFormat(device, options.dataFormat, normalized.length);
    const addr = parseDevice(token);
    validateDeviceType("WRS", addr.deviceType, WR_DEVICE_TYPES);
    const effectiveFormat = resolveEffectiveFormat(addr.deviceType, suffix);
    validateDeviceCount(addr.deviceType, effectiveFormat, normalized.length);
    const payload = normalized.map((value) => this._formatValue(value, suffix)).join(" ");
    await this._expectOk(`WRS ${token} ${normalized.length} ${payload}`);
  }

  async writeSetValue(device, value, options = {}) {
    const token = this._ensureTimerOrCounter(device, options.dataFormat, 1);
    const suffix = parseDevice(token).suffix;
    await this._expectOk(`WS ${token} ${this._formatValue(value, suffix)}`);
  }

  async writeSetValueConsecutive(device, values, options = {}) {
    const normalized = Array.from(values || []);
    if (normalized.length === 0) {
      throw new HostLinkProtocolError("values must not be empty");
    }
    const token = this._ensureTimerOrCounter(device, options.dataFormat, normalized.length);
    const suffix = parseDevice(token).suffix;
    const payload = normalized.map((value) => this._formatValue(value, suffix)).join(" ");
    await this._expectOk(`WSS ${token} ${normalized.length} ${payload}`);
  }

  async switchBank(bankNo) {
    validateRange("bankNo", Number(bankNo), 0, 15);
    await this._expectOk(`BE ${Number(bankNo)}`);
  }

  async readExpansionUnitBuffer(unitNo, address, count, options = {}) {
    validateRange("unitNo", Number(unitNo), 0, 48);
    validateRange("address", Number(address), 0, 59999);
    const suffix = normalizeSuffix(options.dataFormat || ".U");
    validateExpansionBufferCount(suffix, count);
    validateExpansionBufferSpan(Number(address), suffix, count);
    const response = await this.sendRaw(`URD ${Number(unitNo).toString().padStart(2, "0")} ${Number(address)}${suffix} ${count}`);
    return parseDataTokens(splitDataTokens(response), { dataFormat: suffix });
  }

  async writeExpansionUnitBuffer(unitNo, address, values, options = {}) {
    const normalized = Array.from(values || []);
    if (normalized.length === 0) {
      throw new HostLinkProtocolError("values must not be empty");
    }
    validateRange("unitNo", Number(unitNo), 0, 48);
    validateRange("address", Number(address), 0, 59999);
    const suffix = normalizeSuffix(options.dataFormat || ".U");
    validateExpansionBufferCount(suffix, normalized.length);
    validateExpansionBufferSpan(Number(address), suffix, normalized.length);
    const payload = normalized.map((value) => this._formatValue(value, suffix)).join(" ");
    await this._expectOk(`UWR ${Number(unitNo).toString().padStart(2, "0")} ${Number(address)}${suffix} ${normalized.length} ${payload}`);
  }

  async registerMonitorBits(...devices) {
    const targets = this._flattenDevices(devices);
    if (targets.length === 0) {
      throw new HostLinkProtocolError("At least one device is required");
    }
    if (targets.length > 120) {
      throw new HostLinkProtocolError("Maximum 120 devices can be registered");
    }
    const tokens = targets.map((device) => {
      const addr = parseDevice(device);
      validateDeviceType("MBS", addr.deviceType, MBS_DEVICE_TYPES);
      return this._deviceToken(device, { dropSuffix: true });
    });
    await this._expectOk(`MBS ${tokens.join(" ")}`);
  }

  async registerMonitorWords(...devices) {
    const targets = this._flattenDevices(devices);
    if (targets.length === 0) {
      throw new HostLinkProtocolError("At least one device is required");
    }
    if (targets.length > 120) {
      throw new HostLinkProtocolError("Maximum 120 devices can be registered");
    }
    const tokens = targets.map((device) => {
      const addr = parseDevice(device);
      validateDeviceType("MWS", addr.deviceType, MWS_DEVICE_TYPES);
      return this._deviceWithFormat(device, null, 1)[0];
    });
    await this._expectOk(`MWS ${tokens.join(" ")}`);
  }

  async readMonitorBits() {
    return parseDataTokens(splitDataTokens(await this.sendRaw("MBR")));
  }

  async readMonitorWords() {
    return splitDataTokens(await this.sendRaw("MWR"));
  }

  async readComments(device, options = {}) {
    const addr = parseDevice(device);
    validateDeviceType("RDC", addr.deviceType, RDC_DEVICE_TYPES);
    const response = await this.sendRawDecoded(`RDC ${this._deviceToken(device, { dropSuffix: true })}`, decodeCommentResponse);
    return options.stripPadding === false ? response : response.replace(/\s+$/g, "");
  }

  _enqueue(task) {
    const next = this._queue.then(task, task);
    this._queue = next.catch(() => undefined);
    return next;
  }

  async _expectOk(body) {
    const response = await this.sendRaw(body);
    if (response !== "OK") {
      throw new HostLinkProtocolError(`Expected 'OK' but received '${response}' for command '${body}'`);
    }
  }

  _buildCommand(body) {
    return buildFrame(body);
  }

  _processResponse(response, decoder = decodeResponse) {
    return ensureSuccess(decoder(response));
  }

  _buildSetTimeCommand(value) {
    const fields = Array.isArray(value)
      ? value.map((item) => Number(item))
      : this._dateToClockFields(value);
    if (fields.length !== 7) {
      throw new HostLinkProtocolError("time value must contain year, month, day, hour, minute, second, and week");
    }
    const [year, month, day, hour, minute, second, week] = fields;
    validateRange("year(YY)", year, 0, 99);
    validateRange("month", month, 1, 12);
    validateRange("day", day, 1, 31);
    validateRange("hour", hour, 0, 23);
    validateRange("minute", minute, 0, 59);
    validateRange("second", second, 0, 59);
    validateRange("week", week, 0, 6);
    return `WRT ${String(year).padStart(2, "0")} ${String(month).padStart(2, "0")} ${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")} ${String(minute).padStart(2, "0")} ${String(second).padStart(2, "0")} ${week}`;
  }

  _dateToClockFields(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new HostLinkProtocolError("invalid time value");
    }
    return [
      date.getFullYear() % 100,
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getDay(),
    ];
  }

  _deviceToken(device, options = {}) {
    const addr = parseDevice(device);
    return deviceToString(options.dropSuffix ? { ...addr, suffix: "" } : addr);
  }

  _deviceWithFormat(device, dataFormat, count = 1) {
    const addr = parseDevice(device);
    const suffix = requireExplicitFormat(addr, dataFormat);
    validateDeviceSpan(addr.deviceType, addr.number, suffix, count);
    return [deviceToString({ ...addr, suffix }), suffix];
  }

  _ensureTimerOrCounter(device, dataFormat, count = 1) {
    const token = this._deviceWithFormat(device, dataFormat, count)[0];
    const addr = parseDevice(token);
    validateDeviceType("WS/WSS", addr.deviceType, WS_DEVICE_TYPES);
    validateDeviceCount(addr.deviceType, addr.suffix, count);
    return token;
  }

  _flattenDevices(devices) {
    if (devices.length === 1 && Array.isArray(devices[0])) {
      return Array.from(devices[0]);
    }
    return Array.from(devices);
  }

  _formatValue(value, dataFormat) {
    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }
    if (Number.isInteger(value)) {
      if (dataFormat === ".H") {
        return (Number(value) & 0xffff).toString(16).toUpperCase();
      }
      return String(value);
    }
    return String(value).trim();
  }

  async _connectTcp() {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port, noDelay: true });
      const onError = (error) => {
        socket.removeAllListeners();
        reject(new HostLinkConnectionError(`Failed to connect to ${this.host}:${this.port}: ${error.message}`));
      };
      socket.once("error", onError);
      socket.once("connect", () => {
        socket.removeListener("error", onError);
        socket.on("data", (chunk) => this._handleTcpData(chunk));
        socket.on("error", () => undefined);
        socket.on("close", () => {
          if (this._socket === socket) {
            this._socket = null;
          }
        });
        this._socket = socket;
        resolve();
      });
    });
  }

  async _connectUdp() {
    await new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      const onError = (error) => {
        socket.removeAllListeners();
        reject(new HostLinkConnectionError(`Failed to setup UDP endpoint for ${this.host}:${this.port}: ${error.message}`));
      };
      socket.once("error", onError);
      socket.connect(this.port, this.host, () => {
        socket.removeListener("error", onError);
        socket.on("error", () => undefined);
        this._socket = socket;
        resolve();
      });
    });
  }

  _handleTcpData(chunk) {
    this._receiveBuffer = Buffer.concat([this._receiveBuffer, chunk]);
    while (true) {
      const indexes = [this._receiveBuffer.indexOf(0x0d), this._receiveBuffer.indexOf(0x0a)].filter((value) => value >= 0);
      if (indexes.length === 0) {
        return;
      }
      const index = Math.min(...indexes);
      const line = this._receiveBuffer.subarray(0, index);
      let skip = index;
      while (skip < this._receiveBuffer.length && (this._receiveBuffer[skip] === 0x0d || this._receiveBuffer[skip] === 0x0a)) {
        skip += 1;
      }
      this._receiveBuffer = this._receiveBuffer.subarray(skip);
      if (this._lineWaiters.length > 0) {
        this._lineWaiters.shift().resolve(line);
      } else {
        this._lineQueue.push(line);
      }
    }
  }

  async _exchange(payload) {
    await this.connect();
    if (this.traceHook) {
      this.traceHook({ direction: "send", data: payload, timestamp: new Date() });
    }
    if (this.transport === "tcp") {
      await this._writeTcp(payload);
      const response = await this._withTimeout(this._readTcpLine(), "Timeout while waiting response from PLC");
      if (this.traceHook) {
        this.traceHook({ direction: "receive", data: response, timestamp: new Date() });
      }
      return response;
    }
    const response = await this._writeUdpAndRead(payload);
    if (this.traceHook) {
      this.traceHook({ direction: "receive", data: response, timestamp: new Date() });
    }
    return response;
  }

  _writeTcp(payload) {
    return new Promise((resolve, reject) => {
      if (!this._socket) {
        reject(new HostLinkConnectionError("TCP socket is not connected"));
        return;
      }
      this._socket.write(payload, (error) => {
        if (error) {
          reject(new HostLinkConnectionError(`Socket communication failed: ${error.message}`));
          return;
        }
        resolve();
      });
    });
  }

  _writeUdpAndRead(payload) {
    return this._withTimeout(
      new Promise((resolve, reject) => {
        if (!this._socket) {
          reject(new HostLinkConnectionError("UDP socket is not connected"));
          return;
        }
        const cleanup = () => {
          this._socket.off("message", onMessage);
          this._socket.off("error", onError);
        };
        const onMessage = (message) => {
          cleanup();
          resolve(Buffer.from(message).subarray(0));
        };
        const onError = (error) => {
          cleanup();
          reject(new HostLinkConnectionError(`Socket communication failed: ${error.message}`));
        };
        this._socket.once("message", onMessage);
        this._socket.once("error", onError);
        this._socket.send(payload, (error) => {
          if (error) {
            cleanup();
            reject(new HostLinkConnectionError(`Socket communication failed: ${error.message}`));
          }
        });
      }),
      "Timeout while waiting response from PLC"
    );
  }

  _readTcpLine() {
    if (this._lineQueue.length > 0) {
      return Promise.resolve(this._lineQueue.shift());
    }
    return new Promise((resolve, reject) => {
      this._lineWaiters.push({ resolve, reject });
    });
  }

  _withTimeout(promise, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new HostLinkConnectionError(message)), this.timeout);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }
}

async function openAndConnect(options = {}) {
  const client = new HostLinkClient(options);
  await client.connect();
  return client;
}

module.exports = {
  HostLinkClient,
  MODEL_CODES,
  openAndConnect,
  ValueError,
};
