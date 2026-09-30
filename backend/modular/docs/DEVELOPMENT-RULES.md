# Permanent development rules

## Module-first rule

Every feature, bug fix, API change, integration change, report change and
UI-backed change follows this sequence:

1. Identify the affected API, UI feature or integration.
2. Check `docs/MODULE-MAP.md`, `docs/API-INVENTORY.md` and
   `docs/MIGRATION-PLAN.md`.
3. Search the existing module, integration, job and WebSocket directories.
4. Update the existing owner module. If none exists, create a feature-based
   module with clear route, controller, service, repository, validation and
   test responsibilities.
5. Add or update contract tests and run them in `/root/attica-api-next`.
6. Update the module map, API inventory, migration plan and verification
   record when ownership, behavior or migration status changes.
7. Report the owner module, files changed, verification, legacy line-count
   effect and production impact.

Do not add business logic, SQL, calculations, provider calls, cache behavior
or report generation to the legacy production `server.js`. It is reserved for
bootstrap, route mounting, a narrowly scoped compatibility shim, or an urgent
hotfix. An urgent production patch must be followed by the equivalent module
change, test and migration-debt record.

## Oversized-file review

Run `npm run check:large-files` before merging a substantial backend change.
It warns by default and supports `--strict` for CI enforcement. Review files
above these guide levels:

| File type | Review threshold |
| --- | ---: |
| Routes | 300 lines |
| Controllers | 500 lines |
| Services | 800 lines |
| Repositories | 700 lines |
| Integrations | 800 lines |
| React components | 800–1000 lines |
| Any source file | 1500 lines |

The check also warns when the legacy production `server.js` grows by more than
300 lines from its recorded baseline. It does not alter production files.

## Migration rule

Temporary legacy/module duplication is permitted only while compatibility is
being proven in isolated preview. After a module is ready for a controlled
cutover, remove the replaced legacy handler in the same migration work so the
legacy line count actually declines. Production remains unchanged until the
staged implementation has been verified and a concrete cutover is approved.
