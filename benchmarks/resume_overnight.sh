#!/usr/bin/env bash
# resume_overnight.sh — dokończenie przebiegu przerwanego 2026-08-24 17:47.
#
# Stan wejściowy (po odrzuceniu skażonych pomiarów, patrz results/discarded/):
#   S1/A — 3 czyste powtórzenia  ✅
#   S1/B — 2 czyste powtórzenia  → trzeba dobić 1
#   S1/C, S1/D, S2–S6 — brak
#
# URUCHAMIAJ WYŁĄCZNIE PRZEZ ./benchmarks/nohup_overnight.sh — samo wywołanie
# tego skryptu nie chroni przed uśpieniem systemu ani przed zabiciem procesu
# razem z sesją terminala.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "### START $(date '+%Y-%m-%d %H:%M:%S')"

echo "### ETAP 1/3: S1 / profil B — dobicie 3. powtórzenia"
PROFILES="B" REPEATS=1 "$ROOT_DIR/run_all.sh" s1

echo "### ETAP 2/3: S1 / profile C, D"
PROFILES="C D" REPEATS=3 "$ROOT_DIR/run_all.sh" s1

echo "### ETAP 3/3: S2–S6 / profile A–D"
REPEATS=3 "$ROOT_DIR/run_all.sh" s2 s3 s4 s5 s6

echo "### KONIEC $(date '+%Y-%m-%d %H:%M:%S')"
