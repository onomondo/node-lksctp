/* eslint-disable complexity */
/* eslint-disable max-statements */
/* eslint-disable no-use-before-define */

const native = require("./native.js");
const nodeStreamModule = require("node:stream");
const assert = require("node:assert");

const pollerFactory = require("./poller.js");
const constants = require("./constants.js");
const errors = require("./errors.js");
const microtaskSchedulerFactory = require("./microtask-scheduler.js");
const socketCommon = require("./socket-common.js");
const notifications = require("./notifications.js");

const errnoCodes = constants.errno;

const MAX_REASONABLE_PACKET_SIZE = 128 * 1024;

const parseMessageFlags = ({ flags }) => {
  let remainingFlags = flags;

  const MSG_EOR_OR_ZERO = remainingFlags & constants.MSG_EOR;
  remainingFlags &= ~constants.MSG_EOR;

  const MSG_NOTIFICATION_OR_ZERO = remainingFlags & constants.MSG_NOTIFICATION;
  remainingFlags &= ~constants.MSG_NOTIFICATION;

  if (remainingFlags !== 0) {
    throw Error(`unknown flags: ${remainingFlags}`);
  }

  return {
    MSG_EOR: MSG_EOR_OR_ZERO !== 0,
    MSG_NOTIFICATION: MSG_NOTIFICATION_OR_ZERO !== 0
  };
};

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
  initialRemoteAddress,
  maxPacketSize = MAX_REASONABLE_PACKET_SIZE,
  maxOperationsPerMacrotask = 500,
  addressGatherInterval = 5000,
  duplexOptions
}) => {

  // max packet size depends on PMTU
  const receiveBuffer = Buffer.alloc(maxPacketSize);
  let readRequested = false;
  let mayPushData = false;
  let remoteEnded = false;
  const fd = providedFd;

  let destroyed = false;
  let pollErrno = undefined;

  let socketMaybeHasMore = false;
  let socketMaybeTakesMore = false;

  let shutdownRequested = false;

  let scheduledNextMicrotask = undefined;
  let pollCallbacksSinceLastMicrotask = 0;
  const microtaskScheduler = microtaskSchedulerFactory.create({ maxMicrotasksPerMacrotask: maxOperationsPerMacrotask });

  let connected = initiallyConnected;

  let sendQueue = [];

  const raiseErrorAndClose = ({ error }) => {
    duplex.destroy(error);
  };

  const receiveSockaddrBuffer = Buffer.alloc(64);

  const tryReceiveNext = () => {
    if (connected && !mayPushData && !shutdownRequested) {
      return { handeled: false };
    }

    if (remoteEnded) {
      return { handeled: false };
    }

    if (!socketMaybeHasMore) {
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
          error: errors.createErrorFromErrno({ errno: result.errno })
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

    const {
      MSG_EOR,
      MSG_NOTIFICATION,
      ...unknownFlags
    } = parseMessageFlags({ flags: result.flags });

    if (MSG_NOTIFICATION) {
      const rawNotification = Buffer.from(Uint8Array.prototype.slice.call(buffer, 0, result.bytesReceived));
      const parsedNotification = native.parse_sctp_notification({ notification: rawNotification });
      const interpreted = notifications.interpret({ notification: parsedNotification });

      if (!connected) {
        if (parsedNotification.sn_type === constants.SCTP_ASSOC_CHANGE) {
          connected = true;

          updateDuplexProperties();
          updateAddressProperties();

          duplex.emit("connect");
        } else {
          raiseErrorAndClose({
            error: Error("first notification must be SCTP_ASSOC_CHANGE")
          });
          return { handeled: true };
        }
      }

      if (parsedNotification.sn_type === constants.SCTP_PEER_ADDR_CHANGE) {
        // if we receive a peer address change, we update the remote addresses immediately
        updateAddressProperties();
      }

      duplex.emit("notification", {
        raw: rawNotification,
        parsed: parsedNotification,
        interpreted
      });

      return { handeled: true };
    }

    if (!connected) {
      raiseErrorAndClose({
        error: Error("first message must be a notification")
      });
      return { handeled: true };
    }

    if (result.bytesReceived === 0) {
      remoteEnded = true;
      pushAndResetReadRequested({ data: null });
      return { handeled: true };
    }

    if (!MSG_EOR) {
      throw Error("missing MSG_EOR, receive buffer probably too small, not implemented");
    }

    if (Object.keys(unknownFlags).length > 0) {
      throw Error(`unknown flags: ${Object.keys(unknownFlags).join(", ")}`);
    }

    if (result.rcvinfo === undefined) {
      throw Error("missing rcvinfo, should not happen");
    }

    // make sure to copy bytes
    const chunk = Buffer.from(Uint8Array.prototype.slice.call(buffer, 0, result.bytesReceived));

    chunk.sid = Number(result.rcvinfo.sid);
    chunk.ppid = Number(result.rcvinfo.ppid);

    const takesMore = pushAndResetReadRequested({ data: chunk });

    mayPushData = takesMore;

    return { handeled: true };
  };

  const trySendNext = () => {
    if (sendQueue.length === 0) {
      return { handeled: false };
    }

    if (remoteEnded) {
      const next = sendQueue[0];
      const { callback } = next;
      sendQueue = sendQueue.slice(1);

      callback(Error("remote ended"));

      return { handeled: true };
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
        raiseErrorAndClose({
          error: errors.createErrorFromErrno({ errno: result.errno })
        });

        return { handeled: true };
      }

      if (result.errno === errnoCodes.EPIPE) {
        raiseErrorAndClose({
          error: errors.createErrorFromErrno({ errno: result.errno })
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

        const wellKnownErrors = [
          errnoCodes.ECONNREFUSED,
          errnoCodes.ECONNRESET
        ];

        if (wellKnownErrors.includes(result.socketError)) {
          // in case of well known errors, we don't show operation in error message
          raiseErrorAndClose({
            error: errors.createErrorFromErrno({ errno: result.socketError })
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

    if (!connected || (readRequested || shutdownRequested) && !remoteEnded) {
      readable = true;
    }

    if (connected && sendQueue.length > 0) {
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
    ...duplexOptions,

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
          sid: chunk.sid || 0,
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

      if (!shutdownRequested) {
        const { errno } = native.setsockopt_linger({ fd, onoff: 1, linger: 0 });
        if (errno !== errnoCodes.NO_ERROR) {
          throw errors.createErrorFromErrno({
            operation: "setsockopt_linger()",
            errno
          });
        }
      }

      clearInterval(updateAddressIntervalHandle);

      pollHandle.close();
      native.close_fd({ fd });

      callback(err);
    }
  });

  const updateDuplexProperties = () => {
    duplex.connecting = !connected;
    duplex.readyState = connected ? "open" : "opening";
    duplex.pending = !connected;
  };

  updateDuplexProperties();

  const gatherLocalAddresses = () => {
    const localPrimary = socketCommon.getCurrentLocalPrimaryAddress({ native, fd });
    const localSockaddrs = socketCommon.getLocalAddresses({ native, fd });

    const localAddresses = localSockaddrs.map((sockaddr) => {
      return sockaddr.address;
    });

    const localFamily = localPrimary.family;
    const localPort = localPrimary.port;
    const localAddress = localPrimary.address;

    return {
      localFamily,
      localPort,
      localAddress,
      localAddresses,
    };
  };

  const gatherRemoteAddresses = () => {
    // family and port will never change
    const remoteFamily = initialRemoteAddress.family;
    const remotePort = initialRemoteAddress.port;

    const remotePrimary = socketCommon.getCurrentRemotePrimaryAddress({ native, fd });
    const remoteSockaddrs = socketCommon.getRemoteAddresses({ native, fd });

    let remoteAddresses = undefined;
    if (remoteSockaddrs !== undefined) {
      remoteAddresses = remoteSockaddrs.map((sockaddr) => {
        return sockaddr.address;
      });
    }

    return {
      remoteFamily,
      remotePort,
      remoteAddress: remotePrimary === undefined ? undefined : remotePrimary.address,
      remoteAddresses
    };
  };

  const determineRemoteAddressesToUse = ({ gatheredRemoteAddress, gatheredRemoteAddresses }) => {
    if (!connected) {
      // if we are not connected yet, the socket will not give us the remote addresses
      // the most sensible thing is to keep the initial remote address
      return {
        remoteAddress: initialRemoteAddress.address,
        remoteAddresses: [
          initialRemoteAddress.address
        ]
      };
    }

    if (gatheredRemoteAddress !== undefined && gatheredRemoteAddresses !== undefined) {

      if (gatheredRemoteAddresses.includes(gatheredRemoteAddress)) {

        // normal case
        // remote addresses could be gathered and report senseful data

        return {
          remoteAddress: gatheredRemoteAddress,
          remoteAddresses: gatheredRemoteAddresses
        };
      }

      // primary address is not in list of addresses
      // this could happen in rare cases, as the addresses are not fetch atomically
      // if this happens, we just keep the last state
    } else {
      // remote addresses couldn't be fully gathered
      // this is the case, if the socket is already disconnected, but
      // we haven't received the notification yet
      // if this happens, we just keep the last state
    }

    // fallback case is to always keep the last state
    return {
      remoteAddress: duplex.remoteAddress,
      remoteAddresses: duplex.remoteAddresses
    };
  };

  const updateAddressProperties = () => {
    const {
      localFamily,
      localPort,
      localAddress,
      localAddresses,
    } = gatherLocalAddresses();

    const {
      remoteFamily,
      remotePort,
      remoteAddress: gatheredRemoteAddress,
      remoteAddresses: gatheredRemoteAddresses,
    } = gatherRemoteAddresses();

    const {
      remoteAddress,
      remoteAddresses,
    } = determineRemoteAddressesToUse({
      gatheredRemoteAddress,
      gatheredRemoteAddresses
    });

    const arrayChanged = ({ a, b }) => {
      if (a === undefined && b === undefined) {
        return false;
      }

      if (a === undefined || b === undefined) {
        return true;
      }

      if (a.length !== b.length) {
        return true;
      }

      return a.some((elem) => {
        return !b.includes(elem);
      });
    };

    const localChanged = localAddress !== duplex.localAddress || arrayChanged({ a: localAddresses, b: duplex.localAddresses });
    const remoteChanged = remoteAddress !== duplex.remoteAddress || arrayChanged({ a: remoteAddresses, b: duplex.remoteAddresses });

    duplex.localFamily = localFamily;
    duplex.localPort = localPort;
    duplex.localAddress = localAddress;
    duplex.localAddresses = localAddresses;

    duplex.remoteFamily = remoteFamily;
    duplex.remotePort = remotePort;
    duplex.remoteAddress = remoteAddress;
    duplex.remoteAddresses = remoteAddresses;

    duplex.peerInfoByAddress = {};
    remoteAddresses.forEach((peerAddress) => {
      const peerInfo = socketCommon.retrievePeerAddressInfo({
        native,
        fd,
        peerAddress,
        remotePort: initialRemoteAddress.port
      });
      duplex.peerInfoByAddress[peerAddress] = peerInfo;
    });

    if (localChanged || remoteChanged) {
      duplex.emit("address-change");
    }

    duplex.emit("peer-info-update");
  };

  updateAddressProperties();

  const updateAddressIntervalHandle = setInterval(() => {
    updateAddressProperties();
  }, addressGatherInterval);

  duplex.address = () => {
    return {
      address: duplex.localAddress,
      family: duplex.localFamily,
      port: duplex.localPort
    };
  };

  duplex.status = () => {
    if (destroyed) {
      throw Error("status called after destroy");
    }

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

  duplex.setNoDelay = (noDelay = true) => {
    if (destroyed) {
      throw Error("setNoDelay called after destroy");
    }

    if (typeof noDelay !== "boolean") {
      throw Error("noDelay must be a boolean");
    }

    const { errno } = native.setsockopt_nodelay({ fd, value: noDelay ? 1 : 0 });
    if (errno !== errnoCodes.NO_ERROR) {
      throw errors.createErrorFromErrno({
        operation: "setsockopt_nodelay()",
        errno
      });
    }
  };

  maybeScheduleNextMicrotask();

  return duplex;
};

module.exports = {
  create
};
