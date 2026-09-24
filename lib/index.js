const native = require("./native.js");

const serverFactory = require("./server.js");
const clientFactory = require("./client.js");

const serverOptions = ({ value }) => {
  // undefined/null mean "no options", as they do in net.createServer: a caller
  // forwarding an optional config gets the defaults, not a null the server
  // would dereference at listen() time.
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object") {
    throw Error("options must be an object");
  }

  return value;
};

const parseServerArgs = ({ args }) => {
  // net.createServer([options][, connectionListener]).
  if (args.length > 2) {
    throw Error("invalid number of arguments");
  }

  const [first, second] = args;

  // The connection listener may stand alone in the first slot.
  if (typeof first === "function") {
    if (args.length > 1) {
      throw Error("invalid number of arguments");
    }

    return {
      options: {},
      connectListener: first
    };
  }

  return {
    options: serverOptions({ value: first }),
    connectListener: second
  };
};

const createServer = (...args) => {
  const { options, connectListener } = parseServerArgs({ args });

  const server = serverFactory.create({ native, options });

  if (connectListener !== undefined) {
    server.on("connection", connectListener);
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

const createConnection = (...args) => {
  const { options, successCallback } = parseConnectArgs({ args });

  const client = clientFactory.connect({ native, options });

  if (successCallback !== undefined) {
    client.on("connect", successCallback);
  }

  return client;
};

const connect = createConnection;

module.exports = {
  createServer,
  createConnection,
  connect
};
