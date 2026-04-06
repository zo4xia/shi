import React, { useState, useEffect, useRef } from 'react';
import { WebFileOperations } from '../utils/fileOperations';

interface TableStat {
  table: string;
  label: string;
  count: number;
}

interface BackupStats {
  stats: TableStat[];
  sizeBytes: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DataBackup: React.FC = () => {
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backup/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const fileName = match?.[1] || `uclaw-backup-${Date.now()}.sqlite`;
      WebFileOperations.downloadBlob(blob, fileName);
      setMessage({ type: 'success', text: `备份已下载: ${fileName}` });
    } catch {
      setMessage({ type: 'error', text: '导出失败，请重试' });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 重置 input 以便重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!file.name.endsWith('.sqlite')) {
      setMessage({ type: 'error', text: '请选择 .sqlite 备份文件' });
      return;
    }

    const confirmed = window.confirm(
      '还原备份将覆盖当前所有数据（对话、记忆、配置等），此操作不可撤销。\n\n确定要继续吗？'
    );
    if (!confirmed) return;

    setImporting(true);
    setMessage(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: arrayBuffer,
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '还原成功，3 秒后自动刷新页面...' });
        setTimeout(() => window.location.reload(), 3000);
      } else {
        setMessage({ type: 'error', text: data.error || '还原失败' });
      }
    } catch {
      setMessage({ type: 'error', text: '还原失败，请检查文件是否有效' });
    } finally {
      setImporting(false);
    }
  };

  // PLACEHOLDER_RENDER

  return (
    <div className="space-y-6">
      {/* 提示消息 */}
      {message && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border dark:border-claude-darkBorder border-claude-border bg-claude-surface dark:bg-claude-darkSurface/50 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold dark:text-claude-darkText text-claude-text">数据概览</h3>
              <p className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                当前数据库中的主要内容和体积。
              </p>
            </div>
            {stats && (
              <span className="rounded-full border dark:border-claude-darkBorder border-claude-border px-2.5 py-1 text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {formatBytes(stats.sizeBytes)}
              </span>
            )}
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">加载中...</div>
            ) : stats ? (
              <div className="rounded-xl border dark:border-claude-darkBorder border-claude-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="dark:bg-claude-darkSurfaceHover/50 bg-claude-surfaceHover/50">
                      <th className="text-left px-4 py-2 font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">数据类型</th>
                      <th className="text-right px-4 py-2 font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.stats.map((s) => (
                      <tr key={s.table} className="border-t dark:border-claude-darkBorder/50 border-claude-border/50">
                        <td className="px-4 py-2 dark:text-claude-darkText text-claude-text">{s.label}</td>
                        <td className="px-4 py-2 text-right tabular-nums dark:text-claude-darkText text-claude-text">{s.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 border-t dark:border-claude-darkBorder/50 border-claude-border/50 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  数据库大小: {formatBytes(stats.sizeBytes)}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border dark:border-claude-darkBorder border-claude-border bg-claude-surface dark:bg-claude-darkSurface/50 px-5 py-5">
          <div>
            <h3 className="text-sm font-semibold dark:text-claude-darkText text-claude-text">备份与还原</h3>
            <p className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
              建议先导出再还原，避免误覆盖当前数据。
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border dark:border-claude-darkBorder border-claude-border hover:bg-claude-surfaceHover/50 dark:hover:bg-claude-darkSurfaceHover/50 transition-colors disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-blue-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                  {exporting ? '导出中...' : '导出备份'}
                </div>
                <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  下载完整数据库文件 (.sqlite)
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border dark:border-claude-darkBorder border-claude-border hover:bg-claude-surfaceHover/50 dark:hover:bg-claude-darkSurfaceHover/50 transition-colors disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-amber-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                  {importing ? '还原中...' : '还原备份'}
                </div>
                <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  上传 .sqlite 备份文件覆盖当前数据
                </div>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sqlite"
              onChange={handleImport}
              className="hidden"
            />

            <p className="px-1 text-xs leading-5 dark:text-claude-darkTextSecondary/60 text-claude-textSecondary/60">
              还原操作会覆盖所有现有数据，建议先导出当前备份。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default DataBackup;
