# Call center timeline

These dates come from preserved Git history and the September 30 capture.
Commit dates establish when changes entered Git, not their deployment dates.
Times are UTC.

| Date | Recorded milestone | Evidence |
| --- | --- | --- |
| March 18, 2026 | Frontend dialer, call modals, follow-ups and publishing changes | `6b39dd6`, `6be2e2a`, `6392867` |
| March 20, 2026 | Export/file generation added | `66bc9fc` |
| September 21, 2026 | Production baseline captured and modular extraction begun | `d4bff31`, `af5f2fb` |
| September 21, 2026 | Messages, history, reports, billing, SMS, follow-ups, intake, status and reference data extracted into isolated modules | `c8d8689` through `9d8d3b6` |
| September 22, 2026 | SEO/marketing parity work, module rules, dual Tata routing and call attribution | `39c9ef8` through `6afedda` |
| September 30, 2026 | Modular history imported into the complete-project branch | Subtree commit `f0a53a7` |
| September 30, 2026 | Current frontend, APIs, schema, telephony, deployment and IVR source collected | `SOURCE-SNAPSHOT.json` and the snapshot commit |

The frontend changes after March 20 were uncommitted on the server. They
enter Git in the September 30 snapshot without invented earlier commit dates.

```sh
git log --graph --all --date=short --format='%h %ad %s'
git log --date=iso-strict --format='%h %ad %s' -- src
git log --date=iso-strict --format='%h %ad %s' -- backend/production
git log --date=iso-strict --format='%h %ad %s' -- backend/modular
```

The backend's original commits are preserved as parents of the subtree
import, with their original paths. Path-filtered `backend/modular` history
begins at the import; the graph includes the earlier backend development.

Migration sequence: source collection → credential extraction → build and
contract verification → local commits → authenticated GitHub push.
Results and publication status are in `GIT-VERIFICATION.json`.
