#!/usr/bin/env bash
# run_analysis.sh — compare.py na pelnej serii z 2026-08-24/25.
#
# `python3 -u` wylacza buforowanie, zeby tee dostawal wyniki na biezaco,
# a nie dopiero na koncu wielogodzinnego parsowania ~295 GB.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT_DIR/docs/benchmark_wyniki.txt"

{
  echo "# Wyniki benchmarku functional vs OOP"
  echo "# Seria: 2026-08-24 18:29 — 2026-08-25 09:02"
  echo "# 6 scenariuszy x 4 profile x 3 powtorzenia = 72 pary functional+OOP"
  echo "# Analiza uruchomiona: $(date '+%Y-%m-%d %H:%M:%S')"
  echo
} > "$OUT"

cd "$ROOT_DIR"
python3 -u benchmarks/analysis/compare.py 2>&1 | tee -a "$OUT"

echo "" | tee -a "$OUT"
echo "# Analiza zakonczona: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$OUT"
