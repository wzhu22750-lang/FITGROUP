import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  Download,
  FileJson,
  FileText,
  Copy,
  Share2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import type { WorkoutLog } from '../types';
import { CATEGORY_META } from '../constants/workoutPresets';
import {
  generateExportData,
  formatExportAsJson,
  formatExportAsText,
  resolveLogCategories,
} from '../utils/dataExport';
import { fetchAllMyWorkoutLogsForExport } from '../api';
import { exportFileService, type ExportFileService, type ExportContentKind } from '../utils/exportFileService';
import { useToast } from './Toast';

type LoadState = 'loading' | 'ready' | 'error';
type ExportingKind = ExportContentKind | null;

export interface ExportDataPageProps {
  user: any;
  onBack: () => void;
  /** Injectable for tests; defaults to the full-history paginated API. */
  loadLogs?: (userId: string, options: { exportStartedAt: string }) => Promise<WorkoutLog[]>;
  /** Injectable for tests; defaults to the real native/web file service. */
  exportService?: Pick<ExportFileService, 'saveExportFile' | 'shareExportFile'>;
}

function defaultLoadLogs(userId: string, options: { exportStartedAt: string }): Promise<WorkoutLog[]> {
  return fetchAllMyWorkoutLogsForExport(userId, options);
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function ExportDataPage({ user, onBack, loadLogs = defaultLoadLogs, exportService = exportFileService }: ExportDataPageProps) {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [exporting, setExporting] = useState<ExportingKind>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const { showToast } = useToast();

  const userId = user?.id || user?.uid;

  useEffect(() => {
    if (!userId) {
      setLogs([]);
      setLoadState('error');
      return;
    }

    let cancelled = false;
    setLoadState('loading');
    const exportStartedAt = new Date().toISOString();

    loadLogs(userId, { exportStartedAt })
      .then((data) => {
        if (cancelled) return;
        setLogs(Array.isArray(data) ? data : []);
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        // Never interpret a failed request as "zero workouts".
        console.error('Failed to load workout logs for export:', err);
        setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, reloadToken, loadLogs]);

  const exportData = useMemo(() => generateExportData(user, logs), [user, logs]);

  const busy = loadState !== 'ready' || exporting !== null;

  const buildOptions = (kind: ExportContentKind) => {
    const isJson = kind === 'json';
    return {
      kind,
      filename: isJson ? `fitgroup_backup_${todayKey()}.json` : `fitgroup_report_${todayKey()}.txt`,
      mimeType: isJson ? 'application/json' : 'text/plain',
      content: isJson ? formatExportAsJson(exportData) : formatExportAsText(exportData),
    };
  };

  const handleSave = async (kind: ExportContentKind) => {
    if (busy) return;
    setExporting(kind);
    try {
      const result = await exportService.saveExportFile(buildOptions(kind));
      if (result.status === 'cancelled') {
        // User cancelled the document picker: no success and no error noise.
        return;
      }
      if (result.status === 'saved' && (result.bytesWritten ?? 0) > 0) {
        showToast(kind === 'json' ? 'JSON 备份已保存' : '文本报告已保存', 'success');
      }
    } catch (err) {
      console.error('Export save failed:', err);
      showToast('保存失败，请重试', 'error');
    } finally {
      setExporting(null);
    }
  };

  const handleShare = async (kind: ExportContentKind) => {
    if (busy) return;
    setExporting(kind);
    try {
      const result = await exportService.shareExportFile(buildOptions(kind));
      if (result.status === 'cancelled') {
        return;
      }
      if (result.status === 'downloaded') {
        showToast('浏览器不支持分享，已改为下载文件', 'info');
      } else if (result.status === 'shared') {
        showToast('已调起系统分享', 'success');
      }
    } catch (err) {
      console.error('Export share failed:', err);
      showToast('分享失败，请重试', 'error');
    } finally {
      setExporting(null);
    }
  };

  const handleCopyText = async () => {
    try {
      const textContent = formatExportAsText(exportData);
      await navigator.clipboard.writeText(textContent);
      showToast('已复制到剪贴板', 'success');
    } catch {
      showToast('复制失败', 'error');
    }
  };

  const displayedLogs = showAllLogs ? exportData.workoutLogs : exportData.workoutLogs.slice(0, 5);

  return (
    <div key="export" className="space-y-4" data-export-state={loadState} data-exporting={exporting ?? ''}>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors cursor-pointer py-1"
      >
        <ChevronLeft size={18} />
        返回
      </button>

      <div className="card p-5 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Download size={18} /> 数据导出
          </h2>
          <p className="text-xs text-ink/40 mt-1">
            导出个人档案、完整训练历史与统计。保存位置由你在系统文件选择器中自行选择。
          </p>
        </div>

        {loadState === 'error' ? (
          <div
            data-testid="export-load-error"
            className="p-3 bg-red-50 border-2 border-red-500 text-xs text-red-700 space-y-2"
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={14} /> 训练数据加载失败，无法生成完整备份
            </p>
            <p className="text-red-600/80">请检查网络后重试。为避免导出不完整的数据，导出功能已停用。</p>
            <button
              type="button"
              data-testid="export-reload"
              onClick={() => setReloadToken((token) => token + 1)}
              className="btn-secondary py-2 px-3 text-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> 重新加载
            </button>
          </div>
        ) : null}

        {/* Actions: save and share are explicitly separated. */}
        <div className="space-y-3 bg-paper p-3" style={{ borderRadius: 'var(--radius-sm)' }}>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-ink">JSON 数据备份</span>
              <span className="text-[10px] text-ink/30">完整、可恢复的原始数据</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="export-save-json"
                disabled={busy}
                onClick={() => handleSave('json')}
                className="btn-primary py-2.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <FileJson size={14} />
                {exporting === 'json' ? '处理中…' : '保存 JSON'}
              </button>
              <button
                type="button"
                data-testid="export-share-json"
                disabled={busy}
                onClick={() => handleShare('json')}
                className="btn-secondary py-2.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Share2 size={14} /> 分享 JSON
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-ink">文本训练报告</span>
              <span className="text-[10px] text-ink/30">便于阅读的 TXT 报告</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="export-save-text"
                disabled={busy}
                onClick={() => handleSave('text')}
                className="btn-primary py-2.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <FileText size={14} />
                {exporting === 'text' ? '处理中…' : '保存 TXT'}
              </button>
              <button
                type="button"
                data-testid="export-share-text"
                disabled={busy}
                onClick={() => handleShare('text')}
                className="btn-secondary py-2.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Share2 size={14} /> 分享 TXT
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyText}
            className="w-full py-2 text-xs text-ink/40 hover:text-ink transition-colors cursor-pointer flex items-center justify-center gap-1"
          >
            <Copy size={12} /> 复制文本到剪贴板
          </button>
        </div>

        {loadState === 'loading' ? (
          <div className="text-center py-6 text-xs text-ink/30">正在加载完整训练历史…</div>
        ) : loadState === 'error' ? (
          <div className="text-center py-6 text-xs text-ink/30">加载失败，暂无可导出的数据</div>
        ) : (
          <>
            {/* Profile summary */}
            <div>
              <h3 className="text-sm font-bold text-ink mb-2">个人档案</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['性别', exportData.profile.sexZh],
                  ['身高', exportData.profile.heightCm ? `${exportData.profile.heightCm} cm` : '未设置'],
                  ['体重', exportData.profile.bodyweightKg ? `${exportData.profile.bodyweightKg} kg` : '未设置'],
                  ['BMI', exportData.profile.bmi !== null ? `${exportData.profile.bmi}` : '—'],
                  ['累计打卡', `${exportData.profile.totalWorkouts} 次`],
                  ['连续天数', `${exportData.profile.streak} 天`],
                ].map(([label, value]) => (
                  <div key={label} className="p-2 bg-paper" style={{ borderRadius: 'var(--radius-sm)' }}>
                    <span className="text-[10px] text-ink/30 block">{label}</span>
                    <span className="text-sm font-semibold text-ink">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dimension summaries */}
            <div>
              <h3 className="text-sm font-bold text-ink mb-2">各维度记录</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.values(exportData.summaries.dimensionSummaries).map((dim) => {
                  const isCardio = dim.category === 'Cardio';
                  const prEntries = Object.entries(dim.prs);
                  return (
                    <div key={dim.category} className="p-3 bg-paper space-y-1.5" style={{ borderRadius: 'var(--radius-sm)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">{dim.nameZh}</span>
                        <span className="text-[10px] text-ink/30">{dim.workoutCount} 次</span>
                      </div>
                      {isCardio ? (
                        <div className="text-xs text-ink/50">
                          {dim.cardioMinutes || 0} 分钟 · ~{(dim.cardioCaloriesKcal || 0).toLocaleString()} kcal
                          {(dim.cardioDistanceKm || 0) > 0 && ` · ${dim.cardioDistanceKm} km`}
                        </div>
                      ) : (
                        <>
                          <div className="text-xs text-ink/50">
                            最大 {dim.maxWeightKg > 0 ? `${dim.maxWeightKg} kg` : '—'} · 总容量 {dim.totalVolumeKg.toLocaleString()} kg
                          </div>
                          {prEntries.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {prEntries.slice(0, 3).map(([name, w]) => (
                                <span key={name} className="text-[10px] text-ink/40 bg-white px-1.5 py-0.5" style={{ borderRadius: 'var(--radius-sm)' }}>
                                  {name}: {w}kg
                                </span>
                              ))}
                              {prEntries.length > 3 && (
                                <span className="text-[10px] text-ink/30">+{prEntries.length - 3}</span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Training log entries */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-ink">训练记录 ({exportData.workoutLogs.length})</h3>
                {exportData.workoutLogs.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllLogs(!showAllLogs)}
                    className="text-xs text-ink/40 hover:text-ink cursor-pointer"
                  >
                    {showAllLogs ? '收起' : '展开全部'}
                  </button>
                )}
              </div>

              {exportData.workoutLogs.length === 0 ? (
                <div className="text-center py-4 text-xs text-ink/30">暂无记录</div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {displayedLogs.map((log, idx) => {
                    const categories = resolveLogCategories(log);
                    const categoriesText = categories.map((c) => CATEGORY_META[c]?.zh || c).join(' + ') || '综合';
                    return (
                      <div key={log.id || idx} className="p-2 bg-paper text-xs space-y-0.5" style={{ borderRadius: 'var(--radius-sm)' }}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-ink/60">
                            {log.localDate || '时间未知'} {log.localTime}
                          </span>
                          <span className="text-[10px] text-ink/40">{categoriesText}</span>
                        </div>
                        {log.totalVolumeKg > 0 && (
                          <div className="text-[11px] text-ink/40">
                            总容量 {log.totalVolumeKg.toLocaleString()} kg · {log.totalSets} 组
                          </div>
                        )}
                        {log.exerciseSummaries.length > 0 && (
                          <ul className="text-[11px] text-ink/50">
                            {log.exerciseSummaries.map((ex, eIdx) => (
                              <li key={eIdx} className="truncate">• {ex}</li>
                            ))}
                          </ul>
                        )}
                        {log.note && (
                          <p className="text-[10px] text-ink/30 italic">💬 {log.note}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ExportDataPage;
