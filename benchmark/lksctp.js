const lksctp = require("../lib/index.js");
const benchmark = require("./lib/index.js");

const port = 12345;

if (process.env.SERVER) {
  const server = lksctp.createServer({
    sack: {
      freq: 1,
    },
  });

  server.on("error", (error) => {
    console.error("server error", error);
  });

  server.listen(
    { host: process.env.SERVER, port, backlog: 2000 },
    () => {
      console.log(`SCPT server listening on ${process.env.SERVER}:${port}`);
    },
  );

  console.log(server.address());

  console.log(server);
  benchmark.run({
    server,
    connect: () => {
      return lksctp.connect({
        host: process.env.SERVER_HOST,
        port,
        sctp: {
          sack_freq: 1,
        },
      });
    },
  });
} else {
  benchmark.runClient({
    connect: () => {
      console.log("connecting to", process.env.SERVER_HOST);
      return lksctp.connect({
        host: process.env.SERVER_HOST,
        port,
        sctp: {
          sack_freq: 1,
        },
      });
    },
  });
}
