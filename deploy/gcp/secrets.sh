#!/usr/bin/env bash
# Uploads deploy/gcp/secrets.env (or the file given) to Secret Manager.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

FILE="${1:-$DIR/secrets.env}"
[[ -f "$FILE" ]] || die "$FILE not found. Copy secrets.env.example to secrets.env and fill it in."

while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    [[ " ${SECRET_KEYS[*]} " == *" $key "* ]] || continue
    [[ -n "$val" ]] || { warn "$key is empty, skipped"; continue; }

    if [[ "$key" == "BOOTSTRAP_ADMIN_PASSWORD" ]] && { [[ ${#val} -lt 16 ]] || [[ "$val" == "change-me-now" ]]; }; then
        warn "BOOTSTRAP_ADMIN_PASSWORD skipped: it must be at least 16 characters and not the example value"
        continue
    fi

    name="$(secret_name "$key")"
    exists gcloud secrets describe "$name" ||
        gcloud secrets create "$name" --replication-policy=user-managed --locations="$REGION" >/dev/null

    current="$(gcloud secrets versions access latest --secret "$name" 2>/dev/null | tr -d '\r' || true)"
    if [[ "$current" == "$val" ]]; then
        echo "$key: unchanged"
    else
        printf '%s' "$val" | gcloud secrets versions add "$name" --data-file=- >/dev/null
        echo "$key: new version saved"
    fi

    gcloud secrets add-iam-policy-binding "$name" \
        --member "serviceAccount:$API_SA" --role roles/secretmanager.secretAccessor >/dev/null
done < "$FILE"

log "Secrets ready. Next: bash deploy/gcp/deploy.sh"
