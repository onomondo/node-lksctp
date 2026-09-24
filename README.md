# node-lksctp

## System requirements

This package runs on Linux only. `package.json` declares `"os": ["linux"]`, so npm refuses to install it on macOS and Windows, where the native binding would fail to build.

Supported CPU architectures are x64 and arm64. On any other architecture, address formatting throws `unsupported arch`.

CI and `docker/Dockerfile` run Node.js 24.

Put the package in `optionalDependencies`. npm then skips it on other platforms and the install still succeeds. Load it lazily behind a `process.platform === "linux"` check or a `try`/`catch`, and fall back to a userspace SCTP implementation:

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

The binding links against libsctp from [LKSCTP](https://github.com/sctp/lksctp-tools), which Debian packages as `libsctp-dev`. CI builds against 1.0.19 (Ubuntu 24.04 on `ubuntu-latest`) and `docker/Dockerfile` against 1.0.21 (Debian trixie). Other versions will probably work too.

libsctp must define `HAVE_SCTP_SENDV`, which it does when `struct sctp_prinfo` is available at compile time. Some Debian releases ship `libsctp-dev` without this macro. In that case, build libsctp yourself:

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

The API follows the Node.js [Net] API. The differences are listed below.

### ~~new lksctp.Socket()~~

The Socket constructor is not available. Use `lksctp.createServer()` or `lksctp.connect()`.

### lksctp.createServer([options][, connectionListener]) -> `server`

- options [Object] optional; omitted, `undefined` and `null` all give the defaults
- connectionListener [Function] optional, registered as a listener for the "connection" event

`server` is an [EventEmitter](https://nodejs.org/api/events.html), like a [Net] server, so `off()`, `emit()`, `listenerCount()` and `events.once(server, "listening")` all work on it.

options:

- ~~allowHalfOpen~~
- highWaterMark [number] (see Node's [Net])
- ~~keepAlive~~
- ~~keepAliveInitialDelay~~
- noDelay [boolean] optional flag to disable Nagle's algorithm
- ~~pauseOnConnect~~
- MIS [number] maximum number of input streams
- OS [number] number of output streams
- sack [Object] optional, socket option SCTP_DELAYED_SACK as defined in [RFC](https://datatracker.ietf.org/doc/html/rfc6458#section-8.1.19), set on the listening socket and inherited by every accepted association
  - delay [number] `sack_delay` of socket option
  - freq [number] `sack_freq` of socket option

### `server`.listen(options[, callback]) -> `server`

### `server`.listen(port[, host][, backlog][, callback]) -> `server`

- options [Object]
- callback [Function] optional, registered as a one-shot "listening" listener

Both the options form and the positional form of [Net] work. The positional arguments are shorthand for the matching options below.

As in [Net], `callback` is a one-shot listener for the "listening" event. It runs asynchronously, after `listen()` returns, and never receives an error. If the bind fails, the server emits "error" and the callback does not run.

An optional argument that is absent, `undefined` or `null` means the same thing in all three cases. `listen(port, undefined)` and `listen(port, null)` bind exactly like `listen(port)`, `listen(options, undefined)` behaves like `listen(options)`, and `{ host: null }` binds every local address. [Net] treats missing arguments the same way, and callers that forward an optional value, such as `listen(port, opts.host)` or `listen(options, opts.callback)`, depend on it. An argument that is neither a host string nor a backlog number is still an error, and so is anything other than a callback after the options object.

With no `host` and no `localAddresses`, the socket binds `0.0.0.0` (every local IPv4 address), as [Net] does with no host. There is no dual-stack default because there is no IPv6 support: the socket is `AF_INET`, and an IPv6 `host` or `localAddresses` entry is refused.

`host` must be an IP address, since there is no DNS resolution. `port` is required and follows [Net]'s rule: a number or a numeric string, an integer between 0 and 65535. `0` asks the kernel for an ephemeral port. A missing port (`listen()`), a `null` port and an out-of-range port are all refused. Unlike `host`, a `null` port does not count as absent.

options:

- backlog [number] number of connections the kernel will accept for us
- ~~exclusive~~
- host [string] optional local IP address to bind to
- localAddresses [string[]] optional list of local addresses to bind to (not allowed together with host)
- ~~ipv6Only~~
- ~~path~~
- port [number] local port to bind to, required (`0` for an ephemeral one)
- ~~readableAll~~
- ~~signal~~
- ~~writableAll~~

### `server`.address() -> { family: "IPv4", address: string, port: number } | null

Locally bound primary address, or `null` while the server is not listening, as in [Net].

### `server`.getLocalAddresses() -> { family: "IPv4", address: string, port: number } []

Returns the locally bound addresses. Unlike `address()`, it throws while the server is not bound. It is not a [Net] method, so there is no `null` convention to follow.

### `server`.close([callback]) -> `server`

- callback [Function] optional, registered as a one-shot "close" listener

As in [Net], it does not throw when the server was not listening. A `callback` passed to such a call receives `Error("server is not running")`. "close" is emitted in both cases.

### Field `server`.listening [boolean]

True between a successful `listen()` and `close()`, as in [Net].

### lksctp.connect(options[, connectListener]) -> `duplex`

### lksctp.createConnection(options[, connectListener]) -> `duplex`

- options [Object]
- connectListener [Function] optional, registered as a listener for the "connect" event of `duplex`

`createConnection()` is an alias of `connect()`. Only the options form of [Net] is supported.

`host` and `localAddress` must be IPv4 addresses, since there is no DNS resolution and no IPv6 support. An IPv6 address is refused. `port` follows the same rule as in `listen()`: a number or a numeric string, an integer between 0 and 65535. As in `listen()`, an option that is absent, `undefined` or `null` counts as not given. `localPort` and `localAddress` are optional. `port` and one of `host` or `remoteAddresses` are required.

options:

- host [string] remote IP address to connect to
- remoteAddresses [string[]] remote IP addresses to connect to (not allowed together with host)
- port [number] remote port to connect to
- localPort [number] optional local port to bind to
- localAddress [string] optional local IP address to bind to
- localAddresses [string[]] optional list of local addresses to bind to (not allowed together with localAddress)
- highWaterMark [number] (see Node's [Net])
- noDelay [boolean] optional flag to disable Nagle's algorithm
- MIS [number] maximum number of input streams
- OS [number] number of output streams
- sack [Object] optional, socket option SCTP_DELAYED_SACK as defined in [RFC](https://datatracker.ietf.org/doc/html/rfc6458#section-8.1.19)
  - delay [number] `sack_delay` of socket option
  - freq [number] `sack_freq` of socket option

### `duplex`.write(data[, encoding][, callback])

See Node's [Stream].

- data [Buffer]
  - data.ppid [number] optional payload protocol identifier
  - data.sid [number] optional stream ID

### `duplex`.setNoDelay([noDelay])

Like Node's [Net].

### `duplex`.status()

Returns a status object based on [SCTP_STATUS](https://datatracker.ietf.org/doc/html/rfc6458#section-8.2.1).

### `duplex`.end([data[, encoding]][, callback])

Like Node's [Net]. Performs a normal SCTP shutdown.

### `duplex`.destroy([error])

Like Node's [Net]. If the stream has not been closed with `end()`, it aborts the association (ABORT via [SO_LINGER](https://datatracker.ietf.org/doc/html/rfc6458#section-8.1.4)).

### `duplex`.address() -> { address: string, family: "IPv4", port: number }

Locally bound primary address, as in [Net]. The values match `localAddress`, `localFamily` and `localPort`.

### Field `duplex`.connecting [boolean]

True until the association is established, as in [Net].

### Field `duplex`.pending [boolean]

Same value as `connecting`.

### Field `duplex`.readyState [string]

`"opening"` until the association is established, then `"open"`.

### Field `duplex`.localFamily [string]

Local family, "IPv4"

### Field `duplex`.localPort [number]

Locally bound port

### Field `duplex`.localAddress [string]

Current local primary address (may change at runtime)

### Field `duplex`.localAddresses [string[]]

Currently bound local addresses (may change at runtime, including the primary address in `localAddress`)

### Field `duplex`.remoteFamily [string]

Remote family, "IPv4"

### Field `duplex`.remotePort [number]

Remote port

### Field `duplex`.remoteAddress [string]

Current remote primary address (may change at runtime)

### Field `duplex`.remoteAddresses [string[]]

Current remote addresses (may change at runtime, including the primary address in `remoteAddress`)

### Field `duplex`.peerInfoByAddress [{ [address]: info }]

- info: peer address information based on [RFC](https://datatracker.ietf.org/doc/html/rfc6458#section-8.2.2), or undefined if unavailable

### Event `server` - "connection"

- socket [`duplex`] the accepted association

Raised for every accepted association.

### Event `server` - "listening"

Raised once the socket is bound. As in [Net], it is emitted asynchronously (on the next microtask), so a listener attached after the synchronous `listen()` call still receives it. If the server is closed before that microtask runs, the event is dropped, also as in [Net].

### Event `server` - "error"

Raised when the socket cannot be created or bound, or when `accept()` fails. The socket is closed first. As in [Net], the event is emitted asynchronously (on the next microtask), so a failed bind does not throw out of `listen()`, and a handler attached after the call still receives it. That includes `events.once(server, "listening")`, which rejects. Arguments that are invalid on their own, such as a bad port or an IPv6 host, still throw from `listen()`, as in [Net].

### Event `server` - "close"

Raised after `close()` has released the socket.

### Event `duplex` - "connect"

Raised on a duplex from `connect()` once the association is established. Duplexes from the server's "connection" event are already connected and never raise it.

### Event `duplex` - "data"

- data [Buffer]
  - data.ppid [number] received payload protocol identifier
  - data.sid [number] received stream ID

### Event `duplex` - "address-change"

Raised when a local or remote address changes. Read the new values from the `duplex`.local\* and `duplex`.remote\* fields.

### Event `duplex` - "notification"

Raised when a [Notification](https://datatracker.ietf.org/doc/html/rfc6458#section-6) arrives. The event argument contains the raw, parsed and interpreted notification data.

### Event `duplex` - "peer-info-update"

Raised after `duplex`.peerInfoByAddress is refreshed. The contents have not necessarily changed.

[Net]: https://nodejs.org/api/net.html
[Stream]: https://nodejs.org/api/stream.html
