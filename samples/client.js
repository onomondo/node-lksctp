const lksctp = require("../lib/index.js");

const port = 12345;
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

client.on("end", () => {
  console.log("connection ended");
});

client.on("close", () => {
  console.log("connection closed");
});
