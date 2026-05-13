#!/usr/bin/env bash
# run_all.sh — full benchmark run: S1–S6 × profiles A–D × functional + OOP.
#
# Usage:
#   ./benchmarks/run_all.sh                  # all scenarios, all profiles
#   ./benchmarks/run_all.sh s3 s4            # only s3 and s4, all profiles
#   PROFILES="A B" ./benchmarks/run_all.sh   # all scenarios, profiles A and B
#
# Total runtime estimate:
#   Profile A: 30s  × 2 apps = ~2 min per scenario
#   Profile B: 3min × 2 apps = ~8 min per scenario
#   Profile C: 5min × 2 apps = ~13 min per scenario
#   Profile D: 9min × 2 apps = ~21 min per scenario
#   + 30s cooldown between runs, DB resets
#   Full run (6 scenarios × 4 profiles): ~3–4 hours

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Scenarios to run (override via positional args)
if [[ $# -gt 0 ]]; then
  SCENARIOS=("$@")
else
  SCENARIOS=(s1 s2 s3 s4 s5 s6)
fi

# Profiles to run (override via env)
IFS=' ' read -r -a PROFILES <<< "${PROFILES:-A B C D}"

TOTAL=$(( ${#SCENARIOS[@]} * ${#PROFILES[@]} ))
CURRENT=0
START_TIME=$(date +%s)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Full benchmark run"
echo "  Scenarios : ${SCENARIOS[*]}"
echo "  Profiles  : ${PROFILES[*]}"
echo "  Total runs: $TOTAL  (each = functional + OOP)"
echo "  Started   : $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for scenario in "${SCENARIOS[@]}"; do
  for profile in "${PROFILES[@]}"; do
    CURRENT=$(( CURRENT + 1 ))
    echo ""
    echo "▶ [$CURRENT/$TOTAL] $scenario / Profile $profile  ($(date '+%H:%M:%S'))"

    "$ROOT_DIR/run_single.sh" "$scenario" "$profile"

    # Extra cooldown between scenario/profile combinations
    if [[ $CURRENT -lt $TOTAL ]]; then
      echo "  >> Inter-run cooldown 60s..."
      sleep 60
    fi
  done
done

END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))
HOURS=$(( ELAPSED / 3600 ))
MINUTES=$(( (ELAPSED % 3600) / 60 ))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Full benchmark complete"
echo "  Total time: ${HOURS}h ${MINUTES}m"
echo "  Results in: benchmarks/results/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
