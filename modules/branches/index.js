import { createBranchesRepository } from './branches.repository.js';
import { createBranchesService } from './branches.service.js';
import { createBranchesController } from './branches.controller.js';

export { mountBranchesCatalog, mountBranchesAutocomplete } from './branches.routes.js';

export function createBranchesModule({ db, geocoding, logger }) {
  return createBranchesController(createBranchesService(createBranchesRepository(db), geocoding, logger));
}
