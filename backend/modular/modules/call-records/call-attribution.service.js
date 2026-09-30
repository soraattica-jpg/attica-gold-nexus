import { isTataNewDid, normalizeTataNewDid } from '../../integrations/asterisk/trunks/tata-new.config.js';

export const CAMPAIGN_CALL_SOURCE = 'Campaign Calls';
export const CAMPAIGN_CARRIER_TRUNK = 'CAMPAIGN_CALLS';

const clean = (value) => String(value || '').trim();

export function classifyCallAttribution({
  direction,
  callSource,
  carrierTrunk,
  trunkCode,
  pilot,
  didOrCli,
} = {}) {
  const normalizedDirection = clean(direction).toLowerCase();
  const normalizedCarrier = clean(carrierTrunk).toUpperCase();
  const normalizedTrunkCode = clean(trunkCode).toUpperCase();
  const normalizedPilot = normalizeTataNewDid(pilot);
  const normalizedDidOrCli = normalizeTataNewDid(didOrCli);
  const isCampaignCircuit = normalizedCarrier === CAMPAIGN_CARRIER_TRUNK
    || normalizedTrunkCode === 'TATA_NEW'
    || normalizedTrunkCode === CAMPAIGN_CARRIER_TRUNK;

  if (normalizedDirection === 'incoming'
    && isCampaignCircuit
    && normalizedPilot === '8065200220'
    && isTataNewDid(normalizedDidOrCli)) {
    return {
      direction: 'incoming',
      callSource: CAMPAIGN_CALL_SOURCE,
      carrierTrunk: CAMPAIGN_CARRIER_TRUNK,
      trunkCode: CAMPAIGN_CARRIER_TRUNK,
      pilot: normalizedPilot,
      didOrCli: normalizedDidOrCli,
    };
  }

  return {
    direction: normalizedDirection,
    callSource: clean(callSource),
    carrierTrunk: isCampaignCircuit ? CAMPAIGN_CARRIER_TRUNK : normalizedCarrier,
    trunkCode: normalizedTrunkCode,
    pilot: normalizedPilot,
    didOrCli: normalizedDidOrCli,
  };
}
