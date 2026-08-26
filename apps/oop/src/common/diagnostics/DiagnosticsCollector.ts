import { monitorEventLoopDelay, PerformanceObserver } from 'perf_hooks';
import type { IntervalHistogram } from 'perf_hooks';

let eldHistogram: IntervalHistogram;
let gcCount = 0;
let gcTotalMs = 0;

export const initDiagnosticsCollector = (): void => {
  eldHistogram = monitorEventLoopDelay({ resolution: 10 });
  eldHistogram.enable();

  try {
    const gcObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        gcCount++;
        gcTotalMs += entry.duration;
      }
    });
    gcObserver.observe({ entryTypes: ['gc'] });
  } catch {
    // gc entry type unavailable in this runtime
  }
};

/**
 * Zeruje liczniki, zeby snapshot obejmowal WYLACZNIE okno pomiaru.
 *
 * Bez tego `gcCount`, `gcTotalMs` i histogram opoznienia petli zdarzen sa
 * kumulatywne od startu procesu, a `compare.py` raportowalo prace odsmiecacza
 * z calego zycia kontenera zamiast z mierzonego przebiegu. Przy roznym wieku
 * procesow obu aplikacji (zdarzalo sie 6 h wobec 24 h) czynilo to metryki
 * pamieciowe — czyli podstawe hipotezy H5 — bezwartosciowymi.
 *
 * Wywolywane przez run_single.sh po fazie rozgrzewki, tuz przed pomiarem.
 */
export const resetDiagnostics = (): void => {
  gcCount = 0;
  gcTotalMs = 0;
  if (eldHistogram) {
    eldHistogram.reset();
  }
};

const toMb   = (bytes: number): number => Math.round(bytes / 1024 / 1024 * 100) / 100;
// Bezposrednio po eldHistogram.reset() histogram nie ma jeszcze zadnej probki,
// wiec .mean/.percentile/.max zwracaja NaN, ktore JSON.stringify zamienia na null.
// compare.py traktuje te pola jako liczby, wiec null wpadalby do agregacji jako
// wartosc nieokreslona. Zwracamy 0 do czasu pojawienia sie pierwszej probki
// (histogram probkuje co 10 ms, wiec okno jest pomijalne wobec okna pomiaru).
const nsToMs = (ns: number): number => (Number.isFinite(ns) ? Math.round(ns / 1e6 * 1000) / 1000 : 0);

export type DiagnosticsSnapshot = {
  eventLoop: { lagMeanMs: number; lagP99Ms: number; lagMaxMs: number };
  memory:    { heapUsedMb: number; heapTotalMb: number; externalMb: number; rssMb: number };
  gc:        { count: number; totalPauseMs: number };
  process:   { uptimeSeconds: number };
};

export const getDiagnosticsSnapshot = (): DiagnosticsSnapshot => {
  const mem = process.memoryUsage();
  return {
    eventLoop: {
      lagMeanMs: eldHistogram ? nsToMs(eldHistogram.mean) : 0,
      lagP99Ms:  eldHistogram ? nsToMs(eldHistogram.percentile(99)) : 0,
      lagMaxMs:  eldHistogram ? nsToMs(eldHistogram.max) : 0,
    },
    memory: {
      heapUsedMb:  toMb(mem.heapUsed),
      heapTotalMb: toMb(mem.heapTotal),
      externalMb:  toMb(mem.external),
      rssMb:       toMb(mem.rss),
    },
    gc: {
      count:        gcCount,
      totalPauseMs: Math.round(gcTotalMs * 1000) / 1000,
    },
    process: {
      uptimeSeconds: Math.round(process.uptime() * 100) / 100,
    },
  };
};
