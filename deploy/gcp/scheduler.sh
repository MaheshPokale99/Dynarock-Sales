#!/usr/bin/env bash
# Creates the cron secret and the Cloud Scheduler job that runs Gmail sync and follow-ups every minute. Safe to re-run.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

JOB=dynarock-sales-tick
SECRET="$(secret_name CRON_SECRET)"

gcloud services enable cloudscheduler.googleapis.com

log "Secret $SECRET"
if ! exists gcloud secrets describe "$SECRET"; then
    gcloud secrets create "$SECRET" --replication-policy=user-managed --locations="$REGION" >/dev/null
    openssl rand -hex 32 | tr -d '\r\n' | gcloud secrets versions add "$SECRET" --data-file=- >/dev/null
fi
gcloud secrets add-iam-policy-binding "$SECRET" \
    --member "serviceAccount:$API_SA" --role roles/secretmanager.secretAccessor >/dev/null
value="$(gcloud secrets versions access latest --secret "$SECRET" | tr -d '\r\n')"

log "Scheduler job $JOB: POST https://$API_DOMAIN/internal/tick every minute"
args=(
    --location "$REGION"
    --schedule "* * * * *"
    --time-zone "Asia/Kolkata"
    --uri "https://$API_DOMAIN/internal/tick"
    --http-method POST
    --attempt-deadline 300s
    --max-retry-attempts 0
)
if exists gcloud scheduler jobs describe "$JOB" --location "$REGION"; then
    gcloud scheduler jobs update http "$JOB" "${args[@]}" --update-headers "X-Cron-Secret=$value" >/dev/null
else
    gcloud scheduler jobs create http "$JOB" "${args[@]}" --headers "X-Cron-Secret=$value" >/dev/null
fi

log "Done. Check runs: gcloud scheduler jobs describe $JOB --location $REGION --format='value(lastAttemptTime,status)'"
