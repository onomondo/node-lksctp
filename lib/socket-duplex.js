const native = require("./native.js");
const nodeEventsModule = require("node:events");
const nodeNetModule = require("node:net");
const nodeStreamModule = require("node:stream");
const assert = require("node:assert");

const sockaddrTranscoder = require("./sockaddr.js");
const pollerFactory = require("./poller.js");
const constants = require("./constants.js");
const errors = require("./errors.js");
const microtaskSchedulerFactory = require("./microtask-scheduler.js");

const errnoCodes = constants.errno;

const MAX_REASONABLE_PACKET_SIZE = 128 * 1024;

const warnWithStackTrace = ({ message }) => {
    console.warn(message);
    console.trace();
};

const assertNoReentrancy = (fn) => {
    let entered = false;

    return () => {
        if (entered) {
            throw Error("reentrant call detected");
        }

        entered = true;

        try {
            return fn();
        } finally {
            entered = false;
        }
    };
};

const create = ({
    fd: providedFd,
    connected: initiallyConnected,
    remoteSockaddr,
    maxPacketSize = MAX_REASONABLE_PACKET_SIZE,
    maxOperationsPerMacrotask = 500
}) => {

    // max packet size depends on PMTU
    const receiveBuffer = Buffer.alloc(maxPacketSize);
    let readRequested = false;
    let mayPushData = false;
    let remoteEnded = false;
    let localEnded = false;
    let finalCallback = undefined;
    let fd = providedFd;

    let destroyed = false;
    let pollErrno = undefined;

    let socketMaybeHasMore = true;
    let socketMaybeTakesMore = true;

    let scheduledNextMicrotask = undefined;
    const microtaskScheduler = microtaskSchedulerFactory.create({ maxMicrotasksPerMacrotask: maxOperationsPerMacrotask });

    const parsedRemoteSockaddr = sockaddrTranscoder.parse({ sockaddr: remoteSockaddr });

    let connected = initiallyConnected;

    let sendQueue = [];

    const raiseErrorAndClose = ({ error }) => {
        duplex.destroy(error);
    };

    let lastActionWasRead = false;

    const tryHandleConnect = () => {
        if (connected) {
            return { handeled: false };
        }

        if (socketMaybeHasMore) {

            const result = native.get_socket_error({ fd });

            if (result.errno !== errnoCodes.NO_ERROR) {
                raiseErrorAndClose({
                    error: errors.createErrorFromErrno({
                        operation: "get_socket_error()",
                        errno: result.errno
                    })
                });
                return { handeled: true };
            }

            if (result.socketError !== errnoCodes.NO_ERROR) {

                if (result.socketError === errnoCodes.ECONNREFUSED) {
                    raiseErrorAndClose({
                        error: Error("connection refused")
                    });
                    return { handeled: true };
                }

                raiseErrorAndClose({
                    error: errors.createErrorFromErrno({
                        operation: "connect()",
                        errno: result.socketError
                    })
                });
                return { handeled: true };
            }

            connected = true;
            duplex.emit("connect");

            return { handeled: true };
        }

        return { handeled: false };
    };

    const receiveSockaddrBuffer = Buffer.alloc(64);
    const receiveInfoBuffer = Buffer.alloc(64);

    const tryReceiveNext = () => {
        if (!mayPushData) {
            return { handeled: false };
        }

        if (remoteEnded) {
            return { handeled: false };
        }

        const buffer = receiveBuffer;

        const result = native.sctp_recvmsg({
            fd,
            messageBuffer: receiveBuffer,
            infoBuffer: receiveInfoBuffer,
            sockaddr: receiveSockaddrBuffer
        });

        // console.log("tryReceiveNext", { fd, result });

        if (result.errno !== errnoCodes.NO_ERROR) {
            if (result.errno === errnoCodes.EAGAIN) {
                socketMaybeHasMore = false;
                return { handeled: false };
            }

            if (result.errno === errnoCodes.ECONNRESET) {
                raiseErrorAndClose({
                    error: Error("connection reset by peer")
                });
                return { handeled: true };
            }

            raiseErrorAndClose({
                error: errors.createErrorFromErrno({
                    operation: "sctp_recvmsg()",
                    errno: result.errno
                })
            });
            return { handeled: true };
        }

        if (result.bytesReceived === 0) {
            remoteEnded = true;
            pushAndResetReadRequested({ data: null });
            return { handeled: true };
        }

        if ((result.flags & constants.MSG_EOR) === 0) {
            throw Error("missing MSG_EOR, receive buffer probably too small, not implemented");
        }

        // make sure to copy bytes
        const chunk = Buffer.from(Uint8Array.prototype.slice.call(buffer, 0, result.bytesReceived));
        const takesMore = pushAndResetReadRequested({ data: chunk });

        mayPushData = takesMore;

        return { handeled: true };
    };

    const trySendNext = () => {
        if (sendQueue.length === 0) {

            if (localEnded) {

                if (finalCallback !== undefined) {
                    finalCallback();
                    finalCallback = undefined;

                    return { handeled: true };
                }
            }

            return { handeled: false };
        }

        if (!socketMaybeTakesMore) {
            return { handeled: false };
        }

        const next = sendQueue[0];

        const { messageToSend, callback } = next;

        // console.log({ sendQueueLength: sendQueue.length });
        const result = native.sctp_sendmsg({
            fd,
            ...messageToSend
        });

        if (result.errno !== errnoCodes.NO_ERROR) {
            if (result.errno === errnoCodes.EAGAIN) {
                socketMaybeTakesMore = false;
                return { handeled: false };
            }

            if (result.errno === errnoCodes.ECONNRESET) {
                raiseErrorAndClose({
                    error: Error("connection reset by peer")
                });
                return { handeled: true };
            }

            raiseErrorAndClose({
                error: errors.createErrorFromErrno({
                    operation: "sctp_sendmsg()",
                    errno: result.errno
                })
            });
            return { handeled: true };
        }

        sendQueue = sendQueue.slice(1);
        callback();

        return { handeled: true };
    };

    const next = assertNoReentrancy(() => {
        if (destroyed) {
            return;
        }

        if (pollErrno !== undefined) {
            // libuv gives an error on poll, strangely EBADF
            // we need to check for a socket error

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

                if (result.socketError === errnoCodes.ECONNRESET) {
                    raiseErrorAndClose({
                        error: Error("connection reset by peer")
                    });
                    return;
                }

                raiseErrorAndClose({
                    error: errors.createErrorFromErrno({
                        operation: "poll()",
                        errno: result.socketError
                    })
                });
                return;
            }

            raiseErrorAndClose({
                error: errors.createErrorFromErrno({
                    operation: "poll()",
                    errno: pollErrno
                })
            });
            return;
        }

        if (connected) {
            const { handeled: receiveHandled } = tryReceiveNext();
            if (receiveHandled) {
                maybeScheduleNextMicrotask();
                return;
            } else {
                updatePollEvents();
            }

            const { handeled: sendHandled } = trySendNext();
            if (sendHandled) {
                maybeScheduleNextMicrotask();
                return;
            } else {
                updatePollEvents();
            }
        } else {
            const { handeled: connectHandled } = tryHandleConnect();
            if (connectHandled) {
                maybeScheduleNextMicrotask();
                return;
            } else {
                updatePollEvents();
            }
        }
    });

    const maybeScheduleNextMicrotask = () => {
        if (scheduledNextMicrotask === undefined || !scheduledNextMicrotask.pending()) {
            scheduledNextMicrotask = microtaskScheduler.scheduleMicrotask(next);
        }
    };

    const pollHandle = pollerFactory.create({
        fd,

        callback: ({ status, events }) => {

            const errno = -status;

            if (errno !== errnoCodes.NO_ERROR) {
                pollErrno = errno;
            }

            if (events.readable) {
                socketMaybeHasMore = true;
            }

            if (events.writable) {
                socketMaybeTakesMore = true;
            }

            maybeScheduleNextMicrotask();
        }
    });

    const updatePollEvents = () => {
        if (destroyed) {
            warnWithStackTrace({ message: "updatePollEvents called after destroy" });
            return;
        }

        let readable = false;
        let writable = false;

        if (readRequested && !remoteEnded) {
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

    const duplex = new nodeStreamModule.Duplex({
        allowHalfOpen: false,

        read: () => {

            if (remoteEnded) {
                throw Error("BUG: read() called after ended");
            }

            mayPushData = true;
            readRequested = true;

            maybeScheduleNextMicrotask();
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

            // push due to performance reasons
            // immutable would be nicer though
            sendQueue.push({
                messageToSend,
                callback
            });

            maybeScheduleNextMicrotask();
        },

        final: (callback) => {
            localEnded = true;
            finalCallback = callback;

            trySendNext();
        },

        destroy: (err, callback) => {
            destroyed = true;
            pollHandle.close();
            native.close_fd({ fd });

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
