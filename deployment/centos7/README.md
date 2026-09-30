# Attica Gold CentOS 7 Deployment Bundle

This bundle is intended to move the Attica dialer/admin application to a new
CentOS 7 server.

## What is included

- `frontend-dist/` - prebuilt React/Vite frontend for Apache `DocumentRoot`
- `attica-api/` - Node/Express backend API
- `schema/asterisk-schema.sql` - database schema only
- `asterisk-config/` - selected Asterisk runtime configs from production
- `systemd/attica-api.service` - API service unit for CentOS 7
- `httpd/attica-gold.conf` - Apache SPA + API reverse proxy config
- `install-centos7.sh` - deployment helper script

## Required software on target server

- CentOS 7 x86_64
- Apache/httpd 2.4
- PHP with curl and mysqli extensions, if WATI webhooks are used
- MariaDB/MySQL
- Asterisk with PJSIP/chan_sip and WebRTC support
- Node.js 18 or newer

CentOS 7 is old, so install a Node build that is compatible with glibc 2.17.
If your normal Node package fails to start, use a CentOS 7 compatible Node 18
build or build Node on the target server.

## Default paths

- Frontend: `/var/www/html`
- API: `/opt/attica-api`
- API env: `/etc/attica/attica-api.env`
- API service: `attica-api.service`
- Asterisk configs: `/etc/asterisk`

## Install

Copy the tarball to the target server, then:

```bash
tar -xzf attica-centos7-bundle-*.tar.gz
cd attica-centos7-bundle-*
sudo ./install-centos7.sh
```

Optional schema import for a fresh database:

```bash
sudo IMPORT_SCHEMA=1 ./install-centos7.sh
```

Optional creation of the DB user expected by the current API:

```bash
sudo CREATE_DB_USER=1 ./install-centos7.sh
```

Optional Asterisk config install:

```bash
sudo INSTALL_ASTERISK_CONFIGS=1 ./install-centos7.sh
```

The installer backs up existing Apache and Asterisk files before replacing
them.

## Database

The current API expects database `asterisk` and the DB user configured inside
the API. For a new server, create/import the database before starting live use.
At the time this bundle was created, the API runtime uses the local MySQL user
`custom` for database access.

For a full production migration, export live data separately:

```bash
mysqldump --single-transaction --routines --triggers asterisk > asterisk-full.sql
mysql asterisk < asterisk-full.sql
```

The bundled schema is enough to start a clean instance, but it does not include
live calls, agents, branches, recordings, or lead data.

## Ports

Open these as required:

- `80/tcp` and `443/tcp` for Apache
- `3001/tcp` locally for the API, normally proxied by Apache
- `8089/tcp` for Asterisk WebSocket/WSS if browsers connect directly
- SIP/RTP ports as required by your trunk and WebRTC deployment

## After install

```bash
systemctl status attica-api
curl http://127.0.0.1:3001/api/stats
asterisk -rx "queue show"
asterisk -rx "sip show peers"
asterisk -rx "pjsip show endpoints"
```

Protect the bundle. It may contain telecom configuration and deployment
settings that should not be shared publicly.
