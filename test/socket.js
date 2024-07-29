const socketpairFactory = require("./lib/socketpair.js");

describe("socket", function () {
  this.timeout(20000);

  describe("pair", () => {
    it("should create a pair of connected sockets correctly", async () => {
      await socketpairFactory.withSocketpair(async ({ server, client }) => {
        server;
        client;
      });
    });
  });
});
