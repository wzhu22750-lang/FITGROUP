import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { validateExportContent, type ExportContentKind } from './dataExport';

export type { ExportContentKind };

export type ExportStatus = 'saved' | 'cancelled';

export interface SaveExportOptions {
  filename: string;
  mimeType: string;
  content: string;
  kind: ExportContentKind;
}

export interface SaveDocumentResult {
  status: ExportStatus;
  uri?: string;
  filename?: string;
  bytesWritten?: number;
}

export type ShareExportResultStatus = 'shared' | 'cancelled' | 'downloaded';

export interface ShareExportResult {
  status: ShareExportResultStatus;
  bytesWritten?: number;
}

/** Shape of the native DocumentExport Capacitor plugin. */
export interface DocumentExportPlugin {
  saveTextDocument(options: {
    filename: string;
    mimeType: string;
    content: string;
  }): Promise<SaveDocumentResult>;
}

/**
 * Registered lazily by Capacitor. On the web platform this resolves to a proxy
 * that throws if invoked, which is why `saveExportFile` never calls it unless
 * `isNativePlatform()` is true.
 */
export const DocumentExport = registerPlugin<DocumentExportPlugin>('DocumentExport');

/**
 * Low-level host operations. Isolated behind an interface so the save/share
 * semantics can be unit tested without Capacitor, Filesystem or a browser.
 */
export interface ExportFileAdapter {
  isNativePlatform(): boolean;
  saveTextDocument(options: SaveExportOptions): Promise<SaveDocumentResult>;
  writeCacheAndStat(options: { filename: string; content: string; mimeType: string }): Promise<{ uri: string; bytes: number }>;
  shareNative(options: { uri: string; title: string; text: string; dialogTitle: string }): Promise<void>;
  downloadWeb(options: { filename: string; content: string; mimeType: string }): void;
  shareWeb(options: { filename: string; content: string; mimeType: string }): Promise<'shared' | 'cancelled' | 'unsupported'>;
}

/** Trigger a browser download without revoking the object URL too early. */
export function downloadBlobForWeb(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Safari/Chrome need the URL to stay alive until the download actually starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Share a file on the web via the Web Share API (save vs share stay separate). */
export async function shareFileForWeb(
  filename: string,
  content: string,
  mimeType: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof File === 'undefined') return 'unsupported';

  const file = new File([content], filename, { type: mimeType });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !nav.canShare({ files: [file] })) {
    return 'unsupported';
  }

  try {
    await nav.share({
      files: [file],
      title: 'FitGroup 数据导出',
      text: '我的健身数据备份文件',
    });
    return 'shared';
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

export function createDefaultExportAdapter(): ExportFileAdapter {
  return {
    isNativePlatform: () => Capacitor.isNativePlatform(),
    saveTextDocument: (options) =>
      DocumentExport.saveTextDocument({
        filename: options.filename,
        mimeType: options.mimeType,
        content: options.content,
      }),
    writeCacheAndStat: async ({ filename, content }) => {
      const written = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      let bytes = 0;
      try {
        const info = await Filesystem.stat({ path: filename, directory: Directory.Cache });
        bytes = Number(info.size) || 0;
      } catch {
        bytes = 0;
      }
      return { uri: written.uri, bytes };
    },
    shareNative: async ({ uri, title, text, dialogTitle }) => {
      await Share.share({ title, text, files: [uri], dialogTitle });
    },
    downloadWeb: ({ filename, content, mimeType }) => downloadBlobForWeb(filename, content, mimeType),
    shareWeb: ({ filename, content, mimeType }) => shareFileForWeb(filename, content, mimeType),
  };
}

interface ExportFailureLog {
  stage: string;
  filename: string;
  mimeType: string;
  kind: ExportContentKind;
  native: boolean;
  expectedBytes?: number;
  actualBytes?: number;
  error: unknown;
}

/**
 * Log export failures with enough diagnostic metadata to debug the native/web
 * pipeline WITHOUT ever printing the user's fitness data body.
 */
function logExportFailure(info: ExportFailureLog): void {
  console.error('[export] failed', {
    stage: info.stage,
    filename: info.filename,
    mimeType: info.mimeType,
    kind: info.kind,
    native: info.native,
    expectedBytes: info.expectedBytes,
    actualBytes: info.actualBytes,
    error: info.error instanceof Error ? `${info.error.name}: ${info.error.message}` : String(info.error),
  });
}

/** Select only content-free metadata for failure logging. */
function selectLogMeta(options: SaveExportOptions): { filename: string; mimeType: string; kind: ExportContentKind } {
  return { filename: options.filename, mimeType: options.mimeType, kind: options.kind };
}

export class ExportFileService {
  constructor(private readonly adapter: ExportFileAdapter = createDefaultExportAdapter()) {}

  /** Validate content and return the expected UTF-8 byte length. Throws on empty/invalid content. */
  validate(options: SaveExportOptions): number {
    return validateExportContent(options.content, options.kind);
  }

  /**
   * Save the export to a user-chosen location.
   *
   * Native: SAF `ACTION_CREATE_DOCUMENT`; the native layer must report the bytes
   *   it actually wrote back, and we verify `actualBytes === expectedBytes`.
   * Web: browser Blob download.
   *
   * A native failure is never silently downgraded to a web download.
   */
  async saveExportFile(options: SaveExportOptions): Promise<SaveDocumentResult> {
    const expectedBytes = this.validate(options);
    const native = this.adapter.isNativePlatform();

    if (!native) {
      this.adapter.downloadWeb(options);
      return { status: 'saved', filename: options.filename, bytesWritten: expectedBytes };
    }

    let result: SaveDocumentResult;
    try {
      result = await this.adapter.saveTextDocument(options);
    } catch (error) {
      logExportFailure({ stage: 'native-save', native, expectedBytes, ...selectLogMeta(options), error });
      throw error instanceof Error ? error : new Error('原生保存失败');
    }

    if (result?.status === 'cancelled') {
      return { status: 'cancelled', filename: options.filename };
    }

    if (!result || result.status !== 'saved') {
      const error = new Error('原生保存未返回成功状态');
      logExportFailure({ stage: 'native-save-status', native, expectedBytes, ...selectLogMeta(options), error });
      throw error;
    }

    const actualBytes = Number(result.bytesWritten);
    if (!Number.isFinite(actualBytes) || actualBytes <= 0) {
      const error = new Error('保存的文件为空 (0 字节)');
      logExportFailure({ stage: 'native-save-verify', native, expectedBytes, actualBytes, ...selectLogMeta(options), error });
      throw error;
    }

    if (actualBytes !== expectedBytes) {
      const error = new Error(`保存文件大小不一致 (期望 ${expectedBytes} 字节，实际 ${actualBytes} 字节)`);
      logExportFailure({ stage: 'native-save-verify', native, expectedBytes, actualBytes, ...selectLogMeta(options), error });
      throw error;
    }

    return {
      status: 'saved',
      uri: result.uri,
      filename: result.filename || options.filename,
      bytesWritten: actualBytes,
    };
  }

  /**
   * Share the export through the system share sheet.
   *
   * Native: write a temporary cache file, verify it is not empty, then share.
   * Web: Web Share API when supported, otherwise fall back to a download.
   */
  async shareExportFile(options: SaveExportOptions): Promise<ShareExportResult> {
    const expectedBytes = this.validate(options);
    const native = this.adapter.isNativePlatform();

    if (native) {
      let uri = '';
      let bytes = 0;
      try {
        const written = await this.adapter.writeCacheAndStat(options);
        uri = written.uri;
        bytes = Number(written.bytes) || 0;
      } catch (error) {
        logExportFailure({ stage: 'native-cache-write', native, expectedBytes, ...selectLogMeta(options), error });
        throw error instanceof Error ? error : new Error('分享临时文件写入失败');
      }

      if (bytes <= 0) {
        const error = new Error('分享临时文件为空');
        logExportFailure({ stage: 'native-cache-verify', native, expectedBytes, actualBytes: bytes, ...selectLogMeta(options), error });
        throw error;
      }

      try {
        await this.adapter.shareNative({
          uri,
          title: 'FitGroup 数据导出',
          text: '我的健身数据备份文件',
          dialogTitle: '分享健身数据',
        });
      } catch (error) {
        logExportFailure({ stage: 'native-share', native, expectedBytes, actualBytes: bytes, ...selectLogMeta(options), error });
        throw error instanceof Error ? error : new Error('分享失败');
      }

      return { status: 'shared', bytesWritten: bytes };
    }

    const webResult = await this.adapter.shareWeb(options);
    if (webResult === 'shared') return { status: 'shared', bytesWritten: expectedBytes };
    if (webResult === 'cancelled') return { status: 'cancelled', bytesWritten: expectedBytes };

    // Web only: no share capability, fall back to a download.
    this.adapter.downloadWeb(options);
    return { status: 'downloaded', bytesWritten: expectedBytes };
  }
}

export const exportFileService = new ExportFileService();
