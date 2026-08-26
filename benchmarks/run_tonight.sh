#!/usr/bin/env bash
# run_tonight.sh — pelna macierz po wyrownaniu warstwy HTTP (2026-08-25).
#
# URUCHOM PRZEZ:  ./benchmarks/run_tonight.sh
# Skrypt sam sie odczepia od sesji i blokuje uspienie systemu.
#
# Zakres: S1-S6 x profile A-D x 3 powtorzenia = 72 pary functional+OOP.
# Czas:   ~14 h (restart kontenerow + rozgrzewka JIT przed kazdym pomiarem).
#         Po zakonczeniu automatycznie uruchamia analize.
#
# WARUNEK: klapa laptopa otwarta (caffeinate nie blokuje Clamshell Sleep)
#          albo podlaczony monitor zewnetrzny.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

run_all_and_analyse() {
  echo "### START pelnej macierzy  $(date '+%Y-%m-%d %H:%M:%S')"
  REPEATS=3 "$ROOT_DIR/run_all.sh"
  echo "### Pomiar zakonczony, przerwa 2 min przed analiza  $(date '+%H:%M:%S')"
  sleep 120
  "$ROOT_DIR/run_analysis.sh"
  echo "### KONIEC (pomiar + analiza)  $(date '+%Y-%m-%d %H:%M:%S')"
}

if [[ "${MG_DETACHED:-}" == "1" ]]; then
  run_all_and_analyse
  exit 0
fi

# Sanity check przed 14-godzinnym przebiegiem
for c in mg_functional mg_oop my_postgres; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$c"; then
    echo "BLAD: kontener $c nie dziala. Uruchom: docker compose up -d" >&2
    exit 1
  fi
done
if pgrep -f "k6 run" > /dev/null; then
  echo "BLAD: k6 juz dziala — inny pomiar w toku." >&2
  exit 1
fi

LOG="$ROOT_DIR/results/full_matrix_$(date +%s).log"
echo "$LOG" > "$ROOT_DIR/results/.last_overnight_log"
MG_DETACHED=1 nohup python3 -c '
import os, sys
os.setsid()
os.execvp("caffeinate", ["caffeinate", "-ims"] + sys.argv[1:])
' "$ROOT_DIR/run_tonight.sh" > "$LOG" 2>&1 < /dev/null &
disown $! 2>/dev/null || true

echo "Wystartowano. Koniec okolo $(date -v+14H '+%H:%M jutro' 2>/dev/null || date '+%H:%M +14h')."
echo "Log:      $LOG"
echo "Postep:   ./benchmarks/status_overnight.sh"
echo "Wyniki:   docs/benchmark_wyniki.txt  (po zakonczeniu analizy)"
