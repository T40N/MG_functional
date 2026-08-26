#!/usr/bin/env bash
# Czeka na koniec ponownego pomiaru S1/S2 i uruchamia analize calej macierzy.
# Obecny docs/benchmark_wyniki.txt zawiera S1/S2 sprzed wyrownania implementacji
# — po przemiarze trzeba go przeliczyc od nowa.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "### CZEKAM na koniec pomiaru S1/S2  $(date '+%H:%M:%S')"
while pgrep -f "caffeinate -ims.*remeasure_s1s2" > /dev/null; do sleep 60; done
echo "### Pomiar zakonczony, start analizy  $(date '+%H:%M:%S')"
sleep 60
"$ROOT_DIR/run_analysis.sh"
