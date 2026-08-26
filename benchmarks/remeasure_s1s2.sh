#!/usr/bin/env bash
# remeasure_s1s2.sh — ponowny pomiar S1 i S2 po wyrownaniu implementacji.
#
# Powod: `getUserByEmail` w wersji funkcyjnej nie mial `LIMIT 1`, ktory miala
# wersja obiektowa. Roznica ~5 us na zadanie (0,012% czasu obslugi), ale
# widoczna w kodzie — a praca opiera sie na tezie, ze implementacje roznia sie
# wylacznie paradygmatem. Wyrownano 2026-08-25; poprzednie pomiary S1/S2
# przeniesiono do results/superseded_s1s2/.
#
# Zakres: S1, S2 x profile A-D x 3 powtorzenia = 24 pary functional+OOP.
# Szacowany czas: ~4 h 15 min.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "### START ponownego pomiaru S1/S2  $(date '+%Y-%m-%d %H:%M:%S')"
REPEATS=3 "$ROOT_DIR/run_all.sh" s1 s2
echo "### KONIEC  $(date '+%Y-%m-%d %H:%M:%S')"
