# Deploying the backend to Google Cloud Run

This covers the API only (`backend/`). The frontend is hosted separately, with `NEXT_PUBLIC_API_URL=https://api.sales.dynarock.in`.

Project `dynarock-backend-2026`, region `asia-south1`. It uses the same layout as the Dynarock repo:

| File | What it does |
| --- | --- |
| [/cloudbuild.yaml](../../cloudbuild.yaml) | Builds the image (`sales-api:<commit sha>`) and deploys `dynarock-sales-api` with every setting: container, scaling, networking, env vars, secrets |
| [/.gcloudignore](../../.gcloudignore) | Keeps `.env` files, `node_modules` and the frontend out of uploads |
| [/.github/workflows/backend-deploy.yml](../../.github/workflows/backend-deploy.yml) | CI/CD: checks, tests, secret scan, image build, then runs the Cloud Build trigger for that commit |
| [trigger.yaml](trigger.yaml) | The Cloud Build trigger `dynarock-sales-api-deploy` (disabled, so only GitHub Actions starts it) |
| [setup.sh](setup.sh) | One-time: APIs, registry, service accounts, permissions, GitHub sign-in, Cloud NAT |
| [secrets.sh](secrets.sh) | Uploads secrets to Secret Manager |
| [deploy.sh](deploy.sh) | Manual deploy of the last commit with `cloudbuild.yaml` |
| [domains.sh](domains.sh) | HTTPS load balancer and certificate for `api.sales.dynarock.in` |

```text
push to main ─> GitHub Actions: format, lint, typecheck, audit │ tests + build │ gitleaks │ image
             ─> all green ─> Cloud Build trigger (this commit) ─> cloudbuild.yaml ─> Cloud Run dynarock-sales-api

api.sales.dynarock.in ─> HTTPS load balancer ─> Cloud Run ─> Cloud NAT (fixed IP) ─> MongoDB Atlas, Gmail, Gemini
```

GitHub signs in to Google Cloud without keys (Workload Identity Federation, provider `github-actions/dynarock-sales`). Only `backend-deploy.yml` on `main` of `MaheshPokale99/admission-detective-api` is accepted.

Run the scripts from the repo root in **Git Bash**, signed in with `gcloud auth login`.

## First-time setup

```bash
bash deploy/gcp/setup.sh                        # prints the fixed outbound IP for Atlas
bash deploy/gcp/secrets.sh backend/.env         # or a filled-in copy of secrets.env.example
bash deploy/gcp/deploy.sh                       # first deploy (last commit)
bash deploy/gcp/domains.sh                      # prints the IP for DNS
bash deploy/gcp/trigger.sh                      # after connecting the repo (below)
```

1. **MongoDB Atlas → Network Access:** add the IP that `setup.sh` printed, as `/32`.
2. **Connect the GitHub repo to Cloud Build (once, in the browser):** open [Cloud Build → Triggers → Connect repository](https://console.cloud.google.com/cloud-build/triggers;region=global/connect?project=dynarock-backend-2026). Choose **GitHub (Cloud Build GitHub App)**, select `MaheshPokale99/admission-detective-api`, skip creating a trigger, then run `trigger.sh`.
3. **DNS:** point `api.sales` (A record) to the IP that `domains.sh` printed. The certificate turns `ACTIVE` 15–60 minutes later.
4. **Google OAuth client:** check that `https://api.sales.dynarock.in/api/v1/mailbox/oauth/callback` is an authorized redirect URI.
5. **Check:** `curl https://api.sales.dynarock.in/readyz`, then sign in, change the admin password and connect Gmail.

## Day to day

- **Deploy:** merge or push to `main`. The workflow deploys only when every job is green. Pull requests run the checks without deploying.
- **Change a setting** (env var, memory, instances): edit `cloudbuild.yaml` and push.
- **Change a secret:** `bash deploy/gcp/secrets.sh backend/.env`, then redeploy. The service reads `:latest` when an instance starts.
- **Deploy by hand:** `bash deploy/gcp/deploy.sh`.
- **Roll back:** `gcloud run services update-traffic dynarock-sales-api --region asia-south1 --to-revisions <revision>=100`.

## Important

- **`min-instances` is 0.** Gmail sync and follow-ups run on timers inside the API, so they only run while an instance is up, which is during use and about 15 minutes after. For sync and follow-ups around the clock, set `--min-instances 1` in `cloudbuild.yaml` (about $50–60 a month).
- **`ENCRYPTION_KEY`** must stay the same key the database's Gmail connection was saved with.
- **Sign-in cookie:** the frontend must be on `sales.dynarock.in`. On `*.run.app` or `*.vercel.app` addresses the browser won't send the cookie and sign-in fails.
- **Rate limiter behind the load balancer:** the load balancer appends `<client-ip>, <load-balancer-ip>` to `X-Forwarded-For`, so the last entry is the load balancer's IP. `domains.sh` adds an `X-Client-IP` header with the real client IP, and the limiter should read that header.
- **Logs:** Cloud Run collects stdout (Logging → `cloud_run_revision`). Don't set `LOG_FILE`.
