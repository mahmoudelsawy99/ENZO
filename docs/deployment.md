# Deployment

Nothing in this repository has been deployed. These files are a starting point for a host you approve.

Tenant identity stays on the user record. Do not switch to subdomain tenants without a separate migration.

## Configuration

Set these in the API environment, not in git:

- `NODE_ENV=production`
- `PORT`
- `MONGODB_URI`
- `CLIENT_ORIGIN` (comma-separated if needed)
- `COOKIE_SECURE=true`
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (different, at least 32 characters)
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`
- `WHATSAPP_ENCRYPTION_KEY` before any shop stores WhatsApp credentials
- `MONGO_POOL_SIZE` (default 10)

The Angular app calls `/api` on the same origin. The sample proxy sends `/api` to the API container.

## Containers

`docker-compose.yml` builds the API and the web image and starts MongoDB. It does not contain passwords. Create `server/.env` locally and pass it with `--env-file`. Do not commit that file.

```powershell
docker compose --env-file server/.env up --build
```

The web container listens on port 8080 and expects TLS to be terminated in front of it.

## HTTPS

Terminate TLS at the reverse proxy. Forward `X-Forwarded-Proto` and `X-Forwarded-For`. The API trusts the loopback proxy only. If the proxy is on another machine, put it on a private network and review `trust proxy` before exposing the API directly.

Keep the refresh cookie `Secure` in production. SameSite is `Lax`, which matches a same-site proxy. A cross-site API host would need a deliberate cookie change.

## Startup

On connect, the API ensures the platform admin, seeds missing subscription plans, and records a zero-price legacy subscription for shops that do not have one. It does not rewrite sales, payroll, or stock.

## Rollback

1. Keep the previous image tag.
2. Stop the new API.
3. If the release only added collections and indexes, start the previous image. New collections can remain.
4. If a release ever changes historical money fields, restore the database backup taken before the release. This release does not do that.
