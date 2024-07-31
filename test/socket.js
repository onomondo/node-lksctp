/* eslint-disable max-statements */

const assert = require("node:assert");
const socketpairFactory = require("./lib/socketpair.js");
const errors = require("../lib/errors.js");

// make sure unhandeled rejections are thrown
process.on("unhandledRejection", (reason) => {
  throw reason;
});

const generatePseudoRandomBuffer = ({ size }) => {
  const result = Buffer.alloc(size);
  for (let i = 0; i < 1000; i += 1) {
    result[i] = i % 256;
  }
  return result;
};

const doesErrorRelateToCode = ({ error, code }) => {
  const errno = errors.codeToErrno({ code });
  const expectedMessage = errors.errnoToMessage({ errno });

  const relates = error.code === code && error.message === expectedMessage;
  return relates;
};

const transmitAndShutdown = async ({ sender, receiver, packetsToSend }) => {
  let packetsReceived = [];

  await new Promise((resolve, reject) => {
    sender.on("error", (err) => {
      reject(err);
    });

    receiver.on("error", (err) => {
      reject(err);
    });

    receiver.on("data", (packetReceived) => {
      packetsReceived = [
        ...packetsReceived,
        packetReceived
      ];
    });

    receiver.on("end", () => {
      resolve();
    });

    receiver.resume();
    sender.resume();

    packetsToSend.forEach((packetToSend) => {
      sender.write(packetToSend);
    });

    sender.end();
  });

  return { packetsReceived };
};

const buffersEqual = ({ buffer1, buffer2 }) => {
  return Buffer.compare(buffer1, buffer2) === 0;
};

describe("socket", function () {
  this.timeout(20000);

  describe("pair", () => {
    it("should create a pair of connected sockets correctly", async () => {
      await socketpairFactory.withSocketpair({
        test: ({ server, client }) => {
          server;
          client;
        }
      });
    });
  });

  describe("status", () => {
    it("should allow to retrieve stcp status", async () => {
      await socketpairFactory.withSocketpair({
        test: ({ server, client }) => {
          client;

          const status = server.status();

          // example:
          //
          // status: {
          //   tag: 82,
          //   state: 4,
          //   rwnd: 106496,
          //   unackdata: 0,
          //   penddata: 0,
          //   numberOfIncomingStreams: 10,
          //   numberOfOutgoingStreams: 10,
          //   fragmentationPoint: 65484,
          //   incomingQueue: 82,
          //   outgoingQueue: 3101425666,
          //   overallError: 16777343,
          //   maxBurst: 0,
          //   maxSeg: 0,
          //   peer: { tag: 1, rwnd: 0, cap: 7, sack: 0 }
          // }

          const isPositiveInteger = ({ value }) => {
            return !isNaN(value) && value >= 0;
          };

          assert(typeof status === "object");
          assert(isPositiveInteger({ value: status.tag }));
          assert(isPositiveInteger({ value: status.state }));
          assert(isPositiveInteger({ value: status.rwnd }));
          assert(isPositiveInteger({ value: status.unackdata }));
          assert(isPositiveInteger({ value: status.penddata }));
          assert(isPositiveInteger({ value: status.numberOfIncomingStreams }));
          assert(isPositiveInteger({ value: status.numberOfOutgoingStreams }));
          assert(isPositiveInteger({ value: status.fragmentationPoint }));
          assert(isPositiveInteger({ value: status.incomingQueue }));
          assert(isPositiveInteger({ value: status.outgoingQueue }));
          assert(isPositiveInteger({ value: status.overallError }));
          assert(isPositiveInteger({ value: status.maxBurst }));
          assert(isPositiveInteger({ value: status.maxSeg }));
          assert(typeof status.peer === "object");
          assert(isPositiveInteger({ value: status.peer.tag }));
          assert(isPositiveInteger({ value: status.peer.rwnd }));
          assert(isPositiveInteger({ value: status.peer.cap }));
          assert(isPositiveInteger({ value: status.peer.sack }));
        }
      });
    });
  });

  describe("MIS / OS", () => {
    describe("client", () => {

      [
        { OS: 1 },
        { OS: 2 },
        { OS: 5 },
        { OS: 10 },
        { OS: 20 },
        { OS: 50 },
        { OS: 200 }
      ].forEach(({ OS }) => {
        it(`should set and negotiate number of outgoing streams to ${OS} correctly`, async () => {
          await socketpairFactory.withSocketpair({
            options: {
              client: {
                OS
              },

              server: {
                socket: {
                  // always accept more than OS
                  MIS: OS + 10
                }
              }
            },

            test: ({ server, client }) => {
              const serverStatus = server.status();
              assert.strictEqual(serverStatus.numberOfIncomingStreams, OS);

              const clientStatus = client.status();
              assert.strictEqual(clientStatus.numberOfOutgoingStreams, OS);
            }
          });
        });
      });

      [
        { MIS: 1 },
        { MIS: 2 },
        { MIS: 5 },
        { MIS: 10 },
        { MIS: 20 },
      ].forEach(({ MIS }) => {
        it(`should limit and negotiate number of incoming streams to ${MIS} correctly`, async () => {
          await socketpairFactory.withSocketpair({
            options: {
              client: {
                MIS
              },

              server: {
                socket: {
                  // always request more than MIS
                  OS: MIS + 10
                }
              }
            },

            test: ({ server, client }) => {
              const serverStatus = server.status();
              assert.strictEqual(serverStatus.numberOfOutgoingStreams, MIS);

              const clientStatus = client.status();
              assert.strictEqual(clientStatus.numberOfIncomingStreams, MIS);
            }
          });
        });
      });

    });

    describe("server", () => {
      [
        { OS: 1 },
        { OS: 2 },
        { OS: 5 },
        { OS: 10 },
        { OS: 20 },
        { OS: 50 },
        { OS: 200 }
      ].forEach(({ OS }) => {
        it(`should set and negotiate number of outgoing streams to ${OS} correctly`, async () => {
          await socketpairFactory.withSocketpair({
            options: {
              client: {
                // always accept more than OS
                MIS: OS + 10
              },

              server: {
                socket: {
                  OS
                }
              }
            },

            test: ({ server, client }) => {
              const serverStatus = server.status();
              assert.strictEqual(serverStatus.numberOfOutgoingStreams, OS);

              const clientStatus = client.status();
              assert.strictEqual(clientStatus.numberOfIncomingStreams, OS);
            }
          });
        });
      });

      [
        { MIS: 1 },
        { MIS: 2 },
        { MIS: 5 },
        { MIS: 10 },
        { MIS: 20 },
      ].forEach(({ MIS }) => {
        it(`should limit and negotiate number of incoming streams to ${MIS} correctly`, async () => {
          await socketpairFactory.withSocketpair({
            options: {
              client: {
                // always request more than MIS
                OS: MIS + 10
              },

              server: {
                socket: {
                  MIS
                }
              }
            },

            test: ({ server, client }) => {
              const serverStatus = server.status();
              assert.strictEqual(serverStatus.numberOfIncomingStreams, MIS);

              const clientStatus = client.status();
              assert.strictEqual(clientStatus.numberOfOutgoingStreams, MIS);
            }
          });
        });
      });
    });
  });

  describe("send / receive", () => {
    const sendAndReceiveTest = ({ sender, receiver, packetToSend }) => {
      return new Promise((resolve, reject) => {
        let writeCallbackCalled = false;
        let endCallbackCalled = false;
        let packetCorrectlyReceived = false;

        const maybeResolve = () => {
          if (!writeCallbackCalled) {
            return;
          }

          if (!endCallbackCalled) {
            return;
          }

          if (!packetCorrectlyReceived) {
            return;
          }

          resolve();
        };

        sender.write(packetToSend, (writeError) => {
          if (writeError) {
            reject(writeError);
          }

          writeCallbackCalled = true;
          maybeResolve();
        });

        sender.end(() => {
          endCallbackCalled = true;
          maybeResolve();
        });

        sender.on("error", (err) => {
          reject(err);
        });

        receiver.on("data", (packetReceived) => {
          if (!buffersEqual({ buffer1: packetReceived, buffer2: packetToSend })) {
            reject(Error("received packet does not match sent packet"));
            return;
          }

          packetCorrectlyReceived = true;
          maybeResolve();
        });

        receiver.on("error", (err) => {
          reject(err);
        });
      });
    };

    [
      { packetSize: 1 },
      { packetSize: 5 },
      { packetSize: 10 },
      { packetSize: 100 },
      { packetSize: 2000 },
      { packetSize: 30000 }
    ].forEach(({ packetSize }) => {
      it(`should send packets (${packetSize} bytes) from client to server correctly`, async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {

            const packetToSend = generatePseudoRandomBuffer({ size: packetSize });

            await sendAndReceiveTest({
              sender: client,
              receiver: server,
              packetToSend
            });
          }
        });
      });

      it(`should send packets (${packetSize} bytes) from server to client correctly`, async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {

            const packetToSend = generatePseudoRandomBuffer({ size: packetSize });

            await sendAndReceiveTest({
              sender: server,
              receiver: client,
              packetToSend
            });
          }
        });
      });
    });

    describe("shutdown", () => {

      const testGracefulShutdown = async ({ sender, receiver }) => {
        await new Promise((resolve, reject) => {
          sender.on("error", (err) => {
            reject(err);
          });

          receiver.on("error", (err) => {
            reject(err);
          });

          receiver.on("end", () => {
            resolve();
          });

          receiver.resume();
          sender.resume();

          sender.end();
        });
      };

      const testBrokenPipeErrorOnRemoteShutdown = async ({ sender, receiver }) => {
        await new Promise((resolve, reject) => {
          receiver.on("error", (err) => {
            reject(err);
          });

          sender.on("error", (err) => {
            if (doesErrorRelateToCode({ error: err, code: "EPIPE" })) {
              resolve();
            } else {
              reject(err);
            }
          });

          sender.on("end", () => {
            reject(Error("unexpected graceful end"));
          });

          receiver.end();

          const packetToSend = generatePseudoRandomBuffer({ size: 1000 });
          for (let i = 0; i < 10; i += 1) {
            sender.write(packetToSend);
          }

          sender.resume();
        });
      };

      it("should allow to shutdown the socket gracefully (client -> server)", async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {
            await testGracefulShutdown({
              sender: client,
              receiver: server
            });
          }
        });
      });

      it("should give EPIPE error when packets are queued on remote shutdown (client -> server)", async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {
            await testBrokenPipeErrorOnRemoteShutdown({
              sender: client,
              receiver: server
            });
          }
        });
      });

      it("should allow to shutdown the socket gracefully (server -> client)", async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {
            await testGracefulShutdown({
              sender: server,
              receiver: client
            });
          }
        });
      });

      it("should give EPIPE error when packets are queued on remote shutdown (server -> client)", async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {
            await testBrokenPipeErrorOnRemoteShutdown({
              sender: server,
              receiver: client
            });
          }
        });
      });
    });

    describe("abort", () => {

      const testAbort = async ({ sender, receiver }) => {
        await new Promise((resolve, reject) => {
          sender.on("error", (err) => {
            reject(err);
          });

          receiver.on("error", (err) => {
            if (doesErrorRelateToCode({ error: err, code: "ECONNRESET" })) {
              resolve();
            } else {
              reject(err);
            }
          });

          receiver.on("end", () => {
            reject(Error("unexpected graceful end"));
          });

          receiver.resume();
          sender.resume();

          sender.destroy();
        });
      };

      const testBrokenPipeErrorOnAbort = async ({ sender, receiver }) => {
        await new Promise((resolve, reject) => {
          receiver.on("error", (err) => {
            reject(err);
          });

          sender.on("error", (err) => {
            if (doesErrorRelateToCode({ error: err, code: "ECONNRESET" })) {
              resolve();
            } else {
              reject(err);
            }
          });

          sender.on("end", () => {
            reject(Error("unexpected graceful end"));
          });

          receiver.destroy();

          const packetToSend = generatePseudoRandomBuffer({ size: 1000 });
          for (let i = 0; i < 10; i += 1) {
            sender.write(packetToSend);
          }

          sender.resume();
        });
      };

      it("should give ECONNRESET error when remote aborts (client -> server)", async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {
            await testAbort({
              sender: client,
              receiver: server
            });
          }
        });
      });

      it("should give ECONNRESET error when packets are queued on remote abort (client -> server)", async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {
            await testBrokenPipeErrorOnAbort({
              sender: client,
              receiver: server
            });
          }
        });
      });

      it("should give ECONNRESET error when remote aborts (server -> client)", async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {
            await testAbort({
              sender: server,
              receiver: client
            });
          }
        });
      });

      it("should give ECONNRESET error when packets are queued on remote abort (server -> client)", async () => {
        await socketpairFactory.withSocketpair({
          test: async ({ server, client }) => {
            await testBrokenPipeErrorOnAbort({
              sender: server,
              receiver: client
            });
          }
        });
      });
    });

    describe("chunk attributes", () => {
      describe("ppid", () => {

        [
          { ppid: 0 },
          { ppid: 1 },
          { ppid: 2 },
        ].forEach(({ ppid }) => {
          it(`should transmit attribute ppid ${ppid} correctly`, async () => {
            await socketpairFactory.withSocketpair({
              test: async ({ server, client }) => {
                const packetToSend = generatePseudoRandomBuffer({ size: 1000 });
                packetToSend.ppid = ppid;

                const { packetsReceived } = await transmitAndShutdown({
                  sender: client,
                  receiver: server,
                  packetsToSend: [packetToSend]
                });

                assert.strictEqual(packetsReceived.length, 1);
                const packetReceived = packetsReceived[0];

                assert.strictEqual(packetReceived.ppid, ppid);
              }
            });
          });
        });
      });

      describe("sid", () => {
        [
          { sid: 0 },
          { sid: 1 },
          { sid: 2 },
        ].forEach(({ sid }) => {
          it(`should support sid ${sid} correctly`, async () => {
            await socketpairFactory.withSocketpair({
              test: async ({ server, client }) => {
                const packetToSend = generatePseudoRandomBuffer({ size: 1000 });
                packetToSend.sid = sid;

                const { packetsReceived } = await transmitAndShutdown({
                  sender: client,
                  receiver: server,
                  packetsToSend: [packetToSend]
                });

                assert.strictEqual(packetsReceived.length, 1);
                const packetReceived = packetsReceived[0];

                assert.strictEqual(packetReceived.sid, sid);
              }
            });
          });
        });
      });
    });

    describe("socket parameters", () => {
      it(`should support setNoDelay`, async () => {
        await socketpairFactory.withSocketpair({
          test: ({ server, client }) => {
            server.setNoDelay(true);
            server.setNoDelay(false);

            client.setNoDelay(true);
            client.setNoDelay(false);

            server.destroy();
            client.destroy();
          }
        });
      });
    });
  });
});
