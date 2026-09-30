# Attica call center

The complete custom call center project, captured on September 30, 2026:
the React frontend, production API, modular staging API, reporting service,
PHP WhatsApp integrations, Asterisk settings and IVR prompts, database schema,
and deployment scripts. The frontend keeps its existing root build layout.

- [Project structure](docs/PROJECT-STRUCTURE.md)
- [Dated timeline](docs/TIMELINE.md)
- [Git migration and setup](docs/GIT-MIGRATION.md)
- [Source inventory and hashes](docs/SOURCE-SNAPSHOT.json)
- [Backend development rules](backend/modular/docs/DEVELOPMENT-RULES.md)

## Frontend

Use Node.js 20.20.1 or a compatible newer version. Copy `.env.example` to
an ignored `.env` and supply the API URL and any browser-restricted Maps key.

```sh
npm ci
npm run dev
npm run build
npm test
```

`VITE_API_BASE_URL` selects the backend URL; `VITE_API_PROXY_TARGET` selects
the API and recordings target for the development proxy. `VITE_` settings
are public browser build settings.

## Backends

```sh
npm --prefix backend/production ci
npm --prefix backend/modular ci
npm --prefix backend/reporting ci
npm run test:backend
```

The production API loads its `.env` through `bootstrap.mjs`, requires
`ATTICA_DB_PASSWORD`, and needs separately provisioned MariaDB and Asterisk.
The modular API is an isolated refactoring preview. Its sanitized historical
baseline enables contract tests; its generated full runtime refuses to start.

```sh
ATTICA_PREVIEW_DATA=synthetic ATTICA_STAGING_PORT=3102 \
  npm --prefix backend/modular start
```

Choose an unused loopback port. Isolated database verification needs private
fixtures and configuration and is separate from the default tests.

## Git and configuration

```sh
npm run verify:source
git log --graph --date=short --format='%h %ad %s'
```

Credentials use private settings and named Asterisk placeholders. Example
configuration is included. Customer/call data, recordings, private keys,
generated files and temporary backups are operational artifacts outside Git.
The running services continue to use their existing deployment directories.
