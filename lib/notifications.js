const constants = require("./constants.js");
const sockaddrTranscoder = require("./sockaddr.js");

const sacStateToStringMap = {
  [constants.SCTP_COMM_UP]: "SCTP_COMM_UP",
  [constants.SCTP_COMM_LOST]: "SCTP_COMM_LOST",
  [constants.SCTP_RESTART]: "SCTP_RESTART",
  [constants.SCTP_SHUTDOWN_COMP]: "SCTP_SHUTDOWN_COMP",
};

const interpretAssocChangeNotification = ({ notification }) => {

  const sn_assoc_change = notification.sn_assoc_change;
  if (sn_assoc_change === undefined) {
    return undefined;
  }

  const sac_state = sn_assoc_change.sac_state;

  const stateAsString = sacStateToStringMap[sac_state] || "???";

  if (sac_state === constants.SCTP_COMM_UP || sac_state === constants.SCTP_RESTART) {
    return `SCTP_ASSOC_CHANGE: ${stateAsString}, MIS ${sn_assoc_change.sac_inbound_streams} / OS ${sn_assoc_change.sac_outbound_streams}`;
  }

  return `SCTP_ASSOC_CHANGE: ${stateAsString}`;
};

const authIndicationToStringMap = {
  [constants.SCTP_AUTH_NEW_KEY]: "SCTP_AUTH_NEW_KEY",
  [constants.SCTP_AUTH_FREE_KEY]: "SCTP_AUTH_FREE_KEY",
  [constants.SCTP_AUTH_NO_AUTH]: "SCTP_AUTH_NO_AUTH",
};

const interpretAuthenticationEventNotification = ({ notification }) => {
  const sn_authkey_event = notification.sn_authkey_event;
  if (sn_authkey_event === undefined) {
    return undefined;
  }

  const auth_indication = sn_authkey_event.auth_indication;

  const authIndicationAsString = authIndicationToStringMap[auth_indication] || "???";

  if (auth_indication === constants.SCTP_AUTH_NO_AUTH) {
    return `SCTP_AUTHENTICATION_EVENT: ${authIndicationAsString}`;
  }

  return `SCTP_AUTHENTICATION_EVENT: ${authIndicationAsString}, key id ${sn_authkey_event.auth_keynumber}`;
};

const peerAddrChangeStateToStringMap = {
  [constants.SCTP_ADDR_AVAILABLE]: "SCTP_ADDR_AVAILABLE",
  [constants.SCTP_ADDR_UNREACHABLE]: "SCTP_ADDR_UNREACHABLE",
  [constants.SCTP_ADDR_REMOVED]: "SCTP_ADDR_REMOVED",
  [constants.SCTP_ADDR_ADDED]: "SCTP_ADDR_ADDED",
  [constants.SCTP_ADDR_MADE_PRIM]: "SCTP_ADDR_MADE_PRIM",
  [constants.SCTP_ADDR_CONFIRMED]: "SCTP_ADDR_CONFIRMED",
};

const interpretPeerAddrChangeNotification = ({ notification }) => {
  const sn_paddr_change = notification.sn_paddr_change;
  if (sn_paddr_change === undefined) {
    return undefined;
  }

  const peerAddrChangeStateAsString = peerAddrChangeStateToStringMap[sn_paddr_change.spc_state] || "???";
  const { address: parsedAddress } = sockaddrTranscoder.parse({ sockaddr: sn_paddr_change.spc_aaddr });

  return `SCTP_PEER_ADDR_CHANGE: ${peerAddrChangeStateAsString} ${parsedAddress}`;
};

const interpreters = {
  [constants.SCTP_ASSOC_CHANGE]: interpretAssocChangeNotification,
  [constants.SCTP_AUTHENTICATION_EVENT]: interpretAuthenticationEventNotification,
  [constants.SCTP_PEER_ADDR_CHANGE]: interpretPeerAddrChangeNotification,
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
