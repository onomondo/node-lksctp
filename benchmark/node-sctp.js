const sctp = require("sctp");
const benchmark = require("./lib/index.js");

const port = 12345;

const server = sctp.createServer();

server.on("error", (error) => {
    console.error("server error", error);
});

server.listen({ port, backlog: 2000 }, () => {
    console.log(`SCPT server listening on :${port}`);
});

benchmark.run({
    server,
    connect: () => {
        return sctp.connect({ host: "127.0.0.1", port });
    }
});
