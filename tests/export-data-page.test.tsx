import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ExportDataPage } from '../src/components/ExportDataPage';
import { ToastProvider } from '../src/components/Toast';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function pass(msg: string) {
  console.log(`✅ PASSED: ${msg}`);
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderPage(overrides: {
  loadLogs: (userId: string, options: { exportStartedAt: string }) => Promise<any[]>;
  exportService: any;
}): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ToastProvider>
        <ExportDataPage user={{ id: 'u1', displayName: 'Tester' }} onBack={() => undefined} {...overrides} />
      </ToastProvider>,
    );
  });
  return tree;
}

function button(tree: ReactTestRenderer, testId: string) {
  return tree.root.find((node) => node.props?.['data-testid'] === testId);
}

function hasText(tree: ReactTestRenderer, text: string): boolean {
  return tree.root
    .findAll((node) =>
      Array.isArray(node.children) &&
      node.children.some((child) => typeof child === 'string' && child.includes(text)),
    )
    .length > 0;
}

function stateAttr(tree: ReactTestRenderer): string | undefined {
  const root = tree.root.find((node) => typeof node.props?.['data-export-state'] === 'string');
  return root.props['data-export-state'];
}

const readyLogs = [
  {
    id: 'log-1',
    userId: 'u1',
    userName: 'Tester',
    userPhoto: '',
    timestamp: '2026-08-28T18:30:00.000Z',
    category: 'Chest',
    categories: ['Chest'],
    exercises: [{ id: 'e1', name: '杠铃卧推', type: 'strength', sets: 3, reps: 8, weight: 60 }],
    note: '',
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
  },
];

console.log('--- Testing Export Data Page (UI) ---');

// 1. loading=true disables every export/save button
{
  const pending = deferred<any[]>();
  const tree = await renderPage({
    loadLogs: () => pending.promise,
    exportService: { saveExportFile: async () => ({ status: 'saved', bytesWritten: 1 }), shareExportFile: async () => ({ status: 'shared' }) },
  });
  try {
    assert.equal(stateAttr(tree), 'loading');
    assert.equal(button(tree, 'export-save-json').props.disabled, true);
    assert.equal(button(tree, 'export-save-text').props.disabled, true);
    assert.equal(button(tree, 'export-share-json').props.disabled, true);
    assert.equal(button(tree, 'export-share-text').props.disabled, true);
    await act(async () => {
      pending.resolve([]);
    });
    pass('loading state disables all export buttons');
  } finally {
    await act(async () => tree.unmount());
  }
}

// 2. Load error is explicit, disables exports, and offers reload
{
  let attempts = 0;
  const tree = await renderPage({
    loadLogs: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network down');
      return readyLogs;
    },
    exportService: { saveExportFile: async () => ({ status: 'saved', bytesWritten: 1 }), shareExportFile: async () => ({ status: 'shared' }) },
  });
  try {
    assert.equal(stateAttr(tree), 'error');
    assert.ok(hasText(tree, '训练数据加载失败，无法生成完整备份'), 'error message shown');
    assert.equal(button(tree, 'export-save-json').props.disabled, true, 'export disabled on error');
    await act(async () => {
      button(tree, 'export-reload').props.onClick();
    });
    assert.equal(stateAttr(tree), 'ready', 'reload recovers to ready');
    assert.equal(button(tree, 'export-save-json').props.disabled, false);
    pass('load error shows message, disables export and supports reload');
  } finally {
    await act(async () => tree.unmount());
  }
}

// 3. ready=true enables the buttons (even with 0 records)
{
  const tree = await renderPage({
    loadLogs: async () => [],
    exportService: { saveExportFile: async () => ({ status: 'saved', bytesWritten: 1 }), shareExportFile: async () => ({ status: 'shared' }) },
  });
  try {
    assert.equal(stateAttr(tree), 'ready');
    assert.equal(button(tree, 'export-save-json').props.disabled, false);
    assert.equal(button(tree, 'export-save-text').props.disabled, false);
    pass('ready state enables export buttons');
  } finally {
    await act(async () => tree.unmount());
  }
}

// 4. Successful save shows a success toast derived from the result
{
  const tree = await renderPage({
    loadLogs: async () => readyLogs,
    exportService: {
      saveExportFile: async () => ({ status: 'saved', bytesWritten: 123 }),
      shareExportFile: async () => ({ status: 'shared' }),
    },
  });
  try {
    await act(async () => {
      await button(tree, 'export-save-json').props.onClick();
    });
    assert.ok(hasText(tree, 'JSON 备份已保存'), 'success toast shown');
    assert.equal(hasText(tree, '保存失败'), false);
    pass('successful save shows success toast');
  } finally {
    await act(async () => tree.unmount());
  }
}

// 5. Cancellation shows no toast at all
{
  const tree = await renderPage({
    loadLogs: async () => readyLogs,
    exportService: {
      saveExportFile: async () => ({ status: 'cancelled' }),
      shareExportFile: async () => ({ status: 'cancelled' }),
    },
  });
  try {
    await act(async () => {
      await button(tree, 'export-save-json').props.onClick();
    });
    assert.equal(hasText(tree, '已保存'), false, 'no success toast on cancel');
    assert.equal(hasText(tree, '失败'), false, 'no error toast on cancel');
    pass('user cancellation shows no toast');
  } finally {
    await act(async () => tree.unmount());
  }
}

// 6. Failure shows an error toast
{
  const tree = await renderPage({
    loadLogs: async () => readyLogs,
    exportService: {
      saveExportFile: async () => {
        throw new Error('native failed');
      },
      shareExportFile: async () => ({ status: 'shared' }),
    },
  });
  try {
    await act(async () => {
      await button(tree, 'export-save-text').props.onClick();
    });
    assert.ok(hasText(tree, '保存失败，请重试'), 'error toast shown');
    pass('failed save shows error toast');
  } finally {
    await act(async () => tree.unmount());
  }
}

// 7. While exporting, buttons are disabled (prevents duplicate submits)
{
  const pendingSave = deferred<{ status: 'saved'; bytesWritten: number }>();
  const tree = await renderPage({
    loadLogs: async () => readyLogs,
    exportService: {
      saveExportFile: () => pendingSave.promise,
      shareExportFile: async () => ({ status: 'shared' }),
    },
  });
  try {
    let clicked = 0;
    await act(async () => {
      button(tree, 'export-save-json').props.onClick();
      clicked += 1;
    });
    const root = tree.root.find((node) => typeof node.props?.['data-exporting'] === 'string');
    assert.equal(root.props['data-exporting'], 'json', 'exporting state is tracked');
    assert.equal(button(tree, 'export-save-json').props.disabled, true, 'button disabled while exporting');
    assert.equal(clicked, 1);
    await act(async () => {
      pendingSave.resolve({ status: 'saved', bytesWritten: 50 });
    });
    assert.equal(stateAttr(tree), 'ready');
    pass('exporting state disables buttons and prevents duplicate clicks');
  } finally {
    await act(async () => tree.unmount());
  }
}

console.log('\n🎉 ALL EXPORT DATA PAGE UI TESTS PASSED SUCCESSFULLY!\n');
