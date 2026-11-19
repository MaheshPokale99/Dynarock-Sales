#!/usr/bin/env bash
# Manual deploy: runs /cloudbuild.yaml on the last commit (uncommitted changes are not included).
# The normal path is GitHub Actions (.github/workflows/backend-deploy.yml) after a push to main.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SHA="$(git rev-parse HEAD)"
SRC=deploy/gcp/.build
git diff --quiet HEAD -- backend cloudbuild.yaml || warn "uncommitted changes in backend/ or cloudbuild.yaml are not deployed"

rm -rf "$SRC" && mkdir -p "$SRC"
git archive --format=tar HEAD backend cloudbuild.yaml | tar -x -C "$SRC"

log "Deploying commit ${SHA:0:7} with cloudbuild.yaml"
gcloud builds submit "$SRC" \
    --config "$SRC/cloudbuild.yaml" \
    --substitutions "COMMIT_SHA=$SHA" \
    --gcs-source-staging-dir "gs://$BUILD_BUCKET/source"

log "Deployed ${SHA:0:7}"
