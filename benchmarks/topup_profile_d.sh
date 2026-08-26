#!/usr/bin/env bash
# topup_profile_d.sh — nadrabia kombinacje profilu D utracone 2026-08-24.
#
#   S1/D, S2/D — k6 nie startowal: bledna skladnia progu
#                ('http_req_duration{p(95)}': ['< 500']).
#   S3/D       — k6 wystartowal, ale przekroczyl prog p(95) < 500 (583 ms).
#                Kod wyjscia 99 + `set -e` w run_single.sh porzucilo kombinacje
#                po pierwszym przebiegu functional, bez czesci OOP.
#
# Obie przyczyny usuniete w benchmarks/k6/helpers/profiles.js (profile nie maja
# juz zadnych bramek — ocena SLO nalezy do compare.py).
#
# Skrypt CZEKA na koniec glownego przebiegu, zeby dwa obciazenia nie nakladaly
# sie na siebie i nie zafalszowaly pomiarow.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "### CZEKAM na koniec glownego przebiegu  $(date '+%Y-%m-%d %H:%M:%S')"
while pgrep -f "caffeinate -ims.*resume_overnight" > /dev/null; do
  sleep 60
done
echo "### Glowny przebieg zakonczony, start dokladki  $(date '+%Y-%m-%d %H:%M:%S')"

sleep 120   # wychlodzenie maszyny po ostatnim scenariuszu

for s in s1 s2 s3; do
  echo "### $s / profil D x3   ($(date '+%H:%M:%S'))"
  PROFILES="D" REPEATS=3 "$ROOT_DIR/run_all.sh" "$s"
done

echo "### KONIEC DOKLADKI $(date '+%Y-%m-%d %H:%M:%S')"
