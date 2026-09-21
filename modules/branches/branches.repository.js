// The injected query executor retains the caller's connection/transaction routing.
export function createBranchesRepository(db) {
  return {
    async list() {
      const [rows] = await db.query(`
        SELECT *
        FROM wp_branches_database
        WHERE status=1
        ORDER BY
          CASE WHEN branchId LIKE 'AGPL%' THEN 0 ELSE 1 END,
          CASE WHEN branchId LIKE 'AGPL%' THEN CAST(SUBSTRING(branchId, 5) AS UNSIGNED) ELSE 999999 END,
          branchId,
          state,
          city
      `);
      return rows;
    },
    async create(values) {
      await db.query('INSERT INTO wp_branches_database (branchId,branchName,addressline,area,city,state,pincode,timings,latitude,longitude,url,map_url,bitly_url,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)', values);
    },
    async update(id, changes) {
      const fields = changes.map(([key]) => key + '=?');
      await db.query('UPDATE wp_branches_database SET ' + fields.join(',') + ' WHERE branchId=?', [...changes.map(([, value]) => value), id]);
    },
    async deactivate(id) {
      await db.query('UPDATE wp_branches_database SET status=0 WHERE branchId=?', [id]);
    },
    async autocomplete(term) {
      const [rows] = await db.query(
        'SELECT DISTINCT city FROM wp_branches_database WHERE status=1 AND city LIKE ? UNION SELECT DISTINCT area FROM wp_branches_database WHERE status=1 AND area LIKE ? UNION SELECT DISTINCT branchName FROM wp_branches_database WHERE status=1 AND branchName LIKE ? LIMIT 15',
        [term, term, term],
      );
      return rows;
    },
    async findCoordinates(term) {
      const [rows] = await db.query(
        "SELECT latitude, longitude FROM wp_branches_database WHERE status=1 AND (city LIKE ? OR area LIKE ? OR state LIKE ? OR branchName LIKE ? OR addressline LIKE ?) AND latitude IS NOT NULL AND latitude != '' AND longitude IS NOT NULL AND longitude != '' LIMIT 1",
        [term, term, term, term, term],
      );
      return rows;
    },
    async findByText(term) {
      const [rows] = await db.query(
        'SELECT * FROM wp_branches_database WHERE status=1 AND (city LIKE ? OR area LIKE ? OR state LIKE ? OR branchName LIKE ? OR addressline LIKE ?) LIMIT 10',
        [term, term, term, term, term],
      );
      return rows;
    },
    async findByDistance(lat, lng, withinRadius = true) {
      const [rows] = await db.query(
        `SELECT *, (6371 * acos(cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) + sin(radians(?)) * sin(radians(latitude)))) AS distance
         FROM wp_branches_database WHERE status=1 AND latitude IS NOT NULL AND latitude != '' AND longitude IS NOT NULL AND longitude != ''
         ${withinRadius ? 'HAVING distance < 120 ' : ''}ORDER BY distance LIMIT 10`,
        [lat, lng, lat],
      );
      return rows;
    },
  };
}
