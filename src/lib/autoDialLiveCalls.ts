import type { AutoDialLeadRecord, LiveAgentRecord } from "@/lib/api";
import type { CallRecord } from "@/data/mockData";
import { isAgentCurrentlyOnCall, isOpenLiveCallRecord } from "@/lib/liveCallState";
import { normalizePhoneNumber } from "@/lib/phone";

export type ActiveAutoDialCallRow = {
  lead: AutoDialLeadRecord;
  call: CallRecord;
};

const getCallSortTimestamp = (call: Pick<CallRecord, "answeredAt" | "ringStartedAt" | "createdAt">) => {
  const timestamp = new Date(call.answeredAt || call.ringStartedAt || call.createdAt || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildAgentPhoneKey = (agentId?: string, phone?: string) => {
  const normalizedAgentId = String(agentId || "").trim();
  const normalizedPhone = normalizePhoneNumber(phone || "");
  if (!normalizedAgentId || !normalizedPhone) return "";
  return `${normalizedAgentId}|${normalizedPhone}`;
};

export function buildActiveAutoDialCallRows(
  leads: AutoDialLeadRecord[],
  calls: CallRecord[],
  liveAgents: Array<Pick<LiveAgentRecord, "agentId" | "status" | "activeCalls">>,
) {
  const liveAgentById = new Map(
    liveAgents.map((agent) => [String(agent.agentId || "").trim(), agent]),
  );

  const activeCalls = [...calls]
    .filter((call) => (
      isOpenLiveCallRecord(call)
      && Boolean(call.agentId)
      && isAgentCurrentlyOnCall(liveAgentById.get(String(call.agentId || "").trim()))
    ))
    .sort((left, right) => getCallSortTimestamp(right) - getCallSortTimestamp(left));

  const activeCallById = new Map<string, CallRecord>();
  const activeCallByAgentPhone = new Map<string, CallRecord>();

  activeCalls.forEach((call) => {
    const callId = String(call.id || "").trim();
    if (callId && !activeCallById.has(callId)) {
      activeCallById.set(callId, call);
    }

    const agentPhoneKey = buildAgentPhoneKey(call.agentId, call.callerId);
    if (agentPhoneKey && !activeCallByAgentPhone.has(agentPhoneKey)) {
      activeCallByAgentPhone.set(agentPhoneKey, call);
    }
  });

  return leads
    .map((lead) => {
      const matchedCallById = lead.callId ? activeCallById.get(String(lead.callId).trim()) : undefined;
      const fallbackAgentPhoneKey = buildAgentPhoneKey(lead.assignedAgentId, lead.mobileNumber);
      const matchedCall = matchedCallById || (fallbackAgentPhoneKey ? activeCallByAgentPhone.get(fallbackAgentPhoneKey) : undefined);
      if (!matchedCall) return null;

      return {
        lead,
        call: matchedCall,
      } satisfies ActiveAutoDialCallRow;
    })
    .filter((row): row is ActiveAutoDialCallRow => Boolean(row))
    .sort((left, right) => getCallSortTimestamp(right.call) - getCallSortTimestamp(left.call));
}
