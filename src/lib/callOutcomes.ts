import type { CallRecord } from "@/data/mockData";

export type OutboundMissedOutcome = {
  callStatus: Extract<CallRecord["status"], "missed" | "failed">;
  callbackStatus: string;
  followUpFlag: boolean;
  note: string;
  toastMessage: string;
  autoDialError: string;
};

export type EstablishedDisconnectOutcome = {
  callbackStatus: string;
  note: string;
  toastMessage: string;
};

export type IncomingPreAnswerOutcome = {
  callStatus: Extract<CallRecord["status"], "missed">;
  callbackStatus: string;
  followUpFlag: boolean;
  note: string;
  toastMessage: string;
};

const NETWORK_REASON_PATTERN = /(network|transport|route|routing|timeout|timed out|temporarily unavailable|server error|service unavailable|connection|congestion|internal error|unreachable)/i;

export function getOutboundMissedOutcome(statusCode: number, reasonText = ""): OutboundMissedOutcome {
  const normalizedReasonText = String(reasonText || "").trim();
  const reasonSuffix = normalizedReasonText ? ` (${normalizedReasonText})` : "";

  if (statusCode === 408 && /outbound ring timeout/i.test(normalizedReasonText)) {
    return {
      callStatus: "failed",
      callbackStatus: "RNR",
      followUpFlag: true,
      note: "Ring no reply (outbound ring timeout)",
      toastMessage: "No answer. Marked as RNR and moved to your follow-up queue.",
      autoDialError: "RNR - no answer",
    };
  }

  if ([404, 410, 484, 604].includes(statusCode)) {
    return {
      callStatus: "failed",
      callbackStatus: "WN",
      followUpFlag: false,
      note: `Invalid or wrong number${reasonSuffix}`,
      toastMessage: "Call failed. Logged as wrong number.",
      autoDialError: `Wrong number${reasonSuffix}`,
    };
  }

  if ([486, 600].includes(statusCode)) {
    return {
      callStatus: "failed",
      callbackStatus: "LB",
      followUpFlag: true,
      note: `Line busy${reasonSuffix}`,
      toastMessage: "Line busy. Logged separately from no-answer calls.",
      autoDialError: `Line busy${reasonSuffix}`,
    };
  }

  if ([403, 603, 607].includes(statusCode)) {
    return {
      callStatus: "failed",
      callbackStatus: "DEC",
      followUpFlag: false,
      note: `Call declined${reasonSuffix}`,
      toastMessage: "Call was declined and logged separately.",
      autoDialError: `Declined${reasonSuffix}`,
    };
  }

  if ([408, 430, 500, 502, 503, 504, 580].includes(statusCode) || (!statusCode && NETWORK_REASON_PATTERN.test(normalizedReasonText))) {
    return {
      callStatus: "failed",
      callbackStatus: "Network Failure",
      followUpFlag: false,
      note: normalizedReasonText ? `Network or route failure (${normalizedReasonText})` : "Network or route failure",
      toastMessage: "Call failed due to network or telephony routing.",
      autoDialError: normalizedReasonText ? `Network failure (${normalizedReasonText})` : "Network failure",
    };
  }

  if ([480].includes(statusCode)) {
    return {
      callStatus: "failed",
      callbackStatus: "NA",
      followUpFlag: true,
      note: `No answer${reasonSuffix}`,
      toastMessage: "No answer. Logged separately from busy and wrong-number calls.",
      autoDialError: `No answer${reasonSuffix}`,
    };
  }

  return {
    callStatus: "failed",
    callbackStatus: "RNR",
    followUpFlag: true,
    note: normalizedReasonText ? `Ring no reply (${normalizedReasonText})` : "Ring no reply",
    toastMessage: "No answer. Marked as RNR and moved to your follow-up queue.",
    autoDialError: normalizedReasonText ? `RNR (${normalizedReasonText})` : "RNR - no answer",
  };
}

export function getEstablishedDisconnectOutcome(options?: {
  isTransferred?: boolean;
  endedByAgent?: boolean;
}): EstablishedDisconnectOutcome {
  if (options?.isTransferred) {
    return {
      callbackStatus: "Transferred",
      note: "Call transferred",
      toastMessage: "Call transferred and saved",
    };
  }

  if (options?.endedByAgent) {
    return {
      callbackStatus: "Completed",
      note: "Call ended by agent",
      toastMessage: "Call ended and saved",
    };
  }

  return {
    callbackStatus: "Customer Disconnected",
    note: "Customer disconnected",
    toastMessage: "Customer disconnected. Call saved.",
  };
}

export function getIncomingPreAnswerOutcome(options?: {
  endedByAgent?: boolean;
}): IncomingPreAnswerOutcome {
  if (options?.endedByAgent) {
    return {
      callStatus: "missed",
      callbackStatus: "Declined",
      followUpFlag: false,
      note: "Incoming call declined by agent",
      toastMessage: "Incoming call declined.",
    };
  }

  return {
    callStatus: "missed",
    callbackStatus: "Missed",
    followUpFlag: false,
    note: "Caller disconnected before answer",
    toastMessage: "Incoming call ended before answer.",
  };
}
