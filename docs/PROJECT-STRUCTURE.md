# Call center project structure

Captured from the server on September 30, 2026.

```text
attica-gold-nexus/
├── src/                         React agent, admin, MD and marketing frontend
│   ├── components/              Dialer, intake, leads, monitoring and reports
│   ├── contexts/                Authentication and call state
│   ├── hooks/                   Agent, pagination and intake workflows
│   ├── lib/                     SIP, API, reporting and workflow helpers
│   └── pages/                   Dashboard and management pages
├── public/integrations/         Wati and AiSensy PHP integrations
├── backend/
│   ├── production/              Current live API and helper modules
│   ├── modular/                 Isolated refactoring preview
│   │   ├── modules/             Feature routes/controllers/services/repositories
│   │   ├── integrations/        Asterisk trunk routing and Kaleyra SMS
│   │   ├── baseline/            Sanitized historical production source
│   │   ├── tests/               Contract and database suites
│   │   └── docs/                Ownership, migration and verification evidence
│   └── reporting/               Separately deployed reporting API
├── database/                    Schema without customer records
├── telephony/
│   ├── asterisk/                Configuration templates
│   ├── agi-bin/                 Intake-ended AGI integration
│   └── sounds/attica/            Six recorded IVR prompts
├── deployment/
│   ├── systemd/                 Service units and API drop-ins
│   ├── apache/                  Current sites and proxies
│   ├── firewall/                Persistent network rules
│   ├── cron/                    DID rotation schedule
│   ├── reporting-api/           Deployment compatibility source copy
│   ├── war-room/                Source and deployed static reporting page
│   ├── analytics-vm/            VM cloud configuration
│   └── centos7/                 Existing installation materials
├── scripts/                     Deployment, maintenance and verification
└── docs/                        Structure, timeline and source inventory
```

| Component | Server source | Git location |
| --- | --- | --- |
| Frontend and integrations | `/root/attica-gold-nexus` | Repository root |
| Production API | `/root/attica-api` | `backend/production` |
| Modular API | `/root/attica-api-next` | `backend/modular` |
| Reporting API | `/opt/attica-reporting-api` | `backend/reporting` |
| Database structure | MariaDB database `asterisk` | `database/schema.sql` |
| Phone settings | `/etc/asterisk` | `telephony/asterisk/*.template` |
| Intake AGI | `/var/lib/asterisk/agi-bin` | `telephony/agi-bin` |
| IVR prompts | `/var/lib/asterisk/sounds/attica` | `telephony/sounds/attica` |
| Reporting page | `/var/www/warroom-atticagold` | `deployment/war-room/static` |
| Services and network settings | `/etc/systemd`, `/etc/apache2`, `/etc/attica` | `deployment` |

Apache serves the browser app and proxies requests to the production Node
API on port 3001. That API reads MariaDB and coordinates calls with Asterisk.
The reporting API runs on port 3015. The modular API is a separate loopback
preview on port 3101 and supports a synthetic mode for local development.

Asterisk, MariaDB, Apache, PHP and VICIdial/astguiclient are separately
provisioned server dependencies. Their packaged binaries and vendor
installations are outside the custom source snapshot. The schema captures
VICIdial tables; the dialplan references astguiclient AGI on local port 4577.

See [exact source hashes](SOURCE-SNAPSHOT.json) and [the timeline](TIMELINE.md).
