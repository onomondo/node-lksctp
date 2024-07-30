/* eslint-disable complexity */
/* eslint-disable max-statements */
/* eslint-disable no-use-before-define */

const native = require("./native.js");
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
  maxOperationsPerMacrotask = 500,
}) => {

  // max packet size depends on PMTU
  const receiveBuffer = Buffer.alloc(maxPacketSize);
  let readRequested = false;
  let mayPushData = false;
  let remoteEnded = false;
  const fd = providedFd;

  let destroyed = false;
  let pollErrno = undefined;

  let socketMaybeHasMore = true;
  let socketMaybeTakesMore = true;

  let shutdownRequested = false;

  let scheduledNextMicrotask = undefined;
  let pollCallbacksSinceLastMicrotask = 0;
  const microtaskScheduler = microtaskSchedulerFactory.create({ maxMicrotasksPerMacrotask: maxOperationsPerMacrotask });

  const parsedRemoteSockaddr = sockaddrTranscoder.parse({ sockaddr: remoteSockaddr });

  let connected = initiallyConnected;

  let sendQueue = [];

  const raiseErrorAndClose = ({ error }) => {
    duplex.destroy(error);
  };

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

  const tryReceiveNext = () => {
    if (!mayPushData && !shutdownRequested) {
      return { handeled: false };
    }

    if (remoteEnded) {
      return { handeled: false };
    }

    const buffer = receiveBuffer;

    const result = native.sctp_recvv({
      fd,
      messageBuffer: receiveBuffer,
      sockaddr: receiveSockaddrBuffer
    });

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

    if (result.rcvinfo === undefined) {
      throw Error("missing rcvinfo, should not happen");
    }

    // make sure to copy bytes
    const chunk = Buffer.from(Uint8Array.prototype.slice.call(buffer, 0, result.bytesReceived));

    chunk.ppid = result.rcvinfo.ppid;

    const takesMore = pushAndResetReadRequested({ data: chunk });

    mayPushData = takesMore;

    return { handeled: true };
  };

  const trySendNext = () => {
    if (sendQueue.length === 0) {
      return { handeled: false };
    }

    if (!socketMaybeTakesMore) {
      return { handeled: false };
    }

    const next = sendQueue[0];

    const { messageToSend, callback } = next;

    const result = native.sctp_sendv({
      fd,
      ...messageToSend
    });

    if (result.errno !== errnoCodes.NO_ERROR) {
      if (result.errno === errnoCodes.EAGAIN) {
        socketMaybeTakesMore = false;
        return { handeled: false };
      }

      if (result.errno === errnoCodes.ECONNRESET) {

        const error = Error("Connection reset by peer");
        error.code = "ECONNRESET";

        raiseErrorAndClose({
          error
        });

        return { handeled: true };
      }

      if (result.errno === errnoCodes.EPIPE) {

        const error = Error("Broken pipe");
        error.code = "EPIPE";

        raiseErrorAndClose({
          error
        });

        return { handeled: true };
      }

      raiseErrorAndClose({
        error: errors.createErrorFromErrno({
          operation: "sctp_sendv()",
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

    pollCallbacksSinceLastMicrotask = 0;
    scheduledNextMicrotask = undefined;

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
      }

      const { handeled: sendHandled } = trySendNext();
      if (sendHandled) {
        maybeScheduleNextMicrotask();
        return;
      }
    } else {
      const { handeled: connectHandled } = tryHandleConnect();
      if (connectHandled) {
        maybeScheduleNextMicrotask();
        return;
      }
    }

    updatePollEvents();
  });

  const maybeScheduleNextMicrotask = () => {
    if (scheduledNextMicrotask === undefined || !scheduledNextMicrotask.pending()) {
      scheduledNextMicrotask = microtaskScheduler.scheduleMicrotask(next);
    }
  };

  const pollHandle = pollerFactory.create({
    fd,

    callback: ({ status, events }) => {

      pollCallbacksSinceLastMicrotask += 1;

      if (pollCallbacksSinceLastMicrotask > 1) {
        // something went wrong, we need to make sure we won't get stuck
        // in a poll loop

        pollHandle.update({
          events: {
            readable: false,
            writable: false
          }
        });
        return;
      }

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

    if ((readRequested || shutdownRequested) && !remoteEnded) {
      readable = true;
    }

    if (!connected || sendQueue.length > 0) {
      writable = true;
    }

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

        sndinfo: {
          sid: 0,
          ppid: chunk.ppid || 0,
          flags: 0,
          context: 0,
        },

        flags: 0,
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

      assert.equal(sendQueue.length, 0, "BUG: sendQueue not empty on final");

      // in case there is a race an we already received the shutdown from remote
      if (!remoteEnded) {
        // initiate graceful shutdown
        const { errno } = native.shutdown({ fd, how: constants.SHUT_RDWR });
        if (errno !== errnoCodes.NO_ERROR) {
          const error = errors.createErrorFromErrno({
            operation: "shutdown()",
            errno
          });

          callback(error);
          return;
        }
      }

      shutdownRequested = true;

      maybeScheduleNextMicrotask();

      callback();
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

  duplex.status = () => {
    const { errno, info } = native.getsockopt_sctp_status({ fd });

    if (errno !== errnoCodes.NO_ERROR) {
      throw errors.createErrorFromErrno({
        operation: "getsockopt_sctp_status()",
        errno
      });
    }

    const tag = Number(info.sctpi_tag);
    const state = Number(info.sctpi_state);
    const rwnd = Number(info.sctpi_rwnd);
    const unackdata = Number(info.sctpi_unackdata);
    const penddata = Number(info.sctpi_penddata);
    const numberOfIncomingStreams = Number(info.sctpi_instrms);
    const numberOfOutgoingStreams = Number(info.sctpi_outstrms);
    const fragmentationPoint = Number(info.sctpi_fragmentation_point);
    const incomingQueue = Number(info.sctpi_inqueue);
    const outgoingQueue = Number(info.sctpi_outqueue);
    const overallError = Number(info.sctpi_overall_error);
    const maxBurst = Number(info.sctpi_max_burst);
    const maxSeg = Number(info.sctpi_maxseg);

    const peer = {
      tag: Number(info.sctpi_peer_tag),
      rwnd: Number(info.sctpi_peer_rwnd),
      cap: Number(info.sctpi_peer_capable),
      sack: Number(info.sctpi_peer_sack)
    };

    return {
      tag,
      state,
      rwnd,
      unackdata,
      penddata,
      numberOfIncomingStreams,
      numberOfOutgoingStreams,
      fragmentationPoint,
      incomingQueue,
      outgoingQueue,
      overallError,
      maxBurst,
      maxSeg,

      peer
    };
  };

  maybeScheduleNextMicrotask();

  return duplex;
};

module.exports = {
  create
};
