const lksctp = require("../lib/index.js");

describe.only("api", () => {
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
  });
});
