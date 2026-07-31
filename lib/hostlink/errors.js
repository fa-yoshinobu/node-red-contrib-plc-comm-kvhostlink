"use strict";

class HostLinkBaseError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

class HostLinkProtocolError extends HostLinkBaseError {}

class HostLinkConnectionError extends HostLinkBaseError {}

class HostLinkTimeoutError extends HostLinkConnectionError {
  constructor(message, options = {}) {
    super(message, options);
    this.code = "HOSTLINK_TIMEOUT";
  }
}

class HostLinkNotConnectedError extends HostLinkConnectionError {
  constructor(message = "Client is not connected; call connect() before sending a command") {
    super(message);
    this.code = "HOSTLINK_NOT_CONNECTED";
  }
}

class HostLinkClosedError extends HostLinkConnectionError {
  constructor(message = "Connection closed") {
    super(message);
    this.code = "HOSTLINK_CLOSED";
  }
}

class HostLinkCanceledError extends HostLinkBaseError {
  constructor(message = "Host Link operation was canceled by the caller", options = {}) {
    super(message, options);
    this.code = "HOSTLINK_CANCELED";
  }
}

class HostLinkOperationOutcomeUnknownError extends HostLinkBaseError {
  constructor(message, reason, options = {}) {
    super(message, options);
    this.code = "HOSTLINK_OPERATION_OUTCOME_UNKNOWN";
    this.reason = reason;
  }
}

class HostLinkError extends HostLinkBaseError {
  constructor(code, response) {
    super(`PLC returned Host Link error ${code}`);
    this.code = code;
    this.response = response;
  }
}

class ValueError extends HostLinkBaseError {}

module.exports = {
  HostLinkBaseError,
  HostLinkProtocolError,
  HostLinkConnectionError,
  HostLinkTimeoutError,
  HostLinkNotConnectedError,
  HostLinkClosedError,
  HostLinkCanceledError,
  HostLinkOperationOutcomeUnknownError,
  HostLinkError,
  ValueError,
};
