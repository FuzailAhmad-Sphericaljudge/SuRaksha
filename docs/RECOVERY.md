# Recovery runbook

Run `npm run recovery:drill` before a release. The drill creates a live SQLite database, takes an online backup, opens the backup independently, verifies the expected record and runs `PRAGMA integrity_check`.

Production backups must be written to storage outside the application host, encrypted with a separately managed key and retained according to the approved data policy. Record backup time, database version, object count and checksum. Test restore into an isolated environment before promoting it.

During an incident, stop writes, preserve logs, take a final backup when safe, restore the most recent verified backup to a new database path, run migrations and integrity checks, then point a staging instance at the restored database. Resume production only after authentication, public profile and private evidence authorization checks pass. Keep the previous database read-only until the incident is closed.

`/api/health` proves the process is alive. `/api/ready` additionally proves the database answers a query and should be used by deployment readiness checks.
