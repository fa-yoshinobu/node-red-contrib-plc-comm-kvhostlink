"use strict";

const { HostLinkError, HostLinkProtocolError } = require("./errors");
const iconv = require("iconv-lite");

const CR = Buffer.from("\r", "ascii");
const ERROR_RE = /^E[0-9]$/;

function buildFrame(body) {
  const payload = Buffer.from(String(body || "").trim(), "ascii");
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

function decodeCommentResponse(raw) {
  if (!raw || raw.length === 0) {
    throw new HostLinkProtocolError("Empty response");
  }
  const payload = trimFrameTerminators(raw);
  if (payload.length === 0) {
    throw new HostLinkProtocolError(`Malformed response frame: ${raw}`);
  }

  // Fast-path for ASCII only.
  let isAscii = true;
  for (let i = 0; i < payload.length; i += 1) {
    if (payload[i] > 0x7f) {
      isAscii = false;
      break;
    }
  }
  if (isAscii) {
    return payload.toString("ascii");
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch (_error) {
  }
  return iconv.decode(payload, "shift_jis");
}

function ensureSuccess(responseText) {
  if (ERROR_RE.test(responseText)) {
    throw new HostLinkError(responseText, responseText);
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
    return String(token).toUpperCase();
  }
  const parsed = Number.parseInt(token, 10);
  return Number.isNaN(parsed) ? token : parsed;
}

function parseDataTokens(tokens, options = {}) {
  return Array.from(tokens || [], (token) => parseScalarToken(token, options));
}

module.exports = {
  CR,
  buildFrame,
  decodeCommentResponse,
  decodeResponse,
  ensureSuccess,
  splitDataTokens,
  parseScalarToken,
  parseDataTokens,
};
