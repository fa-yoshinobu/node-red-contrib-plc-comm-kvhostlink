"use strict";

const dgram = require("node:dgram");
const net = require("node:net");
const { AsyncLocalStorage } = require("node:async_hooks");

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
const {
  HostLinkClosedError,
  HostLinkCanceledError,
  HostLinkConnectionError,
  HostLinkNotConnectedError,
  HostLinkOperationOutcomeUnknownError,
  HostLinkProtocolError,
  HostLinkTimeoutError,
  ValueError,
} = require("./errors");
const { normalizeIpv4Host, resolveIpv4 } = require("./network");
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
  if (typeof value !== "number") {
    throw new ValueError("port is required and must be an integer in the range 1..65535");
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new ValueError(`port out of range (1..65535): ${value}`);
  }
  return value;
}

function parseTimeout(value) {
  if (typeof value !== "number") {
    throw new ValueError("timeout must be an integer in the range 1..2147483647");
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > 0x7fffffff) {
    throw new ValueError(`timeout out of range (1..2147483647): ${value}`);
  }
  return value;
}

function normalizeRequiredPlcProfile(value) {
  if (typeof value !== "string" || !value) {
    throw new ValueError("plcProfile is required. Specify a canonical PLC profile such as keyence:kv-x500.");
  }
  return normalizePlcProfile(value);
}

class HostLinkClient {
  constructor(options) {
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
      throw new ValueError("options is required and must be an object");
    }
    const host = normalizeIpv4Host(options.host);
    const port = parsePort(options.port);
    if (typeof options.transport !== "string" || !options.transport.trim()) {
      throw new ValueError("transport is required and must be 'tcp' or 'udp'");
    }
    const transport = options.transport.trim().toLowerCase();
    const timeout = Object.prototype.hasOwnProperty.call(options, "timeout") ? parseTimeout(options.timeout) : DEFAULT_TIMEOUT;
    if (Object.prototype.hasOwnProperty.call(options, "bufferSize")) {
      throw new ValueError("bufferSize is no longer a public option; response limits are managed by the library");
    }
    const plcProfile = normalizeRequiredPlcProfile(options.plcProfile);
    if (Object.prototype.hasOwnProperty.call(options, "traceHook")) {
      throw new ValueError("traceHook is not a public runtime option");
    }
    this._traceHook = typeof options._maintainerTraceHook === "function" ? options._maintainerTraceHook : null;

    if (!["tcp", "udp"].includes(transport)) {
      throw new ValueError("transport must be 'tcp' or 'udp'");
    }
    Object.defineProperties(this, {
      host: { value: host, enumerable: true },
      port: { value: port, enumerable: true },
      transport: { value: transport, enumerable: true },
      timeout: { value: timeout, enumerable: true },
      plcProfile: { value: plcProfile, enumerable: true },
    });
    this._socket = null;
    this._generation = 0;
    this._receiveBuffer = Buffer.alloc(0);
    this._pendingTcpResponse = null;
    this._activeUdpRequest = null;
    this._operationQueue = [];
    this._activeOperation = null;
    this._operationGeneration = 0;
    this._closing = false;
    this._closePromise = null;
    this._exclusiveContext = new AsyncLocalStorage();
    this._connecting = null;
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

  connect(options) {
    const operationOptions = normalizeOperationOptions(options, "connect");
    return this._enqueue(async () => {
      if (this._socket) return;
      const context = this._requireActiveContext();
      const deadline = performance.now() + this.timeout;
      if (this.transport === "tcp") {
        await this._connectTcp(deadline, context.signal);
      } else {
        await this._connectUdp(deadline, context.signal);
      }
    }, operationOptions);
  }

  close() {
    if (this._closePromise) return this._closePromise;
    const closePromise = this._closeCore();
    this._closePromise = closePromise.finally(() => {
      if (this._closePromise === closePromise || this._closePromise === wrappedPromise) {
        this._closePromise = null;
      }
    });
    const wrappedPromise = this._closePromise;
    return wrappedPromise;
  }

  async _closeCore() {
    this._closing = true;
    this._operationGeneration += 1;
    const closeError = new HostLinkClosedError();
    const queued = this._operationQueue.splice(0);
    for (const entry of queued) {
      entry.detachAbort();
      entry.reject(closeError);
    }
    const connecting = this._connecting;
    if (this._activeOperation && this._activeOperation.lifecycleController) {
      this._activeOperation.lifecycleController.abort(closeError);
    }
    if (connecting && !connecting.settled) {
      connecting.cancel(new HostLinkClosedError("Connection closed while connect was pending"));
    }
    const socket = this._socket;
    const generation = this._generation;
    this._socket = null;
    this._generation += 1;
    this._receiveBuffer = Buffer.alloc(0);
    this._monitorBitCount = null;
    this._monitorWordCount = null;
    if (this._pendingTcpResponse && this._pendingTcpResponse.socket === socket) {
      this._pendingTcpResponse.reject(closeError);
    }
    if (
      this._activeUdpRequest
      && this._activeUdpRequest.socket === socket
      && this._activeUdpRequest.generation === generation
    ) {
      this._activeUdpRequest.fail(closeError, false);
    }
    if (!socket) {
      this._closing = false;
      return;
    }
    try {
      await new Promise((resolve) => {
        if (this.transport === "tcp") {
          socket.once("close", resolve);
          socket.destroy();
        } else {
          socket.close(() => resolve());
        }
      });
    } finally {
      this._closing = false;
    }
  }

  async sendRaw(body, options) {
    const operationOptions = normalizeOperationOptions(options, "sendRaw");
    const payload = this._buildCommand(body);
    return this._enqueue(async () => {
      const result = stripFrameTerminators(await this._exchange(payload, true));
      this._assertDecodeWithinDeadline();
      return result;
    }, operationOptions);
  }

  async _sendDecoded(body, decoder = decodeResponse, options) {
    return this._enqueue(() => this._sendDecodedImmediate(body, decoder), options);
  }

  async _sendDecodedImmediate(body, decoder = decodeResponse, stateChanging = false) {
    const socket = this._socket;
    const generation = this._generation;
    const response = await this._exchange(this._buildCommand(body), stateChanging);
    let result;
    let decodeError = null;
    try {
      result = this._processResponse(response, decoder);
    } catch (error) {
      decodeError = error;
    }
    this._assertDecodeWithinDeadline();
    if (decodeError instanceof HostLinkProtocolError) {
      this._invalidateAfterProtocolError(decodeError, socket, generation);
      if (stateChanging) throw this._outcomeUnknown(decodeError);
    }
    if (decodeError) throw decodeError;
    return result;
  }

  async changeMode(mode, options) {
    const modeText = typeof mode === "string" ? String(mode).trim().toUpperCase() : "";
    const modeNo = typeof mode === "string"
      ? (modeText === "RUN" ? 1 : modeText === "PROGRAM" ? 0 : NaN)
      : (typeof mode === "number" && Number.isInteger(mode) ? mode : NaN);
    if (![0, 1].includes(modeNo)) {
      throw new HostLinkProtocolError("mode must be 0/1 or PROGRAM/RUN");
    }
    await this._expectOk(`M${modeNo}`, options);
  }

  async clearError(options) {
    await this._expectOk("ER", options);
  }

  async checkErrorNo(options) {
    const operationOptions = normalizeOperationOptions(options, "checkErrorNo");
    return this._sendDecoded("?E", decodeResponse, operationOptions);
  }

  async queryModel(options) {
    const operationOptions = normalizeOperationOptions(options, "queryModel");
    const code = await this._sendDecoded("?K", decodeResponse, operationOptions);
    return { code, model: MODEL_CODES[code] || null };
  }

  async confirmOperatingMode(options) {
    const operationOptions = normalizeOperationOptions(options, "confirmOperatingMode");
    return this._enqueue(async () => {
      const socket = this._socket;
      const generation = this._generation;
      const response = await this._sendDecodedImmediate("?M");
      if (response !== "0" && response !== "1") {
        const error = new HostLinkProtocolError(`Unsupported PLC mode response: ${response}`);
        this._invalidateAfterProtocolError(error, socket, generation);
        throw error;
      }
      return response === "0" ? 0 : 1;
    }, operationOptions);
  }

  async setTime(value, options) {
    if (value === undefined || value === null) {
      throw new HostLinkProtocolError("time value is required");
    }
    await this._expectOk(this._buildSetTimeCommand(value), options);
  }

  async forcedSet(device, options) {
    const addr = parseDevice(device);
    validateDeviceType("ST", addr.deviceType, FORCE_SINGLE_DEVICE_TYPES);
    await this._expectOk(`ST ${this._deviceToken(device, { dropSuffix: true })}`, options);
  }

  async forcedReset(device, options) {
    const addr = parseDevice(device);
    validateDeviceType("RS", addr.deviceType, FORCE_SINGLE_DEVICE_TYPES);
    await this._expectOk(`RS ${this._deviceToken(device, { dropSuffix: true })}`, options);
  }

  async forcedSetConsecutive(device, count, options) {
    validateRange("count", count, 1, 16);
    const addr = parseDevice(device);
    validateDeviceType("STS", addr.deviceType, FORCE_CONSECUTIVE_DEVICE_TYPES);
    await this._expectOk(`STS ${this._deviceToken(device, { dropSuffix: true })} ${count}`, options);
  }

  async forcedResetConsecutive(device, count, options) {
    validateRange("count", count, 1, 16);
    const addr = parseDevice(device);
    validateDeviceType("RSS", addr.deviceType, FORCE_CONSECUTIVE_DEVICE_TYPES);
    await this._expectOk(`RSS ${this._deviceToken(device, { dropSuffix: true })} ${count}`, options);
  }

  async read(device, dataFormat, options) {
    const operationOptions = normalizeOperationOptions(options, "read");
    const [token, suffix] = this._deviceWithFormat(device, dataFormat, 1);
    const deviceType = parseDevice(token).deviceType;
    const expectedCount = this._readResponseTokenCount(deviceType, suffix);
    const values = await this._sendExpectedTokens(`RD ${token}`, expectedCount, suffix, "RD", operationOptions);
    return expectedCount === 1 ? values[0] : values;
  }

  async readConsecutive(device, count, dataFormat, options) {
    const operationOptions = normalizeOperationOptions(options, "readConsecutive");
    const [token, suffix] = this._deviceWithFormat(device, dataFormat, count);
    const addr = parseDevice(token);
    const effectiveFormat = resolveEffectiveFormat(addr.deviceType, suffix);
    validateDeviceCount(addr.deviceType, effectiveFormat, count);
    return this._sendExpectedTokens(`RDS ${token} ${count}`, count, suffix, "RDS", operationOptions);
  }

  async write(device, value, dataFormat, options) {
    const [token, suffix] = this._deviceWithFormat(device, dataFormat, 1);
    const addr = parseDevice(token);
    validateDeviceType("WR", addr.deviceType, WR_DEVICE_TYPES);
    await this._expectOk(`WR ${token} ${this._formatValue(value, suffix)}`, options);
  }

  async writeConsecutive(device, values, dataFormat, options) {
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
    await this._expectOk(`WRS ${token} ${normalized.length} ${payload}`, options);
  }

  async writeSetValue(device, value, dataFormat, options) {
    const token = this._ensureTimerOrCounter(device, dataFormat, 1);
    const suffix = parseDevice(token).suffix;
    await this._expectOk(`WS ${token} ${this._formatValue(value, suffix)}`, options);
  }

  async writeSetValueConsecutive(device, values, dataFormat, options) {
    const normalized = Array.from(values || []);
    if (normalized.length === 0) {
      throw new HostLinkProtocolError("values must not be empty");
    }
    const token = this._ensureTimerOrCounter(device, dataFormat, normalized.length);
    const suffix = parseDevice(token).suffix;
    const payload = normalized.map((value) => this._formatValue(value, suffix)).join(" ");
    await this._expectOk(`WSS ${token} ${normalized.length} ${payload}`, options);
  }

  async switchBank(bankNo, options) {
    validateRange("bankNo", bankNo, 0, 15);
    await this._expectOk(`BE ${bankNo}`, options);
  }

  async readExpansionUnitBuffer(unitNo, address, count, dataFormat, options) {
    const operationOptions = normalizeOperationOptions(options, "readExpansionUnitBuffer");
    validateRange("unitNo", unitNo, 0, 48);
    validateRange("address", address, 0, 59999);
    validateRange("count", count, 1, 1000);
    const suffix = requireExpansionDataFormat(dataFormat);
    validateExpansionBufferCount(suffix, count);
    validateExpansionBufferSpan(address, suffix, count);
    return this._sendExpectedTokens(
      `URD ${unitNo.toString().padStart(2, "0")} ${address}${suffix} ${count}`,
      count,
      suffix,
      "URD",
      operationOptions,
    );
  }

  async writeExpansionUnitBuffer(unitNo, address, values, dataFormat, options) {
    const normalized = Array.from(values || []);
    if (normalized.length === 0) {
      throw new HostLinkProtocolError("values must not be empty");
    }
    validateRange("unitNo", unitNo, 0, 48);
    validateRange("address", address, 0, 59999);
    const suffix = requireExpansionDataFormat(dataFormat);
    validateExpansionBufferCount(suffix, normalized.length);
    validateExpansionBufferSpan(address, suffix, normalized.length);
    const payload = normalized.map((value) => this._formatValue(value, suffix)).join(" ");
    await this._expectOk(`UWR ${unitNo.toString().padStart(2, "0")} ${address}${suffix} ${normalized.length} ${payload}`, options);
  }

  async registerMonitorBits(...devices) {
    const operationOptions = takeTrailingOperationOptions(devices, "registerMonitorBits");
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
    }, operationOptions);
  }

  async registerMonitorWords(entries, options) {
    const operationOptions = normalizeOperationOptions(options, "registerMonitorWords");
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
    }, operationOptions);
  }

  async readMonitorBits(options) {
    const operationOptions = normalizeOperationOptions(options, "readMonitorBits");
    return this._enqueue(() => {
      if (this._monitorBitCount === null) {
        throw new HostLinkProtocolError("Monitor bits must be registered before MBR");
      }
      return this._sendExpectedTokens("MBR", this._monitorBitCount, "", "MBR");
    }, operationOptions);
  }

  async readMonitorWords(options) {
    const operationOptions = normalizeOperationOptions(options, "readMonitorWords");
    return this._enqueue(() => {
      if (this._monitorWordCount === null) {
        throw new HostLinkProtocolError("Monitor words must be registered before MWR");
      }
      return this._sendExpectedTokens("MWR", this._monitorWordCount, null, "MWR");
    }, operationOptions);
  }

  async readComments(device, options) {
    const operationOptions = normalizeOperationOptions(options, "readComments");
    const addr = parseDevice(device);
    validateDeviceType("RDC", addr.deviceType, RDC_DEVICE_TYPES);
    const response = await this._sendDecoded(`RDC ${this._deviceToken(device, { dropSuffix: true })}`, decodeCommentResponse, operationOptions);
    return response.replace(/ +$/g, "");
  }

  _enqueue(task, options = {}) {
    const context = this._exclusiveContext.getStore();
    if (context && context.client === this) {
      return Promise.resolve().then(() => {
        this._throwIfContextUnavailable(context);
        return task();
      });
    }
    if (this._closing) {
      return Promise.reject(new HostLinkClosedError("Host Link client is closing"));
    }
    const signal = options.signal || null;
    if (signal && signal.aborted) {
      return Promise.reject(createCanceledError(signal));
    }
    const generation = this._operationGeneration;
    return new Promise((resolve, reject) => {
      const entry = {
        generation,
        task,
        signal,
        resolve,
        reject,
        abortHandler: null,
        lifecycleController: null,
        detachActiveSignals: () => {},
        detachAbort() {
          if (this.signal && this.abortHandler) {
            this.signal.removeEventListener("abort", this.abortHandler);
            this.abortHandler = null;
          }
        },
      };
      if (signal) {
        entry.abortHandler = () => {
          const index = this._operationQueue.indexOf(entry);
          if (index < 0) return;
          this._operationQueue.splice(index, 1);
          entry.detachAbort();
          reject(createCanceledError(signal));
          this._activateNextOperation();
        };
        signal.addEventListener("abort", entry.abortHandler, { once: true });
      }
      this._operationQueue.push(entry);
      this._activateNextOperation();
    });
  }

  _activateNextOperation() {
    if (this._activeOperation || this._operationQueue.length === 0) return;
    const entry = this._operationQueue.shift();
    entry.detachAbort();
    entry.lifecycleController = new AbortController();
    const combined = combineAbortSignals(entry.signal, entry.lifecycleController.signal);
    entry.detachActiveSignals = combined.cleanup;
    this._activeOperation = entry;
    const context = { client: this, generation: entry.generation, signal: combined.signal, transaction: null };
    Promise.resolve()
      .then(() => {
        this._throwIfContextUnavailable(context);
        return this._exclusiveContext.run(context, entry.task);
      })
      .then(
        (value) => {
          this._throwIfContextUnavailable(context);
          entry.resolve(value);
        },
        (error) => entry.reject(error),
      )
      .catch((error) => entry.reject(error))
      .finally(() => {
        entry.detachActiveSignals();
        if (this._activeOperation === entry) this._activeOperation = null;
        this._activateNextOperation();
      });
  }

  _throwIfContextUnavailable(context = this._exclusiveContext.getStore()) {
    if (!context || context.client !== this) {
      throw new HostLinkConnectionError("Host Link operation has no active FIFO context");
    }
    if (context.generation !== this._operationGeneration || this._closing) {
      throw new HostLinkClosedError("Host Link client was closed before the operation could complete");
    }
    if (context.signal && context.signal.aborted) {
      throw createCanceledError(context.signal);
    }
  }

  _requireActiveContext() {
    const context = this._exclusiveContext.getStore();
    this._throwIfContextUnavailable(context);
    return context;
  }

  _runExclusive(task, options) {
    if (typeof task !== "function") {
      throw new ValueError("exclusive operation must be a function");
    }
    const operationOptions = normalizeOperationOptions(options, "exclusive operation");
    return this._enqueue(task, operationOptions);
  }

  async _expectOk(body, options) {
    const operationOptions = normalizeOperationOptions(options, "Host Link command");
    return this._enqueue(async () => {
      const socket = this._socket;
      const generation = this._generation;
      const response = await this._sendDecodedImmediate(body, decodeResponse, true);
      try {
        this._requireOk(response, body);
      } catch (error) {
        if (error instanceof HostLinkProtocolError) {
          this._invalidateAfterProtocolError(error, socket, generation);
          throw this._outcomeUnknown(error);
        }
        throw error;
      }
    }, operationOptions);
  }

  async _expectOkImmediate(body) {
    const socket = this._socket;
    const generation = this._generation;
    const response = await this._sendDecodedImmediate(body, decodeResponse, true);
    try {
      this._requireOk(response, body);
    } catch (error) {
      if (error instanceof HostLinkProtocolError) {
        this._invalidateAfterProtocolError(error, socket, generation);
        throw this._outcomeUnknown(error);
      }
      throw error;
    }
  }

  async _sendExpectedTokens(body, expectedCount, dataFormat, command, options) {
    return this._enqueue(async () => {
      const socket = this._socket;
      const generation = this._generation;
      const response = await this._sendDecodedImmediate(body);
      try {
        const tokens = splitDataTokens(response);
        if (tokens.length !== expectedCount) {
          throw new HostLinkProtocolError(
            `${command} response token count mismatch: expected ${expectedCount}, received ${tokens.length}`,
          );
        }
        const result = dataFormat === null ? tokens : parseDataTokens(tokens, { dataFormat });
        this._assertDecodeWithinDeadline();
        return result;
      } catch (error) {
        if (error instanceof HostLinkProtocolError) {
          this._invalidateAfterProtocolError(error, socket, generation);
        }
        throw error;
      }
    }, options);
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
    if (explicitFields && fields.some((item) => typeof item !== "number" || !Number.isSafeInteger(item))) {
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

  async _connectTcp(deadline, signal) {
    const address = await resolveIpv4(this.host, deadline, signal);
    this._throwIfContextUnavailable();
    if (performance.now() >= deadline) {
      throw new HostLinkTimeoutError(`Connection timed out to ${this.host}:${this.port}`);
    }
    await new Promise((resolve, reject) => {
      const attemptGeneration = this._generation;
      const socket = net.createConnection({ host: address, port: this.port, family: 4, noDelay: true });
      const connecting = {
        socket,
        settled: false,
        timeoutHandle: null,
        cancel: null,
      };
      const finalizeReject = (error) => {
        if (connecting.settled) return;
        connecting.settled = true;
        clearTimeout(connecting.timeoutHandle);
        socket.removeListener("connect", onConnect);
        socket.removeListener("error", onError);
        if (signal) signal.removeEventListener("abort", onAbort);
        if (this._connecting === connecting) this._connecting = null;
        if (!socket.destroyed) socket.destroy();
        reject(error);
      };
      const onAbort = () => finalizeReject(createCanceledError(signal));
      const onError = (error) => finalizeReject(
        error instanceof HostLinkConnectionError
          ? error
          : new HostLinkConnectionError(`Failed to connect to ${this.host}:${this.port}: ${error.message}`, { cause: error }),
      );
      const onConnect = () => {
        if (connecting.settled || this._connecting !== connecting || this._generation !== attemptGeneration) return;
        if (performance.now() >= deadline) {
          finalizeReject(new HostLinkTimeoutError(`Connection timed out to ${this.host}:${this.port}`));
          return;
        }
        connecting.settled = true;
        clearTimeout(connecting.timeoutHandle);
        socket.removeListener("error", onError);
        if (signal) signal.removeEventListener("abort", onAbort);
        this._connecting = null;
        socket.on("data", (chunk) => this._handleTcpData(chunk, socket));
        socket.on("error", (error) => {
          this._failTcpConnection(new HostLinkConnectionError(`Socket communication failed: ${error.message}`, { cause: error }), socket);
        });
        socket.on("close", () => {
          if (this._socket === socket) {
            this._failTcpConnection(new HostLinkConnectionError("Connection closed"), socket);
          }
        });
        this._socket = socket;
        this._generation += 1;
        resolve();
      };
      connecting.cancel = finalizeReject;
      const remaining = Math.max(0, Math.ceil(deadline - performance.now()));
      connecting.timeoutHandle = setTimeout(
        () => finalizeReject(new HostLinkTimeoutError(`Connection timed out to ${this.host}:${this.port}`)),
        remaining,
      );
      this._connecting = connecting;
      socket.once("error", onError);
      socket.once("connect", onConnect);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  async _connectUdp(deadline, signal) {
    const address = await resolveIpv4(this.host, deadline, signal);
    this._throwIfContextUnavailable();
    if (performance.now() >= deadline) {
      throw new HostLinkTimeoutError(`UDP connection timed out to ${this.host}:${this.port}`);
    }
    await new Promise((resolve, reject) => {
      const attemptGeneration = this._generation;
      const socket = dgram.createSocket("udp4");
      const connecting = {
        socket,
        settled: false,
        timeoutHandle: null,
        cancel: null,
      };
      const finalizeReject = (error) => {
        if (connecting.settled) return;
        connecting.settled = true;
        clearTimeout(connecting.timeoutHandle);
        socket.removeListener("error", onError);
        if (signal) signal.removeEventListener("abort", onAbort);
        if (this._connecting === connecting) this._connecting = null;
        try {
          socket.close();
        } catch (_closeError) {
          // Setup failure may have already closed the provisional socket.
        }
        reject(error);
      };
      const onAbort = () => finalizeReject(createCanceledError(signal));
      const onError = (error) => finalizeReject(
        error instanceof HostLinkConnectionError
          ? error
          : new HostLinkConnectionError(`Failed to setup UDP endpoint for ${this.host}:${this.port}: ${error.message}`, { cause: error }),
      );
      connecting.cancel = finalizeReject;
      const remaining = Math.max(0, Math.ceil(deadline - performance.now()));
      connecting.timeoutHandle = setTimeout(
        () => finalizeReject(new HostLinkTimeoutError(`UDP connection timed out to ${this.host}:${this.port}`)),
        remaining,
      );
      this._connecting = connecting;
      socket.once("error", onError);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      socket.connect(this.port, address, () => {
        if (connecting.settled || this._connecting !== connecting || this._generation !== attemptGeneration) return;
        if (performance.now() >= deadline) {
          finalizeReject(new HostLinkTimeoutError(`UDP connection timed out to ${this.host}:${this.port}`));
          return;
        }
        connecting.settled = true;
        clearTimeout(connecting.timeoutHandle);
        socket.removeListener("error", onError);
        if (signal) signal.removeEventListener("abort", onAbort);
        this._connecting = null;
        this._socket = socket;
        this._generation += 1;
        const generation = this._generation;
        socket.on("error", (error) => {
          this._failUdpConnection(
            new HostLinkConnectionError(`Socket communication failed: ${error.message}`, { cause: error }),
            socket,
            generation,
          );
        });
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
      const pending = this._pendingTcpResponse;
      if (pending && pending.socket === socket && pending.generation === this._generation) {
        pending.resolve(line);
      } else {
        this._failTcpConnection(
          new HostLinkProtocolError("Unsolicited or additional TCP response has no owning request"),
          socket,
        );
        return;
      }
    }
  }

  async _exchange(payload, stateChanging = false) {
    const context = this._requireActiveContext();
    if (!this._socket) {
      throw new HostLinkNotConnectedError();
    }
    const deadline = performance.now() + this.timeout;
    const socket = this._socket;
    const generation = this._generation;
    context.transaction = { deadline, socket, generation, stateChanging };
    if (this.transport === "tcp") {
      if (this._receiveBuffer.length !== 0 || this._pendingTcpResponse !== null) {
        const error = new HostLinkProtocolError("Stale TCP response data exists before send");
        this._failTcpConnection(error, socket);
        throw error;
      }
      this._emitTrace("send", payload);
      let mayHaveSent = false;
      try {
        mayHaveSent = true;
        const response = await this._writeTcpAndRead(payload, socket, generation, deadline, context.signal);
        this._emitTrace("receive", response);
        return response;
      } catch (error) {
        throw stateChanging && mayHaveSent ? this._outcomeUnknown(error) : error;
      }
    }
    this._emitTrace("send", payload);
    try {
      const responsePromise = this._writeUdpAndRead(payload, deadline, context.signal);
      const response = await responsePromise;
      this._emitTrace("receive", response);
      return response;
    } catch (error) {
      throw stateChanging ? this._outcomeUnknown(error) : error;
    }
  }

  _outcomeUnknown(error) {
    if (error instanceof HostLinkOperationOutcomeUnknownError) return error;
    const reason = error instanceof HostLinkTimeoutError
      ? "timeout"
      : error instanceof HostLinkCanceledError
        ? "canceled"
        : error instanceof HostLinkClosedError
          ? "closed"
          : error instanceof HostLinkProtocolError
            ? "invalid-response"
            : "transport";
    return new HostLinkOperationOutcomeUnknownError(
      `State-changing request may have reached the PLC before ${reason}`,
      reason,
      { cause: error },
    );
  }

  _assertDecodeWithinDeadline() {
    const context = this._exclusiveContext.getStore();
    const transaction = context && context.client === this ? context.transaction : null;
    if (!transaction || performance.now() < transaction.deadline) return;
    const error = new HostLinkTimeoutError("Host Link transaction deadline expired during response decoding");
    this._invalidateTransportGeneration(error, transaction.socket, transaction.generation);
    throw transaction.stateChanging ? this._outcomeUnknown(error) : error;
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

  _writeUdpAndRead(payload, deadline = performance.now() + this.timeout, signal = null) {
    return new Promise((resolve, reject) => {
      const socket = this._socket;
      const generation = this._generation;
      if (!socket) {
        reject(new HostLinkNotConnectedError("UDP socket is not connected"));
        return;
      }
      let settled = false;
      let sendComplete = false;
      let response = null;
      const cleanup = () => {
        clearTimeout(timeoutHandle);
        socket.off("message", onMessage);
        socket.off("error", onError);
        if (signal) signal.removeEventListener("abort", onAbort);
        if (this._activeUdpRequest === request) {
          this._activeUdpRequest = null;
        }
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
      const failAndClose = (error, closeSocket = true) => {
        if (this._socket === socket && this._generation === generation) {
          this._socket = null;
          this._generation += 1;
        }
        finish(error);
        if (closeSocket) {
          try {
            socket.close();
          } catch (_error) {
            // The socket may already be closing after an error.
          }
        }
      };
      const maybeFinish = () => {
        if (sendComplete && response !== null) finish(null, response);
      };
      const request = { socket, generation, fail: failAndClose };
      this._activeUdpRequest = request;
      const onMessage = (message) => {
        const last = message.length > 0 ? message[message.length - 1] : -1;
        if (last !== 0x0d && last !== 0x0a) {
          failAndClose(new HostLinkProtocolError("UDP response is missing the required CR/LF terminator"));
          return;
        }
        this._rxBytes += message.length;
        response = Buffer.from(message);
        maybeFinish();
      };
      const onError = (error) => failAndClose(new HostLinkConnectionError(`Socket communication failed: ${error.message}`, { cause: error }));
      const onAbort = () => failAndClose(createCanceledError(signal));
      const timeoutHandle = setTimeout(() => {
        failAndClose(new HostLinkTimeoutError("Timeout while sending request or waiting response from PLC"));
      }, Math.max(0, Math.ceil(deadline - performance.now())));
      socket.once("message", onMessage);
      socket.once("error", onError);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      try {
        socket.send(payload, (error) => {
          if (settled) return;
          if (error) {
            failAndClose(new HostLinkConnectionError(`Socket communication failed: ${error.message}`, { cause: error }));
            return;
          }
          if (this._socket !== socket || this._generation !== generation) {
            failAndClose(new HostLinkClosedError("UDP connection generation changed while sending"), false);
            return;
          }
          this._requestCount += 1;
          this._txBytes += payload.length;
          sendComplete = true;
          maybeFinish();
        });
      } catch (error) {
        failAndClose(new HostLinkConnectionError(`Socket communication failed: ${error.message}`, { cause: error }));
      }
    });
  }

  _createTcpResponseWaiter(socket, generation) {
    return new Promise((resolve, reject) => {
      const pending = {
        socket,
        generation,
        resolve: (value) => {
          clearTimeout(pending.timeoutHandle);
          if (this._pendingTcpResponse === pending) {
            this._pendingTcpResponse = null;
          }
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(pending.timeoutHandle);
          if (this._pendingTcpResponse === pending) {
            this._pendingTcpResponse = null;
          }
          reject(error);
        },
        timeoutHandle: null,
      };
      pending.timeoutHandle = setTimeout(() => {
        this._failTcpConnection(new HostLinkTimeoutError("Timeout while waiting response from PLC"), socket);
      }, this.timeout);
      this._pendingTcpResponse = pending;
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
    this._generation += 1;
    this._receiveBuffer = Buffer.alloc(0);
    const pending = this._pendingTcpResponse;
    if (pending && pending.socket === socket) {
      pending.reject(error);
    }
    if (socket && !socket.destroyed) {
      socket.destroy();
    }
    this._monitorBitCount = null;
    this._monitorWordCount = null;
  }

  _failUdpConnection(error, socket = this._socket, generation = this._generation) {
    if (socket !== this._socket || generation !== this._generation) {
      return;
    }
    this._socket = null;
    this._generation += 1;
    this._monitorBitCount = null;
    this._monitorWordCount = null;
    if (
      this._activeUdpRequest
      && this._activeUdpRequest.socket === socket
      && this._activeUdpRequest.generation === generation
    ) {
      this._activeUdpRequest.fail(error, false);
    }
    try {
      socket.close();
    } catch (_closeError) {
      // The socket may already be closing.
    }
  }

  _writeTcpAndRead(payload, socket, generation, deadline, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let writeComplete = false;
      let response = null;
      const cleanup = () => {
        clearTimeout(timeoutHandle);
        if (signal) signal.removeEventListener("abort", onAbort);
        if (this._pendingTcpResponse === pending) this._pendingTcpResponse = null;
      };
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(value);
      };
      const failAndClose = (error) => {
        finish(error);
        this._failTcpConnection(error, socket);
      };
      const maybeFinish = () => {
        if (writeComplete && response !== null) finish(null, response);
      };
      const onAbort = () => failAndClose(createCanceledError(signal));
      const pending = {
        socket,
        generation,
        resolve: (line) => {
          response = Buffer.from(line);
          maybeFinish();
        },
        reject: (error) => finish(error),
      };
      this._pendingTcpResponse = pending;
      const timeoutHandle = setTimeout(
        () => failAndClose(new HostLinkTimeoutError("Timeout while sending request or waiting response from PLC")),
        Math.max(0, Math.ceil(deadline - performance.now())),
      );
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      try {
        socket.write(payload, (error) => {
          if (settled) return;
          if (error) {
            const wrapped = new HostLinkConnectionError(`Socket communication failed: ${error.message}`, { cause: error });
            failAndClose(wrapped);
            return;
          }
          if (this._socket !== socket || this._generation !== generation) {
            finish(new HostLinkClosedError("TCP connection changed while the request was being sent"));
            return;
          }
          this._requestCount += 1;
          this._txBytes += payload.length;
          writeComplete = true;
          maybeFinish();
        });
      } catch (error) {
        failAndClose(new HostLinkConnectionError(`Socket communication failed: ${error.message}`, { cause: error }));
      }
    });
  }

  _readTcpLine() {
    if (!this._socket) {
      throw new HostLinkNotConnectedError("TCP socket is not connected");
    }
    if (this._pendingTcpResponse !== null) {
      throw new HostLinkProtocolError("A TCP response already has an owning request");
    }
    return this._createTcpResponseWaiter(this._socket, this._generation);
  }

  _invalidateAfterProtocolError(error, socket = this._socket, generation = this._generation) {
    if (!socket) {
      return;
    }
    if (this.transport === "tcp") {
      if (socket === this._socket && generation === this._generation) {
        this._failTcpConnection(error, socket);
      }
      return;
    }
    this._failUdpConnection(error, socket, generation);
  }

  _invalidateTransportGeneration(error, socket, generation) {
    if (this.transport === "tcp") {
      if (socket === this._socket && generation === this._generation) {
        this._failTcpConnection(error, socket);
      }
      return;
    }
    this._failUdpConnection(error, socket, generation);
  }
}

async function openAndConnect(options, operationOptions) {
  const client = new HostLinkClient(options);
  try {
    await client.connect(operationOptions);
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
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
  if (typeof value === "boolean") return value;
  throw new HostLinkProtocolError(`BIT value must be a Boolean, got '${String(value)}'`);
}

function normalizeOperationOptions(value, operation) {
  if (value === undefined) return Object.freeze({ signal: null });
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValueError(`${operation} options must be an object when provided`);
  }
  for (const key of Object.keys(value)) {
    if (key !== "signal") throw new ValueError(`${operation} options contain unsupported key '${key}'`);
  }
  const signal = value.signal === undefined ? null : value.signal;
  if (
    signal !== null
    && (
      typeof signal !== "object"
      || typeof signal.aborted !== "boolean"
      || typeof signal.addEventListener !== "function"
      || typeof signal.removeEventListener !== "function"
    )
  ) {
    throw new ValueError(`${operation} signal must be an AbortSignal`);
  }
  return Object.freeze({ signal });
}

function takeTrailingOperationOptions(values, operation) {
  if (values.length === 0) return normalizeOperationOptions(undefined, operation);
  const candidate = values[values.length - 1];
  if (
    candidate !== null
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && Object.keys(candidate).every((key) => key === "signal")
  ) {
    values.pop();
    return normalizeOperationOptions(candidate, operation);
  }
  return normalizeOperationOptions(undefined, operation);
}

function createCanceledError(signal) {
  if (signal && signal.reason instanceof HostLinkClosedError) return signal.reason;
  return new HostLinkCanceledError("Host Link operation was canceled by the caller", {
    cause: signal && signal.reason instanceof Error ? signal.reason : undefined,
  });
}

function combineAbortSignals(callerSignal, lifecycleSignal) {
  const controller = new AbortController();
  const signals = [callerSignal, lifecycleSignal].filter(Boolean);
  const listeners = [];
  const forward = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  for (const signal of signals) {
    if (signal.aborted) {
      forward(signal);
      break;
    }
    const listener = () => forward(signal);
    signal.addEventListener("abort", listener, { once: true });
    listeners.push([signal, listener]);
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
    },
  };
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
