# Git migration and setup

Repository: `soraattica-jpg/attica-gold-nexus`.
Branch: `chore/full-call-center-project-20260930`.
Checkout: `/root/attica-call-center-git`.

This separate checkout captures the complete custom project while services
continue using their existing directories. Both existing Git histories are
preserved. The frontend keeps its root build layout; the modular backend
was imported with Git subtree under `backend/modular`.

## Configuration

Embedded database, lead-ingestion, website-form, browser verification and
Maps credentials have been replaced with environment settings. Copy the
appropriate `.env.example` files to ignored `.env` files and provide real
values privately. The production API service reads
`/etc/attica/production.env`. Existing provider files and the Google service
account remain private under `/etc/attica`. Wati retains its external
`/etc/attica/wati.config.php` configuration mechanism.

Extracted settings on this server are outside the repository at
`/root/attica-git-migration/private/secret-bindings.json`, with restrictive
permissions. A fresh checkout needs separately supplied private settings.

Render Asterisk placeholders into an ignored review directory:

```sh
node scripts/render-telephony.mjs /path/to/private-bindings.json
```

Review before installing under `/etc/asterisk`. IVR prompts belong under
`/var/lib/asterisk/sounds/attica`. Source capture does not reload the PBX.

## Setup and verification

Provision Apache, PHP, MariaDB, Asterisk and VICIdial/astguiclient separately.
Captured service units retain their existing server paths, which need review
for a new installation. `database/schema.sql` contains database names and
empty table structures for `asterisk` and nine preview/test databases,
refreshed October 1, 2026. Routines, events and triggers are excluded from
this tables-only snapshot. Required executable database objects,
operational records, users and grants must be provisioned privately.
See `database/README.md` and the full table-name inventory beside it.

Install Node dependencies in the root and each backend. The modular baseline
is sanitized and has checked hashes in `backend/modular/docs/BASELINE.json`.
Its original hashes remain under `originalFiles`. Contract tests run from
this checkout; isolated database suites need private fixtures and settings.
The full generated modular candidate stays disabled.

```sh
npm run build
npm test
npm run test:backend
npm run verify:source
git status --short
git push -u origin chore/full-call-center-project-20260930
```

The complete project branch was published to GitHub on September 30, 2026
at 23:54 UTC. Open the [published branch](https://github.com/soraattica-jpg/attica-gold-nexus/tree/chore/full-call-center-project-20260930).

This server uses a dedicated repository deploy key. Its public key is
`/root/attica-git-migration/private/github-deploy-key.pub`; the private key
remains outside the repository. The local repository's SSH command and
`origin` push URL are configured, and this branch tracks its GitHub branch,
so future commits from this checkout can be published with `git push`.
Other clones need their own GitHub authentication.

## Snapshot contents

Source, test fixtures, schema, IVR prompts, settings templates and docs are
versioned. Customer/call exports, recordings, credentials, private keys,
dependencies, generated runtime/build files and duplicate temporary backups
remain operational artifacts outside Git. Historical patches are reference
material; current complete API source is in `backend/production`.
