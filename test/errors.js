const lksctp = require("../lib/index.js");
const socketpairFactory = require("./lib/socketpair.js");
const { doesErrorRelateToCode } = require("./lib/error-util.js");
const assert = require("node:assert");

describe("errors", () => {
  it("should give ECONNREFUSED when connecting to a non-listening port", async () => {
    const socket = lksctp.connect({
      port: 1111,
      host: "127.0.0.1",
    });

    const error = await new Promise((resolve) => {
      socket.on("error", (err) => {
        resolve(err);
      });
    });

    assert(doesErrorRelateToCode({ error, code: "ECONNREFUSED" }));
  });

  [
    "status",
    "address",
    "getLocalAddresses",
    "getRemoteAddresses",
  ].forEach((methodName) => {
    it(`should give an exception if ${methodName}() is called after destroy`, async () => {
      await socketpairFactory.withSocketpair({
        test: ({ client }) => {
          client.destroy();
          assert.throws(() => {
            client[methodName]();
          }, (ex) => {
            return ex.message === `${methodName} called after destroy`;
          });
        }
      });
    });
  });

});
