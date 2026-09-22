# Tata dual-circuit design and commissioning state

The PBX has two independent logical circuits:

| Code | Peer | Incoming | Outgoing role | State |
| --- | --- | --- | --- | --- |
| `TATA_PRIMARY` | `tatasip` | Existing DIDs | Current primary / future fallback | Registered and active |
| `TATA_NEW` | `TATA_NEW` | `8065200220–8065200399` | Planned primary | Network reachable; carrier authentication pending |

The active outbound selector is stored in Asterisk DB at
`TATA_ROUTING/primary`. It is deliberately `TATA_PRIMARY` until Tata confirms
the new circuit authentication and DID activation. There is no automatic
failover.

`TATA_NEW` accepts the pilot/range in 10-digit, zero-prefixed, E.164 and local
8-digit formats. Valid calls are tagged with `TRUNK_CODE`, direction, inbound
DID/pilot and channel account code before entering the existing shared
language IVR and queues. The new outbound context validates CLI
`8065200221–8065200399`, passes early media with uppercase `R`, enforces the
60-channel circuit limit and caps outgoing calls at 50 to reserve capacity for
incoming calls.

## Verified network state, 22 September 2026

- `enp162s0f0`: `10.54.137.22/30`
- `10.79.212.38/32`, `10.79.166.0/28`, and `10.79.165.208/28` use gateway
  `10.54.137.21` on the new NIC as persistent routes.
- `chan_sip` binds to `0.0.0.0:5060`.
- Existing and new SBC IPs differ, so separate inbound peer contexts are not
  ambiguous.
- SIP OPTIONS to `10.79.212.38` succeeds, but copying the existing circuit's
  registration credential was rejected. No REGISTER retry remains configured.

## Activation gate

Do not set `TATA_ROUTING/primary=TATA_NEW` until Tata confirms the pilot/DID
activation, authentication mode, allowed CLI range and required SIP headers,
and controlled inbound/outbound audio tests pass. The reporting API and Admin
selector remain separate follow-up slices; no live Node monolith code was
added for this configuration.
