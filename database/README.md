# Database names and empty table structures

`schema.sql` is the October 1, 2026 tables-only export of all 10 call-center
databases on this server: **419 tables, with no row data**. It includes
database names, table names, column definitions, keys and indexes.
`schema-inventory.json` lists every database and table, capture time, the
SQL file checksum and validation details.

| Database | Tables | Purpose |
| --- | ---: | --- |
| `asterisk` | 394 | Production Attica and VICIdial |
| `attica_api_next_contract` | 1 | Modular contract testing |
| `attica_api_next_preview` | 7 | Modular preview |
| `attica_next_billing` | 2 | Billing testing |
| `attica_next_customer_history` | 3 | Customer-history testing |
| `attica_next_followups` | 3 | Follow-up testing |
| `attica_next_intake` | 3 | Intake testing |
| `attica_next_messages_contract` | 2 | Message contract testing |
| `attica_next_messages_preview` | 2 | Message preview |
| `attica_next_sms` | 2 | SMS testing |

The capture uses `mariadb-dump --no-data --skip-triggers --skip-routines
--skip-events --skip-lock-tables --skip-add-locks --skip-add-drop-table
--skip-comments --no-tablespaces --databases` with the database names above.
It does not include records, seed data, procedures, functions, triggers,
scheduled events, database users or grants. System and administration
databases (`mysql`, `information_schema`, `performance_schema`, `sys` and
`phpmyadmin`) are excluded. Existing backup-named tables are included as
empty definitions only.

Live auto-increment counter values are removed; auto-increment columns
remain defined. Nonempty credential defaults in nine character columns
are cleared to empty strings; their names are recorded in the inventory.
All other table definitions are preserved. SQL statement types and all
419 database/table name pairs were checked against live metadata. No data
was imported, modified or exported, and no services were restarted.

## Setup notes

This is not a complete database backup. Import only into a separate empty
server after reviewing the `CREATE DATABASE` and `USE` statements. Users,
grants, private settings and any required executable database objects must
be provisioned separately. The production API uses a private
`ATTICA_DB_PASSWORD`; the reporting API uses separate `DB_*` settings.
The preview/test databases are optional for production deployment.

Restore operational agents, leads, calls, follow-ups and provider state from
a private backup when deploying. Those records remain outside Git.
