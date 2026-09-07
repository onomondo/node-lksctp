# node-lksctp

## System requirements

This package is Linux-only and declares `"os": ["linux"]`, so npm refuses to install it on
macOS and Windows instead of trying (and failing) to build the native binding there.

Depend on it through `optionalDependencies` rather than `dependencies` — npm then skips it
on non-Linux platforms and the install still succeeds — and load it lazily behind a
`process.platform === "linux"` check or a `try`/`catch`, falling back to a userspace SCTP
implementation:

```js
let sctp;
if (process.platform === "linux") {
  try {
    sctp = require("lksctp");
  } catch {
    // native binding unavailable, fall through
  }
}
sctp ??= require("some-userspace-sctp");
```

Requires libsctp of [LKSCTP](https://github.com/sctp/lksctp-tools), also known as libsctp-dev debian package.

It has been tested to work with v1.0.19 and v1.0.20, but most likely also supports older versions and newer versions.

The library must set HAVE_SCTP_SENDV, which will be the case when `struct sctp_prinfo` is around during compile time. Some debian versions ship libsctp-dev without this macro.

You can always compile libsctp yourself like so:

```
FROM debian:bullseye

RUN apt-get update && apt-get install -y build-essential autoconf automake libtool git

WORKDIR /root

RUN git clone https://github.com/sctp/lksctp-tools.git
WORKDIR /root/lksctp-tools
RUN git checkout v1.0.19
RUN ./bootstrap
RUN ./configure
RUN make -j $(nproc)
RUN make install
```

## Documentation

Refer to Node.js [Net] API.

Several existing differences explained below.

### ~~new lksctp.Socket()~~
The Socket constructor is not available. Use `lksctp.createServer()` or `lksctp.connect()`

### lksctp.createServer([options][, connectionListener]) -> `server`
* options [Object] — may be omitted, `undefined` or `null`; all three give the defaults

options:
* ~~allowHalfOpen~~
* highWaterMark [number] (see Node's [Net])
* ~~keepAlive~~
* ~~keepAliveInitialDelay~~
* noDelay [boolean] optional flag to disable Nagle's algorithm
* ~~pauseOnConnect~~
* MIS [number] maximum number of input streams
* OS [number] number of output streams
* sack [Object] optional, socket option SCTP_DELAYED_SACK as defined in [RFC](https://datatracker.ietf.org/doc/html/rfc6458#section-8.1.19), set on the listening socket and inherited by every accepted association
    * delay [number] `sack_delay` of socket option
    * freq [number] `sack_freq` of socket option

### `server`.listen(options[, callback]) -> `server`
### `server`.listen(port[, host][, backlog][, callback]) -> `server`
* options [Object]
* callback [Function] optional, registered as a one-shot "listening" listener

Both the options variant and the positional variant of [Net] are supported; the positional
arguments are a shorthand for the matching options below.

`callback` is what it is in [Net]: a one-shot listener for the "listening" event. It runs
asynchronously, after `listen()` has returned, and it is never handed an error — a bind that
fails emits "error" and the callback simply does not run. (It used to be called
synchronously, with the error as its first argument.)

An optional argument may be absent, `undefined` or `null`, and all three mean the same thing:
`listen(port, undefined)` and `listen(port, null)` bind exactly like `listen(port)`, and
`{ host: null }` binds every local address. This is what [Net] does with an argument it was
not given, and it is what a caller forwarding an optional host — `listen(port, opts.host)` —
depends on. An argument that is neither a host string nor a backlog number is still an error.

With no `host` and no `localAddresses`, the socket binds `0.0.0.0` — every local IPv4
address — as [Net] does with no host. Unlike [Net] there is no dual-stack default, because
there is no IPv6 at all: the socket is `AF_INET`, and an IPv6 `host` or `localAddresses`
entry is refused rather than bound.

`host` must be an IP address, since there is no DNS resolution. `port` must be present, and
follows [Net]'s rule: a number or a numeric string, integral, between 0 and 65535, where `0`
asks the kernel for an ephemeral port. An omitted port (`listen()`), a `null` port and a port
out of range are all refused — `null` is *not* read as absence here, unlike `host`.

options:
* backlog [number] number of connections kernel will accept for us
* ~~exclusive~~
* host [string] optional local IP address to bind to
* localAddresses [string[]] optional list of local address to bind to (host option is not allowed if this is passed)
* ~~ipv6Only~~
* ~~path~~
* port [number] local port to bind to, required (`0` for an ephemeral one)
* ~~readableAll~~
* ~~signal~~
* ~~writableAll~~

### `server`.address() -> { family: "IPv4", address: string, port: number } | null

Locally bound primary address, or `null` while the server is not listening, as in [Net].

### `server`.getLocalAddresses() -> { family: "IPv4", address: string, port: number } []

Get locally bound addresses. Unlike `address()` this one throws while the server is not
bound — it is not a [Net] method and has no null to answer with.

### `server`.close([callback]) -> `server`
* callback [Function] optional, registered as a one-shot "close" listener

Like [Net]: it does not throw when the server was not listening, and a `callback` given for
such a call is handed an `Error("server is not running")` instead. "close" is emitted either
way.

### Field `server`.listening [boolean]
True between a successful `listen()` and `close()`, as in [Net].


### lksctp.connect(options[, connectListener]) -> `duplex`
* options [Object]

Only the options variant of [Net] is supported.

`host` and `localAddress` must be IP addresses, since there is no DNS resolution, and IPv4
ones: an IPv6 address is refused rather than connected. `port` follows the same rule as in
`listen()` — a number or a numeric string, integral, 0..65535. As in `listen()`, an optional
option may be absent, `undefined` or `null`, and all three mean the same thing; `localPort`
and `localAddress` are optional, `host`/`remoteAddresses` and `port` are not.

options:
* host [string] remote host IP adress to connect to
* remoteAddresses [string[]] remote host IP addresses to connect to (host option is not allowed if this is passed)
* port [number] remote port to connect to
* localPort [number] optional local port to bind to
* localAddress [string] optional local IP address to bind to
* localAddresses [string[]] optional list of local address to bind to (localAddress option is not allowed if this is passed)
* noDelay [boolean] optional flag to disable Nagle's algorithm
* MIS [number] maximum number of input streams
* OS [number] number of output streams
* sack [Object] optional, socket option SCTP_DELAYED_SACK as defined in [RFC](https://datatracker.ietf.org/doc/html/rfc6458#section-8.1.19)
    * delay [number] `sack_delay` of socket option
    * freq [number] `sack_freq` of socket option


### `duplex`.write(data[, encoding][, callback])

See Node's [Stream]
* data [Buffer]
    * data.ppid [number] optional payload protocol identifier
    * data.sid [number] optional stream ID

### `duplex`.setNoDelay([noDelay])

Like Node's [Net]

### `duplex`.status()

Get a status object based on [SCTP_STATUS](https://datatracker.ietf.org/doc/html/rfc6458#section-8.2.1)

### `duplex`.end([data[, encoding]][, callback])
Like Node's [Net]
This will cause a normal shutdown

### `duplex`.destroy([error])
Like Node's [Net]
This will cause an ABORT via [SO_LINGER](https://datatracker.ietf.org/doc/html/rfc6458#section-8.1.4) if the stream has not been closed via end() yet.

### Field `duplex`.localFamily [string]
Local family, "IPv4"

### Field `duplex`.localPort [number]
Locally bound port

### Field `duplex`.localAddress [string]
Locally bound current primary address (may change during runtime)

### Field `duplex`.localAddresses [string[]]
List of currently locally bound addresses (may change during runtime, including primary address of localAddress)

### Field `duplex`.remoteFamily [string]
Remote family, "IPv4"

### Field `duplex`.remotePort [number]
Locally bound port

### Field `duplex`.remoteAddress [string]
Remote current primary address (may change during runtime)

### Field `duplex`.remoteAddresses [string[]]
List of current remote addresses (may change during runtime, including primary address of localAddress)

### Field `duplex`.peerInfoByAddress [{ [address]: info }]
* info - peer address information based on [RFC](https://datatracker.ietf.org/doc/html/rfc6458#section-8.2.2), or undefined if unavailable

### Event `server` - "listening"
Raised once the socket is bound. Emitted asynchronously (on the next microtask) like [Net],
so a listener attached *after* the synchronous `listen()` call still sees it — and, as in
[Net], dropped if the server is closed before that microtask runs.

### Event `server` - "close"
Raised once `close()` has released the socket.

### Event `duplex` - "data"
* data [Buffer]
    * data.ppid [number] received payload protocol identifier
    * data.sid [number] received stream ID

### Event `duplex` - "address-change"
Raised when an address change is detected (examine `duplex`.local* and `duplex`.remote*)

### Event `duplex` - "notification"
A [Notification](https://datatracker.ietf.org/doc/html/rfc6458#section-6) has been received. Event parameter contains raw, parsed and interpreted event data.

### Event `duplex` - "peer-info-update"
Event that `duplex`.peerInfoByAddress has been updated (not necessarily changed).

[Net]: https://nodejs.org/api/net.html
[Stream]: https://nodejs.org/api/stream.html
