// Mount directly on the existing app so paths, middleware, and ordering stay
// identical. Autocomplete was registered later in server.js and stays there.
export function mountBranchesCatalog(app, controller) {
  app.get('/api/branches', controller.list);
  app.post('/api/branches', controller.create);
  app.put('/api/branches/:id', controller.update);
  app.delete('/api/branches/:id', controller.deactivate);
  app.get('/api/branches/search-nearby', controller.nearby);
}

export function mountBranchesAutocomplete(app, controller) {
  app.get('/api/branches/autocomplete', controller.autocomplete);
}
