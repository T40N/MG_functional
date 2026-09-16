#!/usr/bin/env bash
# run_static.sh — B7: metryki statyczne obu implementacji
# do benchmarks/reports/metryki_statyczne.txt.
#
# Pomiar jest deterministyczny (czyta kod, nie uruchamia aplikacji), wiec mozna go
# powtorzyc w dowolnym momencie. Wynik zalezy WYLACZNIE od zawartosci apps/, dlatego
# naglowek zapisuje commit OSTATNIEJ ZMIANY W apps/ — nie HEAD. Dzieki temu commit
# dodajacy sam pomiar nie uniewaznia zapisanej metryczki i liczby w pracy da sie
# odtworzyc jednym `git checkout <hash> -- apps`.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/benchmarks/reports"
OUT="$OUT_DIR/metryki_statyczne.txt"
mkdir -p "$OUT_DIR"

{
  echo "# Metryki statyczne kodu — functional vs OOP (zadanie B7)"
  echo "# Wygenerowane: $(date '+%Y-%m-%d %H:%M:%S')"
  DIRTY=""
  [ -n "$(git -C "$ROOT_DIR" status --porcelain -- apps)" ] && DIRTY=" (niezacommitowane zmiany w apps/)"
  echo "# Mierzony kod: $(git -C "$ROOT_DIR" log -1 --format='%h z %ad' --date=short -- apps)$DIRTY"
  echo "# Narzedzia: wlasny licznik SLOC + ESLint 8 (reguly complexity, max-depth)"
  echo "# Metoda i ograniczenia miary: benchmarks/static/README.md"
  echo
} > "$OUT"

cd "$ROOT_DIR"
node benchmarks/static/collect.js 2>&1 | tee -a "$OUT"
