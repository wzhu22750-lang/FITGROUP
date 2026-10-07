import assert from 'node:assert/strict';
import {
  ExportFileService,
  type ExportFileAdapter,
  type SaveExportOptions,
} from '../src/utils/exportFileService';

function pass(msg: string) {
  console.log(`✅ PASSED: ${msg}`);
}

const textOptions: SaveExportOptions = {
  filename: 'fitgroup_report.txt',
  mimeType: 'text/plain',
  content: 'hello 世界',
  kind: 'text',
};

function bytes(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

function makeAdapter(overrides: Partial<ExportFileAdapter> = {}): ExportFileAdapter {
  return {
    isNativePlatform: () => true,
    saveTextDocument: async () => ({ status: 'saved', bytesWritten: bytes(textOptions.content) }),
    writeCacheAndStat: async () => ({ uri: 'file:///cache/fitgroup.txt', bytes: bytes(textOptions.content) }),
    shareNative: async () => undefined,
    downloadWeb: () => undefined,
    shareWeb: async () => 'unsupported',
    ...overrides,
  };
}

console.log('--- Testing Export File Service ---');

// 1. Empty content is refused before reaching the native layer
{
  let called = false;
  const service = new ExportFileService(makeAdapter({
    saveTextDocument: async () => {
      called = true;
      return { status: 'saved', bytesWritten: 0 };
    },
  }));
  await assert.rejects(
    () => service.saveExportFile({ ...textOptions, content: '' }),
    /导出内容为空/,
  );
  assert.equal(called, false, 'native layer is never called with empty content');
  pass('empty content is rejected before native save');
}

// 2. JSON content must be valid
{
  const service = new ExportFileService(makeAdapter());
  await assert.rejects(
    () => service.saveExportFile({ ...textOptions, content: '{ broken', kind: 'json' }),
    /JSON 内容无效/,
  );
  pass('invalid JSON is rejected before native save');
}

// 3. Native successful save returns the verified byte count
{
  const service = new ExportFileService(makeAdapter());
  const result = await service.saveExportFile(textOptions);
  assert.equal(result.status, 'saved');
  assert.equal(result.bytesWritten, bytes(textOptions.content));
  assert.ok((result.bytesWritten ?? 0) > 0);
  pass('native save succeeds with verified byte count');
}

// 4. Native reports 0 bytes -> reject, NEVER fall back to a web download
{
  let webDownloads = 0;
  const service = new ExportFileService(makeAdapter({
    saveTextDocument: async () => ({ status: 'saved', bytesWritten: 0 }),
    downloadWeb: () => {
      webDownloads += 1;
    },
  }));
  await assert.rejects(() => service.saveExportFile(textOptions), /空/);
  assert.equal(webDownloads, 0, 'no web fallback when native write produced 0 bytes');
  pass('native 0-byte result rejects and does not fall back to web');
}

// 5. Native inconsistent byte count -> reject
{
  let webDownloads = 0;
  const service = new ExportFileService(makeAdapter({
    saveTextDocument: async () => ({ status: 'saved', bytesWritten: 1 }),
    downloadWeb: () => {
      webDownloads += 1;
    },
  }));
  await assert.rejects(() => service.saveExportFile(textOptions), /大小不一致/);
  assert.equal(webDownloads, 0);
  pass('native byte-count mismatch rejects');
}

// 6. Native write throws -> reject, no silent web fallback
{
  let webDownloads = 0;
  const service = new ExportFileService(makeAdapter({
    saveTextDocument: async () => {
      throw new Error('SAF provider failed');
    },
    downloadWeb: () => {
      webDownloads += 1;
    },
  }));
  await assert.rejects(() => service.saveExportFile(textOptions), /SAF provider failed/);
  assert.equal(webDownloads, 0, 'a native failure is never downgraded to a web download');
  pass('native failure rejects without web fallback');
}

// 7. User cancellation is reported as cancelled, not an error or success
{
  let webDownloads = 0;
  const service = new ExportFileService(makeAdapter({
    saveTextDocument: async () => ({ status: 'cancelled' }),
    downloadWeb: () => {
      webDownloads += 1;
    },
  }));
  const result = await service.saveExportFile(textOptions);
  assert.equal(result.status, 'cancelled');
  assert.equal(webDownloads, 0);
  pass('user cancellation returns cancelled');
}

// 8. Web platform downloads the blob and reports saved
{
  let webDownloads = 0;
  const service = new ExportFileService(makeAdapter({
    isNativePlatform: () => false,
    downloadWeb: () => {
      webDownloads += 1;
    },
  }));
  const result = await service.saveExportFile(textOptions);
  assert.equal(result.status, 'saved');
  assert.equal(webDownloads, 1, 'web uses a Blob download');
  assert.equal(result.bytesWritten, bytes(textOptions.content));
  pass('web save downloads a Blob');
}

// 9. Native share verifies the cache file is non-empty
{
  const service = new ExportFileService(makeAdapter({
    writeCacheAndStat: async () => ({ uri: 'file:///cache/x', bytes: 0 }),
  }));
  await assert.rejects(() => service.shareExportFile(textOptions), /临时文件为空/);
  pass('native share rejects an empty cache file');
}

// 10. Native share writes cache then shares
{
  let shared = 0;
  const service = new ExportFileService(makeAdapter({
    shareNative: async () => {
      shared += 1;
    },
  }));
  const result = await service.shareExportFile(textOptions);
  assert.equal(result.status, 'shared');
  assert.equal(shared, 1);
  pass('native share writes cache and opens the share sheet');
}

// 11. Web share unsupported -> downloads instead
{
  let webDownloads = 0;
  const service = new ExportFileService(makeAdapter({
    isNativePlatform: () => false,
    shareWeb: async () => 'unsupported',
    downloadWeb: () => {
      webDownloads += 1;
    },
  }));
  const result = await service.shareExportFile(textOptions);
  assert.equal(result.status, 'downloaded');
  assert.equal(webDownloads, 1);
  pass('web share falls back to download when unsupported');
}

console.log('\n🎉 ALL EXPORT FILE SERVICE TESTS PASSED SUCCESSFULLY!\n');
