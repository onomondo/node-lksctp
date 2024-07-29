/* eslint-disable complexity */

const lksctp = require("../../lib/index.js");

const create = async ({ options } = {}) => {

  return new Promise((resolve, reject) => {
    const serverSocketOptions = options?.server?.socket || {};
    const serverListenOptions = {
      host: "127.0.0.1",
      port: 0,

      ...(options?.server?.listen || {})
    };

    let server = undefined;
    let serverConnection = undefined;
    let client = undefined;
    let clientConnection = undefined;

    const fail = ({ error }) => {
      serverConnection?.destroy();
      serverConnection = undefined;

      server?.close();
      server = undefined;

      client?.destroy();
      client = undefined;

      reject(error);
    };

    const timeoutHandle = setTimeout(() => {
      fail({ error: Error("socketpair timeout") });
    }, 10000);

    const maybeResolve = () => {
      if (serverConnection !== undefined && clientConnection !== undefined) {
        clearTimeout(timeoutHandle);
        resolve({ server: serverConnection, client: clientConnection });
      }
    };

    server = lksctp.createServer(serverSocketOptions);
    server.on("connection", (conn) => {
      // TODO: maybe check if conn is the correct client

      serverConnection = conn;
      maybeResolve();
    });
    server.on("error", (error) => {
      fail({ error });
    });
    server.listen(serverListenOptions, () => {
      const serverAddress = server.address();

      client = lksctp.connect({
        host: serverAddress.address,
        port: serverAddress.port,

        ...(options?.client || {})
      });

      client.on("connect", () => {
        clientConnection = client;
        maybeResolve();
      });

      client.on("error", (error) => {
        fail({ error });
      });

      client.on("close", () => {
        server?.close();
        server = undefined;
      });
    });
  });
};

const withSocketpair = async (fn) => {
  const { server, client } = await create();
  try {
    await fn({ server, client });
  } finally {
    server.destroy();
    client.destroy();
  }
};

module.exports = {
  create,
  withSocketpair
};
