"use strict";

const { HostLinkError, HostLinkProtocolError } = require("./errors");
const { decodeCommentPayload } = require("./comment-codec");

const CR = Buffer.from("\r", "ascii");
const ERROR_RE = /^E[0-9]$/;
const MAX_FRAME_BYTES = 65536;

function buildFrame(body) {
  if (typeof body !== "string") {
    throw new HostLinkProtocolError("Host Link request body must be a string");
  }
  const normalized = body.trim();
  if (!normalized) {
    throw new HostLinkProtocolError("Host Link request body must not be empty");
  }
  if (/[^\x00-\x7F]/.test(normalized)) {
    throw new HostLinkProtocolError("Host Link request body must contain ASCII characters only");
  }
  if (Buffer.byteLength(normalized, "ascii") + CR.length > MAX_FRAME_BYTES) {
    throw new HostLinkProtocolError(`Host Link request frame exceeds ${MAX_FRAME_BYTES} bytes`);
  }
  const payload = Buffer.from(normalized, "ascii");
  return Buffer.concat([payload, CR]);
}

function trimFrameTerminators(raw) {
  const buffer = Buffer.from(raw);
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1] === 0x0d || buffer[end - 1] === 0x0a)) {
    end -= 1;
  }
  return buffer.subarray(0, end);
}

function ensureAsciiPayload(payload) {
  for (let i = 0; i < payload.length; i += 1) {
    const byte = payload[i];
    if (byte > 0x7f) {
      throw new HostLinkProtocolError(
        `Non-ASCII response byte 0x${byte.toString(16).toUpperCase().padStart(2, "0")} at offset ${i}`
      );
    }
  }
}

function decodeResponse(raw) {
  if (!raw || raw.length === 0) {
    throw new HostLinkProtocolError("Empty response");
  }
  const payload = trimFrameTerminators(raw);
  if (payload.length === 0) {
    throw new HostLinkProtocolError(`Malformed response frame: ${raw}`);
  }
  ensureAsciiPayload(payload);
  const text = payload.toString("ascii");
  return text;
}

function decodeCommentBytes(raw) {
  if (!raw || raw.length === 0) {
    throw new HostLinkProtocolError("Empty response");
  }
  const payload = trimFrameTerminators(raw);
  if (payload.length === 0) {
    throw new HostLinkProtocolError(`Malformed response frame: ${raw}`);
  }
  return Buffer.from(payload);
}

function decodeCommentResponse(raw, encoding) {
  return decodeCommentPayload(decodeCommentBytes(raw), encoding);
}

function ensureSuccess(responseText) {
  const errorCode = Buffer.isBuffer(responseText) ? responseText.toString("ascii") : responseText;
  if (ERROR_RE.test(errorCode)) {
    throw new HostLinkError(errorCode, errorCode);
  }
  return responseText;
}

function splitDataTokens(responseText) {
  return String(responseText || "")
    .split(/[ ,]+/)
    .filter((token) => token !== "");
}

function parseScalarToken(token, options = {}) {
  if (options.dataFormat === ".H") {
    const text = String(token).toUpperCase();
    if (!/^[0-9A-F]{1,4}$/.test(text)) {
      throw new HostLinkProtocolError(`Invalid hexadecimal response token '${token}'`);
    }
    return text;
  }
  if ([".U", ".S", ".D", ".L"].includes(options.dataFormat)) {
    const text = String(token);
    if (!/^-?\d+$/.test(text)) {
      throw new HostLinkProtocolError(`Invalid numeric response token '${token}' for format '${options.dataFormat}'`);
    }
    const parsed = Number(text);
    if (!Number.isSafeInteger(parsed)) {
      throw new HostLinkProtocolError(`Numeric response token is outside the safe integer range: '${token}'`);
    }
    const limits = {
      ".U": [0, 0xffff],
      ".S": [-0x8000, 0x7fff],
      ".D": [0, 0xffffffff],
      ".L": [-0x80000000, 0x7fffffff],
    }[options.dataFormat];
    if (parsed < limits[0] || parsed > limits[1]) {
      throw new HostLinkProtocolError(`Numeric response token '${token}' is outside the range for format '${options.dataFormat}'`);
    }
    return parsed;
  }
  if (token === "1" || token === "ON") {
    return 1;
  }
  if (token === "0" || token === "OFF") {
    return 0;
  }
  throw new HostLinkProtocolError(`Invalid direct bit response token '${token}'; expected 0/1 or OFF/ON`);
}

function parseDataTokens(tokens, options = {}) {
  return Array.from(tokens || [], (token) => parseScalarToken(token, options));
}

module.exports = {
  CR,
  buildFrame,
  decodeCommentBytes,
  decodeCommentResponse,
  decodeResponse,
  ensureSuccess,
  splitDataTokens,
  parseScalarToken,
  parseDataTokens,
};
