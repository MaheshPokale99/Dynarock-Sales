#!/usr/bin/env bash
# One-time project setup. Safe to re-run.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

log "Enabling APIs on $PROJECT_ID"
gcloud services enable \
    run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
    secretmanager.googleapis.com compute.googleapis.com iam.googleapis.com \
    cloudresourcemanager.googleapis.com cloudscheduler.googleapis.com

log "Artifact Registry repository $REPO"
exists gcloud artifacts repositories describe "$REPO" --location "$REGION" ||
    gcloud artifacts repositories create "$REPO" --repository-format=docker --location "$REGION" \
        --description="Cloud Run source deployments"

log "Service accounts"
for id in dynarock-sales-api dynarock-sales-build; do
    exists gcloud iam service-accounts describe "$id@$PROJECT_ID.iam.gserviceaccount.com" ||
        gcloud iam service-accounts create "$id" --display-name="$id"
done

project_role() {
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member "serviceAccount:$1" --role "$2" --condition=None >/dev/null
}

log "Cloud Build permissions ($BUILD_SA)"
exists gcloud storage buckets describe "gs://$BUILD_BUCKET" ||
    gcloud storage buckets create "gs://$BUILD_BUCKET" --location "$REGION" --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding "gs://$BUILD_BUCKET" \
    --member "serviceAccount:$BUILD_SA" --role roles/storage.objectViewer >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location "$REGION" \
    --member "serviceAccount:$BUILD_SA" --role roles/artifactregistry.writer >/dev/null
project_role "$BUILD_SA" roles/logging.logWriter
project_role "$BUILD_SA" roles/run.admin
project_role "$BUILD_SA" roles/compute.networkUser
gcloud iam service-accounts add-iam-policy-binding "$API_SA" \
    --member "serviceAccount:$BUILD_SA" --role roles/iam.serviceAccountUser >/dev/null

if [[ "$STATIC_EGRESS" == "true" ]]; then
    log "Fixed outbound IP (VPC + Cloud NAT)"
    exists gcloud compute networks describe "$VPC" ||
        gcloud compute networks create "$VPC" --subnet-mode=custom
    exists gcloud compute networks subnets describe "$SUBNET" --region "$REGION" ||
        gcloud compute networks subnets create "$SUBNET" --network "$VPC" --region "$REGION" --range "$SUBNET_RANGE"
    exists gcloud compute addresses describe "$NAT_IP" --region "$REGION" ||
        gcloud compute addresses create "$NAT_IP" --region "$REGION"
    exists gcloud compute routers describe "$ROUTER" --region "$REGION" ||
        gcloud compute routers create "$ROUTER" --network "$VPC" --region "$REGION"
    exists gcloud compute routers nats describe "$NAT" --router "$ROUTER" --region "$REGION" ||
        gcloud compute routers nats create "$NAT" --router "$ROUTER" --region "$REGION" \
            --nat-custom-subnet-ip-ranges "$SUBNET" --nat-external-ip-pool "$NAT_IP"
    ip="$(value gcloud compute addresses describe "$NAT_IP" --region "$REGION" --format='value(address)')"
    log "Add $ip/32 to MongoDB Atlas -> Network Access"
fi

log "Done. Next: deploy/gcp/secrets.sh"
