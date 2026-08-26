#!/usr/bin/env python3
"""
Analiza benchmarku: functional (fp-ts) vs OOP.

Usage (z katalogu głównego repo):
    python3 benchmarks/analysis/compare.py
    python3 benchmarks/analysis/compare.py --results-dir benchmarks/results \
                                            --output-dir  benchmarks/analysis/charts
"""

import argparse
import csv
import json
import re
import sys
import textwrap
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ── Style ─────────────────────────────────────────────────────────────────────
plt.rcParams.update(
    {
        "font.family": "sans-serif",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.alpha": 0.35,
        "grid.linestyle": "--",
    }
)

FUNC_COLOR = "#3b82f6"
OOP_COLOR = "#ef4444"

SCENARIO_LABELS = {
    "s1": "S1 Registration",
    "s2": "S2 Login",
    "s3": "S3 Product List",
    "s4": "S4 Product Detail",
    "s5": "S5 Add to Cart",
    "s6": "S6 Place Order",
}
PROFILE_LABELS = {
    "A": "Baseline (1 VU, 30s)",
    "B": "Normal (20 VU, 3m)",
    "C": "Peak (100 VU, 5m)",
    "D": "Stress (200 VU, 9m)",
}

# ── Wzorce nazw plików ────────────────────────────────────────────────────────
K6_RE = re.compile(r"^(s\d+)_([A-D])_(functional|oop)_(\d+)\.json$")
STAT_RE = re.compile(r"^(s\d+)_([A-D])_(functional|oop)_stats_(\d+)\.csv$")
DIAG_RE = re.compile(r"^(s\d+)_([A-D])_(functional|oop)_diag_(func|oop)_(\d+)\.jsonl$")


# ─────────────────────────────────────────────────────────────────────────────
# Parsery
# ─────────────────────────────────────────────────────────────────────────────


_SETUP_TAGS = {"setup_login", "setup_cart"}


def parse_k6(path: Path) -> dict:
    """Parse k6 JSONL output. Requests tagged setup_login / setup_cart are excluded."""
    durations, waiting, failed, req_times = [], [], [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("type") != "Point":
                continue
            m, v = rec["metric"], rec["data"]["value"]
            tags = rec["data"].get("tags", {})
            is_setup = tags.get("type") in _SETUP_TAGS
            if m == "http_req_duration":
                if not is_setup:
                    durations.append(v)
                    req_times.append(rec["data"]["time"])
            elif m == "http_req_waiting":
                if not is_setup:
                    waiting.append(v)
            elif m == "http_req_failed":
                if not is_setup:
                    failed.append(v)

    if not durations:
        return {}

    arr = np.array(durations)
    times = [datetime.fromisoformat(t) for t in req_times]
    span = (max(times) - min(times)).total_seconds()
    rps = len(durations) / span if span > 0 else float(len(durations))
    err = sum(1 for v in failed if v > 0) / len(failed) * 100 if failed else 0.0

    avg = float(np.mean(arr))
    # SD próbkowe (ddof=1) — rozrzut czasów pojedynczych zadan w obrebie przebiegu
    std = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0

    return {
        "count": len(durations),
        "avg": avg,
        "std": std,
        "cv": (std / avg * 100.0) if avg else 0.0,
        "p50": float(np.percentile(arr, 50)),
        "p95": float(np.percentile(arr, 95)),
        "p99": float(np.percentile(arr, 99)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "req_per_s": rps,
        "error_rate": err,
        "ttfb_avg": float(np.mean(waiting)) if waiting else 0.0,
    }


def _parse_cpu(s: str) -> float:
    return float(s.strip().rstrip("%"))


def _parse_mem_mib(s: str) -> float:
    u = s.split("/")[0].strip()
    for suffix, factor in [("GiB", 1024.0), ("MiB", 1.0), ("MB", 1.0)]:
        if suffix in u:
            return float(u.replace(suffix, "").strip()) * factor
    return 0.0


def parse_docker_stats(path: Path, impl: str) -> dict:
    """Wyciągnij próbki zasobów dla jednej implementacji z CSV docker stats."""
    target = "mg_functional" if impl == "functional" else "mg_oop"
    rows = []
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["container"] == target:
                rows.append(
                    {
                        "ts": int(row["ts"]),
                        "cpu": _parse_cpu(row["cpu_pct"]),
                        "mem": _parse_mem_mib(row["mem_usage"]),
                    }
                )
    if not rows:
        return {}
    t0 = rows[0]["ts"]
    cpus = [r["cpu"] for r in rows]
    mems = [r["mem"] for r in rows]
    return {
        "ts_rel": [r["ts"] - t0 for r in rows],
        "cpu": cpus,
        "mem": mems,
        "cpu_avg": float(np.mean(cpus)),
        "cpu_max": float(np.max(cpus)),
        "mem_avg": float(np.mean(mems)),
        "mem_max": float(np.max(mems)),
    }


def _parse_diag_ts(raw: str) -> float:
    # macOS date +%s%3N → "{unix_seconds}3N" (literal suffix, nie ms)
    clean = raw.rstrip("N").strip()
    return float(clean[:10]) if len(clean) >= 10 else float(clean)


def parse_diagnostics(path: Path) -> dict:
    """Parsuj diagnostics JSONL: event loop lag, heap, GC."""
    keys = ["heap_used", "heap_total", "rss", "gc_count", "gc_pause", "el_lag_mean", "el_lag_p99"]
    data: dict = {k: [] for k in keys}
    ts_list: list = []

    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(" ", 1)
            if len(parts) != 2:
                continue
            ts = _parse_diag_ts(parts[0])
            try:
                d = json.loads(parts[1])["data"]
            except (json.JSONDecodeError, KeyError):
                continue
            ts_list.append(ts)
            mem = d.get("memory", {})
            data["heap_used"].append(mem.get("heapUsedMb", 0.0))
            data["heap_total"].append(mem.get("heapTotalMb", 0.0))
            data["rss"].append(mem.get("rssMb", 0.0))
            gc = d.get("gc", {})
            data["gc_count"].append(gc.get("count", 0))
            data["gc_pause"].append(gc.get("totalPauseMs", 0.0))
            el = d.get("eventLoop", {})
            data["el_lag_mean"].append(el.get("lagMeanMs", 0.0))
            data["el_lag_p99"].append(el.get("lagP99Ms", 0.0))

    if not ts_list:
        return {}

    t0 = ts_list[0]
    result = {"ts_rel": [t - t0 for t in ts_list]}
    result.update(data)
    result["heap_used_avg"] = float(np.mean(data["heap_used"]))
    result["heap_used_max"] = float(np.max(data["heap_used"]))
    result["rss_avg"] = float(np.mean(data["rss"]))
    result["el_lag_mean_avg"] = float(np.mean(data["el_lag_mean"]))
    result["el_lag_p99_max"] = float(np.max(data["el_lag_p99"]))
    # Licznik GC jest kumulatywny, ale zerowany przez run_single.sh tuz przed
    # oknem pomiaru (POST /api/diagnostics/reset), wiec maksimum z probek to
    # laczna praca odsmiecacza W TYM przebiegu. max() zamiast [-1] na wypadek
    # gdyby ostatnia probka zostala pobrana juz po restarcie kontenera.
    result["gc_pause_total"] = float(np.max(data["gc_pause"])) if data["gc_pause"] else 0.0
    result["gc_count_total"] = float(np.max(data["gc_count"])) if data.get("gc_count") else 0.0
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Discovery
# ─────────────────────────────────────────────────────────────────────────────


def discover(results_dir: Path) -> dict:
    """
    Zgrupuj pliki wynikowe po (scenario, profile, ts).
    Klucze słownika grupy: 'functional', 'oop', 'stats_functional', 'stats_oop',
                           'diag_func_functional', 'diag_oop_oop', ...
    """
    groups: dict = defaultdict(dict)
    for f in sorted(results_dir.iterdir()):
        m = K6_RE.match(f.name)
        if m:
            scen, prof, impl, ts = m.groups()
            groups[(scen, prof, ts)][impl] = f
            continue
        m = STAT_RE.match(f.name)
        if m:
            scen, prof, impl, ts = m.groups()
            groups[(scen, prof, ts)][f"stats_{impl}"] = f
            continue
        m = DIAG_RE.match(f.name)
        if m:
            scen, prof, run_label, app, ts = m.groups()
            # diag_func_functional = diagnostics apki functional podczas benchmarku functional
            groups[(scen, prof, ts)][f"diag_{app}_{run_label}"] = f
    return dict(groups)


# ─────────────────────────────────────────────────────────────────────────────
# Statystyka powtórzeń pomiarów
#
# Rozróżniamy dwa różne odchylenia standardowe — mieszanie ich to najczęstszy
# błąd w raportowaniu benchmarków:
#
#   SD wewnątrzprzebiegowa  (parse_k6 -> "std")
#       rozrzut czasów pojedynczych żądań w JEDNYM przebiegu.
#       Opisuje zmienność, jakiej doświadcza klient.
#
#   SD międzyprzebiegowa    (aggregate_runs -> "sd")
#       rozrzut ŚREDNICH z niezależnych powtórzeń tego samego pomiaru.
#       Opisuje powtarzalność eksperymentu i tylko ona pozwala stwierdzić,
#       czy różnica między implementacjami nie jest szumem pomiarowym.
#
# Kryterium istotności: rozłączność 95% przedziałów ufności — metoda zalecana
# przez Georges, Buytaert, Eeckhout (OOPSLA 2007), DOI 10.1145/1297027.1297033.
# ─────────────────────────────────────────────────────────────────────────────


# Wartości krytyczne rozkładu t-Studenta, dwustronne, poziom ufności 95%.
# Indeks = liczba stopni swobody (n-1). Dla n-1 > 30 przybliżamy 1.96.
_T_CRIT_95 = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
    8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145,
    15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056,
    27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}


def _t_crit(df: int) -> float:
    if df <= 0:
        return float("nan")
    return _T_CRIT_95.get(df, 1.96)


def aggregate_values(values: list) -> dict:
    """Zagreguj N pomiarów TEJ SAMEJ metryki z niezależnych powtórzeń.

    Wspólny rdzeń statystyczny dla czasu żądania i dla metryk hipotezy H5
    (sterta, odśmiecacz, pętla zdarzeń, CPU) — dzięki temu wszystkie wielkości
    raportowane w pracy liczone są dokładnie tą samą metodą.

    Zwraca średnią, SD MIĘDZYPRZEBIEGOWĄ (ddof=1), CV oraz 95% przedział
    ufności z rozkładu t-Studenta.
    """
    vals = [float(v) for v in values if v is not None]
    n = len(vals)
    if n == 0:
        return {}

    arr = np.array(vals, dtype=float)
    mean = float(np.mean(arr))
    # SD międzyprzebiegowa — rozrzut wartości z kolejnych powtórzeń
    sd = float(np.std(arr, ddof=1)) if n > 1 else 0.0
    sem = sd / np.sqrt(n) if n > 1 else 0.0
    ci_half = _t_crit(n - 1) * sem if n > 1 else 0.0

    return {
        "n": n,
        "mean": mean,
        "sd": sd,
        "sem": sem,
        "cv": (sd / mean * 100.0) if mean else 0.0,
        "ci_low": mean - ci_half,
        "ci_high": mean + ci_half,
        "ci_half": ci_half,
        "values": vals,
    }


def aggregate_runs(runs: list) -> dict:
    """Zagreguj CZAS ŻĄDANIA z N niezależnych powtórzeń tego samego pomiaru.

    runs — lista słowników zwróconych przez parse_k6().
    """
    agg = aggregate_values([r.get("avg") for r in runs])
    if not agg:
        return {}

    # średnia SD wewnątrzprzebiegowa — dla porównania rzędów wielkości
    within = [r.get("std", 0.0) for r in runs]
    agg["within_sd_avg"] = float(np.mean(within)) if within else 0.0
    agg["rps_mean"] = float(np.mean([r.get("req_per_s", 0.0) for r in runs]))
    agg["means"] = agg["values"]
    return agg


def ci_disjoint(a: dict, b: dict) -> bool:
    """Czy 95% przedziały ufności obu implementacji są rozłączne."""
    if not a or not b or a.get("n", 0) < 2 or b.get("n", 0) < 2:
        return False
    return a["ci_high"] < b["ci_low"] or b["ci_high"] < a["ci_low"]


def print_repeats_table(scenario, profile, fa, oa):
    """Tabela zbiorcza dla powtórzeń — średni czas żądania ± SD."""
    scen = SCENARIO_LABELS.get(scenario, scenario)
    prof = PROFILE_LABELS.get(profile, profile)

    print(f"\n┌{'═'*_W}┐")
    print(f"│  POWTÓRZENIA: {scen} — Profil {prof}".ljust(_W + 1) + "│")
    _tsep()
    print(f"│  {'Metryka':<27} {'Functional':>14} {'OOP':>14} {'Δ':>8}  │")
    _tsep()
    _trow("liczba przebiegów (n)", fa.get("n"), oa.get("n"), ".0f")
    _trow("średni czas żądania (ms)", fa.get("mean"), oa.get("mean"))
    _trow("SD międzyprzebiegowa (ms)", fa.get("sd"), oa.get("sd"))
    _trow("CV międzyprzebiegowe (%)", fa.get("cv"), oa.get("cv"))
    _trow("95% CI dolna (ms)", fa.get("ci_low"), oa.get("ci_low"))
    _trow("95% CI górna (ms)", fa.get("ci_high"), oa.get("ci_high"))
    _tsep()
    _trow("SD wewnątrzprzebiegowa (ms)", fa.get("within_sd_avg"), oa.get("within_sd_avg"))
    _trow("req/s (średnia)", fa.get("rps_mean"), oa.get("rps_mean"), ".1f")
    _tsep()

    # Uwaga na sformułowanie: nierozłączne przedziały ufności to BRAK DOWODU
    # różnicy, a nie dowód jej braku. Przy n = 3 moc testu jest niska, więc
    # różnica realna, ale mała, pozostanie niewykryta. Wcześniejsze brzmienie
    # („różnica nieistotna statystycznie") sugerowało wniosek mocniejszy, niż
    # dane pozwalają wyciągnąć.
    n_min = min(fa.get("n", 0), oa.get("n", 0))
    note = None
    if n_min < 2:
        verdict = "n < 2 — brak podstaw do wnioskowania o istotności"
    elif n_min < 3:
        verdict = "n = 2 — za mało powtórzeń, wynik orientacyjny"
    elif ci_disjoint(fa, oa):
        faster = "Functional" if fa["mean"] < oa["mean"] else "OOP"
        verdict = f"CI rozłączne → różnica istotna ({faster} szybszy)"
    else:
        verdict = "CI nachodzą → różnica nierozstrzygnięta"
        note = "brak dowodu różnicy, nie dowód jej braku (niska moc testu)"
    print(f"│  Wniosek: {verdict}".ljust(_W + 1) + "│")
    if note:
        print(f"│           {note}".ljust(_W + 1) + "│")
    print(f"└{'═'*_W}┘\n")


def plot_repeats(scenario, profile, fa, oa, out: Path):
    """Wykres średniego czasu żądania z odchyleniem standardowym."""
    if not fa or not oa:
        return
    scen = SCENARIO_LABELS.get(scenario, scenario)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle(
        f"{scen} — Profile {PROFILE_LABELS.get(profile, profile)}  "
        f"(n={fa.get('n')} / {oa.get('n')} runs)",
        fontsize=13,
    )

    # Panel 1: średnia ± SD międzyprzebiegowa oraz ± 95% CI
    _bar_group(
        ax1,
        ["mean ±SD", "mean ±95% CI"],
        [fa["mean"], fa["mean"]],
        [oa["mean"], oa["mean"]],
        "Mean request time [ms]",
        "Mean request time — dispersion across runs",
        f_err=[fa["sd"], fa["ci_half"]],
        o_err=[oa["sd"], oa["ci_half"]],
    )

    # Panel 2: rozrzut poszczególnych przebiegów
    ax2.plot(range(1, fa["n"] + 1), fa["means"], "o-", color=FUNC_COLOR,
             label="Functional", markersize=5)
    ax2.plot(range(1, oa["n"] + 1), oa["means"], "o-", color=OOP_COLOR,
             label="OOP", markersize=5)
    ax2.axhline(fa["mean"], color=FUNC_COLOR, linestyle=":", alpha=0.6)
    ax2.axhline(oa["mean"], color=OOP_COLOR, linestyle=":", alpha=0.6)
    ax2.fill_between(range(1, max(fa["n"], oa["n"]) + 1),
                     fa["ci_low"], fa["ci_high"], color=FUNC_COLOR, alpha=0.10)
    ax2.fill_between(range(1, max(fa["n"], oa["n"]) + 1),
                     oa["ci_low"], oa["ci_high"], color=OOP_COLOR, alpha=0.10)
    ax2.set_xlabel("Run number")
    ax2.set_ylabel("Mean request time [ms]")
    ax2.set_title("Per-run means with 95% CI bands", fontsize=11)
    ax2.set_xticks(range(1, max(fa["n"], oa["n"]) + 1))
    ax2.legend(fontsize=9)

    _save(fig, out / f"{scenario}_{profile}_repeats.png")


# ─────────────────────────────────────────────────────────────────────────────
# Agregacja metryk hipotezy H5 — pamięć i praca odśmiecacza
#
# H5 jest hipotezą CENTRALNĄ pracy: niemutowalne struktury danych wytwarzają
# więcej krótko żyjących obiektów pośrednich, więc powinny obciążać stertę
# i odśmiecacz bardziej niż podejście obiektowe oparte na mutacji w miejscu.
# Orzekanie o tym wymaga tej samej dyscypliny statystycznej co czas żądania —
# średniej z niezależnych powtórzeń, SD MIĘDZYPRZEBIEGOWEJ i przedziału
# ufności — a nie pojedynczej liczby z jednego przebiegu. Do 2026-08-26
# sekcja „ANALIZA POWTÓRZEŃ" agregowała wyłącznie czas żądania, przez co
# hipoteza centralna była jedyną, dla której nie liczono rozrzutu.
#
# Źródła metryk:
#   diag  — /api/diagnostics, pomiar WEWNĄTRZ procesu Node (sterta V8, zdarzenia
#           i pauzy GC, opóźnienie pętli zdarzeń); liczniki GC zerowane po
#           rozgrzewce, więc obejmują wyłącznie okno pomiarowe,
#   stats — docker stats, pomiar NA ZEWNĄTRZ kontenera (CPU, pamięć procesu).
#
# Wszystkie metryki H5 są typu „mniej znaczy lepiej", więc dodatnia Δ oznacza
# większe zużycie po stronie funkcyjnej, czyli wynik zgodny z H5.
# ─────────────────────────────────────────────────────────────────────────────

# (klucz, etykieta, format, źródło)
H5_METRICS = [
    ("heap_used_avg",   "Sterta użyta śr. (MB)",       ".2f", "diag"),
    ("heap_used_max",   "Sterta użyta maks (MB)",      ".2f", "diag"),
    ("rss_avg",         "RSS śr. (MB)",                ".2f", "diag"),
    ("gc_count_total",  "Zdarzenia GC (szt.)",         ".1f", "diag"),
    ("gc_pause_total",  "Suma pauz GC (ms)",           ".2f", "diag"),
    ("el_lag_mean_avg", "Opóźnienie pętli śr. (ms)",   ".3f", "diag"),
    ("el_lag_p99_max",  "Opóźnienie pętli p99 (ms)",   ".2f", "diag"),
    ("cpu_avg",         "CPU śr. (%)",                 ".2f", "stats"),
    ("mem_avg",         "Pamięć kontenera śr. (MiB)",  ".2f", "stats"),
    ("mem_max",         "Pamięć kontenera maks (MiB)", ".2f", "stats"),
]


def aggregate_h5_runs(diags: list, stats: list) -> dict:
    """Zagreguj metryki pamięciowo-odśmiecające z N powtórzeń jednej implementacji.

    diags — lista słowników zwróconych przez parse_diagnostics(),
    stats — lista słowników zwróconych przez parse_docker_stats().

    Zwraca: klucz metryki -> słownik z aggregate_values() (mean, sd, cv, CI).
    Metryki bez kompletu danych są pomijane, nie zerowane — brak próbki nie jest
    pomiarem równym zeru.
    """
    out: dict = {}
    for key, _label, _fmt, source in H5_METRICS:
        runs = diags if source == "diag" else stats
        vals = [r[key] for r in runs if r and r.get(key) is not None]
        agg = aggregate_values(vals)
        if agg:
            out[key] = agg
    return out


_WH5 = 100


def _tsep_h5():
    print(f"├{'─'*_WH5}┤")


def _h5_line(text: str):
    print(f"│  {text}".ljust(_WH5 + 1) + "│")


def _h5_wrap(text: str, indent: str = ""):
    """Wypisz tekst zawinięty do szerokości ramki — długie wyliczenia metryk
    inaczej rozjeżdżają tabelę."""
    for i, line in enumerate(textwrap.wrap(text, width=_WH5 - 2 - len(indent)) or [""]):
        _h5_line(f"{indent if i else ''}{line}" if i else line)


def _h5_verdict(fa: dict, oa: dict) -> str:
    n_min = min(fa.get("n", 0), oa.get("n", 0))
    if n_min < 3:
        return f"n={n_min}"
    if not ci_disjoint(fa, oa):
        return "nierozstrzyg."
    return "istotna (F>O)" if fa["mean"] > oa["mean"] else "istotna (F<O)"


def _h5_row(label: str, fa: dict, oa: dict, fmt: str):
    fcell = f"{fa['mean']:{fmt}} ± {fa['sd']:{fmt}}"
    ocell = f"{oa['mean']:{fmt}} ± {oa['sd']:{fmt}}"
    delta = f"{(fa['mean'] - oa['mean']) / abs(oa['mean']) * 100:+.1f}%" if oa["mean"] else "—"
    print(f"│  {label:<28} {fcell:>20} {ocell:>20} {delta:>9}  "
          f"{_h5_verdict(fa, oa):<14}  │")


def print_h5_repeats_table(scenario, profile, fh, oh):
    """Tabela metryk H5 z powtórzeń — średnia ± SD międzyprzebiegowa + istotność."""
    if not fh or not oh:
        return
    scen = SCENARIO_LABELS.get(scenario, scenario)
    prof = PROFILE_LABELS.get(profile, profile)

    print(f"\n┌{'═'*_WH5}┐")
    _h5_line(f"H5 — PAMIĘĆ I ODŚMIECACZ: {scen} — Profil {prof}")
    _tsep_h5()
    print(f"│  {'Metryka':<28} {'Functional (M±SD)':>20} {'OOP (M±SD)':>20} "
          f"{'Δ':>9}  {'Istotność':<14}  │")
    _tsep_h5()

    shown = []
    prev_source = None
    for key, label, fmt, source in H5_METRICS:
        fa, oa = fh.get(key), oh.get(key)
        if not fa or not oa:
            continue
        if prev_source is not None and source != prev_source:
            _tsep_h5()
        prev_source = source
        _h5_row(label, fa, oa, fmt)
        shown.append((label, fa, oa))

    _tsep_h5()
    sig = [(l, fa, oa) for l, fa, oa in shown if ci_disjoint(fa, oa)]
    higher = [l for l, fa, oa in sig if fa["mean"] > oa["mean"]]
    lower = [l for l, fa, oa in sig if fa["mean"] < oa["mean"]]
    _h5_line(f"Istotnych różnic: {len(sig)} z {len(shown)} metryk — "
             f"funkcyjna wyżej: {len(higher)}, funkcyjna niżej: {len(lower)}")
    if higher:
        _h5_wrap(f"  zgodne z H5 (funkcyjna zużywa więcej): {'; '.join(higher)}",
                 indent="    ")
    if lower:
        _h5_wrap(f"  przeciwne do H5 (funkcyjna zużywa mniej): {'; '.join(lower)}",
                 indent="    ")
    _h5_line("„nierozstrzyg.” = przedziały ufności nachodzą — brak dowodu różnicy,")
    _h5_line("  co przy n=3 nie jest dowodem jej braku (niska moc testu).")
    print(f"└{'═'*_WH5}┘\n")


# Panele wykresu H5 — (klucz metryki, etykieta osi, tytuł panelu)
H5_PLOT_PANELS = [
    ("heap_used_avg",  "Heap used [MB]",      "Mean heap usage"),
    ("heap_used_max",  "Heap used [MB]",      "Peak heap usage"),
    ("rss_avg",        "RSS [MB]",            "Mean resident set size"),
    ("gc_count_total", "GC events",           "Garbage collection events"),
    ("gc_pause_total", "GC pause total [ms]", "Total GC pause time"),
    ("el_lag_p99_max", "Event loop lag [ms]", "Event loop lag p99 (max)"),
]


def plot_h5_repeats(scenario, profile, fh, oh, out: Path):
    """Wykres metryk H5 z powtórzeń — słupki ze słupkami błędu (SD i 95% CI)."""
    panels = [p for p in H5_PLOT_PANELS if fh.get(p[0]) and oh.get(p[0])]
    if not panels:
        return
    scen = SCENARIO_LABELS.get(scenario, scenario)
    n = min(fh[panels[0][0]]["n"], oh[panels[0][0]]["n"])

    ncols = 3
    nrows = (len(panels) + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(5.4 * ncols, 4.6 * nrows))
    axes = np.atleast_1d(axes).ravel()
    fig.suptitle(
        f"{scen} — {PROFILE_LABELS.get(profile, profile)} — H5: memory & GC "
        f"(mean ±SD / ±95% CI across n={n} runs; * = disjoint CI)",
        fontsize=13,
    )

    for ax, (key, ylabel, title) in zip(axes, panels):
        fa, oa = fh[key], oh[key]
        _bar_group(
            ax,
            ["mean ±SD", "mean ±95% CI"],
            [fa["mean"], fa["mean"]],
            [oa["mean"], oa["mean"]],
            ylabel,
            title + (" *" if ci_disjoint(fa, oa) else ""),
            f_err=[fa["sd"], fa["ci_half"]],
            o_err=[oa["sd"], oa["ci_half"]],
        )
    for ax in axes[len(panels):]:
        ax.axis("off")

    _save(fig, out / f"{scenario}_{profile}_h5_repeats.png")


# Zbiorcze wykresy H5 — (klucz metryki, etykieta osi, nazwa pliku)
H5_SUMMARY_CHARTS = [
    ("heap_used_avg",  "Mean heap used [MB]",   "summary_h5_heap.png"),
    ("gc_count_total", "GC events",             "summary_h5_gc_count.png"),
    ("gc_pause_total", "Total GC pause [ms]",   "summary_h5_gc_pause.png"),
]


def plot_summary_h5(aggregates: list, out: Path):
    """Zbiorcze wykresy metryk H5 dla wszystkich pomiarów — średnia ± SD."""
    for key, ylabel, fname in H5_SUMMARY_CHARTS:
        usable = [a for a in aggregates
                  if a.get("func_h5", {}).get(key) and a.get("oop_h5", {}).get(key)]
        if len(usable) < 2:
            continue
        fig, ax = plt.subplots(figsize=(max(8, 1.8 * len(usable)), 6))
        fig.suptitle(f"{ylabel} ± SD across runs — functional vs OOP", fontsize=13)
        _bar_group(
            ax,
            [a["label"] for a in usable],
            [a["func_h5"][key]["mean"] for a in usable],
            [a["oop_h5"][key]["mean"] for a in usable],
            ylabel, "",
            f_err=[a["func_h5"][key]["sd"] for a in usable],
            o_err=[a["oop_h5"][key]["sd"] for a in usable],
        )
        _save(fig, out / fname)


def print_h5_summary(aggregates: list):
    """Zbiorcze rozstrzygnięcie H5 — ile kombinacji wykazuje istotną różnicę."""
    rows = []
    for key, label, _fmt, _src in H5_METRICS:
        higher = lower = undecided = missing = 0
        for a in aggregates:
            fa = a.get("func_h5", {}).get(key)
            oa = a.get("oop_h5", {}).get(key)
            if not fa or not oa:
                missing += 1
            elif not ci_disjoint(fa, oa):
                undecided += 1
            elif fa["mean"] > oa["mean"]:
                higher += 1
            else:
                lower += 1
        rows.append((label, higher, lower, undecided, missing))

    total = len(aggregates)
    print(f"\n┌{'═'*_WH5}┐")
    _h5_line(f"H5 — ZESTAWIENIE ZBIORCZE — liczba kombinacji scenariusz × profil: {total}")
    _tsep_h5()
    print(f"│  {'Metryka':<28} {'zgodne z H5':>13} {'przeciwne':>11} "
          f"{'nierozstrzyg.':>14} {'brak danych':>13}               │")
    _tsep_h5()
    for label, higher, lower, undecided, missing in rows:
        print(f"│  {label:<28} {higher:>13d} {lower:>11d} "
              f"{undecided:>14d} {missing:>13d}               │")
    _tsep_h5()
    _h5_line("„zgodne z H5” = funkcyjna zużywa istotnie WIĘCEJ (rozłączne 95% CI).")
    _h5_line("Kolumna „nierozstrzyg.” to brak dowodu różnicy, nie dowód jej braku.")
    print(f"└{'═'*_WH5}┘\n")


def export_h5_csv(aggregates: list, path: Path):
    """Zapisz agregaty H5 do CSV — materiał źródłowy dla tabel w pracy."""
    fields = [
        "scenario", "profile", "metric", "metric_label",
        "n_functional", "functional_mean", "functional_sd", "functional_cv",
        "functional_ci_low", "functional_ci_high",
        "n_oop", "oop_mean", "oop_sd", "oop_cv", "oop_ci_low", "oop_ci_high",
        "delta_pct", "ci_disjoint",
    ]
    labels = {k: l for k, l, _f, _s in H5_METRICS}
    n_rows = 0
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for a in aggregates:
            for key in labels:
                fa = a.get("func_h5", {}).get(key)
                oa = a.get("oop_h5", {}).get(key)
                if not fa or not oa:
                    continue
                w.writerow({
                    "scenario": a["scenario"],
                    "profile": a["profile"],
                    "metric": key,
                    "metric_label": labels[key],
                    "n_functional": fa["n"],
                    "functional_mean": f"{fa['mean']:.4f}",
                    "functional_sd": f"{fa['sd']:.4f}",
                    "functional_cv": f"{fa['cv']:.2f}",
                    "functional_ci_low": f"{fa['ci_low']:.4f}",
                    "functional_ci_high": f"{fa['ci_high']:.4f}",
                    "n_oop": oa["n"],
                    "oop_mean": f"{oa['mean']:.4f}",
                    "oop_sd": f"{oa['sd']:.4f}",
                    "oop_cv": f"{oa['cv']:.2f}",
                    "oop_ci_low": f"{oa['ci_low']:.4f}",
                    "oop_ci_high": f"{oa['ci_high']:.4f}",
                    "delta_pct": (f"{(fa['mean'] - oa['mean']) / abs(oa['mean']) * 100:.2f}"
                                  if oa["mean"] else ""),
                    "ci_disjoint": "1" if ci_disjoint(fa, oa) else "0",
                })
                n_rows += 1
    print(f"  ✓ {path.name} ({n_rows} wierszy)")


# ─────────────────────────────────────────────────────────────────────────────
# Tabela konsolowa
# ─────────────────────────────────────────────────────────────────────────────

_W = 70  # szerokosc ramki = szerokosc wiersza _trow (27+14+14+8 + separatory)


def _trow(label, fv, ov, fmt=".2f"):
    fs = f"{fv:{fmt}}" if fv is not None else "—"
    os_ = f"{ov:{fmt}}" if ov is not None else "—"
    d = ""
    if fv is not None and ov is not None and ov != 0:
        pct = (fv - ov) / abs(ov) * 100
        d = f"{pct:+.1f}%"
    print(f"│  {label:<27} {fs:>14} {os_:>14} {d:>8}  │")


def _tsep():
    print(f"├{'─'*_W}┤")


def print_table(scenario, profile, fk, ok, fd, od, fdiag, odiag):
    scen = SCENARIO_LABELS.get(scenario, scenario)
    prof = PROFILE_LABELS.get(profile, profile)
    print(f"\n┌{'─'*_W}┐")
    print(f"│  {scen}  —  Profil {prof}".ljust(_W + 1) + "│")
    _tsep()
    print(f"│  {'Metryka':<27} {'Functional':>14} {'OOP':>14} {'Δ':>8}  │")
    _tsep()
    _trow("avg latency (ms)", fk.get("avg"), ok.get("avg"))
    _trow("SD latency (ms)", fk.get("std"), ok.get("std"))
    _trow("CV latency (%)", fk.get("cv"), ok.get("cv"))
    _trow("p50 (ms)", fk.get("p50"), ok.get("p50"))
    _trow("p95 (ms)", fk.get("p95"), ok.get("p95"))
    _trow("p99 (ms)", fk.get("p99"), ok.get("p99"))
    _trow("min (ms)", fk.get("min"), ok.get("min"))
    _trow("max (ms)", fk.get("max"), ok.get("max"))
    _trow("req/s", fk.get("req_per_s"), ok.get("req_per_s"), ".1f")
    _trow("error rate (%)", fk.get("error_rate"), ok.get("error_rate"))
    _trow("TTFB avg (ms)", fk.get("ttfb_avg"), ok.get("ttfb_avg"))
    _trow("total requests", fk.get("count"), ok.get("count"), ".0f")
    if fd and od:
        _tsep()
        _trow("CPU avg (%)", fd.get("cpu_avg"), od.get("cpu_avg"))
        _trow("CPU max (%)", fd.get("cpu_max"), od.get("cpu_max"))
        _trow("MEM avg (MiB)", fd.get("mem_avg"), od.get("mem_avg"))
        _trow("MEM max (MiB)", fd.get("mem_max"), od.get("mem_max"))
    if fdiag and odiag:
        _tsep()
        _trow("Heap avg (MB)", fdiag.get("heap_used_avg"), odiag.get("heap_used_avg"))
        _trow("Heap max (MB)", fdiag.get("heap_used_max"), odiag.get("heap_used_max"))
        _trow("RSS avg (MB)", fdiag.get("rss_avg"), odiag.get("rss_avg"))
        _trow("EL lag mean (ms)", fdiag.get("el_lag_mean_avg"), odiag.get("el_lag_mean_avg"))
        _trow("EL lag p99 max (ms)", fdiag.get("el_lag_p99_max"), odiag.get("el_lag_p99_max"))
        _trow("GC pause total (ms)", fdiag.get("gc_pause_total"), odiag.get("gc_pause_total"))
        _trow("GC count", fdiag.get("gc_count_total"), odiag.get("gc_count_total"))
    print(f"└{'─'*_W}┘\n")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers wykresów
# ─────────────────────────────────────────────────────────────────────────────


def _bar_group(ax, x_labels, f_vals, o_vals, ylabel, title, f_err=None, o_err=None):
    x, w = np.arange(len(x_labels)), 0.35
    ekw = dict(capsize=4, ecolor="#374151", error_kw={"elinewidth": 1.2})
    b1 = ax.bar(x - w / 2, f_vals, w, label="Functional", color=FUNC_COLOR, alpha=0.85,
                yerr=f_err, **(ekw if f_err is not None else {}))
    b2 = ax.bar(x + w / 2, o_vals, w, label="OOP", color=OOP_COLOR, alpha=0.85,
                yerr=o_err, **(ekw if o_err is not None else {}))
    ax.set_ylabel(ylabel)
    ax.set_title(title, fontsize=11)
    ax.set_xticks(x)
    ax.set_xticklabels(x_labels)
    ax.legend(loc="upper left", fontsize=9)
    ax.bar_label(b1, fmt="%.1f", padding=2, fontsize=8)
    ax.bar_label(b2, fmt="%.1f", padding=2, fontsize=8)
    m = max(max(f_vals, default=0), max(o_vals, default=0))
    if f_err is not None:
        m = max(m, max((v + e for v, e in zip(f_vals, f_err)), default=0))
    if o_err is not None:
        m = max(m, max((v + e for v, e in zip(o_vals, o_err)), default=0))
    ax.set_ylim(0, m * 1.30 if m else 1)


def _overlay(ax, fdata, odata, key, ylabel, title, f_avg=None, o_avg=None):
    """Nałóż dwie serie (functional + OOP) na tej samej osi."""
    ax.plot(fdata["ts_rel"], fdata[key], color=FUNC_COLOR, linewidth=1.5,
            label="Functional", marker="o", markersize=3)
    ax.plot(odata["ts_rel"], odata[key], color=OOP_COLOR, linewidth=1.5,
            label="OOP", marker="o", markersize=3)
    if f_avg is not None:
        ax.axhline(f_avg, color=FUNC_COLOR, linestyle=":", alpha=0.6,
                   label=f"avg F {f_avg:.1f}")
    if o_avg is not None:
        ax.axhline(o_avg, color=OOP_COLOR, linestyle=":", alpha=0.6,
                   label=f"avg O {o_avg:.1f}")
    ax.set_xlabel("Time [s]")
    ax.set_ylabel(ylabel)
    ax.set_title(title, fontsize=10)
    ax.legend(fontsize=8)


def _single_line(ax, ts_rel, vals, color, label, ylabel, title, avg=None):
    ax.plot(ts_rel, vals, color=color, linewidth=1.5, label=label, marker="o", markersize=3)
    if avg is not None:
        ax.axhline(avg, color=color, linestyle=":", alpha=0.6, label=f"avg {avg:.1f}")
    ax.set_xlabel("Time [s]")
    ax.set_ylabel(ylabel)
    ax.set_title(title, fontsize=10)
    ax.legend(fontsize=8)


def _save(fig, path: Path):
    fig.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  ✓ {path.name}")


# ─────────────────────────────────────────────────────────────────────────────
# Wykresy per-run
# ─────────────────────────────────────────────────────────────────────────────


def plot_run(scenario, profile, prefix, fk, ok, fd, od, fdiag, odiag, out: Path):
    scen = SCENARIO_LABELS.get(scenario, scenario)
    title = f"{scen} — Profile {PROFILE_LABELS.get(profile, profile)}"

    # ── Chart 1: latency + throughput ─────────────────────────────────────────
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle(title, fontsize=13)

    _bar_group(
        ax1,
        ["avg", "p50", "p95", "p99"],
        [fk.get(m, 0) for m in ["avg", "p50", "p95", "p99"]],
        [ok.get(m, 0) for m in ["avg", "p50", "p95", "p99"]],
        "Time [ms]",
        "Latency",
    )
    _bar_group(
        ax2,
        ["req/s"],
        [fk.get("req_per_s", 0)],
        [ok.get("req_per_s", 0)],
        "Requests / s",
        "Throughput",
    )
    ax2.set_xticks([0])
    ax2.set_xticklabels([""])

    _save(fig, out / f"{prefix}_latency_throughput.png")

    # ── Chart 2: system resources (docker stats) ──────────────────────────────
    if fd and od and fd.get("ts_rel") and od.get("ts_rel"):
        fig, axes = plt.subplots(2, 2, figsize=(13, 8))
        fig.suptitle(f"System Resources — {title}", fontsize=13)

        _single_line(axes[0][0], fd["ts_rel"], fd["cpu"], FUNC_COLOR,
                     "Functional", "CPU [%]", "CPU — Functional", fd.get("cpu_avg"))
        _single_line(axes[0][1], od["ts_rel"], od["cpu"], OOP_COLOR,
                     "OOP", "CPU [%]", "CPU — OOP", od.get("cpu_avg"))
        _single_line(axes[1][0], fd["ts_rel"], fd["mem"], FUNC_COLOR,
                     "Functional", "RAM [MiB]", "RAM — Functional", fd.get("mem_avg"))
        _single_line(axes[1][1], od["ts_rel"], od["mem"], OOP_COLOR,
                     "OOP", "RAM [MiB]", "RAM — OOP", od.get("mem_avg"))

        _save(fig, out / f"{prefix}_resources.png")

    # ── Chart 3: diagnostics (event loop, heap, GC) ───────────────────────────
    if fdiag and odiag and fdiag.get("ts_rel") and odiag.get("ts_rel"):
        fig, axes = plt.subplots(2, 3, figsize=(16, 9))
        fig.suptitle(f"Diagnostics — {title}", fontsize=13)

        diag_metrics = [
            ("el_lag_mean", "ms",  "Event Loop lag (mean)",
             fdiag.get("el_lag_mean_avg"), odiag.get("el_lag_mean_avg")),
            ("el_lag_p99",  "ms",  "Event Loop lag (p99)",  None, None),
            ("gc_pause",    "ms",  "GC pause total (cumulative)", None, None),
            ("heap_used",   "MB",  "Heap used",
             fdiag.get("heap_used_avg"), odiag.get("heap_used_avg")),
            ("heap_total",  "MB",  "Heap total",  None, None),
            ("rss",         "MB",  "RSS (Resident Set Size)",
             fdiag.get("rss_avg"), odiag.get("rss_avg")),
        ]

        for ax, (key, ylabel, title_ax, f_avg, o_avg) in zip(axes.flat, diag_metrics):
            _overlay(ax, fdiag, odiag, key, ylabel, title_ax, f_avg, o_avg)

        _save(fig, out / f"{prefix}_diagnostics.png")


# ─────────────────────────────────────────────────────────────────────────────
# Wykres podsumowujący (wiele scenariuszy)
# ─────────────────────────────────────────────────────────────────────────────


def plot_summary(summary: list, out: Path):
    if len(summary) < 2:
        return
    labels = [s["label"] for s in summary]
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.suptitle("Summary — functional vs OOP", fontsize=14)

    _bar_group(
        axes[0], labels,
        [s["func_p95"] for s in summary],
        [s["oop_p95"] for s in summary],
        "p95 [ms]", "p95 Latency",
    )
    _bar_group(
        axes[1], labels,
        [s["func_rps"] for s in summary],
        [s["oop_rps"] for s in summary],
        "Requests / s", "Throughput",
    )

    _save(fig, out / "summary.png")


def plot_summary_sd(aggregates: list, out: Path):
    """Zbiorczy wykres średniego czasu żądania ± SD dla wszystkich pomiarów."""
    usable = [a for a in aggregates if a["func"] and a["oop"]]
    if len(usable) < 2:
        return

    labels = [a["label"] for a in usable]
    fig, ax = plt.subplots(figsize=(max(8, 1.8 * len(usable)), 6))
    fig.suptitle("Mean request time ± SD across runs — functional vs OOP", fontsize=13)

    _bar_group(
        ax, labels,
        [a["func"]["mean"] for a in usable],
        [a["oop"]["mean"] for a in usable],
        "Mean request time [ms]", "",
        f_err=[a["func"]["sd"] for a in usable],
        o_err=[a["oop"]["sd"] for a in usable],
    )
    _save(fig, out / "summary_mean_sd.png")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Analiza benchmarku functional vs OOP")
    parser.add_argument("--results-dir", default="benchmarks/results",
                        help="Katalog z plikami wynikowymi k6")
    parser.add_argument("--output-dir", default="benchmarks/analysis/charts",
                        help="Katalog wyjściowy dla wykresów PNG")
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    groups = discover(results_dir)
    if not groups:
        print(f"Brak plików wynikowych w: {results_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Znaleziono {len(groups)} grup wyników.\n")

    summary = []
    # powtórzenia: (scenariusz, profil) -> lista wyników per implementacja
    repeats: dict = defaultdict(lambda: {
        "functional": [], "oop": [],          # k6 — czas żądania
        "diag_functional": [], "diag_oop": [],    # /api/diagnostics — H5
        "stats_functional": [], "stats_oop": [],  # docker stats — H5
    })

    for (scenario, profile, ts), group in sorted(groups.items()):
        if "functional" not in group or "oop" not in group:
            print(f"Pominięto {scenario}_{profile}_{ts}: brak pliku functional lub OOP")
            continue

        print(f"► Przetwarzanie: {scenario}_{profile}_{ts}")
        fk = parse_k6(group["functional"])
        ok = parse_k6(group["oop"])

        fd = (parse_docker_stats(group["stats_functional"], "functional")
              if "stats_functional" in group else {})
        od = (parse_docker_stats(group["stats_oop"], "oop")
              if "stats_oop" in group else {})

        # Diagnostics: apka functional pod obciążeniem functional, OOP pod OOP
        fdiag = (parse_diagnostics(group["diag_func_functional"])
                 if "diag_func_functional" in group else {})
        odiag = (parse_diagnostics(group["diag_oop_oop"])
                 if "diag_oop_oop" in group else {})

        print_table(scenario, profile, fk, ok, fd, od, fdiag, odiag)

        rep_entry = repeats[(scenario, profile)]
        if fk:
            rep_entry["functional"].append(fk)
        if ok:
            rep_entry["oop"].append(ok)
        # Metryki H5 zbierane niezależnie od k6 — mają własne, kompletne serie
        if fdiag:
            rep_entry["diag_functional"].append(fdiag)
        if odiag:
            rep_entry["diag_oop"].append(odiag)
        if fd:
            rep_entry["stats_functional"].append(fd)
        if od:
            rep_entry["stats_oop"].append(od)

        prefix = f"{scenario}_{profile}_{ts}"
        plot_run(scenario, profile, prefix, fk, ok, fd, od, fdiag, odiag, output_dir)

        summary.append(
            {
                "label": f"{SCENARIO_LABELS.get(scenario, scenario)}\n(Profile {profile})",
                "func_p95": fk.get("p95", 0),
                "oop_p95": ok.get("p95", 0),
                "func_rps": fk.get("req_per_s", 0),
                "oop_rps": ok.get("req_per_s", 0),
            }
        )

    # ── Analiza powtórzeń: średni czas żądania ± odchylenie standardowe ───────
    aggregates = []
    if repeats:
        print("\n" + "═" * (_W + 2))
        print("  ANALIZA POWTÓRZEŃ POMIARÓW")
        print("═" * (_W + 2))

        for (scenario, profile), runs in sorted(repeats.items()):
            fa = aggregate_runs(runs["functional"])
            oa = aggregate_runs(runs["oop"])
            if not fa or not oa:
                continue

            fh = aggregate_h5_runs(runs["diag_functional"], runs["stats_functional"])
            oh = aggregate_h5_runs(runs["diag_oop"], runs["stats_oop"])

            print_repeats_table(scenario, profile, fa, oa)
            plot_repeats(scenario, profile, fa, oa, output_dir)

            print_h5_repeats_table(scenario, profile, fh, oh)
            plot_h5_repeats(scenario, profile, fh, oh, output_dir)

            aggregates.append({
                "label": f"{SCENARIO_LABELS.get(scenario, scenario)}\n(Profile {profile})",
                "scenario": scenario,
                "profile": profile,
                "func": fa,
                "oop": oa,
                "func_h5": fh,
                "oop_h5": oh,
            })

            if min(fa["n"], oa["n"]) < 3:
                print(f"  ⚠ {scenario}_{profile}: n={min(fa['n'], oa['n'])} — "
                      f"do wnioskowania o istotności potrzebne min. 3 powtórzenia\n")

        if aggregates:
            plot_summary_sd(aggregates, output_dir)
            print_h5_summary(aggregates)
            plot_summary_h5(aggregates, output_dir)
            export_h5_csv(aggregates, output_dir / "h5_aggregates.csv")

    if len(summary) > 1:
        print("Generowanie wykresu podsumowującego...")
        plot_summary(summary, output_dir)

    print(f"\nGotowe! Wykresy zapisane w: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
