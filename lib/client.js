const nodeStreamModule = require("node:stream");
const sockaddrTranscoder = require("./sockaddr.js");
const { determineAddressFamily, createSocketWithOptions } = require("./socket-common.js");
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
    duplex.emit("error", error);
  });

  return duplex;
};

const bind = ({ native, sockfd, localSockaddr }) => {
  const { errno: bindErrno } = native.bind_ipv4({
    fd: sockfd,
    sockaddr: localSockaddr
  });

  if (bindErrno !== errnoCodes.NO_ERROR) {
    return errors.createErrorFromErrno({
      operation: "bind()",
      errno: bindErrno
    });
  }

  return { error: undefined };
};

const initiateConnect = ({ native, sockfd, remoteSockaddr }) => {
  const { errno: connectErrno } = native.connect({
    fd: sockfd,
    sockaddr: remoteSockaddr
  });

  const connectOk = [
    errnoCodes.NO_ERROR,
    errnoCodes.EINPROGRESS,
    errnoCodes.EAGAIN
  ].indexOf(connectErrno) >= 0;

  if (!connectOk) {
    return errors.createErrorFromErrno({
      operation: "connect()",
      errno: connectErrno
    });
  }

  return { error: undefined };
};

const maybeBindLocalAddress = ({ native, sockfd, localAddress, localPort }) => {
  if (localAddress !== undefined) {
    const family = determineAddressFamily({ address: localAddress });

    const localSockaddr = sockaddrTranscoder.format({
      family,
      address: localAddress,
      port: localPort
    });

    const { error: bindError } = bind({
      native,
      sockfd,
      localSockaddr
    });

    return { error: bindError };
  }

  return { error: undefined };
};

// eslint-disable-next-line complexity
const validateConnectOptions = ({ host, port, localAddress, localPort }) => {
  if (host === undefined) {
    throw Error("host is required");
  }

  if (port === undefined) {
    throw Error("port is required");
  }

  if (localAddress !== undefined) {
    if (localPort === undefined) {
      throw Error("localPort is required when localAddress is provided");
    }
  }

  if (localPort !== undefined) {
    if (localAddress === undefined) {
      throw Error("localAddress is required when localPort is provided");
    }

    if (isNaN(localPort)) {
      throw Error("localPort must be a number");
    }
  }
};

const connect = ({ native, options }) => {
  const { host, port, localAddress, localPort } = options;

  validateConnectOptions({ host, port, localAddress, localPort });

  const { error: socketError, fd: sockfd } = createSocketWithOptions({ native, options });
  if (socketError !== undefined) {
    return createErrorDuplex({ error: socketError });
  }

  const { error: bindError } = maybeBindLocalAddress({ native, sockfd, localAddress, localPort });
  if (bindError !== undefined) {
    return createErrorDuplex({ error: bindError });
  }

  const remoteSockaddr = sockaddrTranscoder.format({
    family: determineAddressFamily({ address: host }),
    address: host,
    port
  });

  const { error: connectError } = initiateConnect({ native, sockfd, remoteSockaddr });
  if (connectError !== undefined) {
    return createErrorDuplex({ error: connectError });
  }

  const duplex = socketDuplexFactory.create({
    fd: sockfd,
    connected: false,
    remoteSockaddr,
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
