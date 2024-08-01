const lksctp = require("../lib/index.js");
const benchmark = require("./lib/index.js");

const port = 12345;

const server = lksctp.createServer({
  sack: {
    freq: 1
  }
});

server.on("error", (error) => {
  console.error("server error", error);
});

server.listen({ port, backlog: 2000 }, () => {
  console.log(`SCPT server listening on :${port}`);
});

benchmark.run({
  server,
  connect: () => {
    return lksctp.connect({
      host: "127.0.0.1",
      port,
      sctp: {
        sack_freq: 1
      }
    });
  }
});
