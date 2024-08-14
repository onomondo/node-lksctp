const lksctp = require("../lib/index.js");
const socketpairFactory = require("./lib/socketpair.js");
const assert = require("node:assert");
const net = require("node:net");

const assertIsValidPortNumber = (value) => {
  assert.strictEqual(typeof value, "number");
  assert(!Number.isNaN(value));
  assert(Number.isInteger(value));
  assert(value > 0 && value < 65536);
};

const assertIsIPAddress = (value) => {
  assert(net.isIP(value));
};

describe("api", () => {
  describe("server", () => {
    it("should support createServer with no arguments", () => {
      const server = lksctp.createServer();
      server.close();
    });

    it("should support createServer with only a callback argument", () => {
      const server = lksctp.createServer(() => {

      });
      server.close();
    });

    it("should support createServer with only an options object", () => {
      const server = lksctp.createServer({});
      server.close();
    });

    it("should support createServer with an options object and a callback argument", () => {
      const server = lksctp.createServer({}, () => {

      });
      server.close();
    });

    it("should support listen with only an options object", () => {
      const server = lksctp.createServer();
      server.listen({
        port: 0
      });
      server.close();
    });

    it("should support listen with an options object and a callback argument", () => {
      const server = lksctp.createServer();
      server.listen({
        port: 0
      }, () => {

      });
      server.close();
    });

    const withListeningServerInstance = async ({ socketOptions, listenOptions, test }) => {
      const server = lksctp.createServer(socketOptions);
      try {
        await new Promise((resolve, reject) => {
          server.listen({
            port: 0,
            ...listenOptions
          }, () => {
            resolve();
          });

          server.on("error", (error) => {
            reject(error);
          });
        });

        await test({ server });
      } finally {
        server.close();
      }
    };

    describe("address() method", () => {
      it("should return expected interface without error", async () => {
        await withListeningServerInstance({
          test: ({ server }) => {
            const address = server.address();

            assert.strictEqual(address.family, "IPv4");
            assertIsValidPortNumber(address.port);
            assertIsIPAddress(address.address);
          }
        });
      });

      it("should return correct address and port", async () => {
        const requestedAddress = "127.0.0.1";
        const requestedPort = 12345;

        await withListeningServerInstance({
          listenOptions: {
            host: requestedAddress,
            port: requestedPort
          },

          test: ({ server }) => {
            const address = server.address();

            assert.strictEqual(address.family, "IPv4");
            assert.strictEqual(address.port, requestedPort);
            assert.strictEqual(address.address, requestedAddress);
          }
        });
      });
    });
  });

  describe("socket-duplex", () => {
    describe("address() method", () => {
      it("should return expected interface without error", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            const serverAddress = server.address();
            const clientAddress = client.address();

            assert.strictEqual(serverAddress.family, "IPv4");
            assert.strictEqual(clientAddress.family, "IPv4");

            assertIsValidPortNumber(serverAddress.port);
            assertIsValidPortNumber(clientAddress.port);

            assertIsIPAddress(serverAddress.address);
            assertIsIPAddress(clientAddress.address);
          }
        });
      });

      it("should return correct address and port", async () => {
        const serverAddressToUse = "127.0.0.1";
        const clientAddressToUse = "127.0.0.1";
        const requestedServerPort = 12345;
        const requestedClientPort = 12346;

        await socketpairFactory.withSocketpair({
          options: {
            server: {
              listen: {
                host: serverAddressToUse,
                port: requestedServerPort
              }
            },
            client: {
              localAddress: clientAddressToUse,
              localPort: requestedClientPort
            }
          },

          test: ({ server, client }) => {
            const serverAddress = server.address();
            const clientAddress = client.address();

            assert.strictEqual(serverAddress.family, "IPv4");
            assert.strictEqual(clientAddress.family, "IPv4");

            assert.strictEqual(serverAddress.port, requestedServerPort);
            assert.strictEqual(clientAddress.port, requestedClientPort);

            assert.strictEqual(serverAddress.address, serverAddressToUse);
            assert.strictEqual(clientAddress.address, clientAddressToUse);
          }
        });
      });
    });

    describe("localFamily property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(typeof server.localFamily, "string");
            assert.strictEqual(typeof client.localFamily, "string");
          }
        });
      });

      it("should match value of address().family", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(server.localFamily, server.address().family);
            assert.strictEqual(client.localFamily, client.address().family);
          }
        });
      });
    });

    describe("localAddress property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assertIsIPAddress(server.localAddress);
            assertIsIPAddress(client.localAddress);
          }
        });
      });

      it("should match value of address().address", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(server.localAddress, server.address().address);
            assert.strictEqual(client.localAddress, client.address().address);
          }
        });
      });
    });

    describe("localPort property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assertIsValidPortNumber(server.localPort);
            assertIsValidPortNumber(client.localPort);
          }
        });
      });

      it("should match value of address().port", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(server.localPort, server.address().port);
            assert.strictEqual(client.localPort, client.address().port);
          }
        });
      });
    });

    describe("remoteFamily property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(typeof server.remoteFamily, "string");
            assert.strictEqual(typeof client.remoteFamily, "string");
          }
        });
      });

      it("should be as expected", async () => {

        const requestedServerAddress = "127.0.0.1";
        const requestedServerPort = 12345;

        await socketpairFactory.withSocketpair({
          options: {
            server: {
              listen: {
                host: requestedServerAddress,
                port: requestedServerPort
              }
            }
          },
          test: ({ client }) => {
            assert.strictEqual(client.remoteFamily, "IPv4");
          }
        });
      });
    });

    describe("remoteAddress property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assertIsIPAddress(server.remoteAddress);
            assertIsIPAddress(client.remoteAddress);
          }
        });
      });

      it("should be as expected", async () => {
        const requestedServerAddress = "127.0.0.1";
        const requestedServerPort = 12345;

        await socketpairFactory.withSocketpair({
          options: {
            server: {
              listen: {
                host: requestedServerAddress,
                port: requestedServerPort
              }
            }
          },
          test: ({ client }) => {
            assert.strictEqual(client.remoteAddress, requestedServerAddress);
          }
        });
      });
    });

    describe("remotePort property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assertIsValidPortNumber(server.remotePort);
            assertIsValidPortNumber(client.remotePort);
          }
        });
      });

      it("should be as expected", async () => {
        const requestedServerAddress = "127.0.0.1";
        const requestedServerPort = 12345;

        await socketpairFactory.withSocketpair({
          options: {
            server: {
              listen: {
                host: requestedServerAddress,
                port: requestedServerPort
              }
            }
          },
          test: ({ client }) => {
            assert.strictEqual(client.remotePort, requestedServerPort);
          }
        });
      });
    });

  });
});
