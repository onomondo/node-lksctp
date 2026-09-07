const nodeEventsModule = require("node:events");

const sockaddrTranscoder = require("./sockaddr.js");
const socketDuplexFactory = require("./socket-duplex.js");
const pollerFactory = require("./poller.js");
const constants = require("./constants.js");
const errors = require("./errors.js");


const errnoCodes = constants.errno;

const {
  createSocketWithOptions,
  initiallyBindLocalAddresses,
  parseAddressPair,
  parsePort,
  getCurrentLocalPrimaryAddress: socketGetCurrentLocalPrimaryAddress,
  getLocalAddresses: socketGetLocalAddresses,
} = require("./socket-common.js");

const DEFAULT_BACKLOG = 128;

const bindAndListen = ({ native, sockfd, localAddresses, port, backlog }) => {

  let localAddressesToBind = ["0.0.0.0"];

  if (localAddresses !== undefined) {
    localAddressesToBind = localAddresses;
  }

  const { error } = initiallyBindLocalAddresses({
    native,
    fd: sockfd,
    localAddresses: localAddressesToBind,
    localPort: port
  });

  if (error !== undefined) {
    return {
      error
    };
  }

  const { errno: listenErrno } = native.listen({
    fd: sockfd,
    backlog
  });

  if (listenErrno !== errnoCodes.NO_ERROR) {
    return {
      error: errors.createErrorFromErrno({
        operation: "listen()",
        errno: listenErrno
      })
    };
  }

  return { error: undefined };
};

const acceptSockaddrBuffer = Buffer.alloc(64);

const accept = ({ native, sockfd }) => {
  const { errno: acceptErrno, fd } = native.accept({
    fd: sockfd,
    sockaddr: acceptSockaddrBuffer
  });

  if (acceptErrno !== errnoCodes.NO_ERROR) {
    return {
      error: errors.createErrorFromErrno({
        operation: "accept()",
        errno: acceptErrno
      })
    };
  }

  // copy sockaddr buffer, as it will be overwritten
  // by future accept calls
  const sockaddr = Buffer.alloc(acceptSockaddrBuffer.length);
  sockaddr.set(acceptSockaddrBuffer);

  return {
    error: undefined,
    fd,
    sockaddr
  };
};

// eslint-disable-next-line complexity, max-statements
const listenArguments = ({ args }) => {
  // Accept both lksctp's native object form — listen(options[, callback]) — and
  // Node's net.Server#listen positional form — listen(port[, host][, backlog]
  // [, callback]) — so callers written against `net`/node-sctp work unchanged.
  let options = undefined;
  let callback = () => { };

  if (args.length === 0) {
    throw Error("at least one argument is required");
  }

  const rest = [...args];
  // A trailing function is the listening callback in every listen() form.
  if (typeof rest[rest.length - 1] === "function") {
    callback = rest.pop();
  }

  if (rest.length === 0) {
    throw Error("options or port is required");
  }

  if (typeof rest[0] === "object" && rest[0] !== null) {
    // native object form: listen(options[, callback])
    if (rest.length > 1) {
      throw Error("invalid number of arguments");
    }
    options = rest[0];
  } else {
    // net positional form: listen(port[, host][, backlog][, callback]).
    // The optional slots may be absent *or* passed as undefined/null: net's
    // normalizeArgs ignores anything that is not a host string or a backlog
    // number, and callers forward an optional host that way — the common
    // shape is listen(port, opts.host) with no host configured. Only a
    // value of the wrong kind is an error.
    options = { port: rest[0] };
    for (const arg of rest.slice(1)) {
      if (arg === undefined || arg === null) {
        continue;
      } else if (typeof arg === "string") {
        options.host = arg;
      } else if (typeof arg === "number") {
        options.backlog = arg;
      } else {
        throw Error("invalid listen() argument");
      }
    }
  }

  return {
    options,
    callback
  };
};

const create = ({ native, options: socketOptions }) => {

  const emitter = new nodeEventsModule.EventEmitter();

  let errored = false;
  let closed = false;
  let sockfd = undefined;
  let listenPollHandle = undefined;

  const raiseErrorAndClose = ({ error }) => {
    if (listenPollHandle !== undefined) {
      listenPollHandle.maybeStop();
    }

    if (sockfd !== undefined) {
      native.close_fd({ fd: sockfd });
      sockfd = undefined;
    }

    errored = true;
    emitter.emit("error", error);
  };

  const listenOptions = ({ options }) => {
    if (typeof options !== "object") {
      throw Error("options must be an object");
    }

    const localAddresses = parseAddressPair({
      single: options.host,
      list: options.localAddresses,
      singleName: "host",
      listName: "localAddresses"
    });

    const port = parsePort({ port: options.port, name: "port", required: true });
    const backlog = options.backlog || DEFAULT_BACKLOG;

    if (isNaN(backlog)) {
      throw Error("backlog must be a number");
    }

    return {
      localAddresses,
      port,
      backlog
    };
  };

  // eslint-disable-next-line complexity,max-statements
  const listen = (...args) => {

    if (errored) {
      throw Error("socket already errored");
    }

    if (listenPollHandle !== undefined) {
      throw Error("already listening");
    }

    if (closed) {
      throw Error("socket already closed");
    }

    const { options, callback } = listenArguments({ args });
    const { localAddresses, port, backlog } = listenOptions({ options });

    const { error: socketError, fd: newSockfd } = createSocketWithOptions({
      native,
      options: socketOptions
    });

    if (socketError !== undefined) {
      raiseErrorAndClose({ error: socketError });
      if (callback !== undefined) {
        callback(socketError);
      }
      return;
    }

    sockfd = newSockfd;

    let bindAndListenResult = undefined;

    try {
      bindAndListenResult = bindAndListen({
        native,
        sockfd,
        localAddresses,
        port,
        backlog
      });
    } catch (ex) {
      // The bind path returns its errno failures, but it can still throw:
      // sockaddr formatting has no formatter for an arch outside x64/arm64, and
      // an option this validation does not know about yet would land here too.
      // The caller sees the exception, so nothing is emitted, but the socket has
      // to go — left open, the fd leaks and a second listen() overwrites sockfd
      // instead of refusing. The poll handle does not exist yet at this point.
      native.close_fd({ fd: sockfd });
      sockfd = undefined;
      errored = true;
      throw ex;
    }

    const { error: bindAndListenError } = bindAndListenResult;

    if (bindAndListenError !== undefined) {
      raiseErrorAndClose({ error: bindAndListenError });
      if (callback !== undefined) {
        callback(bindAndListenError);
      }
      return;
    }

    listenPollHandle = pollerFactory.create({
      fd: sockfd,

      callback: () => {

        const { error: acceptError, fd: connfd, sockaddr } = accept({
          native,
          sockfd
        });

        if (acceptError !== undefined) {
          raiseErrorAndClose({ error: acceptError });
          return;
        }

        const initialRemoteAddress = sockaddrTranscoder.parse({ sockaddr });

        const socket = socketDuplexFactory.create({
          fd: connfd,
          connected: true,
          initialRemoteAddress,
          duplexOptions: {
            readableHighWaterMark: socketOptions.highWaterMark,
            writableHighWaterMark: socketOptions.highWaterMark
          }
        });
        emitter.emit("connection", socket);
      }
    });

    listenPollHandle.update({
      events: {
        readable: true,
        writable: false
      }
    });

    callback(null);
    // Defer the event (like net/node-sctp) so a caller attaching
    // once("listening") *after* a synchronous listen() still catches it.
    queueMicrotask(() => emitter.emit("listening"));
  };

  const address = () => {
    if (sockfd === undefined) {
      throw Error("socket not bound");
    }

    return socketGetCurrentLocalPrimaryAddress({ native, fd: sockfd });
  };

  const getLocalAddresses = () => {
    if (sockfd === undefined) {
      throw Error("socket not bound");
    }

    const result = socketGetLocalAddresses({ native, fd: sockfd });

    return result;
  };

  const on = emitter.on.bind(emitter);
  const once = emitter.once.bind(emitter);

  const close = () => {
    if (closed) {
      throw Error("socket already closed");
    }

    if (listenPollHandle !== undefined) {
      listenPollHandle.close();
    }

    if (sockfd !== undefined) {
      native.close_fd({ fd: sockfd });
      sockfd = undefined;
    }

    closed = true;
  };

  return {
    address,

    getLocalAddresses,

    listen,

    on,
    once,

    close
  };
};

module.exports = {
  create
};
