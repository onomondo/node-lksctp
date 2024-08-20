const nodeStreamModule = require("node:stream");
const sockaddrTranscoder = require("./sockaddr.js");
const {
  determineAddressFamily,
  createSocketWithOptions,
  initiallyBindLocalAddresses
} = require("./socket-common.js");
const socketDuplexFactory = require("./socket-duplex.js");
const constants = require("./constants.js");
const errors = require("./errors.js");
const nodeNet = require("node:net");
const errnoCodes = constants.errno;

const createErrorDuplex = ({ error }) => {
  const duplex = new nodeStreamModule.Duplex({
    read: () => { },
    write: () => { }
  });

  process.nextTick(() => {
    duplex.emit("error", error);
  });

  return duplex;
};

const initiateConnect = ({ native, sockfd, remoteSockaddrs }) => {
  const { errno: connectErrno } = native.sctp_connectx({
    fd: sockfd,
    sockaddrs: remoteSockaddrs
  });

  const connectOk = [
    errnoCodes.NO_ERROR,
    errnoCodes.EINPROGRESS,
    errnoCodes.EAGAIN
  ].indexOf(connectErrno) >= 0;

  if (!connectOk) {
    return {
      error: errors.createErrorFromErrno({
        operation: "connect()",
        errno: connectErrno
      })
    };
  }

  return { error: undefined };
};

const bindLocalAddresses = ({ native, sockfd, localAddresses, localPort }) => {

  let localAddressesToBind = ["0.0.0.0"];
  let localPortToBind = 0;

  if (localAddresses !== undefined) {
    localAddressesToBind = localAddresses;
  }

  if (localPort !== undefined) {
    localPortToBind = localPort;
  }

  const { error } = initiallyBindLocalAddresses({
    native,
    fd: sockfd,
    localAddresses: localAddressesToBind,
    localPort: localPortToBind
  });

  return { error };
};

// eslint-disable-next-line complexity, max-statements
const validateConnectOptions = (options) => {

  let localAddressesToUse = undefined;
  let remoteAddressesToUse = undefined;

  if (options.host !== undefined && options.remoteAddresses !== undefined) {
    throw Error("host and remoteAddresses are mutually exclusive");
  }

  if (options.host === undefined && options.remoteAddresses === undefined) {
    throw Error("host or remoteAddresses is required");
  }

  if (options.host !== undefined) {
    remoteAddressesToUse = [options.host];
  }

  if (options.remoteAddresses !== undefined) {
    if (!Array.isArray(options.remoteAddresses)) {
      throw Error("remoteAddresses must be an array");
    }

    if (options.remoteAddresses.length === 0) {
      throw Error("remoteAddresses must have at least one element");
    }

    remoteAddressesToUse = options.remoteAddresses;
  }

  if (options.port === undefined) {
    if (typeof options.port !== "number" || isNaN(options.port)) {
      throw Error("port must be a number");
    }

    throw Error("port is required");
  }

  if (options.localAddress !== undefined && options.localAddresses !== undefined) {
    throw Error("localAddress and localAddresses are mutually exclusive");
  }

  if (options.localAddress !== undefined) {
    localAddressesToUse = [options.localAddress];
  }

  if (options.localAddresses !== undefined) {
    if (!Array.isArray(options.localAddresses)) {
      throw Error("localAddresses must be an array");
    }

    if (options.localAddresses.length === 0) {
      throw Error("localAddresses must have at least one element");
    }

    options.localAddresses.forEach((lAddress) => {
      if (!nodeNet.isIP(lAddress)) {
        throw Error("localAddresses must be an array of valid IP addresses");
      }
    });

    localAddressesToUse = options.localAddresses;
  }

  if (options.localPort !== undefined) {
    if (typeof options.localPort !== "number" || isNaN(options.localPort)) {
      throw Error("localPort must be a number");
    }
  }

  return {
    remoteAddresses: remoteAddressesToUse,
    remotePort: options.port,
    localAddresses: localAddressesToUse,
    localPort: options.localPort,
  };
};

const connect = ({ native, options }) => {
  const {
    remoteAddresses,
    remotePort,
    localAddresses,
    localPort
  } = validateConnectOptions(options);

  const { error: socketError, fd: sockfd } = createSocketWithOptions({ native, options });
  if (socketError !== undefined) {
    return createErrorDuplex({ error: socketError });
  }

  const { error: bindError } = bindLocalAddresses({ native, sockfd, localAddresses, localPort });
  if (bindError !== undefined) {
    return createErrorDuplex({ error: bindError });
  }

  const remoteSockaddrs = remoteAddresses.map((remoteAddress) => {
    return sockaddrTranscoder.format({
      family: determineAddressFamily({ address: remoteAddress }),
      address: remoteAddress,
      port: remotePort
    });
  });

  const { error: connectError } = initiateConnect({
    native,
    sockfd,
    remoteSockaddrs
  });
  if (connectError !== undefined) {
    return createErrorDuplex({ error: connectError });
  }

  const duplex = socketDuplexFactory.create({
    fd: sockfd,
    connected: false,
    initialRemoteAddress: {
      family: determineAddressFamily({ address: remoteAddresses[0] }),
      address: remoteAddresses[0],
      port: remotePort
    },
    duplexOptions: {
      readableHighWaterMark: options.highWaterMark,
      writableHighWaterMark: options.highWaterMark
    }
  });

  return duplex;
};

module.exports = {
  connect
};
