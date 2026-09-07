const lksctp = require("../lib/index.js");
const socketpairFactory = require("./lib/socketpair.js");
const assert = require("node:assert");
const net = require("node:net");
const events = require("node:events");

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
  // eslint-disable-next-line max-statements
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

    it("should support listen with a positional port (net.Server style)", () => {
      const server = lksctp.createServer();
      server.listen(0);
      server.close();
    });

    it("should support listen with a positional port and host (net.Server style)", () => {
      const server = lksctp.createServer();
      server.listen(0, "127.0.0.1");
      server.close();
    });

    it("should support listen with a positional port and a callback argument (net.Server style)", () => {
      const server = lksctp.createServer();
      server.listen(0, () => {

      });
      server.close();
    });

    it("should emit 'listening' asynchronously so a listener attached after listen() still fires", async () => {
      const server = lksctp.createServer();
      try {
        server.listen(0);
        // once() attaches only after listen() has returned; a synchronous emit
        // would be missed. Parity with net.Server / node-sctp.
        await events.once(server, "listening");
      } finally {
        server.close();
      }
    });

    it("should support a positional port and backlog (net.Server style)", () => {
      const server = lksctp.createServer();
      server.listen(0, 128);
      server.close();
    });

    it("should support the full positional form: port, host, backlog and callback", () => {
      const server = lksctp.createServer();
      server.listen(0, "127.0.0.1", 128, () => {

      });
      server.close();
    });

    it("should throw when listen() is called with no arguments", () => {
      assert.throws(() => {
        const server = lksctp.createServer();
        try {
          server.listen();
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "at least one argument is required";
      });
    });

    it("should throw when an options object is passed with extra arguments", () => {
      assert.throws(() => {
        const server = lksctp.createServer();
        try {
          server.listen({ port: 0 }, {});
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "invalid number of arguments";
      });
    });

    it("should throw on a positional argument that is neither host nor backlog", () => {
      assert.throws(() => {
        const server = lksctp.createServer();
        try {
          server.listen(0, {});
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "invalid listen() argument";
      });
    });

    // A caller that forwards an optional host — `listen(port, opts.host)` with
    // nothing configured — hands over undefined, and net binds it as if the
    // argument were absent. node-diameter and node-stp are both written that
    // way, so these are the forms the ecosystem actually calls.
    it("should treat an undefined host as an absent one (net.Server style)", () => {
      const server = lksctp.createServer();
      server.listen(0, undefined);
      server.close();
    });

    it("should treat a null host as an absent one (net.Server style)", () => {
      const server = lksctp.createServer();
      server.listen(0, null);
      server.close();
    });

    it("should accept an undefined host followed by a callback", async () => {
      const server = lksctp.createServer();
      try {
        await new Promise((resolve, reject) => {
          server.listen(0, undefined, () => {
            resolve();
          });

          server.on("error", reject);
        });
      } finally {
        server.close();
      }
    });

    it("should accept undefined in every optional positional slot", () => {
      const server = lksctp.createServer();
      server.listen(0, undefined, undefined);
      server.close();
    });

    it("should treat host: undefined in the options object as an absent host", () => {
      const server = lksctp.createServer();
      server.listen({ port: 0, host: undefined });
      server.close();
    });

    it("should treat host: null in the options object as an absent host", () => {
      const server = lksctp.createServer();
      server.listen({ port: 0, host: null });
      server.close();
    });

    it("should not read a null host as a conflict with localAddresses", () => {
      const server = lksctp.createServer();
      server.listen({ port: 0, host: null, localAddresses: ["127.0.0.1"] });
      server.close();
    });

    // The socket options survive as far as listen(), which reads them to build
    // the socket — an options argument that was dropped for a null shows up
    // there and nowhere earlier, so each of these has to bind to prove anything.
    it("should support createServer with undefined options and a connection listener", () => {
      const server = lksctp.createServer(undefined, () => {

      });
      server.listen(0);
      server.close();
    });

    it("should support createServer with null options and a connection listener", () => {
      const server = lksctp.createServer(null, () => {

      });
      server.listen(0);
      server.close();
    });

    it("should support createServer with undefined options alone", () => {
      const server = lksctp.createServer(undefined);
      server.listen(0);
      server.close();
    });

    // port follows net's validatePort: a number or a numeric string, integral,
    // 0..65535. isNaN() used to admit `null` as an ephemeral port and to pass
    // 99999 down to Buffer#writeUInt16BE, whose range error names no option.
    it("should accept a numeric string as the port (net.Server style)", () => {
      const server = lksctp.createServer();
      server.listen({ port: "0" });
      server.close();
    });

    it("should throw on a null port rather than bind an ephemeral one", () => {
      assert.throws(() => {
        const server = lksctp.createServer();
        try {
          server.listen({ port: null });
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "port is required and must be a number";
      });
    });

    it("should throw on a port above the maximum", () => {
      assert.throws(() => {
        const server = lksctp.createServer();
        try {
          server.listen({ port: 99999 });
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "port must be between 0 and 65535";
      });
    });

    it("should throw on a negative port", () => {
      assert.throws(() => {
        const server = lksctp.createServer();
        try {
          server.listen({ port: -1 });
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "port is required and must be a number";
      });
    });

    it("should throw on a fractional port", () => {
      assert.throws(() => {
        const server = lksctp.createServer();
        try {
          server.listen({ port: 1.5 });
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "port is required and must be a number";
      });
    });

    it("should throw on an empty string port", () => {
      assert.throws(() => {
        const server = lksctp.createServer();
        try {
          server.listen({ port: "" });
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "port is required and must be a number";
      });
    });

    it("should throw when createServer is given options that are not an object", () => {
      assert.throws(() => {
        lksctp.createServer("127.0.0.1");
      }, (ex) => {
        return ex.message === "options must be an object";
      });
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

    describe("getLocalAddresses() method", () => {
      it("should return expected interface without error", async () => {
        await withListeningServerInstance({
          test: ({ server }) => {
            const addresses = server.getLocalAddresses();

            addresses.forEach((address) => {
              assert.strictEqual(address.family, "IPv4");
              assertIsValidPortNumber(address.port);
              assertIsIPAddress(address.address);
            });
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
            const addresses = server.getLocalAddresses();

            let requestedAddressFound = false;

            addresses.forEach((address) => {
              assert.strictEqual(address.family, "IPv4");
              assert.strictEqual(address.port, requestedPort);

              if (address.address === requestedAddress) {
                requestedAddressFound = true;
              }
            });

            assert(requestedAddressFound);
          }
        });
      });
    });

    it("should throw if localAddresses are empty", () => {
      assert.throws(() => {

        const server = lksctp.createServer();
        try {
          server.listen({
            port: 0,
            localAddresses: [],
          });
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "localAddresses must have at least one element";
      });
    });

    it("should throw if localAddresses contains any non ip-address", () => {
      assert.throws(() => {

        const server = lksctp.createServer();
        try {
          server.listen({
            port: 0,
            localAddresses: ["127.0.0.1", "not-an-ip-address"],
          });
        } finally {
          server.close();
        }
      }, (ex) => {
        return ex.message === "localAddresses must be an array of valid IP addresses";
      });
    });
  });

  describe("client", () => {
    it("should support remoteAddresses (single address)", async () => {
      const requestedServerAddress = "127.0.0.1";
      const requestedServerPort = 12345;

      await socketpairFactory.withSocketpair({
        options: {
          server: {
            listen: {
              host: requestedServerAddress,
              port: requestedServerPort
            }
          },
          client: {
            host: undefined,
            remoteAddresses: [requestedServerAddress],
          }
        },
        test: ({ client }) => {
          assert.strictEqual(client.remoteAddress, requestedServerAddress);
          assert.strictEqual(client.remotePort, requestedServerPort);
        }
      });
    });

    it("should support remoteAddresses (multiple addresses)", async () => {
      const requestedServerAddress = "127.0.0.1";
      const requestedServerPort = 12345;

      await socketpairFactory.withSocketpair({
        options: {
          server: {
            listen: {
              host: requestedServerAddress,
              port: requestedServerPort
            }
          },
          client: {
            host: undefined,
            remoteAddresses: [requestedServerAddress, "127.0.0.99"],
          }
        },
        test: ({ client }) => {
          assert.strictEqual(client.remoteAddress, requestedServerAddress);
          assert.strictEqual(client.remotePort, requestedServerPort);
        }
      });
    });

    it("should support localAddresses (single address)", async () => {
      const requestedServerAddress = "127.0.0.1";
      const requestedClientAddress = "127.0.0.1";
      const requestedServerPort = 12345;

      await socketpairFactory.withSocketpair({
        options: {
          server: {
            listen: {
              host: requestedServerAddress,
              port: requestedServerPort
            }
          },
          client: {
            localAddresses: [requestedClientAddress],
          }
        },
        test: ({ client }) => {
          assert.strictEqual(client.localAddress, requestedClientAddress);
        }
      });
    });

    it("should throw if both host and remoteAddresses are specified", () => {
      assert.throws(() => {
        lksctp.connect({
          host: "127.0.0.1",
          remoteAddresses: ["127.0.0.1"],
          port: 12345
        });
      }, (ex) => {
        return ex.message === "host and remoteAddresses are mutually exclusive";
      });
    });

    it("should throw if remoteAddresses are empty", () => {
      assert.throws(() => {
        lksctp.connect({
          remoteAddresses: [],
          port: 12345
        });
      }, (ex) => {
        return ex.message === "remoteAddresses must have at least one element";
      });
    });

    it("should throw if remoteAddresses contains any non ip-address", () => {
      assert.throws(() => {
        lksctp.connect({
          remoteAddresses: ["127.0.0.1", "not-an-ip-address"],
          port: 12345
        });
      }, (ex) => {
        return ex.message === "remoteAddresses must be an array of valid IP addresses";
      });
    });

    it("should throw if localAddresses are empty", () => {
      assert.throws(() => {
        lksctp.connect({
          remoteAddresses: ["127.0.0.1"],
          port: 12345,
          localAddresses: [],
        });
      }, (ex) => {
        return ex.message === "localAddresses must have at least one element";
      });
    });

    it("should throw if localAddresses contains any non ip-address", () => {
      assert.throws(() => {
        lksctp.connect({
          remoteAddresses: ["127.0.0.1"],
          port: 12345,
          localAddresses: ["127.0.0.1", "not-an-ip-address"],
        });
      }, (ex) => {
        return ex.message === "localAddresses must be an array of valid IP addresses";
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

    describe("localAddresses property", () => {
      it("should return expected interface without error", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            const serverAddresses = server.localAddresses;
            const clientAddresses = client.localAddresses;

            serverAddresses.forEach((address) => {
              assertIsIPAddress(address);
            });

            clientAddresses.forEach((address) => {
              assertIsIPAddress(address);
            });
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
            const serverAddresses = server.localAddresses;
            const clientAddresses = client.localAddresses;

            assert.strictEqual(serverAddresses.length, 1);

            const serverAddress = serverAddresses[0];
            assert.strictEqual(serverAddress, serverAddressToUse);

            assert.strictEqual(clientAddresses.length, 1);

            const clientAddress = clientAddresses[0];
            assert.strictEqual(clientAddress, clientAddressToUse);
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

    describe("remoteAddresses property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            const serverAddresses = server.remoteAddresses;
            const clientAddresses = client.remoteAddresses;

            serverAddresses.forEach((address) => {
              assertIsIPAddress(address);
            });

            clientAddresses.forEach((address) => {
              assertIsIPAddress(address);
            });
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
            const clientAddresses = client.remoteAddresses;
            assert.strictEqual(clientAddresses.length, 1);

            const clientAddress = clientAddresses[0];
            assert.strictEqual(clientAddress, requestedServerAddress);
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

    describe("connecting property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(typeof server.connecting, "boolean");
            assert.strictEqual(typeof client.connecting, "boolean");
          }
        });
      });

      it("should be false after connect", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(server.connecting, false);
            assert.strictEqual(client.connecting, false);
          }
        });
      });
    });

    describe("readyState property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(typeof server.readyState, "string");
            assert.strictEqual(typeof client.readyState, "string");
          }
        });
      });

      it("should be 'open' after connect", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(server.readyState, "open");
            assert.strictEqual(client.readyState, "open");
          }
        });
      });
    });

    describe("pending property", () => {
      it("should have the property", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(typeof server.pending, "boolean");
            assert.strictEqual(typeof client.pending, "boolean");
          }
        });
      });

      it("should be false after connect", async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            assert.strictEqual(server.pending, false);
            assert.strictEqual(client.pending, false);
          }
        });
      });
    });
  });
});
