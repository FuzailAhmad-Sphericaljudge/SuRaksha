# Release candidate gate

Run `npm run release:gate` from a clean checkout. It performs formatting, type checks, unit and integration tests, production builds, accessibility and asset-budget checks, a backup/restore integrity drill, the demo production-server smoke test and a production-mode staging smoke test.

The automated API scenarios cover student reporting and evidence moderation, owner claims and reviewer-controlled repairs, professional credential scope and conflict declarations, guardian sharing and immediate revocation, notification retry, privacy requests, reviewer audit operations and public profile/analytics boundaries.

Before deployment, complete manual keyboard and screen-reader passes for registration, reporting, evidence upload, reviewer decisions and public profiles. Record browser, device, result and issue link in the release ticket.

## Rollback rehearsal

1. Take and verify a database backup with `npm run recovery:drill`.
2. Keep database migrations additive. Do not deploy an older binary that cannot tolerate new columns or tables.
3. Retain the previous application image and configuration.
4. If the new release fails readiness, route traffic back to the previous image while keeping the same additive schema.
5. If data corruption is confirmed, stop writes and follow `docs/RECOVERY.md` to restore into a new database path.
6. Run both smoke tests before restoring traffic.

Production deployment remains blocked until provider secrets, off-host backups, alert routing, domains and TLS are configured in Phase 22.
