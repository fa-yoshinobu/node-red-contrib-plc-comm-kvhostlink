"use strict";

const { HostLinkError, HostLinkProtocolError } = require("./errors");
const iconv = require("iconv-lite");

const CR = Buffer.from("\r", "ascii");
const LF = Buffer.from("\n", "ascii");
const ERROR_RE = /^E[0-9]$/;

function buildFrame(body, options = {}) {
  const payload = Buffer.from(String(body || "").trim(), "ascii");
  return options.appendLf ? Buffer.concat([payload, CR, LF]) : Buffer.concat([payload, CR]);
}

function decodeResponse(raw) {
  if (!raw || raw.length === 0) {
    throw new HostLinkProtocolError("Empty response");
  }
  const text = Buffer.from(raw).toString("ascii").replace(/[\r\n]+$/g, "");
  if (!text) {
    throw new HostLinkProtocolError(`Malformed response frame: ${raw}`);
  }
  return text;
}

function decodeCommentResponse(raw) {
  if (!raw || raw.length === 0) {
    throw new HostLinkProtocolError("Empty response");
  }
  let end = raw.length;
  while (end > 0 && (raw[end - 1] === 0x0d || raw[end - 1] === 0x0a)) {
    end -= 1;
  }
  if (end === 0) {
    throw new HostLinkProtocolError(`Malformed response frame: ${raw}`);
  }
  const payload = raw.subarray(0, end);

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
  LF,
  buildFrame,
  decodeCommentResponse,
  decodeResponse,
  ensureSuccess,
  splitDataTokens,
  parseScalarToken,
  parseDataTokens,
};
