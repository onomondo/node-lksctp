const nodeEventsModule = require("node:events");
const nodeNetModule = require("node:net");

const sockaddrTranscoder = require("./sockaddr.js");
const socketDuplexFactory = require("./socket-duplex.js");
const pollerFactory = require("./poller.js");
const constants = require("./constants.js");
const errors = require("./errors.js");


const errnoCodes = constants.errno;

const {
  createSocketWithOptions,
  initiallyBindLocalAddresses,
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

const listenArguments = ({ args }) => {
  let options = undefined;
  let callback = () => { };

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

  // eslint-disable-next-line complexity, max-statements
  const listenOptions = ({ options }) => {
    if (typeof options !== "object") {
      throw Error("options must be an object");
    }

    let localAddresses = undefined;

    if (options.host !== undefined && options.localAddresses !== undefined) {
      throw Error("host and localAddresses are mutually exclusive");
    }

    if (options.host !== undefined) {
      if (!nodeNetModule.isIP(options.host)) {
        throw Error("host must be a valid IP address");
      }

      localAddresses = [options.host];
    }

    if (options.localAddresses !== undefined) {
      if (!Array.isArray(options.localAddresses)) {
        throw Error("localAddresses must be an array");
      }

      if (options.localAddresses.length === 0) {
        throw Error("localAddresses must have at least one element");
      }

      options.localAddresses.forEach((lAddress) => {
        if (!nodeNetModule.isIP(lAddress)) {
          throw Error("localAddresses must be an array of valid IP addresses");
        }
      });

      localAddresses = options.localAddresses;
    }

    const port = options.port;
    const backlog = options.backlog || DEFAULT_BACKLOG;

    if (isNaN(port)) {
      throw Error("port is required and must be a number");
    }

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

    const { error: bindAndListenError } = bindAndListen({
      native,
      sockfd,
      localAddresses,
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
    emitter.emit("listening");
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
