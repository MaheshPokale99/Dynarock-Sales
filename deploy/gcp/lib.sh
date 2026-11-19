#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
# shellcheck disable=SC1090
source <(tr -d '\r' < "$DIR/config.env")

export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

API_SA="dynarock-sales-api@$PROJECT_ID.iam.gserviceaccount.com"
BUILD_SA="dynarock-sales-build@$PROJECT_ID.iam.gserviceaccount.com"
GITHUB_SA="dynarock-sales-github@$PROJECT_ID.iam.gserviceaccount.com"
BUILD_BUCKET="$PROJECT_ID-build-src"
REGISTRY="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"

VPC=dynarock-vpc
SUBNET=dynarock-run
SUBNET_RANGE=10.8.0.0/26
ROUTER=dynarock-router
NAT=dynarock-nat
NAT_IP=dynarock-nat-ip

SECRET_KEYS=(MONGODB_URI ENCRYPTION_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GEMINI_API_KEY BOOTSTRAP_ADMIN_PASSWORD)

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
exists() { "$@" >/dev/null 2>&1; }
value() { "$@" | tr -d '\r'; }
secret_name() { printf 'dynarock-sales-%s' "$(printf '%s' "$1" | tr 'A-Z_' 'a-z-')"; }

command -v gcloud >/dev/null || die "gcloud is not installed"
cd "$ROOT"
