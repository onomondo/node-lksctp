const nodeNetModule = require("node:net");

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

const maybeApplySctpOptions = ({ native, sockfd, options }) => {
  const { error: sackError } = maybeApplySctpSackOptions({
    native,
    sockfd,
    sack: options.sack
  });

  if (sackError !== undefined) {
    return { error: sackError };
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

module.exports = {
  createSocketWithOptions,
  determineAddressFamily
};
