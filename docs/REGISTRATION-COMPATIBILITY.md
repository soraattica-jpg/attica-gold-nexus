# Complete server route registration boundary

All 120 `server.js` path registrations now cross a module boundary in the generated candidate.

- 39 registrations use extracted feature modules.
- 81 path registrations are represented by 75 `mountCompatibilityRoute` calls; six additional paths are aliases registered by array-valued route declarations.

The compatibility layer changes only `app.METHOD(path, ...handlers)` into `mountCompatibilityRoute(app, 'method', path, ...handlers)`. Handler expressions, middleware arguments, paths and order remain byte-for-byte preserved. Tests hash every preserved argument span, check the complete order, syntax-check the candidate, and verify all unrelated top-level statements.

This completes registration modularization while keeping unextracted business logic in its original closure. It does not claim that every feature implementation has been decomposed into controller/service/repository files. Call-critical handlers remain unchanged and the candidate cannot start because of its deliberate startup guard.
