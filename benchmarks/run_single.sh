#!/usr/bin/env bash
# run_single.sh — run one k6 scenario (both apps) with full metrics collection.
#
# Usage:
#   ./benchmarks/run_single.sh <scenario> <profile>
#   ./benchmarks/run_single.sh s3 B
#
# Environment overrides (optional):
#   BASE_URL_FUNC  — default http://localhost:3000
#   BASE_URL_OOP   — default http://localhost:3001
#   DB_HOST        — default localhost  (use 'postgres' inside Docker)
#
# Outputs (benchmarks/results/):
#   <scenario>_<profile>_functional_<ts>.json      k6 metrics
#   <scenario>_<profile>_oop_<ts>.json             k6 metrics
#   <scenario>_<profile>_functional_stats_<ts>.csv docker CPU/RAM samples
#   <scenario>_<profile>_oop_stats_<ts>.csv        docker CPU/RAM samples
#   <scenario>_<profile>_*_diag_<app>_<ts>.jsonl   diagnostics endpoint samples

set -euo pipefail

# ── Args ────────────────────────────────────────────────────────────────────
SCENARIO=${1:-}
PROFILE=${2:-}

if [[ -z "$SCENARIO" || -z "$PROFILE" ]]; then
  echo "Usage: $0 <scenario> <profile>" >&2
  echo "  scenario: s1 s2 s3 s4 s5 s6" >&2
  echo "  profile:  A B C D" >&2
  exit 1
fi

# ── Config ───────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="$ROOT_DIR/results"
SCENARIOS_DIR="$ROOT_DIR/k6/scenarios"

FUNC_URL="${BASE_URL_FUNC:-http://localhost:3000}"
OOP_URL="${BASE_URL_OOP:-http://localhost:3001}"
DB_HOST_VAL="${DB_HOST:-localhost}"

TS=$(date +%s)
PREFIX="${SCENARIO}_${PROFILE}"

# Find the scenario script (e.g. s3 → s3_products_list.js)
SCRIPT=$(ls "$SCENARIOS_DIR/${SCENARIO}_"*.js 2>/dev/null | head -1 || true)
if [[ -z "$SCRIPT" ]]; then
  echo "ERROR: no scenario file matching '${SCENARIO}_*.js' in $SCENARIOS_DIR" >&2
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Scenario : $SCENARIO  ($(basename "$SCRIPT"))"
echo "  Profile  : $PROFILE"
echo "  Timestamp: $TS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Background collector helpers ─────────────────────────────────────────────
STATS_PID=""
DIAG_PID=""

cleanup() {
  [[ -n "$STATS_PID" ]] && kill "$STATS_PID" 2>/dev/null || true
  [[ -n "$DIAG_PID"  ]] && kill "$DIAG_PID"  2>/dev/null || true
}
trap cleanup EXIT INT TERM

start_collectors() {
  local run_label="$1"   # e.g. "functional" or "oop"
  local stats_file="$RESULTS_DIR/${PREFIX}_${run_label}_stats_${TS}.csv"
  local diag_func_file="$RESULTS_DIR/${PREFIX}_${run_label}_diag_func_${TS}.jsonl"
  local diag_oop_file="$RESULTS_DIR/${PREFIX}_${run_label}_diag_oop_${TS}.jsonl"

  # CSV header
  echo "ts,container,cpu_pct,mem_usage,mem_pct" > "$stats_file"

  # docker stats — snapshot every 1s
  {
    while true; do
      docker stats mg_functional mg_oop --no-stream \
        --format "$(date +%s),{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" \
        >> "$stats_file" 2>/dev/null || true
      sleep 1
    done
  } &
  STATS_PID=$!

  # diagnostics — curl every 1s, prepend epoch-ms timestamp
  {
    while true; do
      local d_f d_o
      d_f=$(curl -sf "${FUNC_URL}/api/diagnostics" 2>/dev/null || true)
      d_o=$(curl -sf "${OOP_URL}/api/diagnostics"  2>/dev/null || true)
      [[ -n "$d_f" ]] && echo "$(date +%s%3N) $d_f" >> "$diag_func_file"
      [[ -n "$d_o" ]] && echo "$(date +%s%3N) $d_o" >> "$diag_oop_file"
      sleep 1
    done
  } &
  DIAG_PID=$!
}

stop_collectors() {
  [[ -n "$STATS_PID" ]] && kill "$STATS_PID" 2>/dev/null && STATS_PID="" || true
  [[ -n "$DIAG_PID"  ]] && kill "$DIAG_PID"  2>/dev/null && DIAG_PID=""  || true
  sleep 2  # allow final writes to flush
}

reset_db() {
  echo "  >> Resetting DB..."
  DB_HOST="$DB_HOST_VAL" npm run bench:reset --silent
}

# ── Run against functional app ────────────────────────────────────────────────
echo ""
echo "[ 1/2 ] Functional  ($FUNC_URL)"
reset_db
start_collectors "functional"

k6 run \
  -e BASE_URL="$FUNC_URL" \
  -e PROFILE="$PROFILE" \
  --out "json=$RESULTS_DIR/${PREFIX}_functional_${TS}.json" \
  "$SCRIPT"

stop_collectors

echo "  >> Cooling down 30s..."
sleep 30

# ── Run against OOP app ───────────────────────────────────────────────────────
echo ""
echo "[ 2/2 ] OOP  ($OOP_URL)"
reset_db
start_collectors "oop"

k6 run \
  -e BASE_URL="$OOP_URL" \
  -e PROFILE="$PROFILE" \
  --out "json=$RESULTS_DIR/${PREFIX}_oop_${TS}.json" \
  "$SCRIPT"

stop_collectors

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. Results in benchmarks/results/"
echo "  k6:    ${PREFIX}_functional_${TS}.json"
echo "         ${PREFIX}_oop_${TS}.json"
echo "  stats: ${PREFIX}_functional_stats_${TS}.csv"
echo "         ${PREFIX}_oop_stats_${TS}.csv"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
