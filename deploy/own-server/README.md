# OSGARD on Contabo

This configuration runs the Next.js frontend on loopback port 3000. The
Railway API remains the source of truth for accounts and project data, so the
frontend migration does not create a new empty database or invalidate users.

Install the systemd unit and Nginx config from this directory. Keep
`/etc/osgard-platform/web.env` root-readable only. Required variables:

```text
BACKEND_URL=https://asgard-backend-production.up.railway.app
NEXT_PUBLIC_BACKEND_URL=https://asgard-backend-production.up.railway.app
LIVE_RELAY_TICKET_SECRET=<random 32-byte value>
LIVE_RELAY_ALLOWED_USER_IDS=<optional comma-separated owner ids>
```

When no allowed ids are configured, the relay ticket route permits only a
backend user whose role is `admin` or `owner`.
