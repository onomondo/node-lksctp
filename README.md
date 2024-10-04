# node-lksctp

## System requirements

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
* options [Object]

options:
* ~~allowHalfOpen~~
* highWaterMark [number] (see Node's [Net])
* ~~keepAlive~~
* ~~keepAliveInitialDelay~~
* noDelay [boolean] optional flag to disable Nagle's algorithm
* ~~pauseOnConnect~~
* MIS [number] maximum number of input streams
* OS [number] number of output streams
* sctp [Object] optional
    * sack [Object] optional, socket option SCTP_DELAYED_SACK as defined in [RFC](https://datatracker.ietf.org/doc/html/rfc6458#section-8.1.19), will be set for every connection
        * delay [number] `sack_delay` of socket option
        * freq [number] `sack_freq` of socket option

### `server`.listen(options[, callback]) -> `duplex`
* options [Object]

Only the options variant of [Net] is supported.

options:
* backlog [number] number of connections kernel will accept for us
* ~~exclusive~~
* host [string] optional local IP address to bind to
* localAddresses [string[]] optional list of local address to bind to (host option is not allowed if this is passed)
* ~~ipv6Only~~
* ~~path~~
* port [number] optional local port to bind to
* ~~readableAll~~
* ~~signal~~
* ~~writableAll~~

### `server`.getLocalAddresses() -> { family: "IPv4", address: string, port: number } []

Get locally bound addresses


### lksctp.connect(options[, connectListener]) -> `duplex`
* options [Object]

Only the options variant of [Net] is supported.

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
* sctp [Object] optional
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
