const native = require("./native.js");

const serverFactory = require("./server.js");
const clientFactory = require("./client.js");

const parseServerArgs = ({ args }) => {
  let options = {};
  let connectListener = undefined;

  if (args.length === 1) {

    if (typeof args[0] === "object") {
      options = args[0];
    } else {
      connectListener = args[0];
    }

  } else if (args.length === 2) {
    options = args[0];
    connectListener = args[1];
  } else if (args.length > 2) {
    throw Error("invalid number of arguments");
  }

  return {
    options,
    connectListener
  };
};

const createServer = (...args) => {
  const { options, connectListener } = parseServerArgs({ args });

  const server = serverFactory.create({ native, options });

  if (connectListener !== undefined) {
    server.on("connect", connectListener);
  }

  return server;
};

const parseConnectArgs = ({ args }) => {
  let options = undefined;
  let successCallback = undefined;

  if (args.length === 0) {
    throw Error("at least one argument is required");
  } else if (args.length === 1) {
    options = args[0];
  } else if (args.length === 2) {
    options = args[0];
    successCallback = args[1];
  } else if (args.length > 2) {
    throw Error("invalid number of arguments");
  }

  return {
    options,
    successCallback
  };
};

const connect = (...args) => {
  const { options, successCallback } = parseConnectArgs({ args });

  const client = clientFactory.connect({ native, options });

  if (successCallback !== undefined) {
    client.on("connect", successCallback);
  }

  return client;
};

module.exports = {
  createServer,
  connect
};
