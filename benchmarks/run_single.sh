#!/usr/bin/env bash
# run_single.sh — run one k6 scenario (both apps) with full metrics collection.
#
# Usage:
#   ./benchmarks/run_single.sh <scenario> <profile>
#   ./benchmarks/run_single.sh s3 B
#
# Environment overrides (optional):
#   BASE_URL_FUNC  — default http://localhost:3100  (host port from compose)
#   BASE_URL_OOP   — default http://localhost:3001
#   DB_HOST        — default localhost  (use 'postgres' inside Docker)
#   DB_PORT        — default 55432      (host port of the benchmark postgres;
#                    5432 on the host may belong to a different project)
#   REPEATS        — default 1; number of independent repetitions of the whole
#                    measurement. Each repetition gets its own timestamp, so
#                    compare.py treats them as separate runs and aggregates them
#                    into mean ± SD with a 95% confidence interval.
#                    Use >= 3 for any claim about statistical significance
#                    (Georges et al., OOPSLA 2007, DOI 10.1145/1297027.1297033).
#
#   REPEATS=5 ./benchmarks/run_single.sh s3 B
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
COMPOSE_FILE="$(cd "$ROOT_DIR/.." && pwd)/docker-compose.yml"
SCENARIOS_DIR="$ROOT_DIR/k6/scenarios"

FUNC_URL="${BASE_URL_FUNC:-http://localhost:3100}"
OOP_URL="${BASE_URL_OOP:-http://localhost:3001}"
DB_HOST_VAL="${DB_HOST:-localhost}"
DB_PORT_VAL="${DB_PORT:-55432}"

PREFIX="${SCENARIO}_${PROFILE}"
REPEATS="${REPEATS:-1}"
TS=""   # ustawiany osobno dla każdego powtórzenia

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
echo "  Repeats  : $REPEATS"
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
  echo "  >> Resetting DB ($DB_HOST_VAL:$DB_PORT_VAL)..."
  DB_HOST="$DB_HOST_VAL" DB_PORT="$DB_PORT_VAL" npm run bench:reset --silent
}

# ── Wyrównanie stanu procesów ────────────────────────────────────────────────
# Restart OBU aplikacji przed każdym pomiarem. Trzy powody:
#   1. liczniki GC i histogram pętli zdarzeń startują od zera (do 2026-08-25
#      były kumulatywne od startu kontenera, więc metryki H5 obejmowały całą
#      historię procesu — przy wieku 6 h wobec 24 h czyniło to je bezwartościowymi);
#   2. sterta startuje od zera, więc heap_used nie narasta między powtórzeniami;
#   3. obie aplikacje mają w chwili pomiaru identyczny wiek procesu.
# Restartujemy OBIE, nie tylko mierzoną — kontener bezczynny też zużywa zasoby
# hosta, a jego stan ma być w każdym pomiarze taki sam.
wait_ready() {
  local url="$1" tries=0
  until curl -sf -o /dev/null --max-time 2 "$url/" 2>/dev/null; do
    tries=$(( tries + 1 ))
    if (( tries > 90 )); then
      echo "  !! aplikacja $url nie wstala w 90 s" >&2
      return 1
    fi
    sleep 1
  done
}

restart_apps() {
  echo "  >> Restart obu aplikacji (wyrównanie wieku procesów)..."
  docker compose -f "$COMPOSE_FILE" restart app-functional app-oop > /dev/null 2>&1
  wait_ready "$FUNC_URL" || return 1
  wait_ready "$OOP_URL"  || return 1
}

# ── Rozgrzewka JIT ───────────────────────────────────────────────────────────
# V8 kompiluje i optymalizuje kod w czasie wykonania, więc pierwsze żądania są
# systematycznie wolniejsze. Pomiar obejmujący tę fazę miesza dwa reżimy
# wykonania. Georges i in. (OOPSLA 2007) wymagają jej odrzucenia wprost.
# Przebieg rozgrzewkowy używa tego samego scenariusza, ale jego wyniki nie są
# nigdzie zapisywane.
warmup_app() {
  local url="$1"
  echo "  >> Rozgrzewka JIT (profil WARMUP, wyniki odrzucane)..."
  k6 run \
    --quiet \
    -e BASE_URL="$url" \
    -e PROFILE=WARMUP \
    "$SCRIPT" > /dev/null 2>&1 || true
}

# Zerowanie liczników diagnostycznych PO rozgrzewce, tuż przed oknem pomiaru.
# Bez tego snapshot obejmowałby także pracę odśmiecacza wykonaną w rozgrzewce.
reset_diagnostics() {
  curl -sf -X POST -o /dev/null --max-time 5 "$1/api/diagnostics/reset" 2>/dev/null || true
}

# ── Pojedynczy pomiar jednej implementacji ───────────────────────────────────
measure_app() {
  local label="$1" url="$2"
  echo ""
  echo "[ $3 ] ${label}  ($url)"
  reset_db
  restart_apps || return 1
  warmup_app "$url"
  reset_diagnostics "$FUNC_URL"
  reset_diagnostics "$OOP_URL"
  start_collectors "$label"
  k6 run \
    -e BASE_URL="$url" \
    -e PROFILE="$PROFILE" \
    --out "json=$RESULTS_DIR/${PREFIX}_${label}_${TS}.json" \
    "$SCRIPT"
  stop_collectors
}

# ── Repetition loop ───────────────────────────────────────────────────────────
# Każde powtórzenie to niezależny pomiar obu implementacji, z własnym
# znacznikiem czasu i własnym resetem bazy. compare.py grupuje pliki po
# (scenariusz, profil) i agreguje powtórzenia w średnią ± SD.

TIMESTAMPS=()

for (( REP=1; REP<=REPEATS; REP++ )); do
  TS=$(date +%s)
  TIMESTAMPS+=("$TS")

  echo ""
  echo "══════════════════════════════════════════════════"
  echo "  Powtórzenie $REP / $REPEATS   (ts=$TS)"
  echo "══════════════════════════════════════════════════"

  # ── Naprzemienna kolejność pomiaru ──────────────────────────────────────────
  # Do 2026-08-25 kolejność była stała: zawsze functional, potem OOP. Każda
  # pozostałość po pierwszym przebiegu — rozgrzany cache bazy, narosłe tabele,
  # stan systemu plików — obciążała systematycznie drugą implementację, zawsze
  # tę samą. Naprzemienność rozkłada ten efekt równo na obie i zamienia
  # obciążenie systematyczne w szum.
  if (( REP % 2 == 1 )); then
    measure_app "functional" "$FUNC_URL" "1/2"
    echo "  >> Wychłodzenie 30s..."
    sleep 30
    measure_app "oop" "$OOP_URL" "2/2"
  else
    echo "  (powtórzenie parzyste — kolejność odwrócona: OOP jako pierwszy)"
    measure_app "oop" "$OOP_URL" "1/2"
    echo "  >> Wychłodzenie 30s..."
    sleep 30
    measure_app "functional" "$FUNC_URL" "2/2"
  fi

  # Wychłodzenie między powtórzeniami — poza ostatnim
  if (( REP < REPEATS )); then
    echo "  >> Przerwa 30s przed kolejnym powtórzeniem..."
    sleep 30
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. $REPEATS powtórzeń w benchmarks/results/"
for t in "${TIMESTAMPS[@]}"; do
  echo "    ${PREFIX}_{functional,oop}_${t}.json"
done
if (( REPEATS < 3 )); then
  echo ""
  echo "  UWAGA: n=$REPEATS. Do wnioskowania o istotności różnic potrzebne"
  echo "  min. 3 powtórzenia — uruchom z REPEATS=3 lub więcej."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
