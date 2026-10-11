import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Bundle the real components, replacing only I/O boundaries and the poster tool.
// No production client is initialized and no network request can escape the harness.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const dashboards = new Map<string, (data: any) => void>();
const logs = new Map<string, (data: any[]) => void>();
const dashboardErrors = new Map<string, (error: Error) => void>();
let delayTeamSubscriptions = false;
const refreshes: ReturnType<typeof deferred<any>>[] = [];
let profile = deferred<any>();
const data = (count: number) => ({ todayCheckinCount: count, totalMembers: 9, attendanceRate: count, members: [] });
const log = { id: 'log', userId: 'u', userName: 'Tester', userPhoto: '', timestamp: '2026-01-01', category: 'Others', exercises: [], note: '', likesCount: 0, commentsCount: 0, isLiked: false };
const api = {
  getCurrentUser: () => ({ uid: 'u' }),
  getUserProfile: () => profile.promise,
  subscribeToUserTeams: (_uid: string, cb: (teams: any[]) => void) => {
    cb(['A', 'B'].map(id => ({ id, name: `Team ${id}`, code: id, createdBy: 'u', maxMembers: 10 })));
    return () => undefined;
  },
  subscribeToTeamDashboard: (id: string, cb: (value: any) => void, onError: (error: Error) => void) => { dashboards.set(id, cb); dashboardErrors.set(id, onError); if (!delayTeamSubscriptions) cb(data(id === 'A' ? 1 : 2)); return () => undefined; },
  subscribeToTeamWorkoutLogs: (id: string, cb: (value: any[]) => void) => { logs.set(id, cb); if (!delayTeamSubscriptions) cb([log]); return () => undefined; },
  getTeamDashboard: () => { const pending = deferred<any>(); refreshes.push(pending); return pending.promise; },
  toggleLike: async () => undefined,
};
(globalThis as any).__reviewApi = api;
const events = new EventTarget();
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  setTimeout: (cb: () => void, ms: number) => { const timer = setTimeout(cb, ms); timer.unref(); return timer; },
} });
let copies = 0;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { copies++; } } } });
const folder = await mkdtemp(`${process.cwd()}/tests/.review-ui-`);
let tree: ReactTestRenderer | undefined;
const unmount = async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; };
try {
  const result = await build({
    stdin: { contents: `export { ExportDataPage } from './src/components/ExportDataPage'; export { default as LogCard } from './src/components/LogCard'; export { default as TeamDashboard } from './src/components/TeamDashboard'; export { ToastProvider } from './src/components/Toast';`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external',
    plugins: [{ name: 'io-boundaries', setup(builder) {
      builder.onResolve({ filter: /(^|\/)api$/ }, () => ({ path: 'api', namespace: 'review' }));
      builder.onResolve({ filter: /SharePosterModal$/ }, () => ({ path: 'poster', namespace: 'review' }));
      builder.onResolve({ filter: /EditWorkoutModal$/ }, () => ({ path: 'edit', namespace: 'review' }));
      builder.onResolve({ filter: /TeamModals$/ }, () => ({ path: 'modals', namespace: 'review' }));
      builder.onLoad({ filter: /.*/, namespace: 'review' }, ({ path }) => ({ contents: path === 'api'
        ? `const api = globalThis.__reviewApi; ${['getUserTeams', 'subscribeToUserTeams', 'getTeamDashboard', 'subscribeToTeamDashboard', 'subscribeToTeamWorkoutLogs', 'leaveTeam', 'getCurrentUser', 'toggleLike', 'checkUserLike', 'subscribeToComments', 'addComment', 'getUserProfile', 'deleteWorkoutLog', 'fetchAllMyWorkoutLogsForExport'].map(name => `export const ${name} = (...args) => api.${name}(...args);`).join('\n')}`
        : path === 'poster' ? `import React from 'react'; export default function Poster({onClose}) { return React.createElement('button', {'data-testid': 'close-poster', onClick: onClose}, 'Close'); }`
        : path === 'edit' ? `export default () => null;` : `export const CreateTeamModal = () => null; export const JoinTeamModal = () => null;`, loader: 'js', resolveDir: process.cwd() }));
    } }],
  });
  const file = `${folder}/components.mjs`;
  await writeFile(file, result.outputFiles[0].text);
  const { ExportDataPage, LogCard, TeamDashboard, ToastProvider } = await import(pathToFileURL(file).href);
  const button = (id: string) => tree!.root.findByProps({ 'data-testid': id });
  const render = async (element: React.ReactElement) => { await act(async () => { tree = create(element); }); };

  const load = deferred<any[]>();
  const save = deferred<any>();
  await render(<ToastProvider><ExportDataPage user={{ id: 'u' }} onBack={() => undefined} loadLogs={() => load.promise} exportService={{ saveExportFile: () => save.promise, shareExportFile: async () => ({ status: 'shared' }) }} /></ToastProvider>);
  assert.equal(button('export-copy-text').props.disabled, true);
  await act(async () => { await button('export-copy-text').props.onClick(); });
  assert.equal(copies, 0, 'loading handler cannot copy incomplete data');
  await act(async () => { load.reject(new Error('offline')); });
  assert.equal(button('export-copy-text').props.disabled, true);
  await act(async () => { await button('export-copy-text').props.onClick(); });
  assert.equal(copies, 0, 'failed handler cannot copy incomplete data');
  await unmount();
  await render(<ToastProvider><ExportDataPage user={{ id: 'u' }} onBack={() => undefined} loadLogs={async () => []} exportService={{ saveExportFile: () => save.promise, shareExportFile: async () => ({ status: 'shared' }) }} /></ToastProvider>);
  assert.equal(button('export-copy-text').props.disabled, false);
  await act(async () => { await button('export-copy-text').props.onClick(); });
  assert.equal(copies, 1, 'ready empty history is valid');
  await act(async () => { button('export-save-json').props.onClick(); });
  assert.equal(button('export-copy-text').props.disabled, true);
  await act(async () => { await button('export-copy-text').props.onClick(); });
  assert.equal(copies, 1, 'copy blocked while save pending');
  await act(async () => { save.resolve({ status: 'cancelled' }); });
  assert.equal(button('export-copy-text').props.disabled, false);
  await unmount();

  for (const fails of [false, true]) {
    profile = deferred<any>();
    await render(<LogCard log={log} />);
    await act(async () => { tree!.root.findByProps({ title: '生成打卡海报' }).props.onClick(); });
    assert.equal(tree!.root.findAllByProps({ 'data-testid': 'close-poster' }).length, 1);
    await act(async () => { button('close-poster').props.onClick(); });
    await act(async () => { if (fails) profile.reject(new Error('offline')); else profile.resolve({ streak: 3, totalWorkouts: 8 }); });
    assert.equal(tree!.root.findAllByProps({ 'data-testid': 'close-poster' }).length, 0, 'late profile success/failure never reopens closed modal');
    await unmount();
  }

  await render(<TeamDashboard />);
  const card = () => tree!.root.findByType(LogCard);
  const checkins = (count: number) => tree!.root.findAll(n => n.type === 'span' && n.children.join('') === `${count} / 9 人已打卡`).length > 0;
  await act(async () => { card().props.onLogUpdated(); });
  const staleCallback = card().props.onLogUpdated;
  const switchTo = async (name: string) => {
    await act(async () => { tree!.root.findAllByType('button').find(n => n.props.className?.includes('text-base sm:text-lg'))!.props.onClick(); });
    await act(async () => { tree!.root.findAllByType('button').find(n => n.props.className?.includes('w-full text-left') && JSON.stringify(n.children.map(c => typeof c === 'string' ? c : c.props.children)).includes(name))!.props.onClick(); });
  };
  await switchTo('Team B');
  await act(async () => { staleCallback(); refreshes[0].resolve(data(7)); });
  assert.equal(refreshes.length, 1, 'stale card callback cannot refresh another team');
  assert.ok(checkins(2), 'late A response cannot replace B');
  await switchTo('Team A');
  const returnedLog = card().props.log;
  await act(async () => { staleCallback({ id: log.id, note: 'obsolete first A edit' }); });
  assert.equal(refreshes.length, 1, 'first A card callback cannot refresh after A→B→A');
  assert.equal(card().props.log, returnedLog, 'first A card callback cannot mutate current A log');
  await act(async () => { logs.get('A')!([log]); });
  assert.equal(card().props.log.note, '', 'stale edit must not enter optimistic reconciliation cache');
  await act(async () => { card().props.onLogUpdated(); card().props.onLogUpdated(); });
  await act(async () => { refreshes[2].resolve(data(4)); refreshes[1].resolve(data(8)); });
  assert.ok(checkins(4), 'latest same-team generation wins');
  await act(async () => { card().props.onLogUpdated(); dashboards.get('A')!(data(5)); });
  await act(async () => { refreshes[3].resolve(data(8)); });
  assert.ok(checkins(5), 'fresh subscription invalidates pending refresh');
  await act(async () => { card().props.onLogUpdated(); });
  await switchTo('Team B');
  await switchTo('Team A');
  await act(async () => { refreshes[4].resolve(data(8)); });
  assert.ok(checkins(1), 'A→B→A invalidates the first A request even though team id matches again');
  await act(async () => { card().props.onLogUpdated(); });
  await act(async () => { refreshes[5].reject(new Error('refresh offline')); });
  assert.ok(checkins(1), 'refresh rejection preserves existing dashboard');
  assert.ok(JSON.stringify(tree!.toJSON()).includes('refresh offline'), 'current refresh rejection is surfaced');
  await act(async () => { card().props.onLogUpdated(); });
  await unmount();
  await act(async () => { refreshes[6].resolve(data(8)); });

  // A subscription remains callable after unsubscribe: delayed delivery must be isolated.
  delayTeamSubscriptions = true;
  await render(<TeamDashboard />);
  const memberData = { ...data(3), members: [{ userId: 'a-member', role: 'member', hasCheckedInToday: true, profile: { displayName: 'Only A Member' } }] };
  const firstADashboard = dashboards.get('A')!;
  const firstALogs = logs.get('A')!;
  await act(async () => { firstADashboard(memberData); firstALogs([{ ...log, note: 'Only A Log' }]); });
  assert.ok(checkins(3));
  assert.ok(JSON.stringify(tree!.toJSON()).includes('Only A Member'));
  await switchTo('Team B');
  const assertNoA = () => {
    assert.ok(!checkins(3), 'pending/failed B cannot display A attendance');
    assert.ok(!JSON.stringify(tree!.toJSON()).includes('Only A Member'), 'pending/failed B cannot display A member');
    assert.equal(tree!.root.findAllByType(LogCard).length, 0, 'pending/failed B cannot display A logs');
  };
  assertNoA();
  await act(async () => { firstADashboard(memberData); firstALogs([{ ...log, note: 'late A log' }]); });
  assertNoA();
  await act(async () => { dashboardErrors.get('B')!(new Error('B subscription offline')); });
  assertNoA();
  assert.ok(JSON.stringify(tree!.toJSON()).includes('B subscription offline'));
  await act(async () => { dashboards.get('B')!(data(2)); logs.get('B')!([{ ...log, note: 'Current B Log' }]); });
  assert.ok(checkins(2));
  assert.equal(card().props.log.note, 'Current B Log');
  await switchTo('Team A');
  await act(async () => { firstADashboard(memberData); firstALogs([log]); });
  assertNoA();
  await act(async () => { dashboards.get('A')!(data(6)); logs.get('A')!([{ ...log, note: 'Current A Log' }]); });
  assert.ok(checkins(6), 'only current A subscription may publish after returning');
  assert.equal(card().props.log.note, 'Current A Log');
  await unmount();
  console.log('PASS real UI: export copy guards; share close survives deferred result; team identity/generation guards; delayed subscription isolation');
} finally {
  await unmount();
  await rm(folder, { recursive: true, force: true });
  delete (globalThis as any).__reviewApi;
}
