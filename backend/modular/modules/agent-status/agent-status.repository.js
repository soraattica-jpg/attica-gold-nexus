export function createAgentStatusRepository(a){for(const k of['list','detail','sessions'])if(typeof a?.[k]!=='function')throw new Error(`Agent status adapter missing: ${k}`);return a;}
