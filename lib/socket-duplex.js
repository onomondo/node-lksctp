const native = require("./native.js");
const nodeEventsModule = require("node:events");
const nodeNetModule = require("node:net");
const nodeStreamModule = require("node:stream");
const assert = require("node:assert");

const sockaddrTranscoder = require("./sockaddr.js");
const pollerFactory = require("./poller.js");
const constants = require("./constants.js");
const errors = require("./errors.js");

const errnoCodes = constants.errno;

const MAX_REASONABLE_PACKET_SIZE = 128 * 1024;

const warnWithStackTrace = ({ message }) => {
    console.warn(message);
    console.trace();
};

const create = ({
    fd: providedFd,
    connected: initiallyConnected,
    remoteSockaddr,
    maxPacketSize = MAX_REASONABLE_PACKET_SIZE,
    maxReceivePacketsPerTurn = 20,
    maxSendPacketsPerTurn = 20
}) => {

    // max packet size depends on PMTU
    const receiveBuffer = Buffer.alloc(maxPacketSize);
    let readRequested = false;
    let mayPushData = false;
    let remoteEnded = false;
    let localEnded = false;
    let finalCallback = undefined;
    let errored = false;
    let fd = providedFd;

    const parsedRemoteSockaddr = sockaddrTranscoder.parse({ sockaddr: remoteSockaddr });

    let connected = initiallyConnected;

    let sendQueue = [];

    const stopAndClose = () => {
        pollHandle.close();

        if (fd !== undefined) {
            native.close_fd({ fd });
            fd = undefined;
        }
    };

    const raiseErrorAndClose = ({ error }) => {
        stopAndClose();
        errored = true;
        duplex.destroy(error);
    };

    const pollHandle = pollerFactory.create({
        fd,

        callback: ({ status, events }) => {

            const errno = -status;

            if (errno !== errnoCodes.NO_ERROR) {
                if (!connected) {

                    // for some reasone, libuv gives use errno 9
                    // if connect failed

                    // in order to handle this, we will check
                    // the socket error

                    handleConnect();
                    return;
                }

                raiseErrorAndClose({
                    error: errors.createErrorFromErrno({
                        operation: "poll()",
                        errno
                    })
                });
                return;
            }

            // console.log({ status });
            // console.log("poller", { events });

            if (events.readable) {
                handleReadable();
            }

            if (events.writable) {
                handleWritable();
            }
        }
    });

    const handleReadable = () => {
        tryReceiveNext();
    };

    const handleConnect = () => {
        const result = native.get_socket_error({ fd });

        if (result.errno !== errnoCodes.NO_ERROR) {
            raiseErrorAndClose({
                error: errors.createErrorFromErrno({
                    operation: "get_socket_error()",
                    errno: result.errno
                })
            });
            return;
        }

        if (result.socketError !== errnoCodes.NO_ERROR) {
            raiseErrorAndClose({
                error: errors.createErrorFromErrno({
                    operation: "connect()",
                    errno: result.socketError
                })
            });
            return;
        }

        connected = true;
        updatePollEvents();

        duplex.emit("connect");
    };

    const trySendNext = () => {
        if (errored) {
            return;
        }

        if (!connected) {
            // do not send anything if not connected
            return;
        }

        if (sendQueue.length === 0) {

            if (localEnded) {

                if (finalCallback !== undefined) {
                    stopAndClose();

                    if (!remoteEnded) {
                        pushAndResetReadRequested({ data: null });
                        remoteEnded = true;
                    }

                    finalCallback();
                    finalCallback = undefined;
                }
            }

            return;
        }

        let packetsSent = 0;

        while (sendQueue.length > 0 && packetsSent < maxSendPacketsPerTurn) {

            const next = sendQueue[0];

            const { messageToSend, callback } = next;

            // console.log({ sendQueueLength: sendQueue.length });
            const result = native.sctp_sendmsg({
                fd,
                ...messageToSend
            });

            if (result.errno !== errnoCodes.NO_ERROR) {
                if (result.errno === errnoCodes.EAGAIN) {
                    return;
                }

                raiseErrorAndClose({
                    error: errors.createErrorFromErrno({
                        operation: "sctp_sendmsg()",
                        errno: result.errno
                    })
                });
                return;
            }

            packetsSent += 1;

            sendQueue = sendQueue.slice(1);
            callback();
        }

        if (sendQueue.length === 0) {
            // send queue is now empty,
            // maybe adjust event mask
            updatePollEvents();
        }
    };

    const handleWritable = () => {
        if (!connected) {
            handleConnect();
        }

        trySendNext();
    };

    const updatePollEvents = () => {
        if (fd === undefined) {
            warnWithStackTrace({ message: "updatePollEvents called with undefined fd" });
            return;
        }

        if (errored) {
            warnWithStackTrace({ message: "updatePollEvents called after errored" });
            return;
        }

        let readable = false;
        let writable = false;

        if (readRequested) {
            readable = true;
        }

        if (!connected || sendQueue.length > 0 || localEnded) {
            writable = true;
        }

        // console.log("requesting poll", { readable, writable });

        pollHandle.update({
            events: {
                readable,
                writable
            }
        });
    };

    const pushAndResetReadRequested = ({ data }) => {
        readRequested = false;
        return duplex.push(data);
    };

    const receiveSockaddrBuffer = Buffer.alloc(64);
    const receiveInfoBuffer = Buffer.alloc(64);

    const tryReceiveNext = () => {
        if (errored) {
            warnWithStackTrace({ message: "tryReceiveNext called after errored" });
            return;
        }

        if (remoteEnded) {
            warnWithStackTrace({ message: "tryReceiveNext called after remoteEnded" });
            return;
        }

        if (fd === undefined) {
            warnWithStackTrace({ message: "tryReceiveNext called with undefined fd" });
            return;
        }

        const buffer = receiveBuffer;
        let packetsReceived = 0;

        while (fd !== undefined && mayPushData && packetsReceived < maxReceivePacketsPerTurn) {

            const result = native.sctp_recvmsg({
                fd,
                messageBuffer: receiveBuffer,
                infoBuffer: receiveInfoBuffer,
                sockaddr: receiveSockaddrBuffer
            });

            // console.log("tryReceiveNext", { fd, result });

            if (result.errno !== errnoCodes.NO_ERROR) {
                if (result.errno === errnoCodes.EAGAIN) {
                    updatePollEvents();
                    return;
                }

                raiseErrorAndClose({
                    error: errors.createErrorFromErrno({
                        operation: "sctp_recvmsg()",
                        errno: result.errno
                    })
                });
                return;
            }

            if (result.bytesReceived === 0) {
                remoteEnded = true;
                pushAndResetReadRequested({ data: null });

                // socket will always be closed by send code
                updatePollEvents();
                return;
            }

            packetsReceived += 1;

            if ((result.flags & constants.MSG_EOR) === 0) {
                throw Error("missing MSG_EOR, receive buffer probably too small, not implemented");
            }

            // make sure to copy bytes
            const chunk = Buffer.from(Uint8Array.prototype.slice.call(buffer, 0, result.bytesReceived));
            const takesMore = pushAndResetReadRequested({ data: chunk });

            mayPushData = takesMore;
        }

        if (!mayPushData) {
            updatePollEvents();
        }
    };

    const duplex = new nodeStreamModule.Duplex({
        allowHalfOpen: false,

        read: () => {

            if (remoteEnded) {
                throw Error("BUG: read() called after ended");
            }

            mayPushData = true;
            readRequested = true;

            // tryReceiveNext();
            updatePollEvents();
        },

        write: (chunk, encoding, callback) => {
            const messageToSend = {
                message: chunk,

                sockaddr: remoteSockaddr,

                ppid: chunk.ppid || 0,
                flags: 0,
                streamNumber: 0,
                timeToLive: 0,
                context: 0
            };

            if (!connected || sendQueue.length > 0) {
                // push due to performance reasons
                // immutable would be nicer though
                sendQueue.push({
                    messageToSend,
                    callback
                });

                return;
            }

            // if we don't have any messages queued, try to send it right away
            // console.log({ sendQueueLength: sendQueue.length });
            const result = native.sctp_sendmsg({
                fd,
                ...messageToSend
            });

            if (result.errno !== errnoCodes.NO_ERROR) {

                if (result.errno === errnoCodes.EAGAIN) {
                    sendQueue.push({
                        messageToSend,
                        callback
                    });

                    updatePollEvents();

                    return;
                }

                raiseErrorAndClose({
                    error: errors.createErrorFromErrno({
                        operation: "sctp_sendmsg()",
                        errno: result.errno
                    })
                });
                return;
            }

            if (result.bytesSent !== chunk.length) {
                raiseErrorAndClose({
                    error: Error("not all bytes sent")
                });
                return;
            }

            callback();

            // console.log("sctp_sendmsg", { result });
        },

        final: (callback) => {
            localEnded = true;
            finalCallback = callback;

            trySendNext();
        },

        destroy: (err, callback) => {
            if (fd !== undefined) {
                stopAndClose();
            }
            callback(err);
        }
    });

    duplex.remoteFamily = parsedRemoteSockaddr.family;
    duplex.remoteAddress = parsedRemoteSockaddr.address;
    duplex.remotePort = parsedRemoteSockaddr.port;

    return duplex;
};

module.exports = {
    create
};
