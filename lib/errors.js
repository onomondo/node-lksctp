const createErrorFromErrno = ({ operation, errno }) => {
  const error = new Error(`Error during ${operation}: ${errno}`);
  error.errno = errno;
  return error;
};

module.exports = {
  createErrorFromErrno
};
