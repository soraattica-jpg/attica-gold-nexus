import { BranchValidationError } from './branches.service.js';

// Preserve the existing per-route error shapes; a new global handler would
// change contracts across the rest of the API during this migration.
export function createBranchesController(service) {
  const action = (handler) => async (req, res) => {
    try {
      res.json(await handler(req));
    } catch (error) {
      res.status(error instanceof BranchValidationError ? 400 : 500).json({ error: error.message });
    }
  };
  return {
    list: action(() => service.list()),
    create: action((req) => service.create(req.body)),
    update: action((req) => service.update(req.params.id, req.body)),
    deactivate: action((req) => service.deactivate(req.params.id)),
    nearby: action((req) => service.nearby(req.query)),
    autocomplete: async (req, res) => {
      try { res.json(await service.autocomplete(req.query.q)); }
      catch { res.json([]); }
    },
  };
}
