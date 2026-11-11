# Security audit — Phase 10

Findings below are from the current codebase. Severity is relative to a multi-tenant barbershop SaaS.

## Already in place

| Area | Result |
| --- | --- |
| Password hashing | bcrypt, with a dummy verify when the email is unknown |
| Login throttling | 10 attempts per 15 minutes, plus a lock after 5 bad passwords |
| Refresh rotation | New token on each refresh. A revoked token revokes the user's open sessions |
| Access checks | Every access token is checked against the stored session, including logout |
| Tenant identity | Taken from the authenticated user, not from the request body |
| Privilege grant | A user cannot grant a permission they do not hold. Owners are the exception |
| Headers | Helmet, `x-powered-by` disabled, JSON limit 1mb |
| Cookies | HttpOnly, SameSite=Lax, path limited to `/api/v1/auth`, Secure in production |
| Errors | Clients receive a code and message. Stack traces stay off the response |
| Uploads | Type allow-list, 2 MB, UUID file names |

## Findings and what changed

| Severity | Finding | Change |
| --- | --- | --- |
| High | Uploads trusted the browser MIME type | Byte signatures are checked for PNG, JPEG, GIF, and WEBP. A mismatched file is deleted |
| Medium | Requests had no correlation id | `X-Request-Id` is returned. Production logs one JSON line per request without the body |
| Medium | Readiness was the same as liveness | `/api/health/live` and `/api/health/ready` are separate. Ready requires MongoDB |
| Medium | Employee and catalog files are public if the UUID is known | Left as-is. Image tags cannot send the bearer token. Names are unguessable. Treat the media URL as a secret |
| Low | 500 logs previously printed the raw error object | Logs now keep a short message and the request id |
| Low | CORS accepted one origin only | `CLIENT_ORIGIN` may be a comma-separated list |

## Residual

- Password reset tokens are held in process memory until a mailer collects them. There is no outbound email provider.
- WhatsApp live delivery is not configured.
- Media URLs are not authorized per request.
- Subscription suspension blocks new branches, users, employees, and plan features. Point of Sale stays available so a shop can keep taking customer payments.
- Rate limits are skipped when `NODE_ENV=test`.
