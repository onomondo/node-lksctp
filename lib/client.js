const nodeStreamModule = require("node:stream");
const sockaddrTranscoder = require("./sockaddr.js");
const {
  determineAddressFamily,
  createSocketWithOptions,
  initiallyBindLocalAddresses,
  parseAddressPair,
  parsePort
} = require("./socket-common.js");
const socketDuplexFactory = require("./socket-duplex.js");
const constants = require("./constants.js");
const errors = require("./errors.js");
const errnoCodes = constants.errno;

const createErrorDuplex = ({ error }) => {
  const duplex = new nodeStreamModule.Duplex({
    read: () => { },
    write: () => { }
  });

  process.nextTick(() => {
    duplex.destroy(error);
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

const validateConnectOptions = (options) => {

  const remoteAddresses = parseAddressPair({
    single: options.host,
    list: options.remoteAddresses,
    singleName: "host",
    listName: "remoteAddresses"
  });

  if (remoteAddresses === undefined) {
    throw Error("host or remoteAddresses is required");
  }

  const remotePort = parsePort({
    port: options.port,
    name: "port",
    required: true
  });

  const localAddresses = parseAddressPair({
    single: options.localAddress,
    list: options.localAddresses,
    singleName: "localAddress",
    listName: "localAddresses"
  });

  const localPort = parsePort({
    port: options.localPort,
    name: "localPort",
    required: false
  });

  return {
    remoteAddresses,
    remotePort,
    localAddresses,
    localPort
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
