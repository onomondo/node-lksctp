/* eslint-disable max-statements */

const perf_hooks = require("node:perf_hooks");

const performance = perf_hooks.performance;

let connectedClients = [];
let totalSent = 0;
let totalReceived = 0;

let lastReceived = 0;
let lastSent = 0;
let lastMonotonicTime = performance.now();

let currentClientIndex = 0;
const maxSendQueue = 100;
const batchSize = 40;
const messageSize = 270;
const numberOfConnections = process.env.SERVER ? 0 : 1;
const messageBuffer = Buffer.alloc(messageSize);
console.log("connections", numberOfConnections);
const maybeSendNext = () => {
  if (connectedClients.length === 0) {
    console.log("no clients connected");
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
      // console.log("sending data");
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

const run = ({ server, connect }) => {
  for (let i = 0; i < messageBuffer.length; i += 1) {
    messageBuffer[i] = Math.floor(Math.random() * 256);
  }

  // eslint-disable-next-line prefer-const
  setInterval(() => {
    const now = performance.now();

    const receivedSinceLast = totalReceived - lastReceived;
    const sentSinceLast = totalSent - lastSent;
    const timeSinceLast = now - lastMonotonicTime;

    const messagesReceivedPerSecond =
      (receivedSinceLast / timeSinceLast) * 1000;
    const messagesSentPerSecond = (sentSinceLast / timeSinceLast) * 1000;

    const pendingOrLost = totalSent - totalReceived;

    console.log({
      messagesReceivedPerSecond,
      messagesSentPerSecond,
      pendingOrLost,
    });

    lastReceived = totalReceived;
    lastSent = totalSent;
    lastMonotonicTime = now;
  }, 1000);

  server.on("error", (error) => {
    console.error("server error", error);
  });

  server.on("connection", (socket) => {
    clientOfServer = socket;

    connectedClients.push(socket);
    maybeSendNext();

    console.log("client connected!");

    socket.on("data", () => {
      totalReceived += 1;
      maybeSendNext();
    });

    socket.on("end", () => {});

    socket.on("error", (error) => {
      console.error("socket error", error);
    });
  });

  for (let i = 0; i < numberOfConnections; i += 1) {
    console.log("server is connecting");
    const client = connect();

    client.on("connect", () => {
      console.log("client connected");

      connectedClients.push(client);
      maybeSendNext();
    });

    client.on("error", (error) => {
      console.error("client error", error);
    });

    client.on("data", () => {});
  }
};

function runClient({ connect }) {
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
    totalReceived += 1;
    maybeSendNext();
  });

  setTimeout(maybeSendNext, 0);
}

module.exports = {
  run,
  runClient,
};
