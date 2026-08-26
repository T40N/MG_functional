#!/usr/bin/env bash
# run_all.sh — full benchmark run: S1–S6 × profiles A–D × functional + OOP.
#
# Usage:
#   ./benchmarks/run_all.sh                  # all scenarios, all profiles
#   ./benchmarks/run_all.sh s3 s4            # only s3 and s4, all profiles
#   PROFILES="A B" ./benchmarks/run_all.sh   # all scenarios, profiles A and B
#   REPEATS=3 ./benchmarks/run_all.sh        # 3 independent repetitions of each
#
# REPEATS is passed through to run_single.sh and multiplies the runtime.
# Required for mean ± SD and confidence intervals — use >= 3 for any claim
# about statistical significance.
#
# Total runtime estimate (per repetition):
#   Profile A: 30s  × 2 apps = ~2 min per scenario
#   Profile B: 3min × 2 apps = ~8 min per scenario
#   Profile C: 5min × 2 apps = ~13 min per scenario
#   Profile D: 9min × 2 apps = ~21 min per scenario
#   + 30s cooldown between runs, DB resets
#   Full run (6 scenarios × 4 profiles): ~3–4 hours × REPEATS
#   → REPEATS=3 on the full matrix is roughly 10–12 hours; plan it overnight
#     or narrow the scope, e.g. PROFILES="A B" REPEATS=5

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

REPEATS="${REPEATS:-1}"
export REPEATS

FAILED=()

TOTAL=$(( ${#SCENARIOS[@]} * ${#PROFILES[@]} ))
CURRENT=0
START_TIME=$(date +%s)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Full benchmark run"
echo "  Scenarios : ${SCENARIOS[*]}"
echo "  Profiles  : ${PROFILES[*]}"
echo "  Repeats   : $REPEATS  (per scenario/profile combination)"
echo "  Total runs: $TOTAL combos × $REPEATS = $(( TOTAL * REPEATS ))  (each = functional + OOP)"
echo "  Started   : $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for scenario in "${SCENARIOS[@]}"; do
  for profile in "${PROFILES[@]}"; do
    CURRENT=$(( CURRENT + 1 ))
    echo ""
    echo "▶ [$CURRENT/$TOTAL] $scenario / Profile $profile  ($(date '+%H:%M:%S'))"

    # Odporność na błędy: pojedynczy nieudany scenariusz nie może przerwać
    # wielogodzinnego przebiegu nocnego. Błąd jest logowany, pętla idzie dalej,
    # a compare.py policzy statystyki z tego, co się udało zmierzyć.
    if ! "$ROOT_DIR/run_single.sh" "$scenario" "$profile"; then
      echo "  !! NIEPOWODZENIE: $scenario / profil $profile — pomijam, kontynuuję"
      FAILED+=("${scenario}_${profile}")
    fi

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
echo "  Repeats   : $REPEATS"
echo "  Results in: benchmarks/results/"
if (( ${#FAILED[@]} > 0 )); then
  echo "  NIEUDANE (${#FAILED[@]}): ${FAILED[*]}"
else
  echo "  Wszystkie kombinacje zakończone bez błędów"
fi
echo ""
echo "  Analiza:  python3 benchmarks/analysis/compare.py"
if (( REPEATS < 3 )); then
  echo ""
  echo "  UWAGA: REPEATS=$REPEATS. Sekcja 'ANALIZA POWTÓRZEŃ' w compare.py"
  echo "  nie da podstaw do wnioskowania o istotności różnic (potrzebne n >= 3)."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
