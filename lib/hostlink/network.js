"use strict";

const dns = require("node:dns");
const net = require("node:net");

const {
  HostLinkCanceledError,
  HostLinkClosedError,
  HostLinkConnectionError,
  HostLinkTimeoutError,
  ValueError,
} = require("./errors");

function normalizeIpv4Host(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValueError("host is required and must be an IPv4 address or hostname");
  }
  const normalized = value.trim();
  const literalText = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
  const family = net.isIP(literalText);
  if (family === 4 && literalText !== normalized) {
    throw new ValueError("host must use an IPv4 address without brackets");
  }
  if (family === 6) {
    throw new ValueError("host must be an IPv4 address or a hostname that resolves to IPv4; IPv6 is unsupported");
  }
  return normalized;
}

function resolveIpv4(host, deadline, signal = null) {
  if (net.isIPv4(host)) return Promise.resolve(host);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeoutHandle);
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const onAbort = () => finish(
      signal && signal.reason instanceof HostLinkClosedError
        ? signal.reason
        : new HostLinkCanceledError("Host Link operation was canceled while resolving IPv4", {
          cause: signal && signal.reason instanceof Error ? signal.reason : undefined,
        }),
    );
    const remaining = Math.max(0, Math.ceil(deadline - performance.now()));
    const timeoutHandle = setTimeout(() => {
      finish(new HostLinkTimeoutError(`Connection timed out while resolving '${host}' to IPv4`));
    }, remaining);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    dns.lookup(host, { family: 4, all: true, verbatim: true }, (error, addresses) => {
      if (settled) return;
      if (error) {
        finish(new HostLinkConnectionError(`Failed to resolve Host Link host '${host}' to IPv4: ${error.message}`, { cause: error }));
        return;
      }
      const first = Array.isArray(addresses)
        ? addresses.find((entry) => entry && entry.family === 4 && net.isIPv4(entry.address))
        : null;
      if (!first) {
        finish(new HostLinkConnectionError(`Host did not resolve to an IPv4 address: ${host}`));
        return;
      }
      finish(null, first.address);
    });
  });
}

module.exports = { normalizeIpv4Host, resolveIpv4 };
