const native = require("../lib/native.js");
const assert = require("node:assert");

describe("native", () => {
  it("should create and close a socket correclty", () => {
    const { errno: createErrno, fd } = native.create_socket();

    assert(createErrno === 0);
    assert(typeof fd === "number");

    const { errno: closeErrno } = native.close_fd({ fd });
    assert(closeErrno === 0);
  });
});
