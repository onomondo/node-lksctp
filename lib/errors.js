const constants = require("./constants");
const errnoCodes = constants.errno;

let errnoCodesByNumber = {};
Object.keys(errnoCodes).forEach((key) => {
  const code = errnoCodes[key];

  errnoCodesByNumber = {
    ...errnoCodesByNumber,
    [code]: key
  };
});

const errorMessagesByErrnoString = {
  EAGAIN: "Resource temporarily unavailable",
  ECONNRESET: "Connection reset by peer",
  ECONNREFUSED: "Connection refused",
  EINPROGRESS: "Operation now in progress",
  EPIPE: "Broken pipe",
  EADDRNOTAVAIL: "Cannot assign requested address",
};

const codeToErrno = ({ code }) => {
  return errnoCodes[code];
};

const errnoToCode = ({ errno }) => {
  return errnoCodesByNumber[errno];
};

const errnoToMessage = ({ errno }) => {
  const code = errnoToCode({ errno });
  if (code === undefined) {
    return `errno ${errno}`;
  }

  const message = errorMessagesByErrnoString[code];
  if (message === undefined) {
    return `errno ${errno} (${code})`;
  }

  return message;
};

const createErrorFromErrno = ({ operation, errno }) => {

  if (errno === undefined) {
    throw Error("errno must be defined");
  }

  const code = errnoToCode({ errno });
  const errnoMessage = errnoToMessage({ errno });

  let message;

  if (operation === undefined) {
    message = `${errnoMessage}`;
  } else {
    message = `Error during ${operation}: ${errnoMessage}`;
  }

  const error = new Error(message);
  error.code = code;
  return error;
};

module.exports = {
  createErrorFromErrno,
  codeToErrno,
  errnoToCode,
  errnoToMessage,
};
