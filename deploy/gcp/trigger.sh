#!/usr/bin/env bash
# Creates the Cloud Run continuous deployment trigger from trigger.yaml, then stores its id in _TRIGGER_ID. Safe to re-run.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TRIGGER="$(sed -n 's/^name: //p' "$DIR/trigger.yaml" | tr -d '\r')"

if exists gcloud builds triggers describe "$TRIGGER" --region global; then
    log "Replacing trigger $TRIGGER"
    gcloud builds triggers delete "$TRIGGER" --region global
fi

log "Creating trigger $TRIGGER for $GITHUB_REPO (push to main)"
if ! gcloud builds triggers import --source deploy/gcp/trigger.yaml --region global >/dev/null; then
    cat <<EOF

Cloud Build can't see $GITHUB_REPO yet. Connect it once in the console:
    https://console.cloud.google.com/cloud-build/triggers;region=global/connect?project=$PROJECT_ID
Choose "GitHub (Cloud Build GitHub App)", pick $GITHUB_REPO, and skip creating a trigger there.
Then run this script again.
EOF
    exit 1
fi

id="$(value gcloud builds triggers describe "$TRIGGER" --region global --format='value(id)')"
gcloud builds triggers update github "$TRIGGER" --region global --update-substitutions "_TRIGGER_ID=$id" >/dev/null

log "Done. Pushes to main that change backend/ now deploy $API_SERVICE (trigger id $id)."
echo "Run it by hand: gcloud builds triggers run $TRIGGER --region global --branch main"
