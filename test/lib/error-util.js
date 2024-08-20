const errors = require("../../lib/errors.js");

const doesErrorRelateToCode = ({ error, code }) => {
  const errno = errors.codeToErrno({ code });
  const expectedMessage = errors.errnoToMessage({ errno });

  const relates = error.code === code && error.message === expectedMessage;
  return relates;
};

module.exports = {
  doesErrorRelateToCode,
};
