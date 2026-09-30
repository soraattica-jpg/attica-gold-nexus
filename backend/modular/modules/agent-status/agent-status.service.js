export function createAgentStatusService(r){return{list:()=>r.list(),detail:id=>r.detail(r.normalizeAgentId?r.normalizeAgentId(id):id),sessions:q=>r.sessions(q||{})};}
