# Complete feature ownership for server route registrations

All 120 `server.js` path registrations now have an explicit feature owner in the generated candidate.

- 45 registrations use extracted controller/service/repository modules.
- 75 path registrations preserve legacy business handlers behind 69 feature-owned mounts; six paths are aliases registered by array-valued declarations.
- The generic compatibility registry has been removed.

The remaining preserved handlers are divided into seven bounded owners:

| Owner | Scope |
| --- | --- |
| `call-records` | calls, blocked numbers, recordings, missed calls and waiting queue |
| `agent-management` | breaks, agent languages, agent mutation/login and call-slot state |
| `call-control` | incoming gates, monitoring, conference, transfer and transfer context |
| `lead-ingestion` | Justdial, website, blog, Meta and Google lead endpoints |
| `marketing` | SEO/marketing leads, spend and lead-to-bill reporting |
| `auto-dial` | auto-dial control, queue list/import/current/update |
| `location-ivr` | places/geocoding and call IVR/language cache endpoints |

Each owner rejects unknown paths and wrong HTTP methods. The generator still copies every original middleware and handler expression byte-for-byte. Structural tests hash those arguments, check complete registration order, and fail when a path lacks exactly one owner.

This cleans route ownership and removes the catch-all registry. It does not claim that the 75 legacy handler bodies have been rewritten into services. Those deeper extractions remain ordered by operational risk, with call control, auto-dial and Asterisk-related work last. The generated candidate remains startup-disabled and production is unchanged.
