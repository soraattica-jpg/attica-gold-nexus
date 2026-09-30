import { TATA_PRIMARY } from './trunks/tata-primary.config.js';
import { TATA_NEW } from './trunks/tata-new.config.js';

const trunks = new Map([[TATA_PRIMARY.code, TATA_PRIMARY], [TATA_NEW.code, TATA_NEW]]);

export function normalizeTrunkCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return trunks.has(code) ? code : '';
}

export function createTrunkRouter({ readPrimary, writePrimary, readHealth = async () => ({}) }) {
  if (typeof readPrimary !== 'function' || typeof writePrimary !== 'function') {
    throw new Error('Trunk router requires explicit primary-route persistence');
  }
  return {
    list() {
      return [...trunks.values()];
    },
    async getPrimary() {
      return normalizeTrunkCode(await readPrimary()) || TATA_PRIMARY.code;
    },
    async setPrimary(value) {
      const code = normalizeTrunkCode(value);
      if (!code) {
        const error = new Error('Primary trunk must be TATA_PRIMARY or TATA_NEW');
        error.status = 400;
        throw error;
      }
      await writePrimary(code);
      return { primary: code };
    },
    async selectOutbound() {
      const primary = await this.getPrimary();
      const health = await readHealth(primary);
      return {
        trunk: trunks.get(primary),
        health,
        automaticFailover: false,
        warning: health?.available === false ? 'Selected trunk is unavailable; manual route change is required' : '',
      };
    },
  };
}
