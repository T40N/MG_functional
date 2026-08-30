#!/usr/bin/env python3
"""Wykres krzywej przepustowości serwera bazy danych (sonda pg_curve).

Rysunek do rozdziału 10.3 pracy: przepustowość i średni czas zapytania S3
w funkcji liczby zapytań wykonywanych w bazie jednocześnie, zmierzone BEZ kodu
którejkolwiek aplikacji (`pg_curve.js`, kontener Postgresa z limitem 2 rdzeni).

Na krzywą naniesiono punkty pracy obu implementacji wyznaczone w sondzie
`run_probe.sh list20` z prawa Little'a (wywołania/s × średni czas zapytania):
implementacja funkcyjna 4,73 równoległych zapytań, obiektowa 7,00.

Dane pochodzą z przebiegu 2026-08-26 opisanego w benchmarks/probes/README.md
(surowe wyjście sondy, jak cały materiał pomiarowy, jest poza repozytorium).

Uruchomienie:
    python3 benchmarks/probes/plot_pg_curve.py
"""

from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = Path(__file__).resolve().parents[1] / "analysis" / "charts" / "db_throughput_curve.png"

# pg_curve.js — N równoległych klientów, zapytanie S3, 10 s na punkt
N = [1, 2, 3, 4, 5, 6, 7, 8, 10, 14]
QPS = [1035, 1868, 1902, 1730, 1596, 1375, 1264, 1183, 995, 854]
LATENCY = [0.97, 1.07, 1.58, 2.31, 3.13, 4.37, 5.54, 6.80, 10.09, 16.53]

# Punkty pracy obu implementacji (sonda list20, 100 VU)
WORKING_POINTS = [
    ("funkcyjna", 4.73, 3.609),
    ("obiektowa", 7.00, 6.475),
]


def main() -> None:
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.2))

    ax1.plot(N, QPS, marker="o", color="#1f77b4")
    ax1.axvline(3, color="#d62728", linestyle="--", linewidth=1)
    ax1.annotate("kolano krzywej (N ≈ 3)", xy=(3, 1902), xytext=(4.4, 1750),
                 fontsize=9, color="#d62728")
    y_lo, y_hi = min(QPS), max(QPS)
    for label, n, _lat in WORKING_POINTS:
        ax1.axvline(n, color="#7f7f7f", linestyle=":", linewidth=1)
        ax1.annotate(f"{label} ({n:.2f})".replace(".", ","),
                     xy=(n - 0.15, y_lo + 0.06 * (y_hi - y_lo)), rotation=90,
                     fontsize=8, color="#333333", ha="right", va="bottom")
    ax1.set_xlabel("zapytania wykonywane w bazie jednocześnie (N)")
    ax1.set_ylabel("przepustowość bazy [zapytań/s]")
    ax1.set_title("Przepustowość serwera bazy danych")
    ax1.grid(alpha=0.3)

    ax2.plot(N, LATENCY, marker="o", color="#2ca02c")
    for label, n, measured in WORKING_POINTS:
        ax2.plot([n], [measured], marker="D", color="#d62728", markersize=7)
        ax2.annotate(f"{label}\n{measured:.2f} ms".replace(".", ","), xy=(n, measured),
                     xytext=(n + 0.4, measured + 1.6), fontsize=8, color="#d62728")
    ax2.set_xlabel("zapytania wykonywane w bazie jednocześnie (N)")
    ax2.set_ylabel("średni czas zapytania [ms]")
    ax2.set_title("Czas zapytania S3 wobec równoległości")
    ax2.grid(alpha=0.3)

    fig.tight_layout()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT, dpi=150)
    print(f"zapisano: {OUT}")


if __name__ == "__main__":
    main()
