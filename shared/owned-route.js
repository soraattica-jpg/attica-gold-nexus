function routePaths(value) {
  return Array.isArray(value) ? value : [value];
}

export function createOwnedRouteMount(feature, contracts) {
  const allowed = new Map(Object.entries(contracts).map(([path, methods]) => [path, new Set(methods)]));
  return function mountOwnedRoute(app, method, path, ...handlers) {
    if (typeof app?.[method] !== 'function') throw new Error(`${feature}: unsupported route method ${method}`);
    for (const item of routePaths(path)) {
      if (!allowed.get(item)?.has(method)) throw new Error(`${feature}: route ownership mismatch for ${method.toUpperCase()} ${item}`);
    }
    return app[method](path, ...handlers);
  };
}
