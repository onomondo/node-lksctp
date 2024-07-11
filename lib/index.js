const native = require("./native.js");
const nodeEventsModule = require("node:events");
const nodeNetModule = require("node:net");

const sockaddrTranscoder = require("./sockaddr.js");
const socketDuplexFactory = require("./socket-duplex.js");
const pollerFactory = require("./poller.js");
const constants = require("./constants.js");


const errnoCodes = constants.errno;

const serverFactory = require("./server.js");
const clientFactory = require("./client.js");

const createServer = (...args) => {

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

    const server = serverFactory.create({ native, options });

    if (connectListener !== undefined) {
        server.on("connect", connectListener);
    }

    return server;
};



const connect = (...args) => {

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
