const child_process = require("child_process");
const nodePath = require("node:path");

describe("memory", function () {
  this.timeout(60000);

  it.only("should not leave any leaks in valgrind", () => {
    child_process.execSync(
      [
        "valgrind",
        "--leak-check=full",
        "--error-exitcode=1",
        `--suppressions=${nodePath.resolve(__dirname, "valgrind.supp")}`,
        "node",
        nodePath.resolve(__dirname, "../samples/loop.js"),
      ].join(" ")
    );
  });
});
