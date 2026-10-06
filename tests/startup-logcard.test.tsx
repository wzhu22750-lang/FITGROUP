import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { supabase } = await import('../src/lib/supabase');
const { waitForAuthReady, logout } = await import('../src/api');
const { default: LogCard } = await import('../src/components/LogCard');
const user = { id: 'like-user', user_metadata: {}, email: 'likes@example.test' };
supabase.auth.getSession = async () => ({ data: { session: { user } }, error: null }) as any;
supabase.auth.signOut = async () => ({ error: null });
supabase.rpc = (() => ({ abortSignal: () => Promise.resolve({ data: { id: user.id, display_name: 'Likes', photo_url: '' }, error: null }) })) as any;
await waitForAuthReady();
let checks = 0;
let deletes = 0;
supabase.from = ((table: string) => {
  const q: any = { select: () => { if (table === 'workout_likes') checks++; return q; }, eq: () => q, abortSignal: () => q,
    maybeSingle: () => Promise.resolve({ data: { id: 'log', user_id: user.id }, error: null }),
    delete: () => { deletes++; return q; }, then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve) };
  return q;
}) as any;
let tree: ReactTestRenderer;
try {
  await act(async () => { tree = create(<>{[0, 1, 2, 3, 4].map(i => <LogCard key={i} log={{ id: String(i), userId: 'other', userName: 'Author', userPhoto: '', timestamp: new Date().toISOString(), category: 'Others', exercises: [], note: '', photoUrl: '', likesCount: 6, commentsCount: 0, visibility: 'public' }} />)}</>); });
  assert.equal(checks, 0, 'unknown batch state does not fan out into per-card requests');
  const buttons = tree!.root.findAll(n => n.props?.['data-like-state'] === 'unknown');
  assert.equal(buttons.length, 5);
  await act(async () => { await buttons[0].props.onClick(); });
  assert.equal(checks, 1, 'explicit click checks only the chosen card');
  assert.equal(deletes, 1, 'actual liked state is used: a previously liked log is unliked, not liked again');
  assert.equal(tree!.root.findAll(n => n.props?.['data-like-state'] === 'unliked').length, 1);
  console.log('PASS actual LogCard: no per-card fallback fanout; unknown click resolves actual state before write');
} finally {
  await act(async () => { tree?.unmount(); });
  await logout();
}
