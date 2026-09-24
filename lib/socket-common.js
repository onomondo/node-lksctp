const nodeNetModule = require("node:net");

const sockaddrTranscoder = require("./sockaddr.js");
const constants = require("./constants.js");
const errors = require("./errors.js");
const errnoCodes = constants.errno;

const MAXIMUM_PORT = 65535;

// undefined and null both mean "not given", as they do in net.
const readOptional = ({ value }) => {
  return value ?? undefined;
};

// isIP() says yes to an IPv6 address, but the socket is AF_INET and sockaddr
// formatting has no IPv6 branch, so such an address only fails deep inside
// bindx() or connectx() — after the fd already exists. Name it up front, where
// every other bad option is named.
const refuseIPv6 = ({ address }) => {
  if (nodeNetModule.isIPv6(address)) {
    throw Error(`IPv6 is not implemented yet, cannot bind ${address}`);
  }
};

const validateAddress = ({ address, message }) => {
  refuseIPv6({ address });

  if (!nodeNetModule.isIP(address)) {
    throw Error(message);
  }
};

const parseAddressList = ({ list, listName }) => {
  if (!Array.isArray(list)) {
    throw Error(`${listName} must be an array`);
  }

  if (list.length === 0) {
    throw Error(`${listName} must have at least one element`);
  }

  list.forEach((address) => {
    validateAddress({
      address,
      message: `${listName} must be an array of valid IP addresses`
    });
  });

  return list;
};

// host/localAddresses in listen(), host/remoteAddresses and
// localAddress/localAddresses in connect(): one address or a list of them,
// never both, every entry an IP address this binding can use. The option names
// differ, the rules do not. Returns undefined when neither is given — a caller
// that requires one says so itself.
const parseAddressPair = ({ single: singleOption, list: listOption, singleName, listName }) => {
  const single = readOptional({ value: singleOption });
  const list = readOptional({ value: listOption });

  if (single !== undefined && list !== undefined) {
    throw Error(`${singleName} and ${listName} are mutually exclusive`);
  }

  if (single !== undefined) {
    validateAddress({
      address: single,
      message: `${singleName} must be a valid IP address`
    });

    return [single];
  }

  if (list !== undefined) {
    return parseAddressList({ list, listName });
  }

  return undefined;
};

const portIsAbsent = ({ port }) => {
  return port === undefined || port === null;
};

// A port is a number or a non-blank numeric string in net, and >>> 0 also
// catches NaN, a negative port and a fractional one.
const portIsValid = ({ port }) => {
  const given = typeof port === "number" ||
    (typeof port === "string" && port.trim().length > 0);

  return given && Number(port) === (Number(port) >>> 0);
};

const badPortMessage = ({ name, required }) => {
  return required
    ? `${name} is required and must be a number`
    : `${name} must be a number`;
};

// net takes a port as a number or as a numeric string and refuses everything
// else, null included (validatePort in node's internal/validators). We follow
// it, and hand the transport a real number: isNaN() alone let `null` through as
// port 0 and let 99999 reach Buffer#writeUInt16BE, which reports a range error
// naming "value" and no option at all.
const parsePort = ({ port, name, required }) => {
  if (!required && portIsAbsent({ port })) {
    return undefined;
  }

  if (!portIsValid({ port })) {
    throw Error(badPortMessage({ name, required }));
  }

  const parsedPort = Number(port);

  if (parsedPort > MAXIMUM_PORT) {
    throw Error(`${name} must be between 0 and ${MAXIMUM_PORT}`);
  }

  return parsedPort;
};

const maybeApplySctpSackOptions = ({ native, sockfd, sack }) => {
  if (sack === undefined) {
    return { error: undefined };
  }

  const { errno: errnoSackInfo } = native.setsockopt_sack_info({
    fd: sockfd,
    sack_assoc_id: constants.SCTP_ALL_ASSOC,
    sack_delay: sack.delay || 0,
    sack_freq: sack.freq || 0,
  });

  if (errnoSackInfo !== errnoCodes.NO_ERROR) {
    return {
      error: errors.createErrorFromErrno({
        operation: "setsockopt()",
        errno: errnoSackInfo
      })
    };
  }

  return { error: undefined };
};

const maybeApplySctpStreamsOptions = ({ native, sockfd, maximumInputStreams, outputStreams }) => {
  if (maximumInputStreams === undefined && outputStreams === undefined) {
    return { error: undefined };
  }

  const { errno } = native.setsockopt_sctp_initmsg({
    fd: sockfd,
    sinit_num_ostreams: outputStreams || 0,
    sinit_max_instreams: maximumInputStreams || 0,
    sinit_max_attempts: 0,
    sinit_max_init_timeo: 0
  });

  return { errno };
};

const requestRcvinfoStruct = ({ native, sockfd }) => {
  const { errno } = native.setsockopt_sctp_recvrcvinfo({ fd: sockfd, value: 1 });
  if (errno !== errnoCodes.NO_ERROR) {
    const error = errors.createErrorFromErrno({ operation: "setsockopt()", errno });

    // we don't expect this error to happen, so we throw it
    throw error;
  }
};

const maybeApplyNoDelay = ({ native, sockfd, noDelay }) => {
  if (noDelay === undefined) {
    return { error: undefined };
  }

  if (typeof noDelay !== "boolean") {
    throw Error("noDelay must be a boolean");
  }

  const { errno } = native.setsockopt_nodelay({ fd: sockfd, value: noDelay ? 1 : 0 });
  if (errno !== errnoCodes.NO_ERROR) {
    return {
      error: errors.createErrorFromErrno({ operation: "setsockopt_nodelay()", errno })
    };
  }

  return { error: undefined };
};

const maybeApplySctpOptions = ({ native, sockfd, options }) => {
  const { error: sackError } = maybeApplySctpSackOptions({
    native,
    sockfd,
    sack: options.sack
  });

  if (sackError !== undefined) {
    return { error: sackError };
  }

  requestRcvinfoStruct({ native, sockfd });

  const { error: noDelayError } = maybeApplyNoDelay({ native, sockfd, noDelay: options.noDelay });
  if (noDelayError !== undefined) {
    return { error: noDelayError };
  }

  const { error: streamsError } = maybeApplySctpStreamsOptions({
    native,
    sockfd,
    maximumInputStreams: options.MIS,
    outputStreams: options.OS
  });

  if (streamsError !== undefined) {
    return { error: streamsError };
  }

  return { error: undefined };
};

const subscribeSctpEvents = ({ native, sockfd, events }) => {
  for (const event of events) {
    const { errno: subscribeErrno } = native.setsockopt_sctp_event({ fd: sockfd, se_type: event, se_on: 1 });
    if (subscribeErrno !== errnoCodes.NO_ERROR) {
      return {
        error: errors.createErrorFromErrno({
          operation: "setsockopt()",
          errno: subscribeErrno
        })
      };
    }
  }

  return { errno: undefined };
};

const createSocketWithOptions = ({ native, options }) => {
  const { errno: errnoSocket, fd } = native.create_socket();
  if (errnoSocket === errnoCodes.EPROTONOSUPPORT) {
    return {
      error: Error(`kernel does not support SCTP sockets`)
    };
  } else if (errnoSocket !== errnoCodes.NO_ERROR) {
    return {
      error: errors.createErrorFromErrno({
        operation: "socket()",
        errno: errnoSocket
      })
    };
  }

  const events = [
    constants.SCTP_ASSOC_CHANGE,
    constants.SCTP_PEER_ADDR_CHANGE,
    constants.SCTP_REMOTE_ERROR,
    constants.SCTP_SHUTDOWN_EVENT,
    constants.SCTP_PARTIAL_DELIVERY_EVENT,
    constants.SCTP_ADAPTATION_INDICATION,
    constants.SCTP_AUTHENTICATION_EVENT,
    constants.SCTP_SENDER_DRY_EVENT,
    constants.SCTP_STREAM_RESET_EVENT,
    constants.SCTP_ASSOC_RESET_EVENT,
    constants.SCTP_STREAM_CHANGE_EVENT,
    constants.SCTP_SEND_FAILED_EVENT
  ];

  const { error: errorSubscribe } = subscribeSctpEvents({ native, sockfd: fd, events });
  if (errorSubscribe) {
    native.close_fd({ fd });
    return { error: errorSubscribe };
  }

  const { error: errorOptions } = maybeApplySctpOptions({ native, sockfd: fd, options });
  if (errorOptions) {
    native.close_fd({ fd });
    return { error: errorOptions };
  }

  return {
    error: undefined,
    fd
  };
};

const determineAddressFamily = ({ address }) => {
  if (nodeNetModule.isIPv4(address)) {
    return "IPv4";
  }

  if (nodeNetModule.isIPv6(address)) {
    return "IPv6";
  }

  throw Error("invalid address");
};

const getCurrentLocalPrimaryAddress = ({ native, fd }) => {
  const sockaddrBuffer = Buffer.alloc(64);
  const { errno } = native.getsockname({ fd, sockaddr: sockaddrBuffer });
  if (errno !== errnoCodes.NO_ERROR) {
    throw errors.createErrorFromErrno({ operation: "getsockname()", errno });
  }

  return sockaddrTranscoder.parse({ sockaddr: sockaddrBuffer });
};

const getLocalAddresses = ({ native, fd }) => {
  const { errno, sockaddrs } = native.sctp_getladdrs({ fd });
  if (errno !== errnoCodes.NO_ERROR) {
    throw errors.createErrorFromErrno({ operation: "sctp_getladdrs()", errno });
  }

  const addresses = sockaddrs.map((sockaddr) => {
    return sockaddrTranscoder.parse({ sockaddr });
  });

  return addresses;
};

const getCurrentRemotePrimaryAddress = ({ native, fd }) => {
  const sockaddrBuffer = Buffer.alloc(64);
  const { errno } = native.getpeername({ fd, sockaddr: sockaddrBuffer });
  if (errno === errnoCodes.ENOTCONN) {
    return undefined;
  } else if (errno !== errnoCodes.NO_ERROR) {
    throw errors.createErrorFromErrno({ operation: "getpeername()", errno });
  }

  return sockaddrTranscoder.parse({ sockaddr: sockaddrBuffer });
};

const getRemoteAddresses = ({ native, fd }) => {
  const { errno, sockaddrs } = native.sctp_getpaddrs({ fd });
  if (errno === errnoCodes.ENOTCONN || errno === errnoCodes.EINVAL) {
    return undefined;
  } else if (errno !== errnoCodes.NO_ERROR) {
    throw errors.createErrorFromErrno({ operation: "sctp_getpaddrs()", errno });
  }

  const addresses = sockaddrs.map((sockaddr) => {
    return sockaddrTranscoder.parse({ sockaddr });
  });

  return addresses;
};

const bindx = ({ native, fd, localAddresses, localPort, flags }) => {
  if (localAddresses.length === 0) {
    throw Error("localAddresses must have at least one element");
  }

  let sockaddrs = [];

  localAddresses.forEach((localAddress, idx) => {
    const sockaddr = sockaddrTranscoder.format({
      family: determineAddressFamily({ address: localAddress }),
      address: localAddress,
      port: idx === 0 ? localPort : 0
    });

    sockaddrs = [
      ...sockaddrs,
      sockaddr
    ];
  });

  const { errno: bindErrno } = native.sctp_bindx({
    fd,
    sockaddrs,
    flags
  });

  const wellKnownErrnos = [
    errnoCodes.EADDRINUSE,
  ];

  if (wellKnownErrnos.includes(bindErrno)) {
    // do not include operation for well-known errors
    return {
      error: errors.createErrorFromErrno({
        errno: bindErrno
      })
    };
  } else if (bindErrno !== errnoCodes.NO_ERROR) {
    return {
      error: errors.createErrorFromErrno({
        operation: "sctp_bindx()",
        errno: bindErrno
      })
    };
  }

  return { error: undefined };
};

const initiallyBindLocalAddresses = ({ native, fd, localAddresses, localPort }) => {
  return bindx({ native, fd, localAddresses, localPort, flags: constants.SCTP_BINDX_ADD_ADDR });
};

const retrievePeerAddressInfo = ({ native, fd, peerAddress, remotePort }) => {
  const sockaddr = sockaddrTranscoder.format({
    family: determineAddressFamily({ address: peerAddress }),
    address: peerAddress,
    port: remotePort
  });

  const { errno, info } = native.getsockopt_peer_addr_info({ fd, sockaddr });
  if (errno !== errnoCodes.NO_ERROR) {
    // in order to avoid glitches, we don't throw an error here
    return undefined;
  }

  return {
    state: Number(info.spinfo_state),
    cwnd: Number(info.spinfo_cwnd),
    srtt: Number(info.spinfo_srtt),
    rto: Number(info.spinfo_rto),
    mtu: Number(info.spinfo_mtu)
  };
};

module.exports = {
  createSocketWithOptions,
  determineAddressFamily,
  parseAddressPair,
  parsePort,
  getCurrentLocalPrimaryAddress,
  getLocalAddresses,
  getCurrentRemotePrimaryAddress,
  getRemoteAddresses,
  initiallyBindLocalAddresses,
  retrievePeerAddressInfo
};
