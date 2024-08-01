const nodeEventsModule = require("node:events");

const sockaddrTranscoder = require("./sockaddr.js");
const socketDuplexFactory = require("./socket-duplex.js");
const pollerFactory = require("./poller.js");
const constants = require("./constants.js");
const errors = require("./errors.js");


const errnoCodes = constants.errno;

const { determineAddressFamily, createSocketWithOptions } = require("./socket-common.js");

const DEFAULT_BACKLOG = 128;

const bindAndListen = ({ native, sockfd, host, port, backlog }) => {

  let address = "0.0.0.0";
  if (host !== undefined) {
    address = host;
  }

  const family = determineAddressFamily({ address });

  const listenAddress = sockaddrTranscoder.format({
    family,
    address,
    port
  });

  const { errno: bindErrno } = native.bind_ipv4({
    fd: sockfd,
    sockaddr: listenAddress
  });

  if (bindErrno !== errnoCodes.NO_ERROR) {
    return {
      error: errors.createErrorFromErrno({
        operation: "bind()",
        errno: bindErrno
      })
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

const listenArguments = ({ args }) => {
  let options = undefined;
  let callback = () => {};

  if (args.length === 0) {
    throw Error("at least one argument is required");
  } else if (args.length === 1) {
    options = args[0];
  } else if (args.length === 2) {
    options = args[0];
    callback = args[1];
  } else if (args.length > 2) {
    throw Error("invalid number of arguments");
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

  // eslint-disable-next-line complexity
  const listenOptions = ({ options }) => {
    if (typeof options !== "object") {
      throw Error("options must be an object");
    }

    const host = options.host;
    const port = options.port;
    const backlog = options.backlog || DEFAULT_BACKLOG;

    if (host !== undefined && typeof host !== "string") {
      throw Error("host must be a string");
    }

    if (isNaN(port)) {
      throw Error("port is required and must be a number");
    }

    if (isNaN(backlog)) {
      throw Error("backlog must be a number");
    }

    return {
      host,
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
    const { host, port, backlog } = listenOptions({ options });

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

    const { error: bindAndListenError } = bindAndListen({
      native,
      sockfd,
      host,
      port,
      backlog
    });

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

        const socket = socketDuplexFactory.create({
          fd: connfd,
          connected: true,
          remoteSockaddr: sockaddr,
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
    emitter.emit("listening");
  };

  const address = () => {
    const sockaddrAsBuffer = Buffer.alloc(64);
    const { errno } = native.getsockname({ fd: sockfd, sockaddr: sockaddrAsBuffer });
    if (errno !== errnoCodes.NO_ERROR) {
      throw createErrorFromErrno({ operation: "getsockname()", errno });
    }

    return sockaddrTranscoder.parse({ sockaddr: sockaddrAsBuffer });
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
    listen,

    on,
    once,

    close
  };
};

module.exports = {
  create
};
