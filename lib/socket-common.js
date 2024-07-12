const nodeNetModule = require("node:net");

const constants = require("./constants.js");
const errors = require("./errors.js");
const errnoCodes = constants.errno;

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

    if (options.sctp) {

        const { errno: errnoSackInfo } = native.setsockopt_sack_info({
            fd,
            sack_assoc_id: constants.SCTP_ALL_ASSOC,
            sack_delay: options.sctp.sack_delay || 0,
            sack_freq: options.sctp.sack_freq || 0,
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
