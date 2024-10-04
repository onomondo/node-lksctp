const lksctp = require("../lib/index.js");
const socketpairFactory = require("./lib/socketpair.js");
const { doesErrorRelateToCode } = require("./lib/error-util.js");
const assert = require("node:assert");
const constants = require("../lib/constants.js");
const nodeUtil = require("node:util");

const waitForSocketError = ({ socket, timeoutMs = 500 }) => {
  return new Promise((resolve, reject) => {

    let errorReceived = undefined;

    socket.on("error", (err) => {
      errorReceived = err;
    });

    socket.on("close", () => {
      resolve(errorReceived);
    });

    setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);
  });
};

describe("errors", () => {
  it("should give ECONNREFUSED when connecting to a non-listening port", async () => {
    const socket = lksctp.connect({
      port: 1111,
      host: "127.0.0.1",
    });

    const error = await waitForSocketError({ socket });

    if (error === undefined) {
      throw Error("expected error");
    }

    assert(doesErrorRelateToCode({ error, code: "ECONNREFUSED" }));
  });

  it("should give EADDRINUSE when trying to connect with occupied local port", async () => {

    const port = 1111;

    await socketpairFactory.withSocketpair({
      options: {
        client: {
          localPort: port,
        }
      },
      test: async () => {
        const client2 = lksctp.connect({
          port: 2222,
          host: "127.0.0.1",
          localPort: port,
        });

        const error = await waitForSocketError({ socket: client2 });

        if (error === undefined) {
          throw Error("expected error");
        }

        assert(doesErrorRelateToCode({ error, code: "EADDRINUSE" }));
      }
    });
  });

  [
    "status",
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

  describe("errno constants", () => {

    const codesLibuvIsMissing = [
      "EINPROGRESS"
    ];

    Object.keys(constants.errno).forEach((code) => {

      if (code === "NO_ERROR") {
        return;
      }

      if (codesLibuvIsMissing.includes(code)) {
        it(`should have no mapping for ${code} in libuv`, () => {
          const errno = constants.errno[code];
          const libuvErrno = -errno;
          const libuvCode = nodeUtil.getSystemErrorName(libuvErrno);
          assert(libuvCode.startsWith("Unknown system error"));
        });

      } else {
        it(`should have same value as libuv for ${code}`, () => {
          const errno = constants.errno[code];
          const libuvErrno = -errno;
          const libuvCode = nodeUtil.getSystemErrorName(libuvErrno);
          assert.strictEqual(code, libuvCode);
        });
      }
    });
  });

});
