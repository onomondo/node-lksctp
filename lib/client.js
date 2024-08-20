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
const validateConnectOptions = ({ host, port, localAddress, localAddresses, localPort }) => {

  let localAddressesToUse = undefined;

  if (host === undefined) {
    throw Error("host is required");
  }

  if (port === undefined) {
    throw Error("port is required");
  }

  if (localAddress !== undefined && localAddresses !== undefined) {
    throw Error("localAddress and localAddresses are mutually exclusive");
  }

  if (localAddress !== undefined) {
    localAddressesToUse = [localAddress];
  }

  if (localAddresses !== undefined) {
    if (!Array.isArray(localAddresses)) {
      throw Error("localAddresses must be an array");
    }

    if (localAddresses.length === 0) {
      throw Error("localAddresses must have at least one element");
    }

    localAddresses.forEach((lAddress) => {
      if (!nodeNet.isIP(lAddress)) {
        throw Error("localAddresses must be an array of valid IP addresses");
      }
    });

    localAddressesToUse = localAddresses;
  }

  if (localPort !== undefined) {
    if (isNaN(localPort)) {
      throw Error("localPort must be a number");
    }
  }

  return {
    host,
    port,
    localAddresses: localAddressesToUse,
    localPort
  };
};

const connect = ({ native, options }) => {
  const { host, port, localAddresses, localPort } = validateConnectOptions(options);

  const { error: socketError, fd: sockfd } = createSocketWithOptions({ native, options });
  if (socketError !== undefined) {
    return createErrorDuplex({ error: socketError });
  }

  const { error: bindError } = bindLocalAddresses({ native, sockfd, localAddresses, localPort });
  if (bindError !== undefined) {
    return createErrorDuplex({ error: bindError });
  }

  const remoteAddress = {
    family: determineAddressFamily({ address: host }),
    address: host,
    port
  };

  const remoteSockaddr = sockaddrTranscoder.format({
    family: remoteAddress.family,
    address: remoteAddress.address,
    port: remoteAddress.port
  });

  const { error: connectError } = initiateConnect({
    native,
    sockfd,
    remoteSockaddrs: [ remoteSockaddr ]
  });
  if (connectError !== undefined) {
    return createErrorDuplex({ error: connectError });
  }

  const duplex = socketDuplexFactory.create({
    fd: sockfd,
    connected: false,
    initialRemoteAddress: remoteAddress,
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
