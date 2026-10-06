// Local diagnostic timings only: no user IDs, tokens, or remote telemetry.
export type StageTiming = { stage: string; durationMs: number; outcome: string };
const timings: StageTiming[] = [];
export const getStartupTimings = () => timings.slice();
export function markPageReady(stage: 'login-page-ready' | 'app-frame-ready') {
  const timing = { stage, durationMs: Math.round(performance.now()), outcome: 'ready' };
  timings.push(timing);
  console.info('[fitgroup:timing]', timing);
}
export function startStage(stage: string) {
  const start = performance.now();
  return (outcome = 'success') => {
    const timing = { stage, durationMs: Math.round(performance.now() - start), outcome };
    timings.push(timing);
    if (timings.length > 50) timings.shift();
    console.info('[fitgroup:timing]', timing);
  };
}
