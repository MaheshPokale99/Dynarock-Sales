# Deploying the backend to Google Cloud Run

This covers the API only (`backend/`). The frontend is hosted separately, with `NEXT_PUBLIC_API_URL=https://api.sales.dynarock.in`.

Project `dynarock-backend-2026`, region `asia-south1`. Deploys work like the other services in this project (`impulsevidya`, `dynarock-backend`): a Cloud Run continuous deployment trigger builds and deploys every push to `main`.

| File | What it does |
| --- | --- |
| [/cloudbuild.yaml](../../cloudbuild.yaml) | Build → Push (`cloud-run-source-deploy/dynarock-sales/dynarock-sales-api:<commit>`) → Deploy with every setting: container, scaling, networking, env vars, secrets |
| [/.gcloudignore](../../.gcloudignore) | Keeps `.env` files, `node_modules` and the frontend out of uploads |
| [trigger.yaml](trigger.yaml) | The trigger `rmgpgab-dynarock-sales-api-…`: push to `main` touching `backend/**` runs `cloudbuild.yaml` |
| [setup.sh](setup.sh) | One-time: APIs, service accounts, permissions, Cloud NAT |
| [secrets.sh](secrets.sh) | Uploads secrets from `backend/.env` to Secret Manager |
| [scheduler.sh](scheduler.sh) | Cron secret + Cloud Scheduler job `dynarock-sales-tick` (Gmail sync and follow-ups every minute) |
| [domains.sh](domains.sh) | HTTPS load balancer and certificate for `api.sales.dynarock.in` |
| [deploy.sh](deploy.sh) | Manual deploy of the last commit with `cloudbuild.yaml` |

```text
push to main ─> Cloud Build trigger ─> cloudbuild.yaml: Build ─> Push ─> Deploy ─> Cloud Run dynarock-sales-api
              (GitHub Actions ci.yml runs lint, typecheck, tests and build on the same push)

api.sales.dynarock.in ─> HTTPS load balancer ─> Cloud Run ─> Cloud NAT (fixed IP) ─> MongoDB Atlas, Gmail, Gemini
Cloud Scheduler (every minute) ─> POST /internal/tick ─> Gmail sync + due follow-ups + AI labels
```

**Request-based billing:** the container uses `--cpu-throttling` and `--min-instances 0`, so you pay only while a request runs and nothing when idle. Timers can't run between requests under that model, so `WORKER_MODE=cron` turns them off, and Cloud Scheduler calls `/internal/tick` every minute with the `X-Cron-Secret` header. Each call syncs Gmail, sends due follow-ups and waits for the AI work before it returns. Locally, `WORKER_MODE=timers` (the default) keeps the in-process timers.

Run the scripts from the repo root in **Git Bash**, signed in with `gcloud auth login`.

## First-time setup

```bash
bash deploy/gcp/setup.sh                        # prints the fixed outbound IP for Atlas
bash deploy/gcp/secrets.sh backend/.env         # uploads the secret values
bash deploy/gcp/scheduler.sh                    # cron secret + every-minute job
bash deploy/gcp/deploy.sh                       # first deploy (last commit)
bash deploy/gcp/domains.sh                      # prints the IP for DNS
bash deploy/gcp/trigger.sh                      # after connecting the repo (below)
```

1. **MongoDB Atlas → Network Access:** add the IP that `setup.sh` printed, as `/32`.
2. **Connect the GitHub repo to Cloud Build (once, in the browser):** open [Cloud Build → Triggers → Connect repository](https://console.cloud.google.com/cloud-build/triggers;region=global/connect?project=dynarock-backend-2026). Choose **GitHub (Cloud Build GitHub App)**, select `MaheshPokale99/Dynarock-Sales`, skip creating a trigger, then run `trigger.sh`.
3. **DNS:** point `api.sales` (A record) to the IP that `domains.sh` printed. The certificate turns `ACTIVE` 15–60 minutes later.
4. **Google OAuth client:** check that `https://api.sales.dynarock.in/api/v1/mailbox/oauth/callback` is an authorized redirect URI.
5. **Check:** `curl https://api.sales.dynarock.in/readyz`, then sign in, change the admin password and connect Gmail.

## Day to day

- **Deploy:** push or merge to `main`. Build history: Cloud Build → History.
- **Change a setting** (env var, memory, instances): edit `cloudbuild.yaml` and push.
- **Change a secret:** `bash deploy/gcp/secrets.sh backend/.env`, then redeploy. The service reads `:latest` when an instance starts.
- **Deploy by hand:** `bash deploy/gcp/deploy.sh`, or `gcloud builds triggers run <trigger> --region global --branch main`.
- **Roll back:** `gcloud run services update-traffic dynarock-sales-api --region asia-south1 --to-revisions <revision>=100`.

## Important

- **Background work** depends on the `dynarock-sales-tick` scheduler job. If it's paused or failing, new mail and follow-ups wait. Check it with `gcloud scheduler jobs describe dynarock-sales-tick --location asia-south1`.
- **`ENCRYPTION_KEY`** must stay the same key the database's Gmail connection was saved with.
- **Sign-in cookie:** the frontend must be on `sales.dynarock.in`. On `*.run.app` or `*.vercel.app` addresses the browser won't send the cookie and sign-in fails.
- **Rate limiter behind the load balancer:** the last `X-Forwarded-For` entry is the load balancer's own IP, so `domains.sh` adds an `X-Client-IP` header with the real client IP, and the limiter reads that header first.
- **Logs:** Cloud Run collects stdout (Logging → `cloud_run_revision`). Don't set `LOG_FILE`.
