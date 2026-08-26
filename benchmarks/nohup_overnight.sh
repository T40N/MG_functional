#!/usr/bin/env bash
# nohup_overnight.sh — odpala resume_overnight.sh tak, żeby przeżył noc.
#
# Dwie rzeczy, które ubiły przebieg 2026-08-24:
#   1. macOS uśpił system 30 s po wygaszeniu ekranu → k6 zamrożone na godzinę.
#      Lekarstwo: caffeinate -ims (blokuje idle/disk/system sleep). Bez -d,
#      bo ekran ma prawo zgasnąć — samo wygaszenie ekranu nie mrozi procesów,
#      a świecący panel przez 13 h to zbędne ciepło w trakcie pomiaru.
#   2. Proces był dzieckiem sesji Claude Code / terminala i zginął razem z nią.
#      Lekarstwo: setsid + nohup — własna grupa procesów, odczepiona od TTY.
#
# UWAGA: caffeinate NIE blokuje "Clamshell Sleep". Laptop musi mieć otwartą
# klapę (albo podłączony monitor zewnętrzny), inaczej i tak zaśnie.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$ROOT_DIR/results/overnight_$(date +%s).log"

echo "$LOG" > "$ROOT_DIR/results/.last_overnight_log"

# macOS nie ma setsid(1), wiec nowa sesje procesow zakladamy przez os.setsid()
# w Pythonie, ktory nastepnie exec-uje caffeinate. Dzieki temu proces nie nalezy
# do grupy procesow terminala i nie zginie, gdy sesja sie zamknie.
nohup python3 -c '
import os, sys
os.setsid()
os.execvp("caffeinate", ["caffeinate", "-ims"] + sys.argv[1:])
' "$ROOT_DIR/resume_overnight.sh" > "$LOG" 2>&1 < /dev/null &
PID=$!
disown "$PID" 2>/dev/null || true

echo "Wystartowano, PID $PID"
echo "Log: $LOG"
echo "Podglad: tail -f \"$LOG\""
echo "Zatrzymanie: kill -- -$PID"
