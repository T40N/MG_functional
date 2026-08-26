#!/usr/bin/env bash
# run_probe.sh — jedna konfiguracja sondy S3 dla OBU implementacji.
#
# Usage:
#   ./benchmarks/probes/run_probe.sh <konfiguracja>
#   konfiguracja: diag | list1 | list20 | list50
#
# Environment overrides:
#   VUS       — domyslnie 100 (poziom, na ktorym anomalia S3 jest wyrazna)
#   DURATION  — domyslnie 45s
#
# Dla kazdej implementacji: rozgrzewka JIT (odrzucana) -> zerowanie licznikow
# diagnostycznych i pg_stat_statements -> okno pomiaru -> zrzut trzech zrodel:
#   1. podsumowanie k6                    (przepustowosc i czas zadania)
#   2. GET /api/diagnostics               (sterta, GC, opoznienie petli zdarzen)
#   3. pg_stat_statements                 (liczba wywolan i czas W BAZIE)
#
# Punkt 3 jest tu najwazniejszy i nie ma go w run_single.sh: pozwala rozdzielic
# czas spedzony w aplikacji od czasu spedzonego w serwerze bazy danych. Zapytanie
# S3 jest w obu implementacjach identyczne co do znaku, wiec obie trafiaja w ten
# sam wpis pg_stat_statements — a mierzone osobno, bo obciazana jest zawsze tylko
# jedna aplikacja, druga stoi bezczynnie.
#
# UWAGA: pg_stat_statements jest licznikiem globalnym serwera. Skrypt zeruje go
# przed kazdym oknem pomiaru, wiec NIE uruchamiac rownolegle z innym obciazeniem
# tej instancji Postgresa.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/out"; mkdir -p "$OUT"
FUNC_URL="${BASE_URL_FUNC:-http://localhost:3100}"
OOP_URL="${BASE_URL_OOP:-http://localhost:3001}"
VUS=${VUS:-100}
DURATION=${DURATION:-45s}
PSQL="docker exec my_postgres psql -U postgres -d postgres -Atc"

CFG="${1:-}"
case "$CFG" in
  diag)   MODE=diag; LIMIT=0  ;;
  list1)  MODE=list; LIMIT=1  ;;
  list20) MODE=list; LIMIT=20 ;;
  list50) MODE=list; LIMIT=50 ;;
  *) echo "Usage: $0 <diag|list1|list20|list50>" >&2; exit 1 ;;
esac

echo "━━ sonda $CFG  (${VUS} VU x ${DURATION}) ━━"

for app in functional oop; do
  if [[ $app == functional ]]; then URL=$FUNC_URL; else URL=$OOP_URL; fi
  echo "══ $CFG / $app ($URL) ══"

  # Rozgrzewka JIT — wyniki odrzucane (Georges i in., OOPSLA 2007).
  k6 run --quiet -e BASE_URL="$URL" -e PROBE_PATH=$MODE -e LIMIT=$LIMIT \
         -e VUS=10 -e DURATION=15s "$DIR/probe.js" >/dev/null 2>&1

  # Zerowanie licznikow PO rozgrzewce, tuz przed oknem pomiaru.
  curl -sf -X POST -o /dev/null --max-time 5 "$FUNC_URL/api/diagnostics/reset" || true
  curl -sf -X POST -o /dev/null --max-time 5 "$OOP_URL/api/diagnostics/reset"  || true
  $PSQL "select pg_stat_statements_reset()" >/dev/null

  k6 run --quiet -e BASE_URL="$URL" -e PROBE_PATH=$MODE -e LIMIT=$LIMIT \
         -e VUS=$VUS -e DURATION=$DURATION \
         -e SUMMARY_OUT="$OUT/${CFG}_${app}_summary.json" "$DIR/probe.js" 2>&1 | tail -3

  curl -sf "$URL/api/diagnostics" > "$OUT/${CFG}_${app}_diag.json"
  # calls | total_exec_time | mean_exec_time | rows
  $PSQL "select calls, round(total_exec_time::numeric,1), round(mean_exec_time::numeric,4), rows
         from pg_stat_statements
         where query like '%FROM products%' and query not like '%pg_stat%'
         order by calls desc limit 3" > "$OUT/${CFG}_${app}_pgss.txt"
  echo "  pg_stat_statements: $(tr '\n' ' ' < "$OUT/${CFG}_${app}_pgss.txt")"
done
