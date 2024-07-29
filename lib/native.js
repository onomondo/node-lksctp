const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const nativeReleasePath = path.join(__dirname, "../build/Release/lksctp.node");
const nativeDebugPath = path.join(__dirname, "../build/Debug/lksctp.node");

const releaseExists = fs.existsSync(nativeReleasePath);
const debugExists = fs.existsSync(nativeDebugPath);

if (releaseExists && debugExists) {
  throw Error("both debug and release native modules exist");
} else if (!releaseExists && !debugExists) {
  throw Error("no native modules exist, please build the native module first");
}

let native;

if (releaseExists) {
  native = require(nativeReleasePath);
} else {
  native = require(nativeDebugPath);
  console.warn("using debug native module, please build the release module for production use");
}

// native code expects correct arguments or it aborts
// error handling in native code is noisy, so we
// assert the parameters here

const create_socket = () => {
  const { errno, fd } = native.create_socket();

  assert(typeof errno === "number");

  if (errno === 0) {
    assert(typeof fd === "number");
  }

  return { errno, fd };
};

const bind_ipv4 = ({ fd, sockaddr }) => {

  assert(typeof fd === "number");
  assert(sockaddr instanceof Uint8Array);

  const { errno } = native.bind_ipv4({
    fd,
    sockaddr,
  });

  assert(typeof errno === "number");

  return { errno };
};

const connect = ({ fd, sockaddr }) => {

  assert(typeof fd === "number");
  assert(sockaddr instanceof Uint8Array);

  const { errno } = native.connect({
    fd,
    sockaddr
  });

  assert(typeof errno === "number");

  return {
    errno
  };
};

const listen = ({ fd, backlog }) => {

  assert(typeof fd === "number");
  assert(typeof backlog === "number");

  const { errno } = native.listen({
    fd,
    backlog
  });

  assert(typeof errno === "number");

  return { errno };
};

const accept = ({ fd, sockaddr }) => {

  assert(typeof fd === "number");
  assert(sockaddr instanceof Uint8Array);

  const { errno, fd: connfd } = native.accept({
    fd,
    sockaddr
  });

  assert(typeof errno === "number");

  if (errno === 0) {
    assert(typeof connfd === "number");
  }

  return {
    errno,
    fd: connfd
  };
};

const sctp_recvmsg = ({ fd, messageBuffer, infoBuffer, sockaddr }) => {

  assert(typeof fd === "number");
  assert(messageBuffer instanceof Uint8Array);
  assert(infoBuffer instanceof Uint8Array);
  assert(sockaddr instanceof Uint8Array);

  const { errno, bytesReceived, flags } = native.sctp_recvmsg({
    fd,
    messageBuffer,
    infoBuffer,
    sockaddr
  });

  assert(typeof errno === "number");
  if (errno === 0) {
    assert(typeof bytesReceived === "number");
    assert(typeof flags === "number");
  }

  return {
    errno,
    bytesReceived,
    flags
  };
};

const sctp_sendmsg = ({ fd, message, sockaddr, ppid, flags, streamNumber, timeToLive, context }) => {

  assert(typeof fd === "number");
  assert(message instanceof Uint8Array);
  assert(sockaddr instanceof Uint8Array);
  assert(typeof ppid === "number");
  assert(typeof flags === "number");
  assert(typeof streamNumber === "number");
  assert(typeof timeToLive === "number");
  assert(typeof context === "number");

  const { errno, bytesSent } = native.sctp_sendmsg({
    fd,
    message,
    sockaddr,
    ppid,
    flags,
    streamNumber,
    timeToLive,
    context
  });

  assert(typeof errno === "number");
  if (errno === 0) {
    assert(typeof bytesSent === "number");
  }

  return {
    errno,
    bytesSent
  };
};

const setsockopt_sack_info = ({ fd, sack_assoc_id, sack_delay, sack_freq }) => {

  assert(typeof fd === "number");
  assert(typeof sack_assoc_id === "number");
  assert(typeof sack_delay === "number");
  assert(typeof sack_freq === "number");

  const { errno } = native.setsockopt_sack_info({
    fd,
    sack_assoc_id,
    sack_delay,
    sack_freq
  });

  assert(typeof errno === "number");

  return { errno };
};

const create_poller = ({ fd, callback }) => {

  assert(typeof fd === "number");
  assert(typeof callback === "function");

  const pollHandle = native.create_poller({
    fd,
    callback: (args) => {
      try {
        callback(args);
      } catch (ex) {
        console.error("poll callback error", ex);
      }
    }
  });

  assert(typeof pollHandle === "object");
  assert(typeof pollHandle.start === "function");
  assert(typeof pollHandle.stop === "function");
  assert(typeof pollHandle.close === "function");

  // wrap functions to make sure this argument
  // is always correct, as it is required by native code

  const start = ({ events }) => {

    assert(typeof events === "object");
    assert(typeof events.readable === "boolean");
    assert(typeof events.writable === "boolean");

    pollHandle.start({ events });
  };

  const stop = () => {
    pollHandle.stop();
  };

  const close = () => {
    pollHandle.close();
  };

  return {
    start,
    stop,
    close
  };
};

const get_socket_error = ({ fd }) => {

  assert(typeof fd === "number");

  const { errno, socketError } = native.get_socket_error({
    fd
  });

  assert(typeof errno === "number");
  if (errno === 0) {
    assert(typeof socketError === "number");
  }

  return { errno, socketError };
};

const getsockname = ({ fd, sockaddr }) => {
  assert(typeof fd === "number");

  const { errno } = native.getsockname({
    fd,
    sockaddr
  });

  assert(typeof errno === "number");

  return { errno };
};

const close_fd = ({ fd }) => {
  assert(typeof fd === "number");

  const { errno } = native.close_fd({
    fd
  });

  assert(typeof errno === "number");

  return { errno };
};

module.exports = {
  create_socket,
  bind_ipv4,
  connect,
  listen,
  accept,
  sctp_recvmsg,
  sctp_sendmsg,
  setsockopt_sack_info,
  create_poller,
  get_socket_error,
  getsockname,
  close_fd
};
