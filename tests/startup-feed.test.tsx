import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const events = new EventTarget();
const storage = new Map<string, string>();
const localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) };
Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
Object.defineProperty(globalThis, 'window', { value: {
  localStorage, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  dispatchEvent: events.dispatchEvent.bind(events), setTimeout, clearTimeout, scrollY: 0,
}, configurable: true });
const { supabase } = await import('../src/lib/supabase');
const { default: Feed } = await import('../src/components/Feed');
supabase.channel = (() => { const ch = { on: () => ch, subscribe: () => ch }; return ch; }) as any;
supabase.removeChannel = async () => 'ok';
let count = 0;
let mode: 'hang' | 'empty' | 'content' | 'fail' = 'hang';
let resolveOld: ((v: any) => void) | undefined;
let oldSignal: AbortSignal | undefined;
const row = { id: 'current', user_id: 'user', user_name: 'Tester', created_at: new Date().toISOString(), category: 'Others', exercises: [], note: 'Fresh content', likes_count: 0 };
supabase.from = (() => {
  const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
    abortSignal: (signal: AbortSignal) => {
      count++;
      if (mode === 'hang') { oldSignal = signal; return new Promise(r => { resolveOld = r; }); }
      return Promise.resolve(mode === 'fail' ? { error: new Error('offline'), data: null } : { error: null, data: mode === 'empty' ? [] : [row] });
    } };
  return q;
}) as any;
let tree: ReactTestRenderer;
const state = () => tree.root.findAll(n => n.props['data-state'])[0].props['data-state'];
const retry = () => tree.root.findAllByType('button').find(n => /重新加载|重试/.test(n.children.join('')))!.props.onClick();
try {
  await act(async () => { tree = create(<Feed />); });
  assert.equal(state(), 'loading');
  assert.equal(count, 1);
  mode = 'empty';
  await act(async () => { retry(); await new Promise(r => setTimeout(r, 5)); });
  assert.equal(oldSignal?.aborted, true, 'manual retry actually aborts the initial SDK query');
  assert.equal(state(), 'empty', 'empty retry ends skeletons');
  assert.equal(tree!.root.findAll(n => /animate-pulse/.test(n.props.className || '')).length, 0);
  await act(async () => { resolveOld?.({ data: [row], error: null }); await new Promise(r => setTimeout(r, 5)); });
  assert.equal(state(), 'empty', 'late initial result cannot overwrite empty retry');
  mode = 'content';
  const before = count;
  await act(async () => {
    events.dispatchEvent(new Event('online'));
    events.dispatchEvent(new Event('focus'));
    events.dispatchEvent(new Event('online'));
    await new Promise(r => setTimeout(r, 5));
  });
  assert.equal(count, before + 1, 'recovery burst makes exactly one read');
  assert.equal(state(), 'success');
  mode = 'fail';
  await act(async () => {
    await new Promise(r => setTimeout(r, 1010));
    events.dispatchEvent(new Event('online'));
    await new Promise(r => setTimeout(r, 5));
  });
  assert.equal(state(), 'error');
  assert.ok(JSON.stringify(tree!.toJSON()).includes('Fresh content'), 'background failure retains content');
  await act(async () => { tree!.unmount(); });
  storage.clear();
  (globalThis.navigator as any).onLine = false;
  mode = 'fail';
  await act(async () => { tree = create(<Feed />); await new Promise(r => setTimeout(r, 5)); });
  assert.equal(state(), 'offline');
  assert.ok(JSON.stringify(tree!.toJSON()).includes('联网后重试'));
  await act(async () => { tree!.unmount(); });
  storage.clear();
  (globalThis.navigator as any).onLine = true;
  mode = 'hang';
  await act(async () => { tree = create(<Feed />); });
  assert.equal(state(), 'loading');
  mode = 'empty';
  await act(async () => {
    events.dispatchEvent(new Event('online'));
    events.dispatchEvent(new Event('focus'));
    await new Promise(r => setTimeout(r, 5));
  });
  assert.equal(oldSignal?.aborted, true, 'network recovery aborts a pre-offline hung read');
  assert.equal(state(), 'empty', 'recovery returning empty also ends skeletons');
  console.log('PASS actual Feed: hung→retry/recovery empty, cancellation, late response, recovery dedup, cached failure, offline empty');
} finally {
  await act(async () => { tree?.unmount(); });
  await supabase.removeAllChannels();
}
