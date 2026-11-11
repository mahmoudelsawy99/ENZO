# Production go / no-go

Release candidate: `0.1.0-rc.1`. Nothing was deployed. The recommendation is **NO-GO**.

## Evidence from this session

- API typecheck passed. `tsc` emitted `server/dist`. Angular production build completed to `client/dist/client`. The browser bundle does not contain a MongoDB URI or the test passwords.
- `npm test` in `server/` exited 0. Ten files, 42 tests, 0 failures: phases 2 through 10 and phase 12. Phase 12 itself is 8 tests: database guard, inventory paging, checkout reconciliation, package remainder, subscription invoice isolation, and payroll with no attendance rows.
- Those tests use an in-memory replica set. They did not connect to the Nile database.
- After the run, database `enzo` still has one tenant, `nile-barbers`, zero sales, and zero payroll records. Database `enzo_uat` has one tenant, `uat-barbers`, zero sales, and zero payroll records. The UAT seed is idempotent: a second run left the tenant unchanged.
- `server/scripts/backup.ps1` was pointed at `enzo` and stopped before `mongodump`. `mongodump` is not installed, so no backup file was written and no restore was attempted.
- The stock index `tenantId_1_branchId_1_updatedAt_-1` is present on `enzo`. Creating it did not change tenant, sale, or payroll counts.

## Checklist

| Item | Status | Evidence |
| --- | --- | --- |
| Tenant isolation | PASS | Phase 12 excludes another tenant's stock. Phases 2–10, which passed in the same run, reject cross-tenant reads of sales, products, and invoices. |
| Authentication | PASS | Phase 2 login, lockout, and refresh rotation passed in this run. |
| RBAC | PASS | Phase 3 passed, including a user who cannot grant a permission they do not hold. Full branch access stays on the owner role. |
| POS | PASS | Phase 6 and phase 12. A completed appointment checks out once. An early checkout creates no sale. Subtotal 380, discount 10, total 370. |
| Payments and refunds | PASS | Phase 12 paid one sale with card and cash, and a second with cash, card, wallet, and InstaPay. Payment lines equal the sale total. A second refund above the remaining cash is `refund_limit`. Phase 6, in the same run, covers a refund through `REFUNDED`. |
| Cashier shifts | PASS | Expected cash is opening + cash sales + cash tips − cash refunds. Phase 12: opening 100, cash sales 210, cash tip 20, cash refund 40, expected 290, counted 290, difference 0. |
| Packages | PASS | Phase 5 protects remaining quantity and expiry. Phase 6 returns `package_expired`. Phase 12: asking for 3 uses when 2 remain returns `insufficient_quantity` and leaves the remainder at 2; redeeming 1 leaves 1. |
| Inventory | PASS | Phase 12 paged 24 Cairo rows at 10 per page (10, then 10, then 4). Search returned one SKU. Low returned 8 rows, all above zero and at or below minimum. Out returned 6 rows, all at zero. Giza returned only its own row. |
| Purchases | PASS | Phase 7 passed in this run: receiving, partial supplier payment, weighted average cost, purchase return, transfer, and low-stock count. |
| Attendance | PASS | Phase 8 passed. Phase 12 generated November payroll with no attendance documents: absent 0, present 0, attendance deductions 0. Missing days are not stored as absence. |
| Payroll | PASS | Phase 8 covers generate, review, approve, pay, and a correction that leaves the paid record in place. Phase 12 covers the empty-attendance case. Monthly basic salary stayed 8000. |
| Reports | PASS | Phase 9 passed in this run. |
| SaaS billing | PARTIAL | Phase 10 and phase 12 assign a trial, create an invoice, record a manual payment, and leave `SaleTransaction` unchanged. Upgrade is covered by phase 10. Trial expiry, past due, downgrade, cancellation, and suspension exist in the billing service and were not executed in this session. |
| Backups | BLOCKED | The script refuses `enzo` without `-ConfirmDatabase enzo`. That switch was not used. `mongodump` is not on PATH, so no dump was created and no schedule exists. |
| Restore | BLOCKED | No dump exists to restore. The documented target is `enzo_uat_restore`. The live `enzo` database was not a restore target. |
| Monitoring | PARTIAL | `/api/health/live` and `/api/health/ready` exist. Ready depends on MongoDB. Request logs include a request id. No external error tracker is configured. |
| WhatsApp | BLOCKED | The module, encryption, and webhook signature check are implemented. `LIVE_MESSAGING_TESTED` is `false`. No Meta credentials were used and no message was sent. |
| Fingerprint hardware | BLOCKED | The only provider is the normalized mock adapter. No device was connected. |
| Performance | PARTIAL | The inventory list no longer loads every stock row before slicing. The automated check used 24 rows across two branches, not a production-sized load. |
| Deployment | NOT TESTED | Local API and Angular production builds succeeded. Docker Compose was not started. No server was updated. |
| Rollback | NOT TESTED | The steps are in `docs/deployment.md`. They were not exercised because there was no deployment. |

## Environments

| Name | Database | Used for |
| --- | --- | --- |
| Local Nile | `enzo` on `127.0.0.1:27017` | The live shop. Read and an additive stock index only. |
| UAT | `enzo_uat` | Synthetic tenant `uat-barbers`. |
| Automated tests | In-memory replica set | The 42 tests above. |
| Production | None | No host, domain, or TLS terminator is configured. |

Details and the UAT sign-in table are in `docs/test-environment.md`. Calculations are in `docs/financial-reconciliation.md`.

## Integrations

| Integration | Implemented | Configured | Tested with credentials | Tested against the real service |
| --- | --- | --- | --- | --- |
| Shop payments | Yes. Methods are cash, card, wallet, InstaPay, and other. | Manual recording only. | No gateway credentials. | No. |
| SaaS subscription collection | Yes. Gateway code `MANUAL`. | No card processor. | A manual payment in the in-memory test. | No. |
| WhatsApp | Yes. | No Meta credentials in this session. | No. | No. |
| Fingerprint | Mock adapter only. | No device. | No. | No. |
| Password reset email | Token is held in memory. | No mailer. | No. | No. |

## Release steps that are ready

1. Build the API with `npm run build` in `server/` and the web app with `npx ng build --configuration production` in `client/`. Both succeeded locally.
2. On a new host, set the variables in `docs/deployment.md`. Keep secrets out of git and out of the Angular environment file. The client calls `/api` on the same origin.
3. There is no separate migration runner. On connect, the API ensures the platform admin, seeds missing plans, and records a zero-price legacy subscription only for a shop that does not already have one. It syncs stock and subscription indexes. It does not rewrite sales or payroll.
4. Seed a new empty shop through the platform UI. `npm run seed:uat` is only for a database whose name starts with `enzo_uat`.
5. Roll back by stopping the new API and starting the previous build. Restore a database only into a new database, using the procedure in `docs/backup-and-recovery.md`.

## Why this is NO-GO

The shop workflows covered by the automated suite passed, and Nile's records are still the same tenant with no sales and no payroll. A launch still needs all of the following, and none of them exist yet:

- A production host, HTTPS, and a domain in front of the API and the Angular app.
- A scheduled backup and a restore drill into an empty database.
- A mailer for password reset.
- A payment provider, if shops will take cards online. In-person methods are recorded by hand.
- WhatsApp credentials and a test send in Meta's test environment.
- Fingerprint hardware and a real protocol test. Until then the adapter stays a mock.
- A run of `.github/workflows/ci.yml` on the host that will build the release.
- Execution of the subscription states that this session did not run: trial expiry, past due, downgrade, cancellation, and suspension.

Public catalog and employee media URLs remain reachable by anyone who knows the UUID. That was left in place because image tags cannot send the bearer token. Treat those URLs as secrets until a signed-delivery change is designed.
