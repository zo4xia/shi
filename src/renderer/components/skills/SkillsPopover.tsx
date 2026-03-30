import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { CheckIcon, ComputerDesktopIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import SearchIcon from '../icons/SearchIcon';
import PuzzleIcon from '../icons/PuzzleIcon';
import Cog6ToothIcon from '../icons/Cog6ToothIcon';
import { skillService, type RoleSkillIndexFile } from '../../services/skill';
import { localStore } from '../../services/store';
import { showGlobalToast } from '../../services/toast';
import { requestEmbeddedBrowserOpen } from '../../services/embeddedBrowser';
import { RootState } from '../../store';
import { Skill, getSkillDisplayName } from '../../types/skill';
import {
  BROWSER_EYES_CURRENT_PAGE_STORE_KEY,
  type BrowserEyesCurrentPageState,
} from '../../../shared/browserEyesState';
import {
  NATIVE_CAPABILITY_LABELS,
  type NativeCapabilityId,
} from '../../../shared/nativeCapabilities/config';

interface SkillsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSkill: (skill: Skill) => void;
  onManageSkills: () => void;
  anchorRef: React.RefObject<HTMLElement>;
  roleKey?: string;
}

const NATIVE_CAPABILITY_UI_META: Partial<Record<NativeCapabilityId, {
  buttonLabel: string;
  icon: React.ReactNode;
  helperText: string;
  statusText: string;
  dotClassName: string;
}>> = {
  'browser-eyes-native-addon': {
    buttonLabel: '打开',
    icon: <ComputerDesktopIcon className="h-4 w-4" />,
    helperText: '一起看看当前页面，再决定要不要上重浏览器。',
    statusText: '当前角色可直接看',
    dotClassName: 'bg-emerald-500',
  },
  'ima-native-addon': {
    buttonLabel: '用法',
    icon: <DocumentTextIcon className="h-4 w-4" />,
    helperText: '会帮你搜索、读取、保存到 IMA 笔记。',
    statusText: '当前角色可直接记',
    dotClassName: 'bg-sky-500',
  },
};

const SkillsPopover: React.FC<SkillsPopoverProps> = ({
  isOpen,
  onClose,
  onSelectSkill,
  onManageSkills,
  anchorRef,
  roleKey,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [maxListHeight, setMaxListHeight] = useState(256);
  const [roleSkillIndex, setRoleSkillIndex] = useState<RoleSkillIndexFile | null>(null);
  const [runtimeNativeCapabilities, setRuntimeNativeCapabilities] = useState<Array<{
    id: string;
    title: string;
    enabled: boolean;
    priority: number;
  }>>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const skills = useSelector((state: RootState) => state.skill.skills);
  const activeSkillIds = useSelector((state: RootState) => state.skill.activeSkillIds);
  const coworkConfig = useSelector((state: RootState) => state.cowork.config);
  const currentSessionRoleKey = useSelector((state: RootState) => state.cowork.currentSession?.agentRoleKey);
  const currentRoleKey = roleKey || currentSessionRoleKey || ((coworkConfig as unknown as Record<string, unknown>).agentRoleKey as string) || 'organizer';

  // Load role skill index when popover opens
  useEffect(() => {
    if (!isOpen) return;
    let isActive = true;
    Promise.all([
      skillService.getRoleSkillIndex(currentRoleKey),
      skillService.getRoleRuntime(currentRoleKey),
    ]).then(([index, runtimePayload]) => {
      if (!isActive) return;
      setRoleSkillIndex(index);
      setRuntimeNativeCapabilities(runtimePayload?.capabilitySnapshot?.runtimeNativeCapabilities ?? []);
    });
    return () => { isActive = false; };
  }, [isOpen, currentRoleKey]);

  const indexEntries = roleSkillIndex?.skills ?? [];
  const filteredSkills = indexEntries
    .map((entry) => {
      const skill = skills.find((candidate) => candidate.id === entry.id && candidate.enabled);
      return skill ? { skill, entry } : null;
    })
    .filter((item): item is { skill: Skill; entry: RoleSkillIndexFile['skills'][number] } => item !== null)
    .filter(({ skill, entry }) =>
      getSkillDisplayName(skill).toLowerCase().includes(searchQuery.toLowerCase()) ||
      skillService.getLocalizedSkillDescription(skill.id, skill.name, skill.description).toLowerCase().includes(searchQuery.toLowerCase())
    );

  const filteredNativeCapabilities = runtimeNativeCapabilities.filter((capability) => {
    const nativeId = capability.id as NativeCapabilityId;
    const title = capability.title.toLowerCase();
    const description = (NATIVE_CAPABILITY_LABELS[nativeId]?.description || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return !query || title.includes(query) || description.includes(query) || capability.id.toLowerCase().includes(query);
  });

  // Calculate available height and focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      // Calculate available space above the anchor
      if (anchorRef.current) {
        const anchorRect = anchorRef.current.getBoundingClientRect();
        // Available height = distance from top of viewport to anchor, minus padding for search bar (~120px) and some margin (~60px)
        const availableHeight = anchorRect.top - 120 - 60;
        // Clamp between 120px (minimum usable) and 256px (default max)
        setMaxListHeight(Math.max(120, Math.min(256, availableHeight)));
      }
      if (searchInputRef.current) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen, anchorRef]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsidePopover = popoverRef.current?.contains(target);
      const isInsideAnchor = anchorRef.current?.contains(target);

      if (!isInsidePopover && !isInsideAnchor) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSelectSkill = (skill: Skill) => {
    onSelectSkill(skill);
    // Don't close popover to allow multi-selection
  };

  const handleManageSkills = () => {
    onManageSkills();
    onClose();
  };

  const handleOpenBrowserEyes = async () => {
    const currentPage = await localStore.getItem<BrowserEyesCurrentPageState>(
      BROWSER_EYES_CURRENT_PAGE_STORE_KEY
    );
    const currentUrl = typeof currentPage?.url === 'string' ? currentPage.url.trim() : '';

    if (!currentUrl) {
      showGlobalToast('小眼睛暂时没有可看的页面。先打开一个网页，再来这里。');
      return;
    }

    const opened = requestEmbeddedBrowserOpen({
      title: currentPage?.title?.trim() || 'BLINGBLING 小眼睛',
      url: currentUrl,
    });

    if (!opened) {
      showGlobalToast('小眼睛这次没能打开页面。');
    }
  };

  const handleNativeCapabilityAction = async (capabilityId: string) => {
    if (capabilityId === 'browser-eyes-native-addon') {
      await handleOpenBrowserEyes();
      return;
    }

    if (capabilityId === 'ima-native-addon') {
      showGlobalToast('IMA 已在底层启用。直接在对话里说“搜索 IMA 笔记… / 读取 IMA 笔记 doc_id: … / 保存到 IMA：…”；如果还没配钥匙，去 设置 -> 消息频道 里填 IMA。');
      return;
    }

    showGlobalToast('这个外挂能力已经在底层启用，不需要像普通 skill 一样手动勾选。');
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-xl z-50"
    >
      {/* Search input */}
      <div className="p-3 border-b dark:border-claude-darkBorder border-claude-border">
        <div className="mb-2 rounded-lg border border-sky-200/70 bg-sky-50/80 px-2.5 py-2 text-[11px] leading-5 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/20 dark:text-sky-200">
          {roleSkillIndex
            ? `当前会同时显示 ${currentRoleKey} 角色在 skills.json 里可见的技能，以及当前角色已启用的外挂能力。`
            : '正在读取当前角色的 skills.json 与外挂能力视图。'}
        </div>
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={'搜索技能'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
          />
        </div>
      </div>

      {/* Skills list */}
      <div className="overflow-y-auto py-1" style={{ maxHeight: `${maxListHeight}px` }}>
        {filteredNativeCapabilities.length > 0 && (
          <div className="px-3 pb-2">
            <div className="px-1 pb-1 pt-1 text-[11px] font-semibold tracking-[0.12em] text-claude-textSecondary uppercase dark:text-claude-darkTextSecondary">
              {'外挂能力'}
            </div>
            <p className="px-1 pb-2 text-[11px] leading-5 text-claude-textSecondary/90 dark:text-claude-darkTextSecondary/90">
              {'这些不是普通 skill，而是当前角色已经接上的底层小伙伴。'}
            </p>
            <div className="space-y-1">
              {filteredNativeCapabilities.map((capability) => {
                const nativeId = capability.id as NativeCapabilityId;
                const isBrowserEyes = capability.id === 'browser-eyes-native-addon';
                const uiMeta = NATIVE_CAPABILITY_UI_META[nativeId];
                return (
                  <div
                    key={capability.id}
                    className="flex items-start gap-3 rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
                  >
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                      {uiMeta?.icon ?? <ComputerDesktopIcon className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-claude-text dark:text-claude-darkText">
                          {capability.title}
                        </span>
                        <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-200">
                          {'外挂'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-claude-textSecondary/90 dark:text-claude-darkTextSecondary/90">
                        <span className={`h-1.5 w-1.5 rounded-full ${uiMeta?.dotClassName ?? 'bg-violet-500'}`} />
                        <span>{uiMeta?.statusText ?? '当前角色已启用'}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-claude-textSecondary dark:text-claude-darkTextSecondary">
                        {uiMeta?.helperText ?? NATIVE_CAPABILITY_LABELS[nativeId]?.description ?? '当前角色已启用的底层能力。'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void handleNativeCapabilityAction(capability.id); }}
                      className="shrink-0 rounded-lg border border-violet-200/80 bg-violet-50/80 px-2.5 py-1 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-400/20 dark:bg-violet-400/[0.10] dark:text-violet-200 dark:hover:bg-violet-400/[0.14]"
                    >
                      {uiMeta?.buttonLabel ?? (isBrowserEyes ? '打开' : '查看')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {filteredNativeCapabilities.length > 0 && filteredSkills.length > 0 && (
          <div className="mx-3 my-1 border-t border-claude-border/70 dark:border-claude-darkBorder/70" />
        )}

        {filteredSkills.length === 0 && filteredNativeCapabilities.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {roleSkillIndex ? '当前角色暂无可用技能或外挂能力' : '当前角色技能索引未就绪'}
          </div>
        ) : (
          filteredSkills.map(({ skill, entry }) => {
            const isActive = activeSkillIds.includes(skill.id);
            return (
              <button
                key={skill.id}
                onClick={() => handleSelectSkill(skill)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'dark:bg-claude-accent/10 bg-claude-accent/10'
                    : 'dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover'
                }`}
              >
                <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isActive
                    ? 'bg-claude-accent text-white'
                    : 'dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover'
                }`}>
                  {isActive ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <PuzzleIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium truncate ${
                      isActive
                        ? 'text-claude-accent'
                        : 'dark:text-claude-darkText text-claude-text'
                    }`}>
                      {getSkillDisplayName(skill)}
                    </span>
                    {skill.isOfficial && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-claude-accent/10 text-claude-accent flex-shrink-0">
                        {'官方'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary truncate mt-0.5">
                    {skillService.getLocalizedSkillDescription(skill.id, skill.name, skill.description)}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer - Manage Skills */}
      <div className="border-t dark:border-claude-darkBorder border-claude-border">
        <button
          onClick={handleManageSkills}
          className="w-full flex items-center justify-between px-4 py-3 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors rounded-b-xl"
        >
          <span>{'管理技能'}</span>
          <Cog6ToothIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
        </button>
      </div>
    </div>
  );
};

export default SkillsPopover;
