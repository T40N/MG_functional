#!/usr/bin/env bash
# status_overnight.sh — migawka stanu przebiegu odpalonego przez nohup_overnight.sh.
#
# Uwaga: bez `pipefail`. `pmset ... | grep -q` konczy sie SIGPIPE na pmset,
# co przy pipefail daje status 141 i falszywy alarm "brak blokady uspienia".
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS="$ROOT_DIR/results"
LOG_PTR="$RESULTS/.last_overnight_log"

# Pomiary starsze niz ten znacznik pochodza z majowej sesji benchmarkowej
# (inny stan kodu) i nie licza sie do kompletu.
CUTOFF=1787580977

[[ -f "$LOG_PTR" ]] || { echo "Brak $LOG_PTR — nic nie bylo odpalane."; exit 1; }
LOG="$(cat "$LOG_PTR")"
[[ -f "$LOG" ]] || { echo "Brak logu: $LOG"; exit 1; }

# Wzorzec obejmuje wszystkie runnery, nie tylko resume_overnight — inaczej
# skrypt raportuje falszywe "przebieg zostal przerwany" dla kazdego innego.
RUNNERS="resume_overnight|remeasure_s1s2|topup_profile_d|run_analysis|run_tonight|analysis_after"
PID="$(pgrep -f "caffeinate -ims.*($RUNNERS)" | head -1)"

echo "Log   : $LOG"
if [[ -n "$PID" ]]; then
  echo "Stan  : DZIALA (caffeinate PID $PID, od $(ps -o etime= -p "$PID" | tr -d ' '))"
elif grep -q "^### KONIEC" "$LOG"; then
  echo "Stan  : ZAKONCZONY — $(grep '^### KONIEC' "$LOG")"
else
  echo "Stan  : NIE DZIALA, a w logu brak '### KONIEC' -> przebieg zostal przerwany!"
fi

ASSERT="$(pmset -g assertions)"
if grep -q "PreventSystemSleep named" <<< "$ASSERT"; then
  echo "Sen   : blokada uspienia AKTYWNA"
else
  echo "Sen   : BRAK BLOKADY USPIENIA — pomiary sa zagrozone!"
fi

echo ""
echo "Etap i kombinacja:"
grep -E "^###|^▶" "$LOG" | tail -3 | sed 's/^/  /'
grep -E "Powtórzenie [0-9]+ / [0-9]+" "$LOG" | tail -1 | sed 's/^ */  /'

echo ""
echo "Aktualny k6:"
if pgrep -f "k6 run" >/dev/null; then
  pgrep -fl "k6 run" \
    | sed -E 's#.*BASE_URL=([^ ]+).*PROFILE=([A-D]).*/([^/]+)\.js#  \3, profil \2, \1#' | head -2
  grep "^running" "$LOG" | tail -1 | sed 's/^/  /'
else
  echo "  (brak — przerwa miedzy przebiegami albo koniec)"
fi

echo ""
echo "Komplet powtorzen (liczone tylko pomiary z tej sesji, >= $CUTOFF):"
TOTAL=0
for s in s1 s2 s3 s4 s5 s6; do
  ROW="  $s "
  for p in A B C D; do
    N=$(ls "$RESULTS/${s}_${p}_functional_"*.json 2>/dev/null \
        | sed -E 's/.*_([0-9]+)\.json/\1/' \
        | awk -v c="$CUTOFF" '$1 >= c' | sort -u | wc -l | tr -d ' ')
    TOTAL=$(( TOTAL + N ))
    if   [[ "$N" -ge 3 ]]; then MARK="✓"
    elif [[ "$N" -gt 0 ]]; then MARK="~"
    else                        MARK="·"; fi
    ROW+="$(printf '%s:%d%s  ' "$p" "$N" "$MARK")"
  done
  echo "$ROW"
done
echo "  ───── razem $TOTAL / 72 powtorzen   (✓ = komplet 3,  ~ = niepelne,  · = brak)"

echo ""
# Wyciagamy WZORZEC DATY, nie reszte linii — naglowek moze zawierac dowolny
# opis miedzy "### START" a znacznikiem czasu (np. "### START pelnej macierzy").
# Wczesniej sed obcinal tylko prefiks, data sie nie parsowala, prog wychodzil
# zerowy i kontrola raportowala uspienia sprzed tygodnia jako biezace.
START_STR="$(grep '^### START' "$LOG" | head -1 \
  | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}' | head -1)"
if [[ -z "$START_STR" ]]; then
  echo "  (nie udalo sie odczytac czasu startu z logu — kontrola uspien pominieta)"
  START_EPOCH=""
else
  START_EPOCH=$(date -j -f "%Y-%m-%d %H:%M:%S" "$START_STR" +%s 2>/dev/null || echo "")
fi
echo "Uspienia systemu od startu przebiegu (musi byc pusto):"
FOUND=0
while IFS= read -r line; do
  TS=$(date -j -f "%Y-%m-%d %H:%M:%S" "$(cut -c1-19 <<< "$line")" +%s 2>/dev/null || echo 0)
  if [[ -n "$START_EPOCH" && "$TS" -ge "$START_EPOCH" ]]; then
    echo "  !! $line" | cut -c1-120; FOUND=1
  fi
done < <(pmset -g log | grep "Entering Sleep")
[[ "$FOUND" -eq 0 ]] && echo "  brak — OK"
