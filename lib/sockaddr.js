// format struct sockaddr_in/sockaddr_in6 for native usage

const net = require("node:net");
const constants = require("./constants.js");

const ipv4FormattersByArch = {
    "x64": ({ ipv4AddressAsBuffer, port }) => {

        const data = Buffer.alloc(16);
        data.writeUInt16LE(constants.AF_INET, 0);   // sa_family
        data.writeUInt16BE(port, 2);                // sin_port
        data.set(ipv4AddressAsBuffer, 4);           // sin_addr

        return data;
    }
};

const ipv4ParserByArch = {
    "x64": ({ sockaddr }) => {

        const sa_family = sockaddr.readUInt16LE(0);
        if (sa_family !== constants.AF_INET) {
            throw Error("invalid sa_family");
        }

        const port = sockaddr.readUInt16BE(2);
        const ipv4AddressAsBuffer = sockaddr.slice(4, 8);

        return { ipv4AddressAsBuffer, port };
    }
};

const format = ({ family, address, port }) => {

    if (family === "IPv4") {
        if (!net.isIPv4(address)) {
            throw Error("invalid address");
        }

        const octets = address.split(".").map((octet) => parseInt(octet, 10));
        const ipv4AddressAsBuffer = Buffer.from(octets);

        const formatter = ipv4FormattersByArch[process.arch];
        if (formatter === undefined) {
            throw Error("unsupported arch");
        }

        return formatter({ ipv4AddressAsBuffer, port });
    }

    if (family === "IPv6") {
        if (!net.isIPv6(address)) {
            throw Error("invalid address");
        }

        throw Error("IPv6 not implemented yet");
    }

    throw Error("invalid address");
};

const parse = ({ sockaddr }) => {

    if (sockaddr.length < 2) {
        throw Error("invalid sockaddr");
    }

    const sa_family = sockaddr.readUInt16LE(0);

    if (sa_family === constants.AF_INET) {

        const parser = ipv4ParserByArch[process.arch];
        if (parser === undefined) {
            throw Error("unsupported arch");
        }

        const { ipv4AddressAsBuffer, port } = parser({ sockaddr });

        const octets = Array.from(ipv4AddressAsBuffer);

        return {
            family: "IPv4",
            address: octets.join("."),
            port
        };
    }

    throw Error("unsupported sa_family");
};

module.exports = {
    format,
    parse
};
