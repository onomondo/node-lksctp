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

const createSocketWithOptions = ({ native, options }) => {
  const { errno: errnoSocket, fd } = native.create_socket();
  if (errnoSocket !== errnoCodes.NO_ERROR) {
    return {
      error: errors.createErrorFromErrno({
        operation: "socket()",
        errno: errnoSocket
      })
    };
  }

  const { error: errorOptions } = maybeApplySctpOptions({ native, sockfd: fd, options });
  if (errorOptions) {
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

const getLocalAddress = ({ native, fd }) => {
  const sockaddrBuffer = Buffer.alloc(64);
  const { errno } = native.getsockname({ fd, sockaddr: sockaddrBuffer });
  if (errno !== errnoCodes.NO_ERROR) {
    throw errors.createErrorFromErrno({ operation: "getsockname()", errno });
  }

  return sockaddrTranscoder.parse({ sockaddr: sockaddrBuffer });
};

const getRemoteAddress = ({ native, fd }) => {
  const sockaddrBuffer = Buffer.alloc(64);
  const { errno } = native.getpeername({ fd, sockaddr: sockaddrBuffer });
  if (errno !== errnoCodes.NO_ERROR) {
    throw errors.createErrorFromErrno({ operation: "getsockname()", errno });
  }

  return sockaddrTranscoder.parse({ sockaddr: sockaddrBuffer });
};

module.exports = {
  createSocketWithOptions,
  determineAddressFamily,
  getLocalAddress,
  getRemoteAddress
};
