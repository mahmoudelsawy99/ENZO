# ENZO Barbershop

Foundation for a multi-tenant barbershop management application. This repository contains the design system, localized application shell, and API skeleton. Business modules are not implemented yet.

## Stack

- Angular 21.2, TypeScript, Tailwind CSS 4, Angular CDK
- Node.js, Express 5, MongoDB, Mongoose 9

Angular 22 is the newest CLI release, and it requires Node `^22.22.3`. This workspace is on Node 20.19.5, so the client uses Angular 21.2, the latest major that supports that runtime.

## Run

From the repository root:

```bash
npm run start:client
npm run start:server
```

- Client: http://127.0.0.1:4200
- API health: http://127.0.0.1:3000/api/health

The API starts without MongoDB. Set `MONGODB_URI` in `server/.env` (see `server/.env.example`) when a database is available. The health check then reports `database: "connected"`.

Production builds:

```bash
npm run build:client
npm run build:server
```

## Language and theme

Dark theme and English are the defaults. Use the controls in the top bar:

- **Language:** English (left to right) or العربية (right to left)
- **Theme:** sun/moon button switches light and dark

Both choices are stored in the browser and applied before the first paint. The shell, validation messages, dates, and numbers follow the active language. Layout uses logical CSS rather than hand-mirrored components.

Open **Component preview** on the dashboard, or go to `/preview`, to exercise the shared controls. That page is a design-system gallery, not operational data.

## Layout

```text
client/src/app
  core/        theme, i18n, navigation, API client
  shared/ui/   buttons, fields, table, dialogs, toasts
  layout/      sidebar, top bar, shell
  features/    dashboard and module placeholders
client/src/assets/i18n
client/src/styles
server/src
  config/      environment and MongoDB connection
  middleware/  404 and error handling
  modules/     health route only
```

Navigation entries for appointments, queue, POS, payroll, and the other modules are placeholders. They do not enforce permissions. When roles exist, the API must authorize every request. A branch selected in the shell is not proof of access.

## Not in this foundation

- Authentication and sessions
- Tenant or branch authorization
- Mongoose schemas and business workflows
- A full calendar; the date field is the native picker integration point
