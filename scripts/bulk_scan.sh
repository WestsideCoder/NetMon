#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# NetMon Bulk Site Creation & Network Scan Script
# Creates 4 sub-sites under each parent site and scans their networks.
# =============================================================================

BASE_URL="https://localhost/api"
CURL_OPTS="-sk"  # -s silent, -k allow self-signed certs
SCAN_POLL_INTERVAL=5
SCAN_TIMEOUT=300  # 5 minutes

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

# --- Check dependencies ---
for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || { err "Missing dependency: $cmd"; exit 1; }
done

# =============================================================================
# Step 1: Authenticate
# =============================================================================
echo ""
echo "========================================="
echo "  NetMon Bulk Site Creation & Scanner"
echo "========================================="
echo ""
read -rp "Username: " USERNAME
read -rsp "Password: " PASSWORD
echo ""

log "Authenticating as '$USERNAME'..."
LOGIN_RESP=$(curl $CURL_OPTS -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$USERNAME\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.access_token // empty')
if [[ -z "$TOKEN" ]]; then
  err "Authentication failed. Response: $LOGIN_RESP"
  exit 1
fi
ok "Authenticated successfully."

AUTH_HEADER="Authorization: Bearer $TOKEN"

# =============================================================================
# Step 2: Auto-detect SNMPv3 credential IDs
# =============================================================================
log "Fetching SNMPv3 credentials..."
CREDS_RESP=$(curl $CURL_OPTS -X GET "$BASE_URL/snmp/credentials" -H "$AUTH_HEADER")
SNMPV3_IDS=$(echo "$CREDS_RESP" | jq '[.[] | select(.version == "v3") | .id]')
SNMPV3_COUNT=$(echo "$SNMPV3_IDS" | jq 'length')

if [[ "$SNMPV3_COUNT" -eq 0 ]]; then
  warn "No SNMPv3 credentials found. SNMP scans will be skipped."
else
  ok "Found $SNMPV3_COUNT SNMPv3 credential(s): $SNMPV3_IDS"
fi

# =============================================================================
# Step 3: Define site data
# =============================================================================
# Format: "SiteName|Abbrev|IPPrefix"
SITES=(
  "Joe Walker|JW|10.31"
  "Leona Valley|LV|10.23"
  "Quartz Hill|QH|10.25"
  "Sundown|SD|10.17"
  "Valley View|VV|10.27"
  "Hillview|HV|10.15"
  "Rancho Vista|RV|10.19"
)

# Sub-site definitions: "Suffix|3rdOctet|UseSNMP"
SUBSITES=(
  "AP's|248|no"
  "Cameras|61|no"
  "Switches|250|yes"
  "UPS's|90|yes"
)

# =============================================================================
# Helper: Run scan and import devices
# =============================================================================
run_scan_and_import() {
  local sub_site_id="$1"
  local scan_range="$2"
  local use_snmp="$3"
  local label="$4"

  # Build scan request
  local scan_body
  if [[ "$use_snmp" == "yes" && "$SNMPV3_COUNT" -gt 0 ]]; then
    scan_body=$(jq -n \
      --arg range "$scan_range" \
      --argjson site_id "$sub_site_id" \
      --argjson cred_ids "$SNMPV3_IDS" \
      '{range: $range, site_id: $site_id, test_snmp: true, credential_ids: $cred_ids}')
  else
    scan_body=$(jq -n \
      --arg range "$scan_range" \
      --argjson site_id "$sub_site_id" \
      '{range: $range, site_id: $site_id, test_snmp: false, credential_ids: []}')
  fi

  log "  Starting scan: $scan_range (SNMP: $use_snmp)..."
  local scan_resp
  scan_resp=$(curl $CURL_OPTS -X POST "$BASE_URL/scanner/scan" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$scan_body")

  local scan_id
  scan_id=$(echo "$scan_resp" | jq -r '.scan_id // empty')
  if [[ -z "$scan_id" ]]; then
    warn "  Failed to start scan for $label. Response: $scan_resp"
    return 1
  fi
  log "  Scan started: $scan_id"

  # Poll until completed or timeout
  local elapsed=0
  local status=""
  while [[ $elapsed -lt $SCAN_TIMEOUT ]]; do
    sleep "$SCAN_POLL_INTERVAL"
    elapsed=$((elapsed + SCAN_POLL_INTERVAL))

    local result_resp
    result_resp=$(curl $CURL_OPTS -X GET "$BASE_URL/scanner/results/$scan_id" -H "$AUTH_HEADER")
    status=$(echo "$result_resp" | jq -r '.status // "unknown"')
    local scanned total alive
    scanned=$(echo "$result_resp" | jq -r '.scanned // 0')
    total=$(echo "$result_resp" | jq -r '.total_ips // 0')
    alive=$(echo "$result_resp" | jq -r '.alive // 0')

    printf "  [%3ds] Status: %-15s  Scanned: %d/%d  Alive: %d\r" "$elapsed" "$status" "$scanned" "$total" "$alive"

    if [[ "$status" == "completed" || "$status" == "failed" ]]; then
      echo ""
      break
    fi
  done

  if [[ "$status" != "completed" ]]; then
    if [[ $elapsed -ge $SCAN_TIMEOUT ]]; then
      warn "  Scan timed out after ${SCAN_TIMEOUT}s for $label"
    else
      warn "  Scan failed for $label (status: $status)"
    fi
    return 1
  fi

  # Get final results and collect alive IPs
  local final_resp
  final_resp=$(curl $CURL_OPTS -X GET "$BASE_URL/scanner/results/$scan_id" -H "$AUTH_HEADER")
  local alive_ips
  alive_ips=$(echo "$final_resp" | jq '[.devices[] | select(.is_alive == true) | .ip_address]')
  local alive_count
  alive_count=$(echo "$alive_ips" | jq 'length')

  if [[ "$alive_count" -eq 0 ]]; then
    warn "  No alive devices found for $label"
    return 0
  fi

  log "  Importing $alive_count alive device(s)..."
  local import_body
  import_body=$(jq -n \
    --arg scan_id "$scan_id" \
    --argjson site_id "$sub_site_id" \
    --argjson devices "$alive_ips" \
    '{scan_id: $scan_id, site_id: $site_id, devices: $devices}')

  local import_resp
  import_resp=$(curl $CURL_OPTS -X POST "$BASE_URL/scanner/import" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$import_body")

  local imported
  imported=$(echo "$import_resp" | jq -r '.imported // 0')
  ok "  Imported $imported device(s) for $label"
}

# =============================================================================
# Step 4-6: Loop through sites
# =============================================================================
echo ""
echo "========================================="
echo "  Processing ${#SITES[@]} sites"
echo "========================================="
echo ""

for site_entry in "${SITES[@]}"; do
  IFS='|' read -r site_name abbrev ip_prefix <<< "$site_entry"

  log "Looking up parent site: '$site_name'..."
  # URL-encode the site name for the search query
  encoded_name=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$site_name'))")
  sites_resp=$(curl $CURL_OPTS -X GET "$BASE_URL/sites/?search=$encoded_name" -H "$AUTH_HEADER")

  # Find exact match from search results
  parent_id=$(echo "$sites_resp" | jq -r \
    --arg name "$site_name" \
    '[.[] | select(.name == $name)] | first | .id // empty')

  if [[ -z "$parent_id" ]]; then
    warn "Parent site '$site_name' not found — skipping."
    echo ""
    continue
  fi
  ok "Found '$site_name' (id: $parent_id)"

  for subsite_entry in "${SUBSITES[@]}"; do
    IFS='|' read -r suffix octet use_snmp <<< "$subsite_entry"

    sub_name="${abbrev}-${suffix}"
    scan_range="${ip_prefix}.${octet}.0/24"
    label="${sub_name} (${scan_range})"

    log "Creating sub-site: '$sub_name' under '$site_name'..."
    create_body=$(jq -n \
      --arg name "$sub_name" \
      --argjson parent_id "$parent_id" \
      '{name: $name, parent_site_id: $parent_id}')

    create_resp=$(curl $CURL_OPTS -X POST "$BASE_URL/sites/" \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "$create_body")

    sub_site_id=$(echo "$create_resp" | jq -r '.id // empty')
    if [[ -z "$sub_site_id" ]]; then
      warn "Failed to create sub-site '$sub_name'. Response: $create_resp"
      warn "Skipping scan for $label"
      continue
    fi
    ok "Created '$sub_name' (id: $sub_site_id)"

    run_scan_and_import "$sub_site_id" "$scan_range" "$use_snmp" "$label" || true
    echo ""
  done

  echo "-----------------------------------------"
  echo ""
done

echo "========================================="
ok "Bulk operation complete!"
echo "========================================="
