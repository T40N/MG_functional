#!/usr/bin/env python3
"""Normalizacja metryk H5 do jednostki pracy (na 1000 żądań).

DLACZEGO TO ISTNIEJE
--------------------
`compare.py` agreguje metryki hipotezy H5 w oknie pomiaru: liczba zdarzeń
odśmiecania i suma pauz GC odnoszą się do CAŁEGO przebiegu. Obie implementacje
obsługują w tym samym oknie RÓŻNĄ liczbę żądań — w S4/D implementacja obiektowa
obsługuje ich o ~35% więcej. Porównanie liczników okna miesza więc dwa efekty:
koszt alokacyjny pojedynczego żądania (przedmiot H5) i liczbę żądań (skutek
różnicy wydajności). Przy tej samej pracy na żądanie szybsza implementacja
wypadnie "gorzej", bo tej pracy wykona po prostu więcej.

Skrypt dzieli oba liczniki przez liczbę żądań obsłużonych w tym samym oknie
i przeprowadza tę samą procedurę statystyczną co compare.py: średnia z n
powtórzeń, SD międzyprzebiegowa (ddof=1), 95% przedział ufności z rozkładu
t-Studenta, kryterium rozłączności przedziałów.

ŹRÓDŁO DANYCH
-------------
`benchmarks/reports/benchmark_wyniki.txt` — wynik `compare.py` zapisany przez
`benchmarks/run_analysis.sh`. Skrypt czyta tabele pojedynczych przebiegów
(wiersze "GC count", "GC pause total (ms)", "total requests"), więc sam nie
dotyka surowego materiału z benchmarks/results/ (~300 GB) — wymaga jednak,
by analiza główna była już uruchomiona.

URUCHOMIENIE
------------
    ./benchmarks/run_analysis.sh          # najpierw — tworzy plik źródłowy
    python3 benchmarks/analysis/h5_per_request.py \
        > benchmarks/reports/metryki_h5_na_zadanie.txt
"""

import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "reports" / "benchmark_wyniki.txt"

# Wartość krytyczna rozkładu t-Studenta, dwustronna, 95%, df = n-1.
# Tablica jak w compare.py — bez zależności od SciPy.
T_CRIT_95 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571}

SCENARIOS = ["s1", "s2", "s3", "s4", "s5", "s6"]
PROFILES = ["A", "B", "C", "D"]
PROFILE_LABEL = {"A": "1 VU", "B": "20 VU", "C": "100 VU", "D": "200 VU"}

RUN_RE = re.compile(r"► Przetwarzanie: (\w+)_(\w)_(\d+)\n(.*?)└─+┘", re.S)


def _pair(body: str, label: str):
    m = re.search(r"│\s+" + re.escape(label) + r"\s+([\d.]+)\s+([\d.]+)", body)
    return (float(m.group(1)), float(m.group(2))) if m else None


def parse_runs(text: str) -> dict:
    runs = defaultdict(list)
    for scenario, profile, _ts, body in RUN_RE.findall(text):
        req = _pair(body, "total requests")
        gc_count = _pair(body, "GC count")
        gc_pause = _pair(body, "GC pause total (ms)")
        if req and gc_count and gc_pause:
            runs[(scenario, profile)].append((req, gc_count, gc_pause))
    return runs


def aggregate(values: list) -> dict:
    n = len(values)
    mean = statistics.mean(values)
    sd = statistics.stdev(values) if n > 1 else 0.0
    half = T_CRIT_95.get(n - 1, 1.96) * sd / (n ** 0.5) if n > 1 else 0.0
    return {"n": n, "mean": mean, "sd": sd, "lo": mean - half, "hi": mean + half}


def disjoint(a: dict, b: dict) -> bool:
    return a["hi"] < b["lo"] or b["hi"] < a["lo"]


def verdict(a: dict, b: dict) -> str:
    if not disjoint(a, b):
        return "nierozstrzyg."
    return "istotna (F>O)" if a["mean"] > b["mean"] else "istotna (F<O)"


def main() -> int:
    if not SRC.exists():
        print(f"Brak pliku źródłowego: {SRC}", file=sys.stderr)
        return 1

    runs = parse_runs(SRC.read_text(encoding="utf-8"))
    w = 96
    print("=" * w)
    print("  METRYKI H5 ZNORMALIZOWANE DO JEDNOSTKI PRACY (na 1000 żądań)")
    print("=" * w)
    print(f"  Źródło: {SRC.name} (seria 2026-08-25/26, n=3 na kombinację)")
    print("  Metoda: licznik okna / liczba żądań w tym samym oknie × 1000;")
    print("          średnia z n powtórzeń, SD międzyprzebiegowa, 95% CI (t-Studenta),")
    print("          kryterium rozłączności przedziałów — identycznie jak w compare.py.")
    print("  Uwaga:  „nierozstrzyg.” = przedziały nachodzą, czyli brak dowodu różnicy,")
    print("          co przy n=3 nie jest dowodem jej braku (niska moc testu).")
    print("=" * w)

    tally = {"gc": defaultdict(int), "pause": defaultdict(int)}

    for metric_key, idx, label, fmt in (
        ("gc", 1, "Zdarzenia GC na 1000 żądań", "8.2f"),
        ("pause", 2, "Pauzy GC (ms) na 1000 żądań", "8.3f"),
    ):
        print()
        print(f"┌{'─' * (w - 2)}┐")
        print(f"│  {label:<{w - 4}}│")
        print(f"├{'─' * (w - 2)}┤")
        print(f"│  {'Scenariusz / profil':<22}{'Functional (M±SD)':>21}{'OOP (M±SD)':>21}"
              f"{'Δ':>9}  {'Istotność':<17}│")
        print(f"├{'─' * (w - 2)}┤")
        for scenario in SCENARIOS:
            for profile in PROFILES:
                data = runs.get((scenario, profile), [])
                if len(data) < 2:
                    continue
                f_vals = [d[idx][0] / d[0][0] * 1000 for d in data]
                o_vals = [d[idx][1] / d[0][1] * 1000 for d in data]
                fa, oa = aggregate(f_vals), aggregate(o_vals)
                delta = (fa["mean"] - oa["mean"]) / oa["mean"] * 100 if oa["mean"] else 0.0
                v = verdict(fa, oa)
                tally[metric_key][v] += 1
                name = f"{scenario.upper()} / {profile} ({PROFILE_LABEL[profile]})"
                fcell = f"{fa['mean']:{fmt}} ± {fa['sd']:.2f}"
                ocell = f"{oa['mean']:{fmt}} ± {oa['sd']:.2f}"
                print(f"│  {name:<22}{fcell:>21}{ocell:>21}{delta:>+8.1f}%  {v:<17}│")
        print(f"├{'─' * (w - 2)}┤")
        t = tally[metric_key]
        summary = (f"zgodne z H5: {t['istotna (F>O)']}   "
                   f"przeciwne: {t['istotna (F<O)']}   "
                   f"nierozstrzygnięte: {t['nierozstrzyg.']}   (z 24 kombinacji)")
        print(f"│  {summary:<{w - 4}}│")
        print(f"└{'─' * (w - 2)}┘")

    return 0


if __name__ == "__main__":
    sys.exit(main())
