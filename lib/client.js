const nodeNetModule = require("node:net");
const nodeStreamModule = require("node:stream");
const sockaddrTranscoder = require("./sockaddr.js");
const { createSocketWithOptions } = require("./socket-common.js");
const socketDuplexFactory = require("./socket-duplex.js");
const constants = require("./constants.js");
const errors = require("./errors.js");
const errnoCodes = constants.errno;

const determineAddressFamily = ({ address }) => {
    if (nodeNetModule.isIPv4(address)) {
        return "IPv4";
    }

    if (nodeNetModule.isIPv6(address)) {
        return "IPv6";
    }

    throw Error("invalid address");
};

const createErrorDuplex = ({ error }) => {
    const duplex = new nodeStreamModule.Duplex({
        read() { },
        write() { }
    });

    process.nextTick(() => {
        duplex.emit("error", error);
    });

    return duplex;
};

const initiateConnect = ({ native, sockfd, remoteSockaddr }) => {
    const { errno: connectErrno } = native.connect({
        fd: sockfd,
        sockaddr: remoteSockaddr
    });

    const connectOk = [
        errnoCodes.NO_ERROR,
        errnoCodes.EINPROGRESS,
        errnoCodes.EAGAIN
    ].indexOf(connectErrno) >= 0;

    if (!connectOk) {
        return errors.createErrorFromErrno({
            operation: "connect()",
            errno: connectErrno
        });
    }

    return { error: undefined };
}

const connect = ({ native, options }) => {
    const host = options.host;
    const port = options.port;

    if (host === undefined) {
        throw Error("host is required");
    }

    if (port === undefined) {
        throw Error("port is required");
    }

    const { error: socketError, fd: sockfd } = createSocketWithOptions({ native, options });

    if (socketError !== undefined) {
        return createErrorDuplex({ error: socketError });
    }

    const remoteSockaddr = sockaddrTranscoder.format({
        family: determineAddressFamily({ address: host }),
        address: host,
        port
    });

    const { error: connectError } = initiateConnect({ native, sockfd, remoteSockaddr });
    if (connectError !== undefined) {
        return createErrorDuplex({ error: connectError });
    }

    const duplex = socketDuplexFactory.create({
        fd: sockfd,
        connected: false,
        remoteSockaddr
    });

    return duplex;
};

module.exports = {
    connect
};
