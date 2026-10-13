import { performance } from 'node:perf_hooks';
import { getStatisticsAnalysisLogs, type StatisticsSnapshot } from '../src/utils/statisticsData';
import type { WorkoutLog } from '../src/types';

// Isolate evidence preparation during repeated recent refreshes with unchanged history.
// No network, DOM, render time, or device performance is measured here.
const now = Date.parse('2026-10-14T12:00:00Z');
const make = (i: number, age: number): WorkoutLog => ({ id: `log${i}`, userId: 'bench', userName: '', userPhoto: '', timestamp: new Date(now - age * 86400000).toISOString(), category: 'Chest', exercises: [{ id: `e${i}`, name: '卧推', type: 'strength', weight: 40 + i % 60, sets: 3, reps: 8 }], likesCount: 0, commentsCount: 0 });
const history = Array.from({ length: 5000 }, (_, i) => make(i, 100 + i % 1000));
const body = { sex: 'male' as const, bodyweightKg: 75 };
const sample = (i: number): StatisticsSnapshot => ({ recentLogs: [make(6000 + i, 1)], history, logs: history, historyReady: true, updatedAt: now + i });
const cold = performance.now(); getStatisticsAnalysisLogs(sample(0), body);
const firstMs = performance.now() - cold;
const timings = Array.from({ length: 50 }, (_, i) => {
  const start = performance.now(); getStatisticsAnalysisLogs(sample(i + 1), body); return performance.now() - start;
}).sort((a, b) => a - b);
console.log(JSON.stringify({ historyRows: history.length, refreshes: 50, firstMs: +firstMs.toFixed(3), refreshMedianMs: +timings[25].toFixed(3), refreshP95Ms: +timings[47].toFixed(3) }));
