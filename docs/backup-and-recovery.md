# Backup and recovery

This procedure is prepared. It is not an active production backup. No scheduler or remote bucket is configured. A restore must use a database whose name starts with `enzo_uat`. Never restore over the live `enzo` database.

## What to back up

- MongoDB, which holds tenants, sales, payroll, stock, and subscriptions.
- The `server/assets` font file used by PDF export.
- Uploaded logos, employee photos, and catalog images under the server upload directories.

Do not copy `.env` into the backup archive that you share. Store secrets in the host secret manager.

## Manual backup

From the server directory, with `mongodump` installed:

```powershell
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/enzo_uat'
./scripts/backup.ps1
```

The script refuses to run when `NODE_ENV` is `production` unless `-ConfirmDatabase` is the database name in the URI. It also refuses the live database name `enzo` unless `-ConfirmDatabase enzo` is passed. Do not pass that switch while testing.

The script writes `backups/enzo-<timestamp>/` and deletes local backup folders older than `BACKUP_RETENTION_DAYS` (default 14). Point `BACKUP_DIR` at a disk that is not the database disk.

Suggested frequency: daily, plus a backup before any migration. That schedule exists only after an operator installs it in Task Scheduler or cron.

## Restore

1. Stop the API so it cannot write during the restore.
2. Restore into an empty database first:

```powershell
mongorestore --uri "mongodb://127.0.0.1:27017/enzo_uat_restore" --drop "<backup-folder>/<source-database>"
```

`--drop` replaces collections in the target. The target URI must not be the live `enzo` database. Use `enzo_uat_restore` for a drill.
3. Start the API against that URI.
4. Sign in as the platform admin and as one shop owner. Open a known transaction, a payroll row, and a stock quantity and compare them with the source.
5. Keep the failed database until the comparison matches.

## What this does not cover

- Point-in-time recovery before the last dump.
- Encrypted off-site storage. Configure that in the host you choose.
- A tested production restore. Do not treat a passing build as a completed drill.
