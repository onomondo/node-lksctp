# node-lksctp

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
* ~~noDelay~~
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



[Net]: https://nodejs.org/api/net.html
