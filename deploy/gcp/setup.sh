#!/usr/bin/env bash
# One-time project setup. Safe to re-run.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NUMBER="$(value gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

log "Enabling APIs on $PROJECT_ID"
gcloud services enable \
    run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
    secretmanager.googleapis.com compute.googleapis.com iam.googleapis.com \
    iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com

log "Artifact Registry repository $REPO"
exists gcloud artifacts repositories describe "$REPO" --location "$REGION" ||
    gcloud artifacts repositories create "$REPO" --repository-format=docker --location "$REGION" \
        --description="Dynarock Sales images"

log "Service accounts"
for id in dynarock-sales-api dynarock-sales-build dynarock-sales-github; do
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

log "GitHub Actions sign-in ($GITHUB_REPO, $DEPLOY_BRANCH)"
exists gcloud iam workload-identity-pools describe "$WIF_POOL" --location global ||
    gcloud iam workload-identity-pools create "$WIF_POOL" --location global --display-name "GitHub Actions"
condition="assertion.repository == '$GITHUB_REPO' && assertion.ref == 'refs/heads/$DEPLOY_BRANCH'"
condition+=" && (assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch')"
condition+=" && assertion.workflow_ref == '$GITHUB_REPO/.github/workflows/backend-deploy.yml@refs/heads/$DEPLOY_BRANCH'"
mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref"
mapping+=",attribute.event_name=assertion.event_name,attribute.workflow_ref=assertion.workflow_ref"
if exists gcloud iam workload-identity-pools providers describe "$WIF_PROVIDER" --workload-identity-pool "$WIF_POOL" --location global; then
    gcloud iam workload-identity-pools providers update-oidc "$WIF_PROVIDER" --workload-identity-pool "$WIF_POOL" \
        --location global --attribute-mapping "$mapping" --attribute-condition "$condition" >/dev/null
else
    gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" --workload-identity-pool "$WIF_POOL" \
        --location global --issuer-uri https://token.actions.githubusercontent.com \
        --attribute-mapping "$mapping" --attribute-condition "$condition"
fi
gcloud iam service-accounts add-iam-policy-binding "$GITHUB_SA" --role roles/iam.workloadIdentityUser \
    --member "principal://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$WIF_POOL/subject/repo:$GITHUB_REPO:ref:refs/heads/$DEPLOY_BRANCH" >/dev/null
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location "$REGION" \
    --member "serviceAccount:$GITHUB_SA" --role roles/artifactregistry.writer >/dev/null
project_role "$GITHUB_SA" roles/cloudbuild.builds.editor
project_role "$GITHUB_SA" roles/serviceusage.serviceUsageConsumer
gcloud iam service-accounts add-iam-policy-binding "$BUILD_SA" \
    --member "serviceAccount:$GITHUB_SA" --role roles/iam.serviceAccountUser >/dev/null

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
