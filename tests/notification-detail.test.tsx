import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const pending: { id: string; signal: AbortSignal; flight: ReturnType<typeof deferred<any>> }[] = [];
let user: any = { uid: 'u', displayName: 'Tester' };
let authChange: (next: any) => void = () => undefined;
const notification = { id: 'notice', logId: 'target', type: 'like', isRead: true, senderName: 'Sender', senderId: 'other', createdAt: '2026-01-01' };
const log = (id: string) => ({ id, userId: 'author', userName: `Author ${id}`, userPhoto: '', timestamp: '2026-01-01', category: 'Others', exercises: [], note: '', likesCount: 0, commentsCount: 0 });
const api = {
  normalizeLog: (row: any) => row,
  getCurrentUser: () => user,
  waitForAuthReady: async () => undefined,
  onAuthStateChangedFn: (cb: typeof authChange) => { authChange = cb; return () => undefined; },
  subscribeToNotifications: (_uid: string, cb: (rows: any[]) => void) => { cb([notification]); return () => undefined; },
  markNotificationAsRead: async () => undefined,
};
(globalThis as any).__detailApi = api;
(globalThis as any).__detailClient = { from: (table: string) => {
  assert.equal(table, 'workout_logs');
  let id = '';
  let requestSignal: AbortSignal;
  const query = {
    select: (columns: string) => { assert.equal(columns, '*'); return query; },
    eq: (column: string, value: string) => { assert.equal(column, 'id'); id = value; return query; },
    abortSignal: (signal: AbortSignal) => { requestSignal = signal; return query; },
    maybeSingle: () => { const flight = deferred<any>(); pending.push({ id, signal: requestSignal, flight }); return flight.promise; },
  };
  return query;
} };
const events = new EventTarget();
const captureEvents = new EventTarget();
const documentEvents = new EventTarget();
const listeners = new Set<EventListenerOrEventListenerObject>();
// Model the browser's window capture -> document -> window bubble path.
function escapeKey() {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: 'Escape' });
  captureEvents.dispatchEvent(event);
  documentEvents.dispatchEvent(event);
  events.dispatchEvent(event);
  return event;
}
Object.defineProperty(globalThis, 'window', { configurable: true, value: {
  addEventListener: (type: string, cb: EventListenerOrEventListenerObject, capture?: boolean) => { if (type === 'keydown') listeners.add(cb); (capture ? captureEvents : events).addEventListener(type, cb); },
  removeEventListener: (type: string, cb: EventListenerOrEventListenerObject, capture?: boolean) => { listeners.delete(cb); (capture ? captureEvents : events).removeEventListener(type, cb); },
  innerHeight: 800,
} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { style: { overflow: 'auto' } }, activeElement: null,
  addEventListener: documentEvents.addEventListener.bind(documentEvents),
  removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
} });
Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class HTMLElement {} });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => '1' } });
const folder = await mkdtemp(`${process.cwd()}/tests/.notification-detail-`);
let tree: ReactTestRenderer | undefined;
const unmount = async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; };
try {
  const bundle = await build({
    stdin: { contents: `export { default as Detail } from './src/components/WorkoutDetailModal'; export { default as App } from './src/App'; export { consumeBack, pushBackHandler } from './src/backStack'; export { default as Share } from './src/components/SharePosterModal'; export { default as Edit } from './src/components/EditWorkoutModal'; export { getWorkoutLogDetail } from './src/utils/workoutDetail';`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external',
    plugins: [{ name: 'io', setup(builder) {
      builder.onResolve({ filter: /(^|\/)api$/ }, () => ({ path: 'api', namespace: 'mock' }));
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'mock' }));
      builder.onResolve({ filter: /(^|\/)native$/ }, () => ({ path: 'native', namespace: 'mock' }));
      builder.onResolve({ filter: /\/(Feed|Profile|Statistics|AuthScreen|SplashAnimation)$/ }, () => ({ path: 'unused', namespace: 'mock' }));
      builder.onResolve({ filter: /\/WorkoutLogger$/ }, () => ({ path: 'session', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'api'
        ? `const api = globalThis.__detailApi; ${['normalizeLog', 'getCurrentUser', 'waitForAuthReady', 'onAuthStateChangedFn', 'subscribeToNotifications', 'markNotificationAsRead', 'markAllNotificationsAsRead', 'deleteNotification', 'fetchNotifications', 'logout', 'toggleLike', 'checkUserLike', 'subscribeToComments', 'addComment', 'getUserProfile', 'deleteWorkoutLog'].map(name => `export const ${name} = (...args) => api.${name}(...args);`).join('\n')}`
        : path === 'client' ? `export const supabase = globalThis.__detailClient; export const supabaseConfigError = null;`
        : path === 'session' ? `import React from 'react'; export default () => null; export const WorkoutSession = ({ editing }) => React.createElement('button', { 'aria-label': '模拟保存中', onClick: () => editing.onBusy(true) }, '保存');`
        : path === 'native' ? `export const shareImageDataUrl = async () => {}; export const hideSplash = async () => {}; export const exitApp = async () => {}; export const listenAndroidBack = () => () => {};`
        : `export default () => null;`, loader: 'js', resolveDir: process.cwd() }));
    } }],
  });
  const file = `${folder}/components.mjs`;
  await writeFile(file, bundle.outputFiles[0].text);
  const { Detail, App, Share, Edit, consumeBack, pushBackHandler, getWorkoutLogDetail } = await import(pathToFileURL(file).href);
  const render = async (node: React.ReactElement) => { await act(async () => { tree = create(node, { createNodeMock: element => element.type === 'dialog' ? {
    showModal: () => undefined, close: () => undefined, style: { setProperty: () => undefined },
  } : null }); }); };
  const text = () => JSON.stringify(tree!.toJSON());
  const close = () => tree!.root.findByProps({ 'aria-label': '关闭训练详情' });
  const resolve = async (index: number, value: any) => { await act(async () => pending[index].flight.resolve({ data: value, error: null })); };
  let closed = 0;
  const onClose = () => { closed++; };
  await render(<Detail logId="A" accountId="u" onClose={onClose} />);
  assert.match(text(), /加载训练详情/);
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(listeners.size, 1);
  await act(async () => { tree!.update(<Detail logId="B" accountId="u" onClose={onClose} />); });
  assert.equal(pending[0].signal.aborted, true);
  await resolve(1, log('B'));
  assert.match(text(), /Author B/); // the real LogCard, not a stub
  await resolve(0, log('A'));
  assert.doesNotMatch(text(), /Author A/);
  await act(async () => tree!.update(<Detail logId="B" accountId="other" onClose={onClose} />));
  assert.doesNotMatch(text(), /Author B/);
  await resolve(2, null);
  assert.match(text(), /不存在或暂不可访问/);
  await act(async () => tree!.update(<Detail logId="C" accountId="other" onClose={onClose} />));
  await act(async () => pending[3].flight.reject(new Error('offline')));
  assert.match(text(), /加载失败/);
  await act(async () => tree!.root.findAllByType('button').find(button => button.children.includes('重试'))!.props.onClick());
  await resolve(4, log('C'));
  assert.match(text(), /Author C/);
  await act(async () => tree!.update(<Detail logId="D" accountId="other" onClose={onClose} />));
  await act(async () => close().props.onClick());
  assert.equal(pending[5].signal.aborted, true, 'close aborts even before unmount');
  await resolve(5, log('D'));
  assert.doesNotMatch(text(), /Author D/);
  await unmount();
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(listeners.size, 0);
  assert.equal(consumeBack(), false);
  await render(<Detail logId="E" accountId="u" onClose={onClose} />);
  await act(async () => assert.equal(consumeBack(), true));
  assert.equal(pending[6].signal.aborted, true);
  assert.equal(closed, 2);
  await unmount();
  await resolve(6, log('E')); // late unmounted response

  // Real nested modal handlers and the real back stack; no Escape/cancel stubs.
  // A synchronous document listener removing its handler must not expose the
  // parent to the *same* keydown at window bubble.
  let nestedClosed = 0;
  await render(<Detail logId="nested" accountId="u" onClose={onClose} />);
  const parentClosed = closed;
  const removeNested = pushBackHandler(() => { nestedClosed++; return true; });
  const closeSynchronously = () => { nestedClosed++; removeNested(); };
  document.addEventListener('keydown', closeSynchronously);
  await act(async () => { escapeKey(); });
  document.removeEventListener('keydown', closeSynchronously);
  assert.equal(nestedClosed, 1);
  assert.equal(closed, parentClosed, 'same Escape cannot close a newly exposed parent');
  await unmount();

  function Nested({ kind, parentClose = onClose }: { kind: 'share' | 'edit' | null; parentClose?: () => void }) {
    const [open, setOpen] = React.useState(true);
    return <><Detail logId="nested" accountId="u" onClose={parentClose} />{open && kind && (kind === 'share'
      ? <Share log={log('share')} userStats={null} onClose={() => setOpen(false)} />
      : <Edit log={{ ...log('edit'), userId: 'u' }} onSuccess={() => undefined} onClose={() => setOpen(false)} />)}</>;
  }
  await render(<Nested kind="share" />);
  await act(async () => { escapeKey(); });
  assert.equal(tree!.root.findAllByType(Share).length, 0, 'real share document Escape closes share');
  assert.equal(closed, parentClosed, 'share Escape preserves detail');
  await act(async () => { escapeKey(); });
  assert.equal(closed, parentClosed + 1, 'next Escape closes detail');
  await unmount();

  await render(<Nested kind="edit" />);
  // Browsers deliver dialog cancel as the default action of an uncancelled
  // Escape keydown. Exercise the real WorkoutSheet cancel/busy guard.
  const cancelEdit = () => {
    const event = escapeKey();
    assert.equal(event.defaultPrevented, false, 'parent must not suppress native dialog cancel');
    const cancel = new Event('cancel', { cancelable: true });
    tree!.root.findByType('dialog').props.onCancel(cancel);
    assert.equal(cancel.defaultPrevented, true);
  };
  await act(async () => tree!.root.findByProps({ 'aria-label': '模拟保存中' }).props.onClick());
  await act(async () => tree!.update(<Nested kind="edit" parentClose={() => onClose()} />));
  await act(async () => { cancelEdit(); });
  assert.equal(tree!.root.findAllByType(Edit).length, 1, 'busy editor remains open');
  assert.equal(closed, parentClosed + 1, 'busy edit Escape cannot bypass into parent');
  await act(async () => { assert.equal(consumeBack(), true); });
  assert.equal(tree!.root.findAllByType(Edit).length, 1, 'busy editor consumes Android back without closing parent');
  assert.equal(closed, parentClosed + 1);
  // Remove the editor first, mirroring its own lifecycle, then its parent.
  await act(async () => tree!.update(<Nested kind={null} />));
  await unmount();

  for (const kind of ['share', 'edit'] as const) {
    await render(<Nested kind={kind} />);
    const beforeBack = closed;
    await act(async () => { assert.equal(consumeBack(), true); });
    assert.equal(tree!.root.findAllByType(kind === 'share' ? Share : Edit).length, 0);
    assert.equal(closed, beforeBack, `${kind} Android back preserves parent`);
    await act(async () => { assert.equal(consumeBack(), true); });
    assert.equal(closed, beforeBack + 1);
    await unmount();
  }
  const beforeIdleCancel = closed;
  await render(<Nested kind="edit" />);
  await act(async () => { cancelEdit(); });
  assert.equal(tree!.root.findAllByType(Edit).length, 0, 'idle native cancel closes editor only');
  assert.equal(closed, beforeIdleCancel);
  await unmount();
  assert.equal(consumeBack(), false, 'all nested registrations cleaned up');

  // Data layer is real; raw client query is the only mocked boundary.
  for (const code of ['42501', 'PGRST116']) {
    const promise = getWorkoutLogDetail('hidden');
    pending.at(-1)!.flight.resolve({ data: null, error: { code } });
    assert.equal(await promise, null);
  }
  const controller = new AbortController();
  const cancelled = getWorkoutLogDetail('cancel', { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled);
  assert.equal(pending.at(-1)!.signal.aborted, true);
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((cb: any, ms: number, ...args: any[]) => originalTimeout(cb, ms === 9000 ? 5 : ms, ...args)) as typeof setTimeout;
  try {
    await assert.rejects(getWorkoutLogDetail('timeout'), { name: 'TimeoutError' });
    assert.equal(pending.at(-1)!.signal.aborted, true);
  } finally { globalThis.setTimeout = originalTimeout; }

  await render(<App />);
  await act(async () => tree!.root.findByProps({ title: '消息通知' }).props.onClick());
  const item = tree!.root.findAll(node => typeof node.props.onClick === 'function' && node.props.className?.includes('relative') && node.props.className?.includes('p-3 border-2'))[0];
  assert.ok(item, 'real notification item is rendered');
  await act(async () => { await item.props.onClick(); });
  assert.equal(pending.at(-1)!.id, 'target', 'App forwards notification logId to detail query');
  const target = pending.length - 1;
  await resolve(target, log('target'));
  assert.match(text(), /Author target/);
  await act(async () => { user = { uid: 'new' }; authChange(user); });
  assert.doesNotMatch(text(), /Author target/);
  assert.equal(tree!.root.findAllByProps({ role: 'dialog' }).length, 0);
  await act(async () => { await item.props.onClick(); });
  assert.equal(tree!.root.findAllByProps({ role: 'dialog' }).length, 0, 'old notification handler cannot open detail for a new account');
  await act(async () => tree!.root.findByProps({ title: '消息通知' }).props.onClick());
  const newItem = tree!.root.findAll(node => typeof node.props.onClick === 'function' && node.props.className?.includes('relative') && node.props.className?.includes('p-3 border-2'))[0];
  await act(async () => { await newItem.props.onClick(); });
  const inFlight = pending.length - 1;
  await act(async () => { user = { uid: 'third' }; authChange(user); });
  assert.equal(pending[inFlight].signal.aborted, true);
  await resolve(inFlight, log('old-account-secret'));
  assert.doesNotMatch(text(), /old-account-secret/);
  await act(async () => tree!.root.findByProps({ title: '消息通知' }).props.onClick());
  const thirdItem = tree!.root.findAll(node => typeof node.props.onClick === 'function' && node.props.className?.includes('relative') && node.props.className?.includes('p-3 border-2'))[0];
  await act(async () => { await thirdItem.props.onClick(); });
  const escapeFlight = pending.length - 1;
  await act(async () => { escapeKey(); });
  assert.equal(tree!.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(pending[escapeFlight].signal.aborted, true);
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(listeners.size, 0);
  await resolve(escapeFlight, log('closed-secret'));
  assert.doesNotMatch(text(), /closed-secret/);
  await unmount();
  console.log('notification detail tests passed');
} finally {
  await unmount();
  await rm(folder, { recursive: true, force: true });
}
