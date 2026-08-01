"use strict";

const { TextDecoder } = require("node:util");
const { HostLinkProtocolError, ValueError } = require("./errors");

const COMMENT_ENCODINGS = Object.freeze(["utf8", "cp932"]);

function requireCommentEncoding(value, label = "encoding") {
  if (typeof value !== "string" || !COMMENT_ENCODINGS.includes(value)) {
    throw new ValueError(`${label} is required and must be one of: ${COMMENT_ENCODINGS.join(", ")}`);
  }
  return value;
}

function decodeCommentPayload(payload, encoding) {
  const normalized = requireCommentEncoding(encoding);
  try {
    if (normalized === "utf8") {
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(payload);
    }
    return decodeCp932(payload);
  } catch (error) {
    throw new HostLinkProtocolError(`RDC comment payload is not valid ${normalized}`, { cause: error });
  }
}

function decodeCp932(payload) {
  const decoder = new TextDecoder("shift_jis", { fatal: true, ignoreBOM: true });
  const decoded = [];

  for (let offset = 0; offset < payload.length;) {
    const lead = payload[offset];
    if (lead <= 0x7f) {
      decoded.push(String.fromCharCode(lead));
      offset += 1;
      continue;
    }
    if (lead >= 0xa1 && lead <= 0xdf) {
      decoded.push(decoder.decode(payload.subarray(offset, offset + 1)));
      offset += 1;
      continue;
    }
    if ((lead >= 0x81 && lead <= 0x9f) || (lead >= 0xe0 && lead <= 0xfc)) {
      if (offset + 1 >= payload.length) {
        throw new TypeError(`Truncated CP932 lead byte 0x${lead.toString(16)}`);
      }
      const trail = payload[offset + 1];
      if (!((trail >= 0x40 && trail <= 0x7e) || (trail >= 0x80 && trail <= 0xfc))) {
        throw new TypeError(`Invalid CP932 trail byte 0x${trail.toString(16)}`);
      }
      decoded.push(decoder.decode(payload.subarray(offset, offset + 2)));
      offset += 2;
      continue;
    }
    throw new TypeError(`Invalid CP932 single byte 0x${lead.toString(16)}`);
  }

  return decoded.join("");
}

module.exports = { COMMENT_ENCODINGS, decodeCommentPayload, requireCommentEncoding };
