#!/usr/bin/env bash
# Creates the Cloud Build trigger from trigger.yaml. Safe to re-run.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TRIGGER=dynarock-sales-api-deploy

if exists gcloud builds triggers describe "$TRIGGER" --region global; then
    log "Replacing trigger $TRIGGER"
    gcloud builds triggers delete "$TRIGGER" --region global
fi

log "Creating trigger $TRIGGER for $GITHUB_REPO"
if ! gcloud builds triggers import --source deploy/gcp/trigger.yaml --region global; then
    cat <<EOF

Cloud Build can't see $GITHUB_REPO yet. Connect it once in the console:
    https://console.cloud.google.com/cloud-build/triggers;region=global/connect?project=$PROJECT_ID
Choose "GitHub (Cloud Build GitHub App)", pick $GITHUB_REPO, and skip creating a trigger there.
Then run this script again.
EOF
    exit 1
fi

log "Done. GitHub Actions runs $TRIGGER after every check passes on $DEPLOY_BRANCH."
