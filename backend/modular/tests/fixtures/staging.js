// Synthetic branch data only. No real customer, branch, or provider credential.
const demo = {
  branchId: 'TEST001', branchName: 'Staging Demonstration Branch',
  addressline: 'Test Address', area: 'Test Area', city: 'Test City', state: 'Test State',
  pincode: '000000', timings: 'Test hours', latitude: '12.9', longitude: '77.6',
  url: '', map_url: '', bitly_url: '', status: 1,
};
export function createFixtureDb() {
  return { async query(sql) {
    const statement = sql.trim();
    if (!statement.startsWith('SELECT')) throw new Error('Staging fixture adapter cannot write');
    if (statement.includes('SELECT DISTINCT city')) return [[{ city: demo.city }]];
    if (statement.includes('SELECT latitude, longitude')) return [[{ latitude: demo.latitude, longitude: demo.longitude }]];
    if (statement.includes('AS distance')) return [[{ ...demo, distance: 2.4 }]];
    return [[{ ...demo }]];
  } };
}
export function createFixtureGeocoding() {
  return {
    hasGooglePlacesApiKey: () => false,
    geocodeGooglePlace: async () => null,
    geocodePhotonPlace: async () => null,
  };
}
