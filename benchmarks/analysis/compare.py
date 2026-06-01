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


def parse_k6(path: Path) -> dict:
    """Parsuj k6 JSONL — zwróć zagregowane metryki HTTP."""
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
            if m == "http_req_duration":
                durations.append(v)
                req_times.append(rec["data"]["time"])
            elif m == "http_req_waiting":
                waiting.append(v)
            elif m == "http_req_failed":
                failed.append(v)

    if not durations:
        return {}

    arr = np.array(durations)
    times = [datetime.fromisoformat(t) for t in req_times]
    span = (max(times) - min(times)).total_seconds()
    rps = len(durations) / span if span > 0 else float(len(durations))
    err = sum(1 for v in failed if v > 0) / len(failed) * 100 if failed else 0.0

    return {
        "count": len(durations),
        "avg": float(np.mean(arr)),
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
    result["gc_pause_total"] = float(data["gc_pause"][-1]) if data["gc_pause"] else 0.0
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
# Tabela konsolowa
# ─────────────────────────────────────────────────────────────────────────────

_W = 66


def _trow(label, fv, ov, fmt=".2f"):
    fs = f"{fv:{fmt}}" if fv is not None else "—"
    os_ = f"{ov:{fmt}}" if ov is not None else "—"
    d = ""
    if fv is not None and ov is not None and ov != 0:
        pct = (fv - ov) / abs(ov) * 100
        d = f"{pct:+.1f}%"
    print(f"│  {label:<26} {fs:>14} {os_:>14} {d:>8}  │")


def _tsep():
    print(f"├{'─'*_W}┤")


def print_table(scenario, profile, fk, ok, fd, od, fdiag, odiag):
    scen = SCENARIO_LABELS.get(scenario, scenario)
    prof = PROFILE_LABELS.get(profile, profile)
    print(f"\n┌{'─'*_W}┐")
    print(f"│  {scen}  —  Profil {prof}".ljust(_W + 1) + "│")
    _tsep()
    print(f"│  {'Metryka':<26} {'Functional':>14} {'OOP':>14} {'Δ':>8}  │")
    _tsep()
    _trow("avg latency (ms)", fk.get("avg"), ok.get("avg"))
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
    print(f"└{'─'*_W}┘\n")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers wykresów
# ─────────────────────────────────────────────────────────────────────────────


def _bar_group(ax, x_labels, f_vals, o_vals, ylabel, title):
    x, w = np.arange(len(x_labels)), 0.35
    b1 = ax.bar(x - w / 2, f_vals, w, label="Functional", color=FUNC_COLOR, alpha=0.85)
    b2 = ax.bar(x + w / 2, o_vals, w, label="OOP", color=OOP_COLOR, alpha=0.85)
    ax.set_ylabel(ylabel)
    ax.set_title(title, fontsize=11)
    ax.set_xticks(x)
    ax.set_xticklabels(x_labels)
    ax.legend(loc="upper left", fontsize=9)
    ax.bar_label(b1, fmt="%.1f", padding=2, fontsize=8)
    ax.bar_label(b2, fmt="%.1f", padding=2, fontsize=8)
    m = max(max(f_vals, default=0), max(o_vals, default=0))
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

    if len(summary) > 1:
        print("Generowanie wykresu podsumowującego...")
        plot_summary(summary, output_dir)

    print(f"\nGotowe! Wykresy zapisane w: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
