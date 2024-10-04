const errors = require("../../lib/errors.js");

const doesErrorRelateToCode = ({ error, code }) => {
  const errno = errors.codeToErrno({ code });
  const expectedMessage = errors.errnoToMessage({ errno });

  const codeCorrect = error.code === code;
  const errnoCorrect = error.errno === errno;
  const messageCorrect = error.message === expectedMessage;

  const relates = codeCorrect && errnoCorrect && messageCorrect;

  return relates;
};

module.exports = {
  doesErrorRelateToCode,
};
