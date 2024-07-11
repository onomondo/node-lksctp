const lksctp = require("../lib/index.js");

const server = lksctp.createServer();

const port = 12345;


server.on("error", (error) => {
    console.error("server error", error);
});

server.on("connection", (socket) => {
    console.log(`incoming connection from ${socket.remoteAddress}:${socket.remotePort}`);

    socket.on("data", (data) => {
        console.log("received data", data);
    });

    socket.on("end", () => {
        console.log("socket ended");
    });

    socket.on("error", (error) => {
        console.error("socket error", error);
    });
});

server.listen({ port }, (err) => {
    if (err) {
        console.error("server listen error", err);
        return;
    }

    console.log(`SCPT server listening on :${port}`);
});
