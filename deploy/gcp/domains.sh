#!/usr/bin/env bash
# Global HTTPS load balancer for API_DOMAIN -> Cloud Run API. Run after the first deploy. Safe to re-run.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

LB_IP=dynarock-sales-ip
NEG=dynarock-sales-api-neg
BACKEND=dynarock-sales-api-backend
URL_MAP=dynarock-sales-lb
REDIRECT_MAP=dynarock-sales-http-redirect
CERT=dynarock-sales-api-cert
HTTPS_PROXY=dynarock-sales-https-proxy
HTTP_PROXY=dynarock-sales-http-proxy

log "Static IP"
exists gcloud compute addresses describe "$LB_IP" --global ||
    gcloud compute addresses create "$LB_IP" --global --ip-version IPV4

log "Backend for $API_SERVICE"
exists gcloud compute network-endpoint-groups describe "$NEG" --region "$REGION" ||
    gcloud compute network-endpoint-groups create "$NEG" --region "$REGION" \
        --network-endpoint-type serverless --cloud-run-service "$API_SERVICE"
exists gcloud compute backend-services describe "$BACKEND" --global ||
    gcloud compute backend-services create "$BACKEND" --global --load-balancing-scheme EXTERNAL_MANAGED
value gcloud compute backend-services describe "$BACKEND" --global --format='value(backends[].group)' | grep -q "/$NEG" ||
    gcloud compute backend-services add-backend "$BACKEND" --global \
        --network-endpoint-group "$NEG" --network-endpoint-group-region "$REGION"
gcloud compute backend-services update "$BACKEND" --global \
    --custom-request-header 'X-Client-IP:{client_ip_address}' >/dev/null ||
    warn "could not add the X-Client-IP header"

log "URL map"
exists gcloud compute url-maps describe "$URL_MAP" --global ||
    gcloud compute url-maps create "$URL_MAP" --global --default-service "$BACKEND"

log "Managed certificate for $API_DOMAIN"
exists gcloud compute ssl-certificates describe "$CERT" --global ||
    gcloud compute ssl-certificates create "$CERT" --global --domains "$API_DOMAIN"

log "HTTPS frontend"
exists gcloud compute target-https-proxies describe "$HTTPS_PROXY" --global ||
    gcloud compute target-https-proxies create "$HTTPS_PROXY" --global --url-map "$URL_MAP" --ssl-certificates "$CERT"
exists gcloud compute forwarding-rules describe dynarock-sales-https --global ||
    gcloud compute forwarding-rules create dynarock-sales-https --global --load-balancing-scheme EXTERNAL_MANAGED \
        --address "$LB_IP" --target-https-proxy "$HTTPS_PROXY" --ports 443

log "HTTP -> HTTPS redirect"
exists gcloud compute url-maps describe "$REDIRECT_MAP" --global ||
    gcloud compute url-maps import "$REDIRECT_MAP" --global --source deploy/gcp/lb-http-redirect.yaml
exists gcloud compute target-http-proxies describe "$HTTP_PROXY" --global ||
    gcloud compute target-http-proxies create "$HTTP_PROXY" --global --url-map "$REDIRECT_MAP"
exists gcloud compute forwarding-rules describe dynarock-sales-http --global ||
    gcloud compute forwarding-rules create dynarock-sales-http --global --load-balancing-scheme EXTERNAL_MANAGED \
        --address "$LB_IP" --target-http-proxy "$HTTP_PROXY" --ports 80

ip="$(value gcloud compute addresses describe "$LB_IP" --global --format='value(address)')"
status="$(value gcloud compute ssl-certificates describe "$CERT" --global --format='value(managed.status)')"
cat <<EOF

DNS record to add at your domain provider:
    ${API_DOMAIN%.dynarock.in}   A   $ip     ($API_DOMAIN)

Certificate status: $status (turns ACTIVE 15-60 minutes after DNS points here)
Check: gcloud compute ssl-certificates describe $CERT --global --format='value(managed.domainStatus)'
EOF
