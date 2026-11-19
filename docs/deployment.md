# Deploying Dynarock Sales

Target setup:

| Part | Address | Where |
| --- | --- | --- |
| Web app (Next.js) | `https://sales.dynarock.in` | Vercel, or the same server as the API |
| API (Hono + workers) | `https://api.sales.dynarock.in` | An always-on server: a small VPS, Render, Railway, or a container service |
| Database | MongoDB Atlas, database `dynarock_sales` | Already set up |
| Mail | `sales@dynarock.in` through the Gmail API | Already set up ([gmail-setup.md](gmail-setup.md)) |

Both addresses are on `dynarock.in`, so the sign-in cookie works across them with no extra configuration.

> **The API must run all the time.** It checks Gmail every minute and sends follow-ups in the background. Serverless platforms that sleep between requests (Vercel functions, Netlify functions) won't work for the API. The web app can go on Vercel.

## 1. API server

Requirements: Node 22.13 or newer (or Docker), and port 5000 behind HTTPS.

**With Docker** (from the repo root):

```bash
docker build -t dynarock-sales-api ./backend
docker run -d --name dynarock-api --restart unless-stopped --env-file backend/.env -p 5000:5000 dynarock-sales-api
```

**Without Docker:**

```bash
cd backend
npm ci
npm run build
NODE_ENV=production node dist/server.js   # keep it running with pm2 or systemd
```

Put a reverse proxy (Caddy, nginx, or the platform's own) in front for HTTPS. With Caddy the whole config is:

```text
api.sales.dynarock.in {
    reverse_proxy localhost:5000
}
```

### Production `backend/.env`

Start from your local `.env` and change these:

```bash
NODE_ENV=production
PORT=5000
FRONTEND_ORIGIN=https://sales.dynarock.in
API_PUBLIC_URL=https://api.sales.dynarock.in
GOOGLE_REDIRECT_URI=https://api.sales.dynarock.in/api/v1/mailbox/oauth/callback
TRUST_PROXY=true
# COOKIE_SECURE is on automatically in production.
```

Keep the same `MONGODB_URI`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GEMINI_API_KEY`. **Never change `ENCRYPTION_KEY` once the mailbox is connected**: the saved Google login can only be read with that key.

Health checks: `GET /healthz` (process is up) and `GET /readyz` (the database answers).

## 2. Web app

**On Vercel:** import the repo, set **Root Directory** to `frontend`, and add the environment variable:

```bash
NEXT_PUBLIC_API_URL=https://api.sales.dynarock.in
```

Then add the domain `sales.dynarock.in` in the project settings.

**On the same server (Docker):**

```bash
docker build -t dynarock-sales-web --build-arg NEXT_PUBLIC_API_URL=https://api.sales.dynarock.in ./frontend
docker run -d --name dynarock-web --restart unless-stopped -p 3000:3000 dynarock-sales-web
```

`NEXT_PUBLIC_API_URL` is baked in at build time, so rebuild the web app whenever it changes.

## 3. DNS (at your domain provider)

| Name | Type | Points to |
| --- | --- | --- |
| `sales` | CNAME | `cname.vercel-dns.com` (Vercel), or an A record to your server |
| `api.sales` | A | Your API server's IP address |

## 4. Google and Gmail

1. In Google Cloud → **Clients → Dynarock Sales API**, make sure `https://api.sales.dynarock.in/api/v1/mailbox/oauth/callback` is under **Authorized redirect URIs**. It's already added if you followed the earlier steps.
2. **Create a new client secret** (Add secret), put it in the production `.env`, then disable the old one. The old secret was shared in chat during setup.
3. In admin.google.com, check that DKIM is on for `dynarock.in`, and that SPF and DMARC records exist ([gmail-setup.md](gmail-setup.md), step 7).
4. Sign in to `https://sales.dynarock.in` as an admin and go to **Settings → Connect Gmail**. Each server keeps its own connection in the database, so connect again after moving to a new database.

## 5. MongoDB Atlas

- **Network Access:** add the API server's IP address. Avoid `0.0.0.0/0`.
- **Database Access:** give the app its own user with a strong password and access only to `dynarock_sales`. Don't reuse the password shared during setup.
- Backups: Atlas takes snapshots on paid tiers. On the free tier, schedule a `mongodump` of `dynarock_sales`.

### Daily limits

`USER_DAILY_SEND_LIMIT` (200), `MAILBOX_DAILY_SEND_LIMIT` (1500) and `AI_DAILY_CALL_LIMIT` (1500) cap sending and AI use per day, India time. Google Workspace allows about 2,000 emails a day per mailbox, so keep the mailbox limit below that.

The bootstrap admin password must be your own and at least 16 characters in production; the API won't start with the example one.

## 6. After the first deploy

1. Sign in with the bootstrap admin (`BOOTSTRAP_ADMIN_EMAIL`), then **change the password** in Settings.
2. Connect Gmail (Settings).
3. Invite the sales team (Team).
4. Check the follow-up settings: send window and daily limit (Follow-ups → Settings).
5. Read through the Knowledge facts and the starter Templates.
6. Send yourself a test email, reply to it, and check it appears in the Inbox with an AI label.

## Running more than one API instance

It's safe. Gmail sync and the follow-up sender each take a lock in MongoDB, so only one instance runs them at a time. The rate limiter is per instance, though, so put the instances behind one proxy, or use a shared store, if you need exact limits.

## Updating

```bash
git pull
docker build -t dynarock-sales-api ./backend && docker rm -f dynarock-api && docker run -d --name dynarock-api --restart unless-stopped --env-file backend/.env -p 5000:5000 dynarock-sales-api
```

There are no database migrations to run: MongoDB indexes are created when the API starts.
