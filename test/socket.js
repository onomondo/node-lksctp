/* eslint-disable max-statements */

const assert = require("node:assert");
const socketpairFactory = require("./lib/socketpair.js");

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
                MIS: OS + 10
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
              server: {
                client: {
                  MIS: OS + 10
                },

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
    });
  });
});
