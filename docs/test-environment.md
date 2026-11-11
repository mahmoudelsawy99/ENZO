# Test environment

The machine that currently runs ENZO has one configured database, named `enzo`. That database holds the Nile shop. It is not a staging database and it is not a production host.

| Environment | Where it runs | Database | What may be written |
| --- | --- | --- | --- |
| Local Nile | API on `localhost:3000`, Angular on `localhost:4200`, URI from `server/.env` | `enzo` | Live shop records. Do not use it for acceptance tests. |
| UAT | Same API process only when `UAT_MONGODB_URI` points at a separate database | `enzo_uat` | Synthetic tenant `uat-barbers` only |
| Restore drill | A second database on the same local MongoDB | `enzo_uat_restore` | A copy of `enzo_uat`. Never the restore target `enzo`. |
| Automated tests | `node --test` with `MongoMemoryReplSet` | In memory, discarded after the run | Nothing on disk |
| Production | Not configured | Not configured | Do not deploy from this preparation |

`server/src/shared/database-guard.ts` refuses a seed, reset, or backup when `NODE_ENV` is `production`, when the database name is missing, or when the name is `enzo`, `admin`, `local`, or `config`. The only accepted names start with `enzo_uat`.

## Credentials

`server/.env.uat.example` is the template. It contains no secrets. The seed reads JWT secrets from the local `server/.env` and then replaces `MONGODB_URI` with `UAT_MONGODB_URI` before it connects. It does not write to `enzo`.

Synthetic shop sign-in, after `npm run seed:uat` from `server/`:

| Person | Email | Password | Access |
| --- | --- | --- | --- |
| Owner | `owner.uat@enzo.test` | `OwnerPass1` | Owner |
| Branch manager | `manager.uat@enzo.test` | `UatPass1` | Branch Manager, Cairo and Giza |
| Cashier | `cashier.uat@enzo.test` | `UatPass1` | Cashier, Cairo and Giza |
| Receptionist | `receptionist.uat@enzo.test` | `UatPass1` | Receptionist, Cairo and Giza |
| HR | `hr.uat@enzo.test` | `UatPass1` | HR, Cairo and Giza |
| Accountant | `accountant.uat@enzo.test` | `UatPass1` | Accountant, Cairo and Giza |

The two barbers are employees, `UAT Barber One` and `UAT Barber Two`, assigned to Cairo and Giza. They do not have login accounts. The catalog is three services, three customers, one VIP package template, three products, and supplier `UAT Supply`. The seed does not create sales, cashier shifts, payroll, or subscription invoices.

The platform admin in `enzo_uat` is created from `SUPER_ADMIN_EMAIL` in `server/.env` when that value is set. That password is not written in this document.

## Repeat

From `server/`:

```powershell
npm run seed:uat
```

Running it again leaves an existing `uat-barbers` tenant unchanged.

Reset drops only a database whose name starts with `enzo_uat`:

```powershell
npm run reset:uat
npm run seed:uat
```

Do not point `UAT_MONGODB_URI` at `mongodb://127.0.0.1:27017/enzo`.
