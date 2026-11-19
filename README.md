# Dynarock Sales

The Dynarock sales team's internal tool for emailing colleges and universities from the shared `sales@dynarock.in` mailbox. It tracks every email sent and received, sends follow-ups automatically when a client goes quiet, uses Gemini to write and answer emails, and shows the team's growth.

The full design (MongoDB collections, API, screens, build plan) is in [docs/dynarock-sales-design.md](docs/dynarock-sales-design.md). Connecting the real mailbox: [docs/gmail-setup.md](docs/gmail-setup.md). Going live on `sales.dynarock.in`: [docs/deployment.md](docs/deployment.md).

> The previous project (NIAT Admission Drop-Off Detective) is kept at the git tag `v1-admission-detective`.

## Status

| Phase | What | State |
| --- | --- | --- |
| 0 | Clean-up: Prisma/Postgres and NIAT code removed, MongoDB (Mongoose) added | Done |
| 1 | Accounts: sign in, invitations, roles (admin / sales rep), Team and Settings pages, app shell | Done |
| 2 | Gmail connection, sync, shared Inbox, Gmail-style Compose, replies, drafts, attachments | Done |
| 3 | Contacts and colleges (auto-created and auto-linked from email), stage history, pipeline board | Done |
| 4 | AI (Gemini): AI Write and Rewrite in Compose, reply labels and summaries, suggested replies in Approvals, Knowledge base | Done |
| 5 | Automatic follow-ups (plans, AI-written steps, send window, daily limit, pause), schedule send, unsubscribe | Done |
| 6 | Analytics dashboard: KPIs vs previous period, activity over time, pipeline, follow-up results, reply labels, AI drafts, team table | Done |
| 7 | Templates with fill-in fields, mobile and clean-up polish, production build check, deployment guide | Done |

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

Everything in Docker: `MONGO_ROOT_PASSWORD=... BOOTSTRAP_ADMIN_PASSWORD=... docker compose --profile app up --build`. Compose refuses to start without both; MongoDB requires a login and listens only on 127.0.0.1, and the admin password must be at least 16 characters.

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
| `npm run check:ai` | Calls Gemini once with your key to confirm AI works |
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
| `API_PUBLIC_URL` | `http://localhost:<PORT>` | Public URL of the API, used in unsubscribe links |
| `AI_RATE_LIMIT_PER_MINUTE` | `20` | Per-IP limit on AI endpoints |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | none / `gemini-3.1-flash-lite` | AI features (from phase 4) |
| `RATE_LIMIT_PER_MINUTE` / `AUTH_RATE_LIMIT_PER_MINUTE` | `300` / `10` | Per-IP limits; the second protects sign-in and invites |
| `TRUST_PROXY` | `false` | Read the client IP from `X-Forwarded-For` behind a proxy (the last entry, added by your proxy) |
| `USER_DAILY_SEND_LIMIT` / `MAILBOX_DAILY_SEND_LIMIT` | `200` / `1500` | Emails one person, and the whole mailbox, can send per day (India time) |
| `AI_DAILY_CALL_LIMIT` | `1500` | AI calls per day for the whole team |

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
| GET | `/ai/status` | signed in | Whether AI is configured |
| POST | `/ai/compose` · `/ai/rewrite` | signed in | AI Write from an instruction; rewrite a draft (improve, shorten, formal, friendly, demo request, grammar) |
| POST | `/threads/:id/ai/suggest-reply` | signed in | Draft a reply to the latest client email now |
| GET | `/ai/suggestions?status=&threadId=` · `/ai/suggestions/counts` | signed in | Reply drafts waiting for approval, and history |
| POST | `/ai/suggestions/:id/send` · `/ai/suggestions/:id/reject` | signed in | Approve (after editing) or reject a draft |
| GET / POST / PATCH / DELETE | `/knowledge` | read: signed in, write: admin | Product facts the AI may use |
| POST | `/emails/send` | signed in | Send now or later (`sendAt`), optionally with `followUp: { sequenceId }` |
| GET / PATCH | `/automation/settings` | read: signed in, write: admin | Pause, daily limit, send window, default plan |
| GET / POST / PATCH / DELETE | `/sequences` | read: signed in, write: admin | Follow-up plans |
| POST / GET | `/threads/:id/enroll` · `/threads/:id/automation` | signed in | Start follow-ups on a conversation; its plan and scheduled emails |
| POST | `/enrollments/:id/stop` · `/pause` · `/resume` | signed in | Control a running plan |
| GET | `/scheduled-emails?status=&kind=&threadId=` · `/scheduled-emails/counts` | signed in | Scheduled, sent and stopped emails |
| PATCH / POST | `/scheduled-emails/:id` · `/cancel` · `/send-now` · `/regenerate` · `/approve` | scheduler or admin | Edit, cancel, send now, rewrite with AI, approve a held AI follow-up |
| GET / POST | `/u/:token` (outside `/api`) | public | Unsubscribe page and one-click unsubscribe |
| GET | `/analytics/dashboard?days=7\|30\|90` | signed in | Everything the dashboard shows, with the previous period for comparison |
| GET / POST / PATCH / DELETE | `/templates` | signed in (edit: own or admin) | Saved emails |
| POST | `/templates/:id/render` | signed in | Template filled in for the first recipient (`{{contact.firstName}}`, `{{organization.name}}`, `{{sender.name}}` …) |
| GET | `/health` · `/healthz` · `/readyz` | — | Status and probes |

How contacts work: every email sent or received creates the contact if needed and links them to the college with the same email domain (never for gmail.com and other personal providers). Stages move forward on their own, New → Contacted when we email, → Replied when they answer, and never backwards. Unsubscribed, bounced and do-not-contact people can't be emailed.

How follow-ups work: tick **Follow up if no reply** in Compose (on by default for new emails) or start a plan from any conversation. The standard plan sends three follow-ups (about day 3, 7 and 14). Each one is written by the AI as soon as the previous email goes out, so it shows as **Scheduled** in the conversation and on the Follow-ups page, where the person who scheduled it (or an admin) can edit it, send it now or cancel it. An AI follow-up with a figure or link that isn't in the knowledge base is marked **Needs review** and doesn't send until someone edits or approves it. A client reply (not an auto-reply) or an unsubscribe stops the plan; a manual reply pushes the next follow-up back. Automatic emails only go out inside the send window (default Mon–Sat 9:00–18:00 IST), never above the daily limit, and not at all while automation is paused. Every automatic email carries an unsubscribe link and one-click unsubscribe headers.

How the AI works: every new client email is labelled (interested, wants a demo, question, pricing, objection, not now, not interested, out of office, unsubscribe) with a one-line summary. For emails that need an answer, Gemini drafts a reply that waits in **Approvals**; nothing is sent until a person edits and approves it. Unsubscribe requests mark the contact unsubscribed, unless Gmail says the sender failed its authentication check. To protect the AI budget, emails from strangers (conversations we never wrote in) aren't processed automatically, and each sender gets at most 5 automatic runs a day. The AI only uses facts from the **Knowledge** page (seeded from dynarock.in); any figure or link it writes that isn't in the knowledge base or the conversation is flagged for review. Client emails are passed to the model as data, never as instructions.

Safety rules built in: only hashes of session and invite tokens are stored; a disabled user is signed out everywhere; nobody can change their own role or disable themselves; the team always keeps at least one active admin; cross-site form posts are rejected; 10 wrong passwords lock an account for 15 minutes; each person can only use files they uploaded (200 MB each); one email goes to at most 50 people; only admins can make an unsubscribed or bounced contact emailable again; mail only counts as ours if Gmail marked it SENT, not because of its From header.

## Project structure

```text
backend/src/
  server.ts  app.ts  container.ts      bootstrap, middleware, dependency wiring
  config/env.ts                        validated configuration
  database/                            Mongoose connection and model registry
  common/                              errors, http helpers, logger, middleware, utils
  modules/<name>/                      model, repository, service, controller, routes, schema
    auth/  users/  activities/  mailbox/  mail/  drafts/  files/  locks/  contacts/  organizations/  knowledge/  templates/  ai/  automation/  analytics/  system/
  integrations/gmail/                  OAuth, REST client, MIME build/parse
  integrations/gemini/                 Gemini client (JSON output)
  workers/                             Gmail sync and the follow-up sender
frontend/src/
  app/(auth)/                          login, accept-invite
  app/(app)/                           signed-in pages inside the sidebar shell
  features/                            auth, team, settings, inbox, compose, contacts, organizations, pipeline, approvals, knowledge, followups, dashboard, templates
  components/ui/                       shadcn components
  hooks/  lib/api/  config/
```
