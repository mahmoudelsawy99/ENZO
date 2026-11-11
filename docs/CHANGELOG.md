# Changelog

## 0.1.0-rc.1 — not deployed

Release candidate prepared locally. No host was updated and no git tag was created.

- Inventory lists now filter, sort, and page in MongoDB. Low stock and out of stock stay mutually exclusive. A branch index on tenant, branch, and update time supports that page.
- Seed and reset commands for a separate `enzo_uat` database. Both refuse the live `enzo` database and refuse `NODE_ENV=production`.
- Backup script refuses the live `enzo` database unless the operator passes an explicit confirmation. That confirmation was not used.
- Acceptance coverage added for the database guard, inventory pages, split tender, cash refund limits, package remainders, subscription invoices staying out of shop sales, and payroll ignoring days that have no attendance record.
- Formulas are written in `docs/financial-reconciliation.md`. The go / no-go record is `docs/PRODUCTION_GO_LIVE.md`.

Shop sales, payroll rows, and the Nile subscription were not rewritten.
