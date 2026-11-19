# Dynarock Sales

The Dynarock sales team's internal tool for emailing colleges and universities from the shared `sales@dynarock.in` mailbox. It tracks every email sent and received, sends follow-ups automatically when a client goes quiet, uses Gemini to write and answer emails, and shows the team's growth.

The full design (MongoDB collections, API, screens, build plan) is in [docs/dynarock-sales-design.md](docs/dynarock-sales-design.md). Connecting the real mailbox: [docs/gmail-setup.md](docs/gmail-setup.md).

> The previous project (NIAT Admission Drop-Off Detective) is kept at the git tag `v1-admission-detective`.

## Status

| Phase | What | State |
| --- | --- | --- |
| 0 | Clean-up: Prisma/Postgres and NIAT code removed, MongoDB (Mongoose) added | Done |
| 1 | Accounts: sign in, invitations, roles (admin / sales rep), Team and Settings pages, app shell | Done |
| 2 | Gmail connection, sync, shared Inbox, Gmail-style Compose, replies, drafts, attachments | Done |
| 3 | Contacts and colleges (auto-created and auto-linked from email), stage history, pipeline board | Done |
| 4 | AI: write and rewrite in Compose, reply suggestions, Approvals | Next |
| 5 | Automatic follow-ups | |
| 6 | Analytics dashboard | |

## Stack

| Layer | Choice |
| --- | --- |
| Backend | Node 22+, Hono, TypeScript, Zod, pino |
| Database | MongoDB through Mongoose |
| Auth | argon2id passwords, httpOnly session cookie stored as a hash in MongoDB, invitation links |
| AI | Gemini (`@google/genai`) |
| Frontend | Next.js 16, React 19, Tailwind v4, **shadcn/ui** (Base UI), TanStack Query |

## Run it locally

Requirements: **Node 22.13+**. MongoDB is optional: `npm run db:local` starts a zero-install one.

```bash
# 1. Database (pick one)
cd backend
npm install
npm run db:local                 # local MongoDB on 27017, data in backend/data/mongo
# or: docker compose up -d mongo  (from the repo root)
# or: put a MongoDB Atlas URI in MONGODB_URI

# 2. API (new terminal)
cd backend
cp .env.example .env             # set BOOTSTRAP_ADMIN_PASSWORD (and GEMINI_API_KEY later)
npm run dev                      # http://localhost:5000

# 3. Web (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                      # http://localhost:3000
```

On first start the API creates the first admin from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`. Sign in with it, change the password in **Settings**, then add the sales team from **Team → Invite member**. Each invite gives a one-time link (valid 7 days) for that person to choose their password.

Everything in Docker: `docker compose --profile app up --build`.

### Try the Inbox without Google setup

`npm run dev:fake-mail` in `backend` (instead of `npm run dev`) runs the API with an in-memory fake Gmail. Go to **Settings → Connect Gmail** (it connects instantly), then **Compose** an email to any address: about 8 seconds later the "client" replies and the conversation moves to **Needs reply**. Fake mail is lost when the API restarts.

### Connect the real sales@dynarock.in

Follow [docs/gmail-setup.md](docs/gmail-setup.md): create the Google Cloud OAuth client, put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `ENCRYPTION_KEY` in `backend/.env`, restart, then **Settings → Connect Gmail** as an admin.

## Commands

| In `backend` | What it does |
| --- | --- |
| `npm run dev` | API with reload |
| `npm test` | Unit and integration tests (in-memory MongoDB) |
| `npm run lint` / `typecheck` / `format` | Code checks |
| `npm run db:local` | Zero-install local MongoDB |
| `npm run dev:fake-mail` | API with a fake Gmail, for trying the Inbox |
| `npm run build` / `start` | Compile to `dist/` and run it |

| In `frontend` | What it does |
| --- | --- |
| `npm run dev` | Web app |
| `npm run lint` / `typecheck` / `build` | Code checks and production build |

## Configuration (`backend/.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed web origin(s), comma separated; the first is used in invite links |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/dynarock_sales` | MongoDB connection |
| `SESSION_TTL_DAYS` / `INVITE_TTL_DAYS` | `14` / `7` | How long a sign-in and an invite link last |
| `COOKIE_SECURE` | on in production | HTTPS-only session cookie |
| `BOOTSTRAP_ADMIN_NAME` / `_EMAIL` / `_PASSWORD` | `Admin` / none / none | First admin, created only when there are no users |
| `MAILBOX_ADDRESS` | `sales@dynarock.in` | The shared mailbox; any other account is refused |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | none | Google OAuth client (see docs/gmail-setup.md) |
| `GOOGLE_REDIRECT_URI` | `http://localhost:<PORT>/api/v1/mailbox/oauth/callback` | Must match the OAuth client |
| `ENCRYPTION_KEY` | none | 32 bytes, base64; encrypts the stored Gmail tokens |
| `GMAIL_SYNC_INTERVAL_SECONDS` | `60` | How often new mail is fetched |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | none / `gemini-3.1-flash-lite` | AI features (from phase 4) |
| `RATE_LIMIT_PER_MINUTE` / `AUTH_RATE_LIMIT_PER_MINUTE` | `300` / `10` | Per-IP limits; the second protects sign-in and invites |
| `TRUST_PROXY` | `false` | Read the client IP from `X-Forwarded-For` behind a proxy |

## API so far (`/api/v1`)

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/login` · `/auth/logout` | anyone | Sign in / out (session cookie) |
| GET / PATCH | `/auth/me` | signed in | Current user; update name and signature |
| POST | `/auth/change-password` | signed in | Also signs out other devices |
| GET | `/auth/invites/:token` | anyone | Invite details for the accept page |
| POST | `/auth/accept-invite` | anyone | Set a password and sign in |
| GET | `/users` | signed in | The team |
| POST | `/users/invite` · `/users/:id/resend-invite` | admin | Create or renew an invite link |
| PATCH | `/users/:id` | admin | Change role, disable or enable |
| GET | `/mailbox` | signed in | Mailbox status |
| GET | `/mailbox/connect` · POST `/mailbox/disconnect` | admin | Start Google sign-in; disconnect |
| GET | `/mailbox/oauth/callback` | Google | OAuth redirect (signed state) |
| POST | `/mailbox/sync` | signed in | Fetch new mail now |
| GET | `/threads?folder=&q=&sentBy=&before=` · `/threads/counts` | signed in | Inbox list and counts |
| GET / PATCH | `/threads/:id` | signed in | Conversation with messages; mark read/unread, close/reopen |
| POST | `/emails/send` | signed in | New email, reply, reply all or forward (with attachments) |
| GET | `/messages/:id/attachments/:index` | signed in | Download an attachment |
| GET | `/recipients?q=` | signed in | Address suggestions for Compose |
| GET / POST / PATCH / DELETE | `/drafts` | signed in (own only) | Compose autosave |
| POST / GET | `/files` · `/files/:id` | signed in | Upload / download Compose attachments (20 MB) |
| GET / POST | `/contacts?q=&stage=&status=&organizationId=&ownerId=&page=` | signed in | List / add contacts |
| GET / PATCH | `/contacts/:id` | signed in | Contact with conversations and timeline; edit, change stage (Lost needs a reason), owner, status |
| GET | `/pipeline?q=&ownerId=` | signed in | Contacts grouped by stage |
| GET / POST | `/organizations?q=&type=` | signed in | List / add colleges (adding a domain links matching contacts) |
| GET / PATCH | `/organizations/:id` | signed in | College with people and conversations; edit |
| GET | `/health` · `/healthz` · `/readyz` | — | Status and probes |

How contacts work: every email sent or received creates the contact if needed and links them to the college with the same email domain (never for gmail.com and other personal providers). Stages move forward on their own, New → Contacted when we email, → Replied when they answer, and never backwards. Unsubscribed, bounced and do-not-contact people can't be emailed.

Safety rules built in: only hashes of session and invite tokens are stored; a disabled user is signed out everywhere; nobody can change their own role or disable themselves; the team always keeps at least one active admin; cross-site form posts are rejected.

## Project structure

```text
backend/src/
  server.ts  app.ts  container.ts      bootstrap, middleware, dependency wiring
  config/env.ts                        validated configuration
  database/                            Mongoose connection and model registry
  common/                              errors, http helpers, logger, middleware, utils
  modules/<name>/                      model, repository, service, controller, routes, schema
    auth/  users/  activities/  mailbox/  mail/  drafts/  files/  locks/  contacts/  organizations/  system/
  integrations/gmail/                  OAuth, REST client, MIME build/parse
  workers/                             background Gmail sync
frontend/src/
  app/(auth)/                          login, accept-invite
  app/(app)/                           signed-in pages inside the sidebar shell
  features/                            auth, team, settings, inbox, compose, contacts, organizations, pipeline
  components/ui/                       shadcn components
  hooks/  lib/api/  config/
```
