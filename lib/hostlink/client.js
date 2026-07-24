"use strict";

const dgram = require("node:dgram");
const net = require("node:net");

const {
  FORCE_SINGLE_DEVICE_TYPES,
  FORCE_CONSECUTIVE_DEVICE_TYPES,
  DIRECT_BIT_DEVICE_TYPES,
  MBS_DEVICE_TYPES,
  MWS_DEVICE_TYPES,
  RDC_DEVICE_TYPES,
  WR_DEVICE_TYPES,
  WS_DEVICE_TYPES,
  deviceToString,
  normalizeSuffix,
  packDirectBitTokens,
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

const DEFAULT_TIMEOUT = 3000;
const ABSOLUTE_RESPONSE_CAP = 65536;

function parsePort(value) {
  if (typeof value === "boolean" || value === null || value === undefined || (typeof value === "string" && !/^\d+$/.test(value.trim()))) {
    throw new ValueError("port is required and must be an integer in the range 1..65535");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new ValueError(`port out of range (1..65535): ${value}`);
  }
  return parsed;
}

function parseTimeout(value) {
  if (typeof value === "boolean" || value === null || value === undefined || (typeof value === "string" && !/^\d+$/.test(value.trim()))) {
    throw new ValueError("timeout must be an integer in the range 1..2147483647");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 0x7fffffff) {
    throw new ValueError(`timeout out of range (1..2147483647): ${value}`);
  }
  return parsed;
}

function normalizeRequiredPlcProfile(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new ValueError("plcProfile is required. Specify a canonical PLC profile such as keyence:kv-x500.");
  }
  return normalizePlcProfile(text);
}

class HostLinkClient {
  constructor(options) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new ValueError("options is required and must be an object");
    }
    if (typeof options.host !== "string" || !options.host.trim()) {
      throw new ValueError("host is required and must be a non-empty string");
    }
    this.host = options.host.trim();
    this.port = parsePort(options.port);
    if (typeof options.transport !== "string" || !options.transport.trim()) {
      throw new ValueError("transport is required and must be 'tcp' or 'udp'");
    }
    this.transport = options.transport.trim().toLowerCase();
    this.timeout = Object.prototype.hasOwnProperty.call(options, "timeout") ? parseTimeout(options.timeout) : DEFAULT_TIMEOUT;
    if (Object.prototype.hasOwnProperty.call(options, "bufferSize")) {
      throw new ValueError("bufferSize is no longer a public option; response limits are managed by the library");
    }
    this.plcProfile = normalizeRequiredPlcProfile(options.plcProfile);
    if (Object.prototype.hasOwnProperty.call(options, "traceHook")) {
      throw new ValueError("traceHook is not a public runtime option");
    }
    this._traceHook = typeof options._maintainerTraceHook === "function" ? options._maintainerTraceHook : null;

    if (!["tcp", "udp"].includes(this.transport)) {
      throw new ValueError("transport must be 'tcp' or 'udp'");
    }
    this._socket = null;
    this._receiveBuffer = Buffer.alloc(0);
    this._lineWaiters = [];
    this._lineQueue = [];
    this._queue = Promise.resolve();
    this._connectPromise = null;
    this._monitorBitCount = null;
    this._monitorWordCount = null;
    this._requestCount = 0;
    this._txBytes = 0;
    this._rxBytes = 0;
  }

  /**
   * Return lifetime traffic counters. TCP receive bytes include the response
   * body and first CR/LF terminator; UDP receive bytes include the datagram.
   */
  trafficStats() {
    if (arguments.length !== 0) throw new ValueError("trafficStats does not accept arguments");
    return Object.freeze({ requestCount: this._requestCount, txBytes: this._txBytes, rxBytes: this._rxBytes });
  }

  async connect() {
    if (this._socket) {
      return;
    }
    if (this._connectPromise) {
      return this._connectPromise;
    }
    const operation = this.transport === "tcp" ? this._connectTcp() : this._connectUdp();
    this._connectPromise = operation;
    try {
      await operation;
    } finally {
      if (this._connectPromise === operation) {
        this._connectPromise = null;
      }
    }
  }

  async close() {
    const connecting = this._connectPromise;
    if (connecting) {
      try {
        await connecting;
      } catch (_error) {
        // A failed connection attempt already owns and releases its provisional socket.
      }
    }
    const socket = this._socket;
    this._socket = null;
    this._receiveBuffer = Buffer.alloc(0);
    this._lineQueue = [];
    this._monitorBitCount = null;
    this._monitorWordCount = null;
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
    return this._enqueue(async () => stripFrameTerminators(await this._exchange(this._buildCommand(body))));
  }

  async _sendDecoded(body, decoder = decodeResponse) {
    return this._enqueue(() => this._sendDecodedImmediate(body, decoder));
  }

  async _sendDecodedImmediate(body, decoder = decodeResponse) {
    const response = await this._exchange(this._buildCommand(body));
    return this._processResponse(response, decoder);
  }

  async changeMode(mode) {
    const modeText = typeof mode === "string" ? String(mode).trim().toUpperCase() : "";
    const modeNo = typeof mode === "string"
      ? (modeText === "RUN" ? 1 : modeText === "PROGRAM" ? 0 : NaN)
      : (typeof mode === "number" && Number.isInteger(mode) ? mode : NaN);
    if (![0, 1].includes(modeNo)) {
      throw new HostLinkProtocolError("mode must be 0/1 or PROGRAM/RUN");
    }
    await this._expectOk(`M${modeNo}`);
  }

  async clearError() {
    await this._expectOk("ER");
  }

  async checkErrorNo() {
    return this._sendDecoded("?E");
  }

  async queryModel() {
    const code = await this._sendDecoded("?K");
    return { code, model: MODEL_CODES[code] || null };
  }

  async confirmOperatingMode() {
    return this._enqueue(async () => {
      const response = await this._sendDecodedImmediate("?M");
      const modeNo = Number.parseInt(response, 10);
      if (![0, 1].includes(modeNo)) {
        const error = new HostLinkProtocolError(`Unsupported PLC mode response: ${response}`);
        this._invalidateAfterProtocolError(error);
        throw error;
      }
      return modeNo;
    });
  }

  async setTime(value) {
    if (value === undefined || value === null) {
      throw new HostLinkProtocolError("time value is required");
    }
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

  async read(device, dataFormat) {
    const [token, suffix] = this._deviceWithFormat(device, dataFormat, 1);
    const deviceType = parseDevice(token).deviceType;
    const expectedCount = this._readResponseTokenCount(deviceType, suffix);
    const values = await this._sendExpectedTokens(`RD ${token}`, expectedCount, suffix, "RD");
    return expectedCount === 1 ? values[0] : values;
  }

  async readConsecutive(device, count, dataFormat) {
    const [token, suffix] = this._deviceWithFormat(device, dataFormat, count);
    const addr = parseDevice(token);
    const effectiveFormat = resolveEffectiveFormat(addr.deviceType, suffix);
    validateDeviceCount(addr.deviceType, effectiveFormat, count);
    return this._sendExpectedTokens(`RDS ${token} ${count}`, count, suffix, "RDS");
  }

  async write(device, value, dataFormat) {
    const [token, suffix] = this._deviceWithFormat(device, dataFormat, 1);
    const addr = parseDevice(token);
    validateDeviceType("WR", addr.deviceType, WR_DEVICE_TYPES);
    await this._expectOk(`WR ${token} ${this._formatValue(value, suffix)}`);
  }

  async writeConsecutive(device, values, dataFormat) {
    const normalized = Array.from(values || []);
    if (normalized.length === 0) {
      throw new HostLinkProtocolError("values must not be empty");
    }
    const [token, suffix] = this._deviceWithFormat(device, dataFormat, normalized.length);
    const addr = parseDevice(token);
    validateDeviceType("WRS", addr.deviceType, WR_DEVICE_TYPES);
    const effectiveFormat = resolveEffectiveFormat(addr.deviceType, suffix);
    validateDeviceCount(addr.deviceType, effectiveFormat, normalized.length);
    const payload = normalized.map((value) => this._formatValue(value, suffix)).join(" ");
    await this._expectOk(`WRS ${token} ${normalized.length} ${payload}`);
  }

  async writeSetValue(device, value, dataFormat) {
    const token = this._ensureTimerOrCounter(device, dataFormat, 1);
    const suffix = parseDevice(token).suffix;
    await this._expectOk(`WS ${token} ${this._formatValue(value, suffix)}`);
  }

  async writeSetValueConsecutive(device, values, dataFormat) {
    const normalized = Array.from(values || []);
    if (normalized.length === 0) {
      throw new HostLinkProtocolError("values must not be empty");
    }
    const token = this._ensureTimerOrCounter(device, dataFormat, normalized.length);
    const suffix = parseDevice(token).suffix;
    const payload = normalized.map((value) => this._formatValue(value, suffix)).join(" ");
    await this._expectOk(`WSS ${token} ${normalized.length} ${payload}`);
  }

  async switchBank(bankNo) {
    validateRange("bankNo", Number(bankNo), 0, 15);
    await this._expectOk(`BE ${Number(bankNo)}`);
  }

  async readExpansionUnitBuffer(unitNo, address, count, dataFormat) {
    validateRange("unitNo", Number(unitNo), 0, 48);
    validateRange("address", Number(address), 0, 59999);
    const suffix = requireExpansionDataFormat(dataFormat);
    validateExpansionBufferCount(suffix, count);
    validateExpansionBufferSpan(Number(address), suffix, count);
    return this._sendExpectedTokens(
      `URD ${Number(unitNo).toString().padStart(2, "0")} ${Number(address)}${suffix} ${count}`,
      count,
      suffix,
      "URD",
    );
  }

  async writeExpansionUnitBuffer(unitNo, address, values, dataFormat) {
    const normalized = Array.from(values || []);
    if (normalized.length === 0) {
      throw new HostLinkProtocolError("values must not be empty");
    }
    validateRange("unitNo", Number(unitNo), 0, 48);
    validateRange("address", Number(address), 0, 59999);
    const suffix = requireExpansionDataFormat(dataFormat);
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
    await this._enqueue(async () => {
      const generation = this._socket;
      await this._expectOkImmediate(`MBS ${tokens.join(" ")}`);
      if (this._socket !== generation) {
        throw new HostLinkConnectionError("Connection changed while registering monitor bits");
      }
      this._monitorBitCount = targets.length;
    });
  }

  async registerMonitorWords(entries) {
    if (!Array.isArray(entries)) {
      throw new HostLinkProtocolError("registerMonitorWords requires an array of device/dataFormat entries");
    }
    const targets = Array.from(entries);
    if (targets.length === 0) {
      throw new HostLinkProtocolError("At least one device is required");
    }
    if (targets.length > 120) {
      throw new HostLinkProtocolError("Maximum 120 devices can be registered");
    }
    const tokens = targets.map((entry) => {
      const device = typeof entry === "string" ? entry : entry && entry.device;
      const dataFormat = typeof entry === "string" ? undefined : entry && entry.dataFormat;
      if (typeof device !== "string" || !device.trim()) {
        throw new HostLinkProtocolError("registerMonitorWords entries require a non-empty device");
      }
      const addr = parseDevice(device);
      validateDeviceType("MWS", addr.deviceType, MWS_DEVICE_TYPES);
      return this._deviceWithFormat(device, dataFormat, 1)[0];
    });
    await this._enqueue(async () => {
      const generation = this._socket;
      await this._expectOkImmediate(`MWS ${tokens.join(" ")}`);
      if (this._socket !== generation) {
        throw new HostLinkConnectionError("Connection changed while registering monitor words");
      }
      this._monitorWordCount = targets.length;
    });
  }

  async readMonitorBits() {
    if (this._monitorBitCount === null) {
      throw new HostLinkProtocolError("Monitor bits must be registered before MBR");
    }
    return this._sendExpectedTokens("MBR", this._monitorBitCount, "", "MBR");
  }

  async readMonitorWords() {
    if (this._monitorWordCount === null) {
      throw new HostLinkProtocolError("Monitor words must be registered before MWR");
    }
    return this._sendExpectedTokens("MWR", this._monitorWordCount, null, "MWR");
  }

  async readComments(device) {
    const addr = parseDevice(device);
    validateDeviceType("RDC", addr.deviceType, RDC_DEVICE_TYPES);
    const response = await this._sendDecoded(`RDC ${this._deviceToken(device, { dropSuffix: true })}`, decodeCommentResponse);
    return response.replace(/ +$/g, "");
  }

  async writeBitInWord(device, bitIndex, value) {
    if (!Number.isInteger(bitIndex) || bitIndex < 0 || bitIndex > 15) {
      throw new HostLinkProtocolError(`bitIndex must be 0-15, got ${bitIndex}`);
    }
    const enabled = normalizeBitWriteValue(value);
    const [token, suffix] = this._deviceWithFormat(device, ".U", 1);
    const addr = parseDevice(token);
    validateDeviceType("WR", addr.deviceType, WR_DEVICE_TYPES);
    return this._enqueue(async () => {
      const response = await this._sendDecodedImmediate(`RD ${token}`);
      let current;
      try {
        const values = parseDataTokens(splitDataTokens(response), { dataFormat: suffix });
        current = DIRECT_BIT_DEVICE_TYPES.has(addr.deviceType)
          ? packDirectBitTokens(values, 16, device)
          : values.length === 1 && Number.isInteger(values[0]) && values[0] >= 0 && values[0] <= 0xffff
            ? values[0]
            : null;
        if (current === null) {
          throw new HostLinkProtocolError(`Bit-in-word read for '${device}' did not return one unsigned word`);
        }
      } catch (error) {
        if (error instanceof HostLinkProtocolError) {
          this._invalidateAfterProtocolError(error);
        }
        throw error;
      }
      const next = enabled ? current | (1 << bitIndex) : current & ~(1 << bitIndex);
      await this._expectOkImmediate(`WR ${token} ${next & 0xffff}`);
    });
  }

  _enqueue(task) {
    const next = this._queue.then(task, task);
    this._queue = next.catch(() => undefined);
    return next;
  }

  async _expectOk(body) {
    return this._enqueue(async () => {
      const response = await this._sendDecodedImmediate(body);
      try {
        this._requireOk(response, body);
      } catch (error) {
        if (error instanceof HostLinkProtocolError) {
          this._invalidateAfterProtocolError(error);
        }
        throw error;
      }
    });
  }

  async _expectOkImmediate(body) {
    const response = await this._sendDecodedImmediate(body);
    try {
      this._requireOk(response, body);
    } catch (error) {
      if (error instanceof HostLinkProtocolError) {
        this._invalidateAfterProtocolError(error);
      }
      throw error;
    }
  }

  async _sendExpectedTokens(body, expectedCount, dataFormat, command) {
    return this._enqueue(async () => {
      const response = await this._sendDecodedImmediate(body);
      try {
        const tokens = splitDataTokens(response);
        if (tokens.length !== expectedCount) {
          throw new HostLinkProtocolError(
            `${command} response token count mismatch: expected ${expectedCount}, received ${tokens.length}`,
          );
        }
        return dataFormat === null ? tokens : parseDataTokens(tokens, { dataFormat });
      } catch (error) {
        if (error instanceof HostLinkProtocolError) {
          this._invalidateAfterProtocolError(error);
        }
        throw error;
      }
    });
  }

  _requireOk(response, body) {
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
    const explicitFields = Array.isArray(value);
    const fields = explicitFields ? Array.from(value) : this._dateToClockFields(value);
    if (fields.length !== 7) {
      throw new HostLinkProtocolError("time value must contain year, month, day, hour, minute, second, and week");
    }
    if (explicitFields && fields.some((item) => typeof item !== "number" || !Number.isInteger(item))) {
      throw new HostLinkProtocolError("time fields must be integers");
    }
    const [year, month, day, hour, minute, second, week] = fields;
    validateRange("year(YY)", year, 0, 99);
    validateRange("month", month, 1, 12);
    validateRange("day", day, 1, 31);
    validateRange("hour", hour, 0, 23);
    validateRange("minute", minute, 0, 59);
    validateRange("second", second, 0, 59);
    validateRange("week", week, 0, 6);
    if (explicitFields) {
      const calendar = new Date(2000 + year, month - 1, day, hour, minute, second, 0);
      if (
        calendar.getFullYear() !== 2000 + year
        || calendar.getMonth() !== month - 1
        || calendar.getDate() !== day
      ) {
        throw new HostLinkProtocolError("time value contains a nonexistent calendar date");
      }
      if (calendar.getDay() !== week) {
        throw new HostLinkProtocolError(`week ${week} does not match the calendar date (expected ${calendar.getDay()})`);
      }
    }
    return `WRT ${String(year).padStart(2, "0")} ${String(month).padStart(2, "0")} ${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")} ${String(minute).padStart(2, "0")} ${String(second).padStart(2, "0")} ${week}`;
  }

  _dateToClockFields(value) {
    if (!(value instanceof Date)) {
      throw new HostLinkProtocolError("time value must be a Date or a seven-integer clock field array");
    }
    const date = value;
    if (Number.isNaN(date.getTime())) {
      throw new HostLinkProtocolError("invalid time value");
    }
    if (date.getFullYear() < 2000 || date.getFullYear() > 2099) {
      throw new HostLinkProtocolError("Date year must be in range 2000..2099");
    }
    return [
      date.getFullYear() - 2000,
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
    if (options.dropSuffix && addr.suffix) {
      throw new HostLinkProtocolError(`Device '${device}' must not contain a data-format suffix for this command`);
    }
    return deviceToString(options.dropSuffix ? { ...addr, suffix: "" } : addr);
  }

  _deviceWithFormat(device, dataFormat, count = 1) {
    const addr = parseDevice(device);
    const suffix = requireExplicitFormat(addr, dataFormat);
    validateDeviceSpan(addr.deviceType, addr.number, suffix, count);
    return [deviceToString({ ...addr, suffix }), suffix];
  }

  _readResponseTokenCount(deviceType, suffix) {
    if (deviceType === "T" || deviceType === "C") {
      return 3;
    }
    if (DIRECT_BIT_DEVICE_TYPES.has(deviceType)) {
      if ([".U", ".S", ".H"].includes(suffix)) {
        return 16;
      }
      if ([".D", ".L"].includes(suffix)) {
        return 32;
      }
    }
    return 1;
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
    if (dataFormat === "") {
      return normalizeBitWriteValue(value) ? "1" : "0";
    }
    const limits = {
      ".U": [0, 0xffff],
      ".S": [-0x8000, 0x7fff],
      ".D": [0, 0xffffffff],
      ".L": [-0x80000000, 0x7fffffff],
      ".H": [0, 0xffff],
    }[dataFormat];
    if (!limits || !Number.isSafeInteger(value) || value < limits[0] || value > limits[1]) {
      throw new HostLinkProtocolError(`value '${String(value)}' is outside the range for dataFormat '${dataFormat}'`);
    }
    return dataFormat === ".H" ? value.toString(16).toUpperCase() : String(value);
  }

  async _connectTcp() {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port, noDelay: true });
      const timeoutHandle = setTimeout(() => {
        socket.destroy();
        reject(new HostLinkConnectionError(`Connection timed out to ${this.host}:${this.port}`));
      }, this.timeout);
      const onError = (error) => {
        clearTimeout(timeoutHandle);
        socket.removeAllListeners();
        socket.destroy();
        reject(new HostLinkConnectionError(`Failed to connect to ${this.host}:${this.port}: ${error.message}`));
      };
      socket.once("error", onError);
      socket.once("connect", () => {
        clearTimeout(timeoutHandle);
        socket.removeListener("error", onError);
        socket.on("data", (chunk) => this._handleTcpData(chunk, socket));
        socket.on("error", (error) => {
          this._failTcpConnection(new HostLinkConnectionError(`Socket communication failed: ${error.message}`), socket);
        });
        socket.on("close", () => {
          if (this._socket === socket) {
            this._failTcpConnection(new HostLinkConnectionError("Connection closed"), socket);
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
        try {
          socket.close();
        } catch (_closeError) {
          // Setup failure may have already closed the provisional socket.
        }
        reject(new HostLinkConnectionError(`Failed to setup UDP endpoint for ${this.host}:${this.port}: ${error.message}`));
      };
      socket.once("error", onError);
      socket.connect(this.port, this.host, () => {
        socket.removeListener("error", onError);
        socket.on("error", () => {
          if (this._socket === socket) {
            this._socket = null;
          }
          try {
            socket.close();
          } catch (_error) {
            // The socket may already be closed by an in-flight request handler.
          }
        });
        this._socket = socket;
        resolve();
      });
    });
  }

  _handleTcpData(chunk, socket = this._socket) {
    if (socket !== this._socket) {
      return;
    }
    this._receiveBuffer = Buffer.concat([this._receiveBuffer, chunk]);
    while (true) {
      let leadingTerminators = 0;
      while (
        leadingTerminators < this._receiveBuffer.length &&
        (this._receiveBuffer[leadingTerminators] === 0x0d || this._receiveBuffer[leadingTerminators] === 0x0a)
      ) {
        leadingTerminators += 1;
      }
      if (leadingTerminators > 0) {
        this._receiveBuffer = this._receiveBuffer.subarray(leadingTerminators);
      }
      if (this._receiveBuffer.length === 0) {
        return;
      }

      const indexes = [this._receiveBuffer.indexOf(0x0d), this._receiveBuffer.indexOf(0x0a)].filter((value) => value >= 0);
      if (indexes.length === 0) {
        if (this._receiveBuffer.length > ABSOLUTE_RESPONSE_CAP) {
          this._failTcpConnection(new HostLinkProtocolError(`Response line exceeds ${ABSOLUTE_RESPONSE_CAP} bytes`), socket);
        }
        return;
      }
      const index = Math.min(...indexes);
      if (index > ABSOLUTE_RESPONSE_CAP) {
        this._failTcpConnection(new HostLinkProtocolError(`Response line exceeds ${ABSOLUTE_RESPONSE_CAP} bytes`), socket);
        return;
      }
      const line = this._receiveBuffer.subarray(0, index);
      let skip = index;
      while (skip < this._receiveBuffer.length && (this._receiveBuffer[skip] === 0x0d || this._receiveBuffer[skip] === 0x0a)) {
        skip += 1;
      }
      this._receiveBuffer = this._receiveBuffer.subarray(skip);
      // Count the response line through its first terminator. Any adjacent
      // CR/LF separator padding is consumed above but is not another line.
      this._rxBytes += index + 1;
      if (this._lineWaiters.length > 0) {
        this._lineWaiters.shift().resolve(line);
      } else {
        this._lineQueue.push(line);
      }
    }
  }

  async _exchange(payload) {
    if (!this._socket) {
      throw new HostLinkConnectionError("Client is not connected; call connect() before sending a command");
    }
    this._emitTrace("send", payload);
    if (this.transport === "tcp") {
      await this._writeTcp(payload);
      const response = await this._readTcpLine();
      this._emitTrace("receive", response);
      return response;
    }
    const response = await this._writeUdpAndRead(payload);
    this._emitTrace("receive", response);
    return response;
  }

  _emitTrace(direction, data) {
    if (!this._traceHook) {
      return;
    }
    try {
      this._traceHook({ direction, data, timestamp: new Date() });
    } catch (_error) {
      // Maintainer diagnostics must not change command success, ordering, or retry behavior.
    }
  }

  _writeTcp(payload) {
    return new Promise((resolve, reject) => {
      const socket = this._socket;
      if (!socket) {
        reject(new HostLinkConnectionError("TCP socket is not connected"));
        return;
      }
      socket.write(payload, (error) => {
        if (error) {
          const wrapped = new HostLinkConnectionError(`Socket communication failed: ${error.message}`);
          this._failTcpConnection(wrapped, socket);
          reject(wrapped);
          return;
        }
        if (this._socket !== socket) {
          reject(new HostLinkConnectionError("TCP connection changed while the request was being sent"));
          return;
        }
        this._requestCount += 1;
        this._txBytes += payload.length;
        resolve();
      });
    });
  }

  _writeUdpAndRead(payload) {
    return new Promise((resolve, reject) => {
      const socket = this._socket;
      if (!socket) {
        reject(new HostLinkConnectionError("UDP socket is not connected"));
        return;
      }
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeoutHandle);
        socket.off("message", onMessage);
        socket.off("error", onError);
      };
      const finish = (error, message) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          resolve(Buffer.from(message));
        }
      };
      const failAndClose = (error) => {
        if (this._socket === socket) {
          this._socket = null;
        }
        finish(error);
        try {
          socket.close();
        } catch (_error) {
          // The socket may already be closing after an error.
        }
      };
      const onMessage = (message) => {
        const last = message.length > 0 ? message[message.length - 1] : -1;
        if (last !== 0x0d && last !== 0x0a) {
          failAndClose(new HostLinkProtocolError("UDP response is missing the required CR/LF terminator"));
          return;
        }
        this._rxBytes += message.length;
        finish(null, message);
      };
      const onError = (error) => failAndClose(new HostLinkConnectionError(`Socket communication failed: ${error.message}`));
      const timeoutHandle = setTimeout(() => {
        failAndClose(new HostLinkConnectionError("Timeout while waiting response from PLC"));
      }, this.timeout);
      socket.once("message", onMessage);
      socket.once("error", onError);
      socket.send(payload, (error) => {
        if (error) {
          failAndClose(new HostLinkConnectionError(`Socket communication failed: ${error.message}`));
          return;
        }
        this._requestCount += 1;
        this._txBytes += payload.length;
      });
    });
  }

  _readTcpLine() {
    if (this._lineQueue.length > 0) {
      return Promise.resolve(this._lineQueue.shift());
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (value) => {
          clearTimeout(waiter.timeoutHandle);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(waiter.timeoutHandle);
          reject(error);
        },
        timeoutHandle: null,
      };
      waiter.timeoutHandle = setTimeout(() => {
        this._failTcpConnection(new HostLinkConnectionError("Timeout while waiting response from PLC"));
      }, this.timeout);
      this._lineWaiters.push(waiter);
    });
  }

  _failTcpConnection(error, socket = this._socket) {
    if (socket !== this._socket) {
      if (socket && !socket.destroyed) {
        socket.destroy();
      }
      return;
    }
    this._socket = null;
    this._receiveBuffer = Buffer.alloc(0);
    this._lineQueue = [];
    const waiters = this._lineWaiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(error);
    }
    if (socket && !socket.destroyed) {
      socket.destroy();
    }
    this._monitorBitCount = null;
    this._monitorWordCount = null;
  }

  _invalidateAfterProtocolError(error) {
    if (this.transport === "tcp") {
      this._failTcpConnection(error);
      return;
    }
    const socket = this._socket;
    this._socket = null;
    this._monitorBitCount = null;
    this._monitorWordCount = null;
    if (socket) {
      try {
        socket.close();
      } catch (_closeError) {
        // The datagram socket may already be closing after a framing failure.
      }
    }
  }
}

async function openAndConnect(options) {
  const client = new HostLinkClient(options);
  await client.connect();
  return client;
}

function requireExpansionDataFormat(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new HostLinkProtocolError("dataFormat is required for expansion unit buffer access");
  }
  const normalized = normalizeSuffix(value);
  if (![".U", ".S", ".D", ".L", ".H"].includes(normalized)) {
    throw new HostLinkProtocolError(`Unsupported expansion unit buffer dataFormat '${String(value)}'`);
  }
  return normalized;
}

function normalizeBitWriteValue(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (Number.isInteger(value) && (value === 0 || value === 1)) {
    return value === 1;
  }
  throw new HostLinkProtocolError(`BIT value must be boolean or integer 0/1, got '${String(value)}'`);
}

function stripFrameTerminators(value) {
  const buffer = Buffer.from(value);
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1] === 0x0d || buffer[end - 1] === 0x0a)) {
    end -= 1;
  }
  return Buffer.from(buffer.subarray(0, end));
}

module.exports = {
  HostLinkClient,
  MODEL_CODES,
  openAndConnect,
  ValueError,
};
