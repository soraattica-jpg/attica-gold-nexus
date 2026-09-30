# Agent Status read preview

The three read registrations at `server.js:29997–30114` are extracted: agent list, single-agent detail and session history. Candidate adapters preserve the existing cached list, runtime status overlay, PJSIP contact mapping, UI refresh attachment, session date/limit rules and response errors.

Port 3101 returns synthetic agents and sessions only. It does not inspect PJSIP, Asterisk channels, queues or production agent tables. Mutating agent, break, login, call-slot and call-state routes remain pending because those share routing and telephony state. See `AGENT-STATUS-VERIFICATION.json`.
