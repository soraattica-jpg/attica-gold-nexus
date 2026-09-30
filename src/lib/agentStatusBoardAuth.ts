import {
  readSessionStorageItem,
  removeSessionStorageItem,
  writeSessionStorageItem,
} from "@/lib/browserStorage";

export const AGENT_STATUS_BOARD_LOGIN_ID = "STATUS01";
export const AGENT_STATUS_BOARD_PASSWORD = "Status@123";
export const AGENT_STATUS_BOARD_SESSION_KEY = "attica_agent_status_board_access";

export function isAgentStatusBoardCredential(loginId: string, password: string) {
  return loginId.trim().toUpperCase() === AGENT_STATUS_BOARD_LOGIN_ID && password === AGENT_STATUS_BOARD_PASSWORD;
}

export function hasAgentStatusBoardAccess() {
  return readSessionStorageItem(AGENT_STATUS_BOARD_SESSION_KEY) === "1";
}

export function grantAgentStatusBoardAccess() {
  writeSessionStorageItem(AGENT_STATUS_BOARD_SESSION_KEY, "1");
}

export function revokeAgentStatusBoardAccess() {
  removeSessionStorageItem(AGENT_STATUS_BOARD_SESSION_KEY);
}
