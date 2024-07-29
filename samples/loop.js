const lksctp = require("../lib/index.js");

const server = lksctp.createServer();

const port = 12345;

server.on("error", (error) => {
  console.error("server error", error);
});

server.on("connection", (socket) => {
  console.log("client connected!");

  socket.on("data", (data) => {
    console.log("server received data", data);
  });

  socket.on("end", () => {
    console.log("socket ended");
  });

  socket.on("error", (error) => {
    console.error("socket error", error);
  });
});

server.listen({ port }, () => {
  console.log(`SCPT server listening on :${port}`);
});

const client = lksctp.connect({ host: "127.0.0.1", port });

client.on("connect", () => {
  console.log("client connected");

  console.log("sending test message");
  client.write(Buffer.from("hello world"));
  client.end();
});

client.on("error", (error) => {
  console.error("client error", error);
});

client.on("data", (data) => {
  console.log("client received data", data);
});
