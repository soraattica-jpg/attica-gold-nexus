export const CAMPAIGN_CALL_SOURCE = "Campaign Calls";
export const CAMPAIGN_CARRIER_TRUNK = "CAMPAIGN_CALLS";

export type SipHeaderReader = {
  getHeader?: (name: string) => string | undefined;
  getHeaders?: (name: string) => string[];
};

export type CallAttribution = {
  callSource: string;
  carrierTrunk: string;
  trunkCode: string;
  pilot: string;
  didOrCli: string;
};

const firstHeader = (request: SipHeaderReader | null | undefined, name: string) => {
  const direct = String(request?.getHeader?.(name) || "").trim();
  if (direct) return direct;
  return String(request?.getHeaders?.(name)?.find(Boolean) || "").trim();
};

const normalizeDigits = (value: string) => value.replace(/\D/g, "");

export const normalizeCampaignDid = (value: string) => {
  let digits = normalizeDigits(value);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 8 && digits.startsWith("65200")) digits = `80${digits}`;
  return digits;
};

export const isCampaignDid = (value: string) => {
  const did = normalizeCampaignDid(value);
  if (!/^8065200\d{3}$/.test(did)) return false;
  const suffix = Number(did.slice(-3));
  return suffix >= 220 && suffix <= 399;
};

export function readIncomingCallAttribution(request: SipHeaderReader | null | undefined): CallAttribution {
  const carrierTrunk = firstHeader(request, "X-Attica-Carrier-Trunk").toUpperCase();
  const trunkCode = firstHeader(request, "X-Attica-Trunk-Code").toUpperCase();
  const pilot = normalizeCampaignDid(firstHeader(request, "X-Attica-Pilot"));
  const didOrCli = normalizeCampaignDid(firstHeader(request, "X-Attica-DID"));
  const requestedSource = firstHeader(request, "X-Attica-Call-Source");
  const isCampaignCircuit = carrierTrunk === CAMPAIGN_CARRIER_TRUNK
    && trunkCode === CAMPAIGN_CARRIER_TRUNK
    && pilot === "8065200220"
    && isCampaignDid(didOrCli);

  return {
    callSource: isCampaignCircuit && requestedSource.toLowerCase() === CAMPAIGN_CALL_SOURCE.toLowerCase()
      ? CAMPAIGN_CALL_SOURCE
      : "",
    carrierTrunk: isCampaignCircuit ? CAMPAIGN_CARRIER_TRUNK : carrierTrunk,
    trunkCode,
    pilot,
    didOrCli,
  };
}
