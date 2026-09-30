import { cleanString } from '../../shared/string.js';

export class BranchValidationError extends Error {}

export function serializeBranchRow(r, extra = {}) {
  const mapUrl = cleanString(r.map_url || r.mapUrl || r.url, 1000);
  const bitlyUrl = cleanString(r.bitly_url || r.bitlyUrl, 1000);
  const displayUrl = mapUrl || bitlyUrl || cleanString(r.url, 1000);
  return {
    id: r.branchId, name: r.branchName, address: r.addressline,
    area: r.area, city: r.city, state: r.state, pincode: r.pincode,
    timings: r.timings, latitude: r.latitude, longitude: r.longitude,
    url: displayUrl, mapUrl, bitlyUrl, ...extra,
  };
}

const UPDATABLE_FIELDS = [
  'branchName', 'addressline', 'area', 'city', 'state', 'pincode', 'timings',
  'latitude', 'longitude', 'url', 'map_url', 'bitly_url', 'status',
];

export function createBranchesService(repository, geocoding, logger = console) {
  return {
    async list() {
      return (await repository.list()).map((r) => serializeBranchRow(r));
    },
    async create(b) {
      if (!b.branchId || !b.branchName) throw new BranchValidationError('Branch ID and Name required');
      const mapUrl = cleanString(b.mapUrl || b.map_url || b.url, 1000);
      const bitlyUrl = cleanString(b.bitlyUrl || b.bitly_url, 1000);
      const displayUrl = bitlyUrl || mapUrl || cleanString(b.url, 1000);
      await repository.create([
        b.branchId, b.branchName, b.addressline || '', b.area || '', b.city || '',
        b.state || '', b.pincode || '', b.timings || '9:30 AM - 6:00 PM',
        b.latitude || '', b.longitude || '', displayUrl, mapUrl, bitlyUrl,
      ]);
      return { success: true };
    },
    async update(id, b) {
      // Preserve the existing alias precedence, including duplicate assignments.
      const changes = UPDATABLE_FIELDS.filter((key) => b[key] !== undefined).map((key) => [key, b[key]]);
      if (b.mapUrl !== undefined) changes.push(['map_url', b.mapUrl]);
      if (b.bitlyUrl !== undefined) changes.push(['bitly_url', b.bitlyUrl]);
      if (!changes.length) throw new BranchValidationError('No fields');
      await repository.update(id, changes);
      return { success: true };
    },
    async deactivate(id) {
      await repository.deactivate(id);
      return { success: true };
    },
    async autocomplete(q) {
      if (!q || q.length < 2) return [];
      const rows = await repository.autocomplete('%' + q + '%');
      return rows.map((r) => r.city || r.area || r.branchName);
    },
    async nearby({ location, lat, lng }) {
      let searchLat, searchLng;
      if (lat && lng) {
        searchLat = parseFloat(lat);
        searchLng = parseFloat(lng);
      } else if (location) {
        const rawLocation = String(location || '').trim();
        let geocodedLocation = null;
        if (geocoding.hasGooglePlacesApiKey()) {
          try {
            geocodedLocation = await geocoding.geocodeGooglePlace({ address: rawLocation });
          } catch (error) {
            logger.error('Nearby branch Google geocode failed:', {
              location: cleanString(rawLocation, 160), message: error?.message || error,
            });
          }
        }
        if (!geocodedLocation) {
          try {
            geocodedLocation = await geocoding.geocodePhotonPlace({ address: rawLocation });
          } catch (error) {
            logger.error('Nearby branch Photon geocode failed:', {
              location: cleanString(rawLocation, 160), message: error?.message || error,
            });
          }
        }
        if (geocodedLocation && Number.isFinite(geocodedLocation.lat) && Number.isFinite(geocodedLocation.lng)) {
          searchLat = Number(geocodedLocation.lat);
          searchLng = Number(geocodedLocation.lng);
        } else {
          const term = '%' + rawLocation + '%';
          const match = await repository.findCoordinates(term);
          if (match.length > 0) {
            searchLat = parseFloat(match[0].latitude);
            searchLng = parseFloat(match[0].longitude);
          } else {
            return (await repository.findByText(term)).map((r) => serializeBranchRow(r, { distance: null }));
          }
        }
      } else {
        throw new BranchValidationError('location or lat/lng required');
      }
      let rows = await repository.findByDistance(searchLat, searchLng);
      if (!rows.length) rows = await repository.findByDistance(searchLat, searchLng, false);
      return rows.map((r) => serializeBranchRow(r, { distance: Math.round(r.distance) }));
    },
  };
}
