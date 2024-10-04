# node-lksctp

## Documentation

Refer to Node.js [Net] API.

Several existing differences explained below.

### ~~new lksctp.Socket()~~
The Socket constructor is not available. Use lksctp.

### lksctp.createServer([options][, connectionListener]) -> ServerInstance
* options [Object]

options:
* ~~allowHalfOpen~~
* highWaterMark [number] (see Node's [Net])
* ~~keepAlive~~
* ~~keepAliveInitialDelay~~
* ~~noDelay~~
* ~~pauseOnConnect~~



[Net]: https://nodejs.org/api/net.html
