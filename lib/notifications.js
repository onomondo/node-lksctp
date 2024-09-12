const constants = require("./constants.js");

const sacStateToStringMap = {
  [constants.SCTP_COMM_UP]: "SCTP_COMM_UP",
  [constants.SCTP_COMM_LOST]: "SCTP_COMM_LOST",
  [constants.SCTP_RESTART]: "SCTP_RESTART",
  [constants.SCTP_SHUTDOWN_COMP]: "SCTP_SHUTDOWN_COMP",
};

const interpretAssocChangeNotification = ({ notification }) => {

  const sn_assoc_change = notification.sn_assoc_change;
  const sac_state = sn_assoc_change.sac_state;

  const stateAsString = sacStateToStringMap[sac_state] || "???";

  if (sac_state === constants.SCTP_COMM_UP || sac_state === constants.SCTP_RESTART) {
    return `SCTP_ASSOC_CHANGE: ${stateAsString}, MIS ${sn_assoc_change.sac_inbound_streams} / OS ${sn_assoc_change.sac_outbound_streams}`;
  }

  return `SCTP_ASSOC_CHANGE: ${stateAsString}`;
};

const interpreters = {
  [constants.SCTP_ASSOC_CHANGE]: interpretAssocChangeNotification
};

const interpret = ({ notification }) => {
  const interpreter = interpreters[notification.sn_type];
  if (interpreter === undefined) {
    return undefined;
  }

  return interpreter({ notification });
};

module.exports = {
  interpret
};
