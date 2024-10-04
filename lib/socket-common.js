const nodeNetModule = require("node:net");

const sockaddrTranscoder = require("./sockaddr.js");
const constants = require("./constants.js");
const errors = require("./errors.js");
const errnoCodes = constants.errno;

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
  getCurrentLocalPrimaryAddress,
  getLocalAddresses,
  getCurrentRemotePrimaryAddress,
  getRemoteAddresses,
  initiallyBindLocalAddresses,
  retrievePeerAddressInfo
};
