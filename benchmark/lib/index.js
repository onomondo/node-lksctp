/* eslint-disable max-statements */

const perf_hooks = require("node:perf_hooks");

const performance = perf_hooks.performance;

const run = ({ server, connect }) => {

  const maxSendQueue = 100;
  const batchSize = 40;
  const messageSize = 270;
  const numberOfConnections = 1;

  const messageBuffer = Buffer.alloc(messageSize);
  for (let i = 0; i < messageBuffer.length; i += 1) {
    messageBuffer[i] = Math.floor(Math.random() * 256);
  }

  // eslint-disable-next-line prefer-const
  let connectedClients = [];
  let totalSent = 0;
  let totalReceived = 0;

  let lastReceived = 0;
  let lastSent = 0;
  let lastMonotonicTime = performance.now();
  setInterval(() => {
    const now = performance.now();

    const receivedSinceLast = totalReceived - lastReceived;
    const sentSinceLast = totalSent - lastSent;
    const timeSinceLast = now - lastMonotonicTime;

    const messagesReceivedPerSecond = receivedSinceLast / timeSinceLast * 1000;
    const messagesSentPerSecond = sentSinceLast / timeSinceLast * 1000;

    const pendingOrLost = totalSent - totalReceived;

    console.log({ messagesReceivedPerSecond, messagesSentPerSecond, pendingOrLost });

    lastReceived = totalReceived;
    lastSent = totalSent;
    lastMonotonicTime = now;
  }, 1000);

  let currentClientIndex = 0;

  const maybeSendNext = () => {
    if (connectedClients.length === 0) {
      return;
    }

    const pending = totalSent - totalReceived;

    if (pending >= maxSendQueue - batchSize) {
      // console.log("backpressure");
      return;
    }

    for (let i = 0; i < batchSize; i += 1) {

      const client = connectedClients[currentClientIndex];
      currentClientIndex = (currentClientIndex + 1) % connectedClients.length;

      client.write(messageBuffer, (err) => {
        if (err) {
          throw err;
        }

        maybeSendNext();
      });

      totalSent += 1;
    }

    // console.log({ totalSent });

    setTimeout(() => {
      maybeSendNext();
    }, 0);
  };

  server.on("error", (error) => {
    console.error("server error", error);
  });

  server.on("connection", (socket) => {
    clientOfServer = socket;
    maybeSendNext();

    console.log("client connected!");

    socket.on("data", () => {
      totalReceived += 1;
      maybeSendNext();
    });

    socket.on("end", () => {

    });

    socket.on("error", (error) => {
      console.error("socket error", error);
    });
  });


  for (let i = 0; i < numberOfConnections; i += 1) {
    const client = connect();

    client.on("connect", () => {
      console.log("client connected");

      connectedClients.push(client);
      maybeSendNext();
    });

    client.on("error", (error) => {
      console.error("client error", error);
    });

    client.on("data", () => {

    });
  }
};

module.exports = {
  run
};
