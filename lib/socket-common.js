const nodeNetModule = require("node:net");

const constants = require("./constants.js");
const errors = require("./errors.js");
const errnoCodes = constants.errno;

const maybeApplySctpOptions = ({ native, sockfd, sctpOptions }) => {
  if (sctpOptions) {

    const { errno: errnoSackInfo } = native.setsockopt_sack_info({
      fd: sockfd,
      sack_assoc_id: constants.SCTP_ALL_ASSOC,
      sack_delay: sctpOptions.sack_delay || 0,
      sack_freq: sctpOptions.sack_freq || 0,
    });

    if (errnoSackInfo !== errnoCodes.NO_ERROR) {
      return {
        error: errors.createErrorFromErrno({
          operation: "setsockopt()",
          errno: errnoSackInfo
        })
      };
    }
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

  const { error: errorOptions } = maybeApplySctpOptions({ native, sockfd: fd, sctpOptions: options.sctp });
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
