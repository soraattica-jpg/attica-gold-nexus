import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_CALL_SOURCE,
  CAMPAIGN_CARRIER_TRUNK,
  isCampaignDid,
  readIncomingCallAttribution,
} from "@/lib/callAttribution";

const requestFrom = (headers: Record<string, string>) => ({
  getHeader: (name: string) => headers[name],
});

describe("call attribution", () => {
  it("classifies an incoming call on the new Tata range as Campaign Calls", () => {
    const result = readIncomingCallAttribution(requestFrom({
      "X-Attica-Call-Source": "Campaign Calls",
      "X-Attica-Carrier-Trunk": "CAMPAIGN_CALLS",
      "X-Attica-Trunk-Code": "CAMPAIGN_CALLS",
      "X-Attica-Pilot": "8065200220",
      "X-Attica-DID": "+91 8065200225",
    }));

    expect(result.callSource).toBe(CAMPAIGN_CALL_SOURCE);
    expect(result.carrierTrunk).toBe(CAMPAIGN_CARRIER_TRUNK);
    expect(result.didOrCli).toBe("8065200225");
  });

  it("does not trust Campaign Calls without the matching circuit and DID", () => {
    expect(readIncomingCallAttribution(requestFrom({
      "X-Attica-Call-Source": "Campaign Calls",
      "X-Attica-Carrier-Trunk": "PRIMARY_TATA",
      "X-Attica-Trunk-Code": "CAMPAIGN_CALLS",
      "X-Attica-Pilot": "8065200220",
      "X-Attica-DID": "8065200225",
    })).callSource).toBe("");
    expect(isCampaignDid("8065200400")).toBe(false);
  });
});
