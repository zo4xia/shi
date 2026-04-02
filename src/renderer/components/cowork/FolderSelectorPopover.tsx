import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import FolderPlusIcon from '../icons/FolderPlusIcon';
import ClockIcon from '../icons/ClockIcon';
import ChevronRightIcon from '../icons/ChevronRightIcon';
import FolderIcon from '../icons/FolderIcon';
import { coworkService } from '../../services/cowork';
import { getCompactFolderName } from '../../utils/path';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';
import ModalWrapper from '../ui/ModalWrapper';

// Custom tooltip for folder paths
interface PathTooltipProps {
  path: string;
  anchorRect: DOMRect | null;
  visible: boolean;
}

const PathTooltip: React.FC<PathTooltipProps> = ({ path, anchorRect, visible }) => {
  if (!visible || !anchorRect) return null;
  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.top - 8,
    left: anchorRect.left + anchorRect.width / 2,
    transform: 'translate(-50%, -100%)',
    maxWidth: '400px',
    zIndex: 100,
  };
  return (
    <div style={style} className="px-3.5 py-2.5 text-[13px] leading-relaxed rounded-xl shadow-xl dark:bg-claude-darkBg bg-claude-bg dark:text-claude-darkText text-claude-text dark:border-claude-darkBorder border-claude-border border break-all pointer-events-none">
      {path}
    </div>
  );
};

/* ── 目录浏览器弹窗 ─────────────────────────────── */
interface DirectoryBrowserProps {
  onSelect: (path: string) => void;
  onClose: () => void;
  useModal?: boolean;
}

const DirectoryBrowser: React.FC<DirectoryBrowserProps> = ({ onSelect, onClose, useModal = true }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [drives, setDrives] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pathInput, setPathInput] = useState('');
  // PLACEHOLDER_CONTINUE

  const browse = useCallback(async (dirPath?: string) => {
    setLoading(true);
    try {
      const qs = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(`/api/dialog/browse${qs}`);
      const data = await res.json();
      if (data.success) {
        setCurrentPath(data.current);
        setParentPath(data.parent);
        setFolders(data.folders);
        setPathInput(data.current);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // 加载盘符 + 默认目录
  useEffect(() => {
    fetch('/api/dialog/drives').then(r => r.json()).then(d => {
      if (d.success) setDrives(d.drives);
    }).catch(() => {});
    browse();
  }, [browse]);

  const handleConfirm = () => {
    if (currentPath) {
      onSelect(currentPath);
      onClose();
    }
  };

  const handlePathInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pathInput.trim()) {
      browse(pathInput.trim());
    }
  };

  /* ## {提取} FolderPickerSheet / DesktopPopover
     当前目录选择器同时承担了移动端 modal 与桌面 popover 两种职责。
     后续适合拆成：移动端 FolderPickerSheet、桌面 FolderSelectorPopover。 */
  const content = (
    <div className="space-y-3">
      <div>
        <input
          type="text"
          value={pathInput}
          onChange={e => setPathInput(e.target.value)}
          onKeyDown={handlePathInputKeyDown}
          placeholder="输入位置后回车打开"
          className="w-full px-3 py-1.5 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkBg bg-claude-bg dark:text-claude-darkText text-claude-text focus:outline-none focus:ring-1 focus:ring-claude-accent/50 font-mono"
        />
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {drives.map(d => (
          <button key={d} type="button" onClick={() => browse(d)}
            className="px-2 py-0.5 text-xs rounded border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors">
            {d}
          </button>
        ))}
        {parentPath && (
          <button type="button" onClick={() => browse(parentPath)}
            className="px-2 py-0.5 text-xs rounded border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors">
            ↑ 上级
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1 min-h-[120px]">
        {loading ? (
          <div className="text-center py-8 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">加载中...</div>
        ) : folders.length === 0 ? (
          <div className="text-center py-8 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">无子文件夹</div>
        ) : (
          folders.map(name => (
            <button key={name} type="button" onClick={() => browse(currentPath + (currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '/') + name)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors rounded-lg text-left">
              <FolderIcon className="h-4 w-4 flex-shrink-0 text-amber-500" />
              <span className="truncate">{name}</span>
            </button>
          ))
        )}
      </div>

      <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary truncate font-mono">{currentPath || '...'}</div>
    </div>
  );

  const footerActions = (
    <>
      <button
        type="button"
        onClick={onClose}
        className="px-3 py-1.5 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
      >
        取消
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!currentPath}
        className="px-3 py-1.5 text-sm rounded-lg bg-claude-accent hover:bg-claude-accentHover text-white transition-colors disabled:opacity-50"
      >
        选择此目录
      </button>
    </>
  );

  if (useModal) {
    return (
      <ModalWrapper
        isOpen={true}
        onClose={onClose}
        title={'选择工作目录'}
        maxWidth="md"
        maxHeight="75vh"
        footer={footerActions}
      >
        {content}
      </ModalWrapper>
    );
  }

  return (
    <>
      {content}
      <div className="flex items-center justify-end gap-3 border-t dark:border-claude-darkBorder border-claude-border pt-3">
        {footerActions}
      </div>
    </>
  );
};

/* ── 主组件 ─────────────────────────────────────── */
interface FolderSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFolder: (path: string) => void;
  anchorRef: React.RefObject<HTMLElement>;
}

const FolderSelectorPopover: React.FC<FolderSelectorPopoverProps> = ({
  isOpen, onClose, onSelectFolder, anchorRef,
}) => {
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [showRecentSubmenu, setShowRecentSubmenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submenuPosition, setSubmenuPosition] = useState({ top: 0, left: 0 });
  const [showBrowser, setShowBrowser] = useState(false);
  const [tooltipState, setTooltipState] = useState<{ visible: boolean; path: string; rect: DOMRect | null }>({ visible: false, path: '', rect: null });
  const popoverRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const recentFoldersRef = useRef<HTMLDivElement>(null);
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isMobileViewport = useIsMobileViewport();

  useEffect(() => { return () => { if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current); }; }, []);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      coworkService.getRecentCwds(10).then(f => setRecentFolders(f)).catch(() => setRecentFolders([])).finally(() => setIsLoading(false));
    } else {
      setShowRecentSubmenu(false);
      setShowBrowser(false);
      setTooltipState({ visible: false, path: '', rect: null });
      if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null; }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !submenuRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose, anchorRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (showRecentSubmenu && recentFoldersRef.current) {
      const rect = recentFoldersRef.current.getBoundingClientRect();
      setSubmenuPosition({ top: rect.top, left: rect.right + 4 });
    }
  }, [showRecentSubmenu]);

  const handleAddFolder = async () => {
    // 优先用浏览器原生目录选择器 (Chrome/Edge 86+)
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
        const dirName = dirHandle.name;
        // 收集少量子条目用于后端匹配验证
        const childNames: string[] = [];
        try {
          for await (const [name] of dirHandle.entries()) {
            childNames.push(name);
            if (childNames.length >= 5) break;
          }
        } catch { /* 权限不足时忽略 */ }
        // 让后端根据目录名+子文件推断绝对路径
        const qs = `name=${encodeURIComponent(dirName)}&children=${encodeURIComponent(childNames.join(','))}`;
        const res = await fetch(`/api/dialog/resolve-dir?${qs}`);
        const data = await res.json();
        if (data.success && data.path) {
          onSelectFolder(data.path);
          onClose();
          return;
        }
        // 后端没找到，fallback 到目录浏览器
        setShowBrowser(true);
      } catch (err: any) {
        // 用户取消选择
        if (err?.name === 'AbortError') return;
        // 其他错误 fallback 到目录浏览器
        setShowBrowser(true);
      }
      return;
    }
    // 不支持 showDirectoryPicker 时用目录浏览器
    setShowBrowser(true);
  };

  const handleSelectRecentFolder = (path: string) => { onSelectFolder(path); onClose(); };

  const handleFolderMouseEnter = useCallback((path: string, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => {
      setTooltipState({ visible: true, path: getCompactFolderName(path, 120) || '未选择文件夹', rect });
    }, 300);
  }, []);

  const handleFolderMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) { clearTimeout(tooltipTimerRef.current); tooltipTimerRef.current = null; }
    setTooltipState({ visible: false, path: '', rect: null });
  }, []);

  const truncatePath = (path: string, maxLength = 40): string => {
    if (!path) return '未选择文件夹';
    return getCompactFolderName(path, maxLength) || '未选择文件夹';
  };

  if (!isOpen) return null;

  // 目录浏览器弹窗
  if (showBrowser) {
    return <DirectoryBrowser onSelect={onSelectFolder} onClose={() => { setShowBrowser(false); onClose(); }} />;
  }

  /* ## {提取} DesktopPopover
     当前最近目录菜单仍是桌面 popover 形态。
     后续可和 SkillsPopover / ModelSelector 一起收口为 PopoverOrSheet。 */
  if (isMobileViewport) {
    const handleMobileClose = () => {
      setShowBrowser(false);
      onClose();
    };

    const mobileBody = showBrowser ? (
      <DirectoryBrowser
        onSelect={(path) => {
          onSelectFolder(path);
        }}
        onClose={handleMobileClose}
        useModal={false}
      />
    ) : (
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleAddFolder}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
        >
          <FolderPlusIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
          <span>添加文件夹</span>
        </button>
        <div className="rounded-xl border dark:border-claude-darkBorder border-claude-border overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold dark:text-claude-darkTextSecondary text-claude-textSecondary">
            最近使用
          </div>
          {isLoading ? (
            <div className="px-3 py-3 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">加载中...</div>
          ) : recentFolders.length === 0 ? (
            <div className="px-3 py-3 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">暂无最近文件夹</div>
          ) : (
            <div className="space-y-1 px-2 pb-2">
              {recentFolders.map((folder, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectRecentFolder(folder)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors text-left"
                >
                  <FolderIcon className="h-4 w-4 flex-shrink-0 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                  <span className="truncate">{truncatePath(folder)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );

    return (
      <ModalWrapper
        isOpen={true}
        onClose={handleMobileClose}
        title={'选择文件夹'}
        maxWidth="md"
        maxHeight="75vh"
      >
        {mobileBody}
      </ModalWrapper>
    );
  }

  return (
    <>
      <div ref={popoverRef} className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-lg z-50">
        <button onClick={handleAddFolder} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors rounded-t-lg">
          <FolderPlusIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
          <span>添加文件夹</span>
        </button>
        <div ref={recentFoldersRef} className="relative" onMouseEnter={() => setShowRecentSubmenu(true)} onMouseLeave={() => setShowRecentSubmenu(false)}>
          <button className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors rounded-b-lg">
            <div className="flex items-center gap-3">
              <ClockIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
              <span>最近使用</span>
            </div>
            <ChevronRightIcon className="h-3 w-3 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
          </button>
        </div>
      </div>

      {showRecentSubmenu && (
        <div ref={submenuRef} className="fixed w-64 max-h-80 overflow-y-auto rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-lg z-[60]"
          style={{ top: submenuPosition.top, left: submenuPosition.left }}
          onMouseEnter={() => setShowRecentSubmenu(true)} onMouseLeave={() => setShowRecentSubmenu(false)}>
          {isLoading ? (
            <div className="px-3 py-2.5 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">加载中...</div>
          ) : recentFolders.length === 0 ? (
            <div className="px-3 py-2.5 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">暂无最近文件夹</div>
          ) : (
            recentFolders.map((folder, index) => (
              <button key={index} onClick={() => handleSelectRecentFolder(folder)}
                onMouseEnter={(e) => handleFolderMouseEnter(folder, e)} onMouseLeave={handleFolderMouseLeave}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors text-left first:rounded-t-lg last:rounded-b-lg">
                <FolderIcon className="h-4 w-4 flex-shrink-0 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                <span className="truncate">{truncatePath(folder)}</span>
              </button>
            ))
          )}
        </div>
      )}

      <PathTooltip path={tooltipState.path} anchorRect={tooltipState.rect} visible={tooltipState.visible} />
    </>
  );
};

export default FolderSelectorPopover;
