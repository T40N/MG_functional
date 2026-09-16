#!/usr/bin/env bash
# run_analysis.sh — compare.py na calym materiale z benchmarks/results/.
#
# `python3 -u` wylacza buforowanie, zeby tee dostawal wyniki na biezaco,
# a nie dopiero na koncu wielogodzinnego parsowania (pelna seria to ~300 GB).
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/benchmarks/reports"
OUT="$OUT_DIR/benchmark_wyniki.txt"
mkdir -p "$OUT_DIR"

{
  echo "# Wyniki benchmarku functional vs OOP"
  echo "# Material: benchmarks/results/ (6 scenariuszy x 4 profile x N powtorzen)"
  echo "# Analiza uruchomiona: $(date '+%Y-%m-%d %H:%M:%S')"
  echo
} > "$OUT"

cd "$ROOT_DIR"
python3 -u benchmarks/analysis/compare.py 2>&1 | tee -a "$OUT"

echo "" | tee -a "$OUT"
echo "# Analiza zakonczona: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$OUT"
