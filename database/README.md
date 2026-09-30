# Database schema

`schema.sql` is the September 30, 2026 schema-only export of MariaDB database
`asterisk`, including Attica and VICIdial table definitions, routines, events
and triggers. It contains no row exports.

Use a separately provisioned empty database for setup. Review `CREATE
DATABASE`, `USE`, definers, event scheduling and triggers before import.
Users and grants are provisioned privately. The production API uses the
existing service account on `127.0.0.1` with a private `ATTICA_DB_PASSWORD`;
the reporting API has separate `DB_*` settings. The modular preview uses
its own isolated databases.

Restore operational agents, leads, calls, follow-ups and provider state from
a private backup when deploying. Those records are outside Git.
