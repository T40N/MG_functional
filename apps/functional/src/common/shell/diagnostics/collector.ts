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

const toMb  = (bytes: number): number => Math.round(bytes / 1024 / 1024 * 100) / 100;
const nsToMs = (ns: number): number   => Math.round(ns / 1e6 * 1000) / 1000;

export type TDiagnosticsSnapshot = {
  eventLoop: { lagMeanMs: number; lagP99Ms: number; lagMaxMs: number };
  memory:    { heapUsedMb: number; heapTotalMb: number; externalMb: number; rssMb: number };
  gc:        { count: number; totalPauseMs: number };
  process:   { uptimeSeconds: number };
};

export const getDiagnosticsSnapshot = (): TDiagnosticsSnapshot => {
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
