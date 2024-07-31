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

// eslint-disable-next-line max-statements
const sctp_recvv = ({ fd, messageBuffer, sockaddr }) => {

  assert(typeof fd === "number");
  assert(messageBuffer instanceof Uint8Array);
  assert(sockaddr instanceof Uint8Array);

  const { errno, bytesReceived, flags, rcvinfo } = native.sctp_recvv({
    fd,
    messageBuffer,
    sockaddr
  });

  assert(typeof errno === "number");
  if (errno === 0) {
    assert(typeof bytesReceived === "number");
    assert(typeof flags === "number");

    if (rcvinfo !== undefined) {
      assert(typeof rcvinfo === "object");
      assert(typeof rcvinfo.sid === "bigint");
      assert(typeof rcvinfo.ssn === "bigint");
      assert(typeof rcvinfo.flags === "bigint");
      assert(typeof rcvinfo.ppid === "bigint");
      assert(typeof rcvinfo.context === "bigint");
    }
  }

  return {
    errno,
    bytesReceived,
    flags,
    rcvinfo
  };
};

const sctp_sendv = ({ fd, message, sndinfo, flags }) => {

  assert(typeof fd === "number");
  assert(message instanceof Uint8Array);
  assert(typeof sndinfo === "object");
  assert(typeof sndinfo.sid === "number");
  assert(typeof sndinfo.ppid === "number");
  assert(typeof sndinfo.context === "number");
  assert(typeof sndinfo.flags === "number");
  assert(typeof flags === "number");

  const { errno, bytesSent } = native.sctp_sendv({
    fd,
    message,
    sndinfo,
    flags
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

const getsockopt_sctp_status = ({ fd }) => {

  assert(typeof fd === "number");

  const { errno, info } = native.getsockopt_sctp_status({ fd });

  assert(typeof errno === "number");
  assert(typeof info === "object");

  return {
    errno,
    info
  };
};

const setsockopt_sctp_initmsg = ({
  fd,
  sinit_num_ostreams,
  sinit_max_instreams,
  sinit_max_attempts,
  sinit_max_init_timeo
}) => {

  assert(typeof fd === "number");
  assert(typeof sinit_num_ostreams === "number");
  assert(typeof sinit_max_instreams === "number");
  assert(typeof sinit_max_attempts === "number");
  assert(typeof sinit_max_init_timeo === "number");

  const { errno } = native.setsockopt_sctp_initmsg({
    fd,
    sinit_num_ostreams,
    sinit_max_instreams,
    sinit_max_attempts,
    sinit_max_init_timeo
  });

  assert(typeof errno === "number");

  return { errno };
};

const setsockopt_sctp_recvrcvinfo = ({ fd, value }) => {

  assert(typeof fd === "number");
  assert(typeof value === "number");

  const { errno } = native.setsockopt_sctp_recvrcvinfo({
    fd,
    value
  });

  assert(typeof errno === "number");

  return { errno };
};

const setsockopt_linger = ({ fd, onoff, linger }) => {

  assert(typeof fd === "number");
  assert(typeof onoff === "number");
  assert(typeof linger === "number");

  const { errno } = native.setsockopt_linger({
    fd,
    onoff,
    linger
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

const shutdown = ({ fd, how }) => {
  assert(typeof fd === "number");
  assert(typeof how === "number");

  const { errno } = native.shutdown({
    fd,
    how
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
  sctp_recvv,
  sctp_sendv,
  setsockopt_sack_info,
  getsockopt_sctp_status,
  setsockopt_sctp_initmsg,
  setsockopt_sctp_recvrcvinfo,
  setsockopt_linger,
  create_poller,
  get_socket_error,
  getsockname,
  shutdown,
  close_fd
};
