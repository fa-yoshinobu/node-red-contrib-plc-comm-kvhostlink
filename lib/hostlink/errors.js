"use strict";

class HostLinkBaseError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

class HostLinkProtocolError extends HostLinkBaseError {}

class HostLinkConnectionError extends HostLinkBaseError {}

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
  HostLinkError,
  ValueError,
};
