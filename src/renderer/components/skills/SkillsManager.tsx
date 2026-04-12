// {路标} FLOW-PAGE-SKILLS
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AGENT_ROLE_ORDER, AGENT_ROLE_SHORT_LABELS } from '../../../shared/agentRoleConfig';
import { UI_BADGE_TEXT_CLASS, UI_MARK_ICON_CLASS, UI_MENU_ICON_CLASS } from '../../../shared/mobileUi';
import { useIsMediumViewport } from '../../hooks/useIsMediumViewport';
import { useIsMobileViewport } from '../../hooks/useIsMobileViewport';
import {
    skillService,
    type RoleCapabilitySnapshotFile,
    type SkillRoleConfigEntry,
} from '../../services/skill';
import { showGlobalToast } from '../../services/toast';
import { RootState } from '../../store';
import { setSkills } from '../../store/slices/skillSlice';
import { Skill, getSkillDisplayName, getSkillFilterLabels } from '../../types/skill';
import { WebFileOperations } from '../../utils/fileOperations';
import ErrorMessage from '../ErrorMessage';
import FolderOpenIcon from '../icons/FolderOpenIcon';
import LinkIcon from '../icons/LinkIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import SearchIcon from '../icons/SearchIcon';
import TrashIcon from '../icons/TrashIcon';
import UploadIcon from '../icons/UploadIcon';
import ConfirmDialog from '../ui/ConfirmDialog';
import ImportDialog from '../ui/ImportDialog';
import SkillDetailOverlay, { type RoleOptionKey } from './SkillDetailOverlay';

const HIDDEN_SKILL_IDS = new Set(['daily-memory-extraction']);
const SKILL_GROUP_LABELS: Record<string, string> = {
  feishu: '飞书',
  obsidian: 'Obsidian',
  writing: '写作',
  skills: '技能包',
  xlsx: '表格',
  mcp: 'MCP',
  web: '网页',
};

const SkillsManager: React.FC = () => {
  const isMobileViewport = useIsMobileViewport();
  const isMediumViewport = useIsMediumViewport();
  const shouldHideHeaderSearch = isMobileViewport || isMediumViewport;
  const dispatch = useDispatch();
  const skills = useSelector((state: RootState) => state.skill.skills);
  const importSuccessMessage = '技能已导入并完成安装对象绑定。';
  const claudeCliSkillsNotice = '当前 Skills 默认支持 Claude CLI 技能；如需导入其他版本技能，功能正在更新，下期完善。';

  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [skillDownloadSource, setSkillDownloadSource] = useState('');
  const [skillActionError, setSkillActionError] = useState('');
  const [isDownloadingSkill, setIsDownloadingSkill] = useState(false);
  const [isAddSkillMenuOpen, setIsAddSkillMenuOpen] = useState(false);
  const [isGithubImportOpen, setIsGithubImportOpen] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillPendingDelete, setSkillPendingDelete] = useState<Skill | null>(null);
  const [isDeletingSkill, setIsDeletingSkill] = useState(false);
  const [roleConfigs, setRoleConfigs] = useState<SkillRoleConfigEntry[]>([]);
  const [roleCapabilitySnapshots, setRoleCapabilitySnapshots] = useState<Partial<Record<string, RoleCapabilitySnapshotFile>>>({});
  const [isCleaningInvalid, setIsCleaningInvalid] = useState(false);
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);
  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [showDuplicateCleanConfirm, setShowDuplicateCleanConfirm] = useState(false);
  const [importTargetRoleKeys, setImportTargetRoleKeys] = useState<string[]>([]);
  const [showRuntimeHint, setShowRuntimeHint] = useState(false);
  const [showCompatHint, setShowCompatHint] = useState(false);
  const [skillDisplayAlias, setSkillDisplayAlias] = useState('');
  const [selectedSkillLabels, setSelectedSkillLabels] = useState<string[]>([]);
  const [skillCategoryDraft, setSkillCategoryDraft] = useState('');
  const [isSavingSkillCategory, setIsSavingSkillCategory] = useState(false);
  const [collapsedSkillGroups, setCollapsedSkillGroups] = useState<Record<string, boolean>>({});

  const addSkillMenuRef = useRef<HTMLDivElement>(null);
  const addSkillButtonRef = useRef<HTMLButtonElement>(null);
  const githubImportInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isActive = true;
    const loadSkills = async () => {
      const loadedSkills = await skillService.loadSkills();
      if (!isActive) return;
      dispatch(setSkills(loadedSkills));
    };
    const loadRoleConfigs = async () => {
      const configs = await skillService.listAllRoleConfigs();
      if (!isActive) return;
      setRoleConfigs(configs);
    };
    const loadRoleCapabilitySnapshots = async () => {
      const responses = await Promise.all(
        AGENT_ROLE_ORDER.map(async (roleKey) => [roleKey, await skillService.getRoleRuntime(roleKey)] as const)
      );
      if (!isActive) return;
      const nextSnapshots: Partial<Record<string, RoleCapabilitySnapshotFile>> = {};
      for (const [roleKey, payload] of responses) {
        if (payload?.capabilitySnapshot) {
          nextSnapshots[roleKey] = payload.capabilitySnapshot;
        }
      }
      setRoleCapabilitySnapshots(nextSnapshots);
    };
    loadSkills();
    loadRoleConfigs();
    loadRoleCapabilitySnapshots();

    const unsubscribe = skillService.onSkillsChanged(async () => {
      const loadedSkills = await skillService.loadSkills();
      if (!isActive) return;
      dispatch(setSkills(loadedSkills));
      const configs = await skillService.listAllRoleConfigs();
      if (!isActive) return;
      setRoleConfigs(configs);
      const responses = await Promise.all(
        AGENT_ROLE_ORDER.map(async (roleKey) => [roleKey, await skillService.getRoleRuntime(roleKey)] as const)
      );
      if (!isActive) return;
      const nextSnapshots: Partial<Record<string, RoleCapabilitySnapshotFile>> = {};
      for (const [roleKey, payload] of responses) {
        if (payload?.capabilitySnapshot) {
          nextSnapshots[roleKey] = payload.capabilitySnapshot;
        }
      }
      setRoleCapabilitySnapshots(nextSnapshots);
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [dispatch]);

  useEffect(() => {
    if (!isAddSkillMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideMenu = addSkillMenuRef.current?.contains(target);
      const isInsideButton = addSkillButtonRef.current?.contains(target);
      if (!isInsideMenu && !isInsideButton) {
        setIsAddSkillMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAddSkillMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isAddSkillMenuOpen]);

  useEffect(() => {
    if (!isGithubImportOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsGithubImportOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    setTimeout(() => githubImportInputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isGithubImportOpen]);

  useEffect(() => {
    if (!selectedSkill) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedSkill(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [selectedSkill]);

  useEffect(() => {
    if (!selectedSkill) {
      setSkillCategoryDraft('');
      setIsSavingSkillCategory(false);
      return;
    }
    setSkillCategoryDraft(selectedSkill.category ?? '');
    setIsSavingSkillCategory(false);
  }, [selectedSkill]);

  const filteredSkills = useMemo(() => {
    const query = skillSearchQuery.toLowerCase();
    const hasLabelFilter = selectedSkillLabels.length > 0;
    return skills.filter(skill => {
      if (HIDDEN_SKILL_IDS.has(skill.id)) {
        return false;
      }
      const displayName = getSkillDisplayName(skill);
      const matchesSearch = displayName.toLowerCase().includes(query)
        || skillService.getLocalizedSkillDescription(skill.id, skill.name, skill.description).toLowerCase().includes(query);
      if (!matchesSearch) {
        return false;
      }
      if (!hasLabelFilter) {
        return true;
      }
      const labels = getSkillFilterLabels(skill);
      return selectedSkillLabels.some((label) => labels.includes(label));
    });
  }, [skills, skillSearchQuery, selectedSkillLabels]);

  const availableSkillLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const skill of skills) {
      if (HIDDEN_SKILL_IDS.has(skill.id)) {
        continue;
      }
      for (const label of getSkillFilterLabels(skill)) {
        labels.add(label);
      }
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [skills]);

  const matchesSkillBinding = (config: SkillRoleConfigEntry, skill: Skill) => (
    config.skillId === skill.id
    || config.skillName === skill.name
    || config.skillName === getSkillDisplayName(skill)
  );

  const toggleSkillLabel = (label: string) => {
    setSelectedSkillLabels((current) => (
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
    ));
  };

  const getStoredSkillRoleConfigs = (skill: Skill): SkillRoleConfigEntry[] => {
    return roleConfigs.filter((config) => config.enabled && matchesSkillBinding(config, skill));
  };

  const getSkillRoleBindings = (skill: Skill): Array<{
    roleKey: 'all' | typeof AGENT_ROLE_ORDER[number];
  }> => {
    const bindings = new Map<string, {
      roleKey: 'all' | typeof AGENT_ROLE_ORDER[number];
    }>();

    for (const roleKey of AGENT_ROLE_ORDER) {
      const snapshot = roleCapabilitySnapshots[roleKey];
      const availableSkills = snapshot?.availableSkills ?? [];
      for (const boundSkill of availableSkills) {
        if (boundSkill.id !== skill.id) {
          continue;
        }

        const bindingKey = boundSkill.scope === 'all' ? 'all' : roleKey;
        if (!bindings.has(bindingKey)) {
          bindings.set(bindingKey, {
            roleKey: bindingKey,
          });
        }
      }
    }

    const order = ['all', ...AGENT_ROLE_ORDER];
    return Array.from(bindings.values()).sort((a, b) => (
      order.indexOf(a.roleKey) - order.indexOf(b.roleKey)
    ));
  };

  const getUnboundRoleLabels = (skill: Skill): string[] => {
    const bindings = getSkillRoleBindings(skill);
    if (bindings.some((binding) => binding.roleKey === 'all')) {
      return [];
    }

    const boundRoleKeys = new Set(bindings.map((binding) => binding.roleKey));
    return AGENT_ROLE_ORDER
      .filter((roleKey) => !boundRoleKeys.has(roleKey))
      .map((roleKey) => AGENT_ROLE_SHORT_LABELS[roleKey] || roleKey);
  };

  const getSkillSourceLabel = (skill: Skill) => {
    switch (skill.sourceType) {
      case 'user':
        return '本地导入';
      case 'claude':
        return '继承导入';
      case 'bundled':
        return '官方预装';
      default:
        return skill.isBuiltIn ? '系统内置' : '本地导入';
    }
  };

  const handleToggleSkill = async (skillId: string) => {
    const targetSkill = skills.find(skill => skill.id === skillId);
    if (!targetSkill) return;
    try {
      const updatedSkills = await skillService.setSkillEnabled(skillId, !targetSkill.enabled);
      dispatch(setSkills(updatedSkills));
      setSkillActionError('');
      showGlobalToast('技能设置已更新');
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新技能失败';
      setSkillActionError(message);
      showGlobalToast(message);
    }
  };

  const handleRequestDeleteSkill = (skill: Skill) => {
    if (skill.isBuiltIn) {
      setSkillActionError('系统内置技能不允许删除');
      return;
    }
    setSkillActionError('');
    setSkillPendingDelete(skill);
  };

  const handleCancelDeleteSkill = () => {
    if (isDeletingSkill) return;
    setSkillPendingDelete(null);
  };

  const handleConfirmDeleteSkill = async () => {
    if (!skillPendingDelete || isDeletingSkill) return;
    setIsDeletingSkill(true);
    setSkillActionError('');
    const result = await skillService.deleteSkill(skillPendingDelete.id);
    if (!result.success) {
      const message = result.error || '删除技能失败';
      setSkillActionError(message);
      showGlobalToast(message);
      setIsDeletingSkill(false);
      return;
    }
    if (result.skills) {
      dispatch(setSkills(result.skills));
    }
    showGlobalToast('技能已删除');
    setIsDeletingSkill(false);
    setSkillPendingDelete(null);
  };

  const handleSaveSkillCategory = async () => {
    if (!selectedSkill || isSavingSkillCategory) return;

    const nextCategory = skillCategoryDraft.trim() || undefined;
    const currentCategory = selectedSkill.category?.trim() || undefined;
    if (nextCategory === currentCategory) {
      return;
    }

    setIsSavingSkillCategory(true);
    setSkillActionError('');
    try {
      const updatedSkills = await skillService.updateSkillMetadata(selectedSkill.id, { category: nextCategory });
      dispatch(setSkills(updatedSkills));
      const refreshedSkill = updatedSkills.find((skill) => skill.id === selectedSkill.id) ?? null;
      setSelectedSkill(refreshedSkill);
      showGlobalToast('技能分类已更新');
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新技能分类失败';
      setSkillActionError(message);
      showGlobalToast(message);
    } finally {
      setIsSavingSkillCategory(false);
    }
  };

  // 无效 skill = 非内置 且 prompt 为空（SKILL.md 读取失败或文件损坏）
  const invalidSkills = useMemo(
    () => skills.filter(s => !HIDDEN_SKILL_IDS.has(s.id) && !s.isBuiltIn && !s.prompt),
    [skills]
  );

  /* ## {提取} DuplicateCleanupDialog / DuplicateSkillGrouping
     同名副本识别与清理是可复用目录治理逻辑。
     后续适合抽成公共“重复项分组 + 清理确认”能力。 */
  const duplicateSkillGroups = useMemo(() => {
    const groups = new Map<string, Skill[]>();
    for (const skill of skills) {
      if (HIDDEN_SKILL_IDS.has(skill.id) || skill.isBuiltIn) {
        continue;
      }
      const displayName = getSkillDisplayName(skill).trim().toLowerCase();
      if (!displayName) {
        continue;
      }
      const existing = groups.get(displayName) ?? [];
      existing.push(skill);
      groups.set(displayName, existing);
    }
    return Array.from(groups.entries())
      .map(([displayName, entries]) => ({
        displayName,
        entries: [...entries].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)),
      }))
      .filter((group) => group.entries.length > 1);
  }, [skills]);

  const duplicateSkillCount = useMemo(
    () => duplicateSkillGroups.reduce((sum, group) => sum + Math.max(0, group.entries.length - 1), 0),
    [duplicateSkillGroups]
  );

  /* ## {提取} GroupedCatalogSection
     当前技能列表已开始按前缀分组折叠。
     这套“目录分组 + 折叠 + 卡片列表”后续适合给 Skills / MCP 共同复用。 */
  const groupedSkills = useMemo(() => {
    const groups = new Map<string, Skill[]>();
    const getGroupKey = (skill: Skill): string => {
      const displayName = getSkillDisplayName(skill).trim();
      const slashMatch = /^([^/]+)\//.exec(displayName);
      if (slashMatch) {
        return slashMatch[1].trim().toLowerCase();
      }
      const dashMatch = /^([a-z0-9]+)[-_][a-z0-9]/i.exec(displayName);
      if (dashMatch) {
        return dashMatch[1].trim().toLowerCase();
      }
      return 'ungrouped';
    };

    for (const skill of filteredSkills) {
      const key = getGroupKey(skill);
      const existing = groups.get(key) ?? [];
      existing.push(skill);
      groups.set(key, existing);
    }

    return Array.from(groups.entries())
      .map(([key, entries]) => ({
        key,
        title: key === 'ungrouped' ? '其他技能' : (SKILL_GROUP_LABELS[key] || key),
        entries,
      }))
      .sort((a, b) => {
        if (a.key === 'ungrouped') return 1;
        if (b.key === 'ungrouped') return -1;
        return a.title.localeCompare(b.title, 'zh-CN');
      });
  }, [filteredSkills]);

  const handleCleanInvalidSkills = async () => {
    setIsCleaningInvalid(true);
    setShowCleanConfirm(false);
    let lastSkills = skills;
    for (const skill of invalidSkills) {
      const result = await skillService.deleteSkill(skill.id);
      if (result.skills) lastSkills = result.skills;
    }
    dispatch(setSkills(lastSkills));
    setIsCleaningInvalid(false);
    showGlobalToast(`已清理 ${invalidSkills.length} 个无效技能`);
  };

  const handleCleanDuplicateSkills = async () => {
    setIsCleaningDuplicates(true);
    setShowDuplicateCleanConfirm(false);
    let lastSkills = skills;
    let deletedCount = 0;
    for (const group of duplicateSkillGroups) {
      const removable = group.entries.slice(1);
      for (const skill of removable) {
        const result = await skillService.deleteSkill(skill.id);
        if (result.skills) {
          lastSkills = result.skills;
        }
        deletedCount += 1;
      }
    }
    dispatch(setSkills(lastSkills));
    setIsCleaningDuplicates(false);
    showGlobalToast(`已清理 ${deletedCount} 个重复副本`);
  };

  const handleAddSkillFromSource = async (source: string) => {
    const trimmedSource = source.trim();
    if (!trimmedSource) return;
    setIsDownloadingSkill(true);
    setSkillActionError('');
    const result = await skillService.downloadSkill(trimmedSource, skillDisplayAlias.trim() || undefined);
    setIsDownloadingSkill(false);
    if (!result.success) {
      const message = result.error || '导入技能失败';
      setSkillActionError(message);
      showGlobalToast(message);
      return;
    }
    if (result.skills) {
      dispatch(setSkills(result.skills));
      const bindResult = await applyImportedSkillTargets(result.importedSkills ?? []);
      if (!bindResult.success) {
        const message = bindResult.error || '技能已导入，但安装对象绑定失败';
        setSkillActionError(message);
        showGlobalToast(message);
        return;
      }
    }
    const importedCount = result.importedSkills?.length ?? 0;
    const importedNames = (result.importedSkills ?? [])
      .slice(0, 3)
      .map((skill) => getSkillDisplayName(skill))
      .join('、');
    showGlobalToast(
      importedCount > 0
        ? `已导入 ${importedCount} 个技能${importedNames ? `：${importedNames}` : ''}`
        : importSuccessMessage
    );
    setSkillDownloadSource('');
    setSkillDisplayAlias('');
    setIsAddSkillMenuOpen(false);
    setIsGithubImportOpen(false);
    setImportTargetRoleKeys([]);
  };

  const handleUploadSkillZip = async () => {
    if (isDownloadingSkill) return;
    const file = await WebFileOperations.selectFile({ accept: '.zip' });
    if (file) {
      setIsDownloadingSkill(true);
      setSkillActionError('');
      const dataUrl = await WebFileOperations.readFileAsDataURL(file);
      const result = await skillService.importUploadedSkill({
        kind: 'zip',
        fileName: file.name,
        dataUrl,
        displayName: skillDisplayAlias.trim() || undefined,
      });
      setIsDownloadingSkill(false);
      if (!result.success) {
        const message = result.error || '导入技能失败';
        setSkillActionError(message);
        showGlobalToast(message);
        return;
      }
      if (result.skills) {
        dispatch(setSkills(result.skills));
        const bindResult = await applyImportedSkillTargets(result.importedSkills ?? []);
        if (!bindResult.success) {
          const message = bindResult.error || '技能已导入，但安装对象绑定失败';
          setSkillActionError(message);
          showGlobalToast(message);
          return;
        }
      }
      setIsAddSkillMenuOpen(false);
      setSkillDisplayAlias('');
      setImportTargetRoleKeys([]);
      const importedCount = result.importedSkills?.length ?? 0;
      const importedNames = (result.importedSkills ?? [])
        .slice(0, 3)
        .map((skill) => getSkillDisplayName(skill))
        .join('、');
      showGlobalToast(
        importedCount > 0
          ? `已导入 ${importedCount} 个技能${importedNames ? `：${importedNames}` : ''}`
          : importSuccessMessage
      );
    }
  };

  const handleUploadSkillFolder = async () => {
    if (isDownloadingSkill) return;
    const result = await WebFileOperations.selectDirectory();
    if (result) {
      setIsDownloadingSkill(true);
      setSkillActionError('');
      const files = await Promise.all(result.files.map(async (file) => ({
        relativePath: file.webkitRelativePath || file.name,
        dataUrl: await WebFileOperations.readFileAsDataURL(file),
      })));
      const importResult = await skillService.importUploadedSkill({
        kind: 'folder',
        folderName: result.name,
        files,
        displayName: skillDisplayAlias.trim() || undefined,
      });
      setIsDownloadingSkill(false);
      if (!importResult.success) {
        const message = importResult.error || '导入技能失败';
        setSkillActionError(message);
        showGlobalToast(message);
        return;
      }
      if (importResult.skills) {
        dispatch(setSkills(importResult.skills));
        const bindResult = await applyImportedSkillTargets(importResult.importedSkills ?? []);
        if (!bindResult.success) {
          const message = bindResult.error || '技能已导入，但安装对象绑定失败';
          setSkillActionError(message);
          showGlobalToast(message);
          return;
        }
      }
      setIsAddSkillMenuOpen(false);
      setSkillDisplayAlias('');
      setImportTargetRoleKeys([]);
      const importedCount = importResult.importedSkills?.length ?? 0;
      const importedNames = (importResult.importedSkills ?? [])
        .slice(0, 3)
        .map((skill) => getSkillDisplayName(skill))
        .join('、');
      showGlobalToast(
        importedCount > 0
          ? `已导入 ${importedCount} 个技能${importedNames ? `：${importedNames}` : ''}`
          : importSuccessMessage
      );
    }
  };

  const handleOpenGithubImport = () => {
    setIsAddSkillMenuOpen(false);
    setSkillActionError('');
    setIsGithubImportOpen(true);
  };

  const handleImportFromGithub = async () => {
    if (isDownloadingSkill) return;
    await handleAddSkillFromSource(skillDownloadSource);
  };

  const toggleImportTargetRole = (roleKey: string) => {
    setImportTargetRoleKeys((current) => (
      current.includes(roleKey)
        ? current.filter((item) => item !== roleKey)
        : [...current, roleKey]
    ));
  };

  const getImportBindingTargets = () => (
    importTargetRoleKeys.length > 0 ? importTargetRoleKeys : ['all']
  );

  const applyImportedSkillTargets = async (importedSkills: Skill[]): Promise<{ success: boolean; error?: string }> => {
    if (importedSkills.length === 0) {
      return { success: false, error: '没有识别到本次新导入的技能，已取消自动绑定' };
    }
    const targetRoleKeys = getImportBindingTargets();
    for (const skill of importedSkills) {
      const result = await skillService.batchInstallSkillForRoles({
        skillId: skill.id,
        skillName: getSkillDisplayName(skill),
        roleKeys: targetRoleKeys,
      });
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  };

  const renderImportTargetPicker = () => (
    <div className="rounded-xl border dark:border-claude-darkBorder/70 border-claude-border/70 bg-black/5 dark:bg-white/5 px-3 py-3">
      <div className="text-xs font-semibold dark:text-claude-darkText text-claude-text">
        {'安装对象'}
      </div>
      <div className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
        {'可多选。一个都不勾时，默认按全局安装。'}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {AGENT_ROLE_ORDER.map((roleKey) => {
          const selected = importTargetRoleKeys.includes(roleKey);
          return (
            <button
              key={`import-target-${roleKey}`}
              type="button"
              onClick={() => toggleImportTargetRole(roleKey)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                selected
                  ? 'border-claude-accent bg-claude-accent/10 text-claude-accent'
                  : 'dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover'
              }`}
            >
              {AGENT_ROLE_SHORT_LABELS[roleKey]}
            </button>
          );
        })}
        <span className={`rounded-full px-3 py-1.5 text-xs ${
          importTargetRoleKeys.length === 0
            ? 'bg-green-500/15 text-green-700 dark:text-green-300'
            : 'bg-black/5 text-claude-textSecondary dark:bg-white/5 dark:text-claude-darkTextSecondary'
        }`}>
          {importTargetRoleKeys.length === 0 ? '当前默认：全局' : `已选 ${importTargetRoleKeys.length} 个角色`}
        </span>
      </div>
    </div>
  );

  const handleToggleSkillRole = async (skill: Skill, roleKey: string) => {
    const existing = getStoredSkillRoleConfigs(skill).find((binding) => binding.roleKey === roleKey);
    let result: { success: boolean; error?: string };

    if (existing) {
      result = await skillService.removeRoleConfig(existing.id);
    } else {
      result = await skillService.installSkillForRole({
        roleKey,
        skillId: skill.id,
        skillName: getSkillDisplayName(skill),
      });
    }

    if (!result.success) {
      const message = result.error || '更新技能角色绑定失败';
      setSkillActionError(message);
      showGlobalToast(message);
      return;
    }

    const configs = await skillService.listAllRoleConfigs();
    setRoleConfigs(configs);
    const nextResponses = await Promise.all(
      AGENT_ROLE_ORDER.map(async (nextRoleKey) => [nextRoleKey, await skillService.getRoleRuntime(nextRoleKey)] as const)
    );
    const nextSnapshots: Partial<Record<string, RoleCapabilitySnapshotFile>> = {};
    for (const [nextRoleKey, payload] of nextResponses) {
      if (payload?.capabilitySnapshot) {
        nextSnapshots[nextRoleKey] = payload.capabilitySnapshot;
      }
    }
    setRoleCapabilitySnapshots(nextSnapshots);
    showGlobalToast(existing ? '已解除角色绑定' : '已绑定到角色');
  };

  const selectedSkillCategory = selectedSkill?.category?.trim() || '';
  const hasSelectedSkillCategoryChanged = Boolean(selectedSkill) && selectedSkillCategory !== skillCategoryDraft.trim();

  const selectedSkillRoleBindings = selectedSkill ? getSkillRoleBindings(selectedSkill) : [];
  const selectedSkillUnboundRoleLabels = selectedSkill ? getUnboundRoleLabels(selectedSkill) : [];
  const selectedSkillDescription = selectedSkill
    ? skillService.getLocalizedSkillDescription(selectedSkill.id, selectedSkill.name, selectedSkill.description)
    : '';
  const selectedSkillSourceLabel = selectedSkill ? getSkillSourceLabel(selectedSkill) : '';
  const handleSkillDetailToggleEnabled = () => {
    if (!selectedSkill) return;
    handleToggleSkill(selectedSkill.id);
    setSelectedSkill((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev));
  };
  const handleSkillDetailRoleToggle = (roleKey: RoleOptionKey) => {
    if (!selectedSkill) return;
    void handleToggleSkillRole(selectedSkill, roleKey);
  };
  const formatSkillHeader = (skill: Skill) => `(${skill.category?.trim() || '未分类'}) ${getSkillDisplayName(skill)}`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/40 bg-claude-surface/60 p-4 space-y-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold dark:text-claude-text text-claude-text">
                  {'当前角色可用技能，可直接调整后在对话中使用。'}
                </p>
                <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  {'保持首屏简洁，需时点击卡片展开详情。'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowRuntimeHint((value) => !value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-sky-100/80 dark:border-sky-800/70 bg-sky-50/80 dark:bg-sky-950/20 px-2.5 py-1 text-sky-700 dark:text-sky-200 transition-colors ${UI_BADGE_TEXT_CLASS}`}
                >
                  <InformationCircleIcon className={UI_MARK_ICON_CLASS} />
                  {'说明'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCompatHint((value) => !value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-amber-100/80 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-2.5 py-1 text-amber-700 dark:text-amber-200 transition-colors ${UI_BADGE_TEXT_CLASS}`}
                >
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  {'兼容'}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {!shouldHideHeaderSearch && (
                <div className="relative flex-1">
                  <SearchIcon className={`absolute left-3 top-1/2 -translate-y-1/2 ${UI_MENU_ICON_CLASS} dark:text-claude-darkTextSecondary text-claude-textSecondary`} />
                  <input
                    type="text"
                    placeholder={'搜索技能'}
                    value={skillSearchQuery}
                    onChange={(e) => setSkillSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-end w-full sm:w-auto">
                {invalidSkills.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCleanConfirm(true)}
                    disabled={isCleaningInvalid}
                    className="flex items-center gap-2 rounded-full border border-red-300/70 dark:border-red-800 text-xs px-3 py-1 text-red-600 dark:text-red-300 bg-red-50/60 dark:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TrashIcon className={UI_MENU_ICON_CLASS} />
                    <span>{isCleaningInvalid ? '清理中...' : `清理无效 (${invalidSkills.length})`}</span>
                  </button>
                )}
                {duplicateSkillCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDuplicateCleanConfirm(true)}
                    disabled={isCleaningDuplicates}
                    className="flex items-center gap-2 rounded-full border border-amber-300/70 dark:border-amber-800 text-xs px-3 py-1 text-amber-700 dark:text-amber-200 bg-amber-50/60 dark:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TrashIcon className={UI_MENU_ICON_CLASS} />
                    <span>{isCleaningDuplicates ? '清理中...' : `清理重复 (${duplicateSkillCount})`}</span>
                  </button>
                )}
                <div className="relative">
                  <button
                    ref={addSkillButtonRef}
                    type="button"
                    onClick={() => setIsAddSkillMenuOpen(prev => !prev)}
                    className="inline-flex items-center gap-2 rounded-full border bg-claude-surface/80 dark:bg-claude-darkSurface border-claude-border dark:border-claude-darkBorder px-3 py-1 text-sm dark:text-claude-text text-claude-text"
                  >
                    <PlusCircleIcon className={UI_MENU_ICON_CLASS} />
                    <span>{'添加'}</span>
                  </button>

                  {isAddSkillMenuOpen && (
                    <div
                      ref={addSkillMenuRef}
                      className="absolute right-0 mt-2 w-80 rounded-2xl border border-claude-border dark:border-claude-darkBorder bg-claude-surface/80 dark:bg-claude-darkSurface shadow-lg z-popover overflow-hidden"
                      style={{ zIndex: 'var(--z-popover)' }}
                    >
                      <div className="px-3 py-3 border-b border-claude-border dark:border-claude-darkBorder/70">
                        {renderImportTargetPicker()}
                        <div className="mt-3 space-y-1">
                          <div className="text-xs font-semibold dark:text-claude-darkText text-claude-text">
                            {'显示别名'}
                          </div>
                          <input
                            type="text"
                            value={skillDisplayAlias}
                            onChange={(e) => setSkillDisplayAlias(e.target.value)}
                            placeholder={'可选：只改界面显示名，不改 skill_id'}
                            className="w-full px-3 py-2 text-sm rounded-xl dark:bg-claude-darkBg bg-claude-bg dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleUploadSkillZip}
                        disabled={isDownloadingSkill}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50"
                      >
                        <UploadIcon className={`${UI_MENU_ICON_CLASS} dark:text-claude-darkTextSecondary text-claude-textSecondary`} />
                        <span>{'上传 .zip'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleUploadSkillFolder}
                        disabled={isDownloadingSkill}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-50"
                      >
                        <FolderOpenIcon className={`${UI_MENU_ICON_CLASS} dark:text-claude-darkTextSecondary text-claude-textSecondary`} />
                        <span>{'上传文件夹'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenGithubImport}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                      >
                        <LinkIcon className={`${UI_MENU_ICON_CLASS} dark:text-claude-darkTextSecondary text-claude-textSecondary`} />
                        <span>{'从 GitHub 导入'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {showRuntimeHint && (
          <div className="rounded-2xl border border-sky-200/70 dark:border-sky-800/70 bg-sky-50/80 dark:bg-sky-950/20 px-4 py-3 space-y-1">
            <p className="text-sm leading-6 text-sky-700 dark:text-sky-200">
              {'这里看到的是角色当前真正能用到的技能结果，系统会按角色绑定和运行配置筛出实际能力。'}
            </p>
            <div className="text-xs text-sky-600 dark:text-sky-300/90 space-y-1">
              <div>{'先导入，再选择给哪个角色使用，最后才会进入真实对话能力。'}</div>
              <div>{'只保留已经对当前角色生效的结果，不直接铺开底层技术细节。'}</div>
            </div>
          </div>
        )}

        {showCompatHint && (
          <div className="rounded-2xl border border-amber-200/70 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3">
            <p className="text-sm leading-6 text-amber-700 dark:text-amber-200">
              {claudeCliSkillsNotice}
            </p>
          </div>
        )}

        {skillActionError && (
          <ErrorMessage
            message={skillActionError}
            onClose={() => setSkillActionError('')}
          />
        )}
      </div>

      {availableSkillLabels.length > 0 && (
        <div
          aria-label="技能市场"
          className="rounded-2xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/30 bg-claude-surface/50 px-4 py-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold dark:text-claude-text text-claude-text">
              {'标签 / 分类'}
            </span>
            <span className="text-[11px] text-claude-textSecondary dark:text-claude-darkTextSecondary">
              {'过滤已装技能，快速定位能力面。'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableSkillLabels.map((label) => {
              const checked = selectedSkillLabels.includes(label);
              return (
                <label
                  key={label}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer transition-colors ${
                    checked
                      ? 'border-claude-accent bg-claude-accent/10 text-claude-accent'
                      : 'dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSkillLabel(label)}
                    className="h-3.5 w-3.5 rounded border-claude-border text-claude-accent focus:ring-claude-accent"
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/30 bg-claude-surface/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
              {'已装技能'}
            </p>
            <p className="text-[11px] text-claude-textSecondary dark:text-claude-darkTextSecondary">
              {'点击卡片查看详情，保持首屏轻量。'}
            </p>
          </div>
          <span className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">{`共 ${filteredSkills.length} 项`}</span>
        </div>

        {filteredSkills.length === 0 ? (
          <div className="text-center py-8 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'暂无可用技能'}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedSkills.map((group) => (
              <div
                key={`skill-group-${group.key}`}
                className="space-y-3 border-b border-claude-border dark:border-claude-darkBorder pb-4 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => setCollapsedSkillGroups((prev) => ({
                    ...prev,
                    [group.key]: !prev[group.key],
                  }))}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-medium dark:text-claude-darkText text-claude-text transition-colors hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover"
                >
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full bg-claude-accent/10 px-2 py-0.5 text-claude-accent ${UI_BADGE_TEXT_CLASS}`}>
                      {group.entries.length}
                    </span>
                    <span>{group.title}</span>
                  </div>
                  <span className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                    {collapsedSkillGroups[group.key] ? '展开' : '收起'}
                  </span>
                </button>

                {!collapsedSkillGroups[group.key] && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {group.entries.map((skill) => {
                      const bindings = getSkillRoleBindings(skill);
                      const roleLabel = bindings.length === 0
                        ? '未绑定'
                        : bindings.some((binding) => binding.roleKey === 'all')
                          ? '全部角色'
                          : bindings
                            .slice(0, 2)
                            .map((binding) => AGENT_ROLE_SHORT_LABELS[binding.roleKey] || binding.roleKey)
                            .join(' / ');
                      const description = skillService.getLocalizedSkillDescription(skill.id, skill.name, skill.description);

                      return (
                        <div
                          key={skill.id}
                          className="group rounded-xl border border-claude-border dark:border-claude-darkBorder bg-white/60 dark:bg-claude-darkSurface/80 p-3 cursor-pointer transition-colors hover:border-claude-accent/60 dark:hover:border-claude-accent/60"
                          onClick={() => setSelectedSkill(skill)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm font-semibold dark:text-claude-darkText text-claude-text line-clamp-1">
                                {formatSkillHeader(skill)}
                              </p>
                              <p className="text-[12px] leading-5 text-claude-textSecondary dark:text-claude-darkTextSecondary line-clamp-1">
                                {description}
                              </p>
                                <span className={`font-medium text-claude-accent ${UI_BADGE_TEXT_CLASS}`}>
                                  {'查看更多'}
                                </span>
                            </div>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              {!skill.isBuiltIn && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleRequestDeleteSkill(skill); }}
                                  className="p-1 rounded-lg text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                  title={'删除技能'}
                                >
                                  <TrashIcon className={UI_MENU_ICON_CLASS} />
                                </button>
                              )}
                              <div
                                className={`w-9 h-5 rounded-full flex items-center transition-colors cursor-pointer ${
                                  skill.enabled ? 'bg-claude-accent' : 'dark:bg-claude-darkBorder bg-claude-border'
                                }`}
                                onClick={(e) => { e.stopPropagation(); handleToggleSkill(skill.id); }}
                              >
                                <div
                                  className={`w-3.5 h-3.5 rounded-full bg-white shadow-md transform transition-transform ${
                                    skill.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                  }`}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 space-y-1 text-[11px] text-claude-textSecondary dark:text-claude-darkTextSecondary">
                            <div className="min-w-0">{`绑定角色：${roleLabel}`}</div>
                            <div className={`font-semibold ${skill.enabled ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-400'}`}>
                              {skill.enabled ? '已开启' : '已关闭'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedSkill && (
        <SkillDetailOverlay
          skill={selectedSkill}
          description={selectedSkillDescription}
          sourceLabel={selectedSkillSourceLabel}
          onClose={() => setSelectedSkill(null)}
          onToggleEnabled={handleSkillDetailToggleEnabled}
          onDeleteRequest={handleRequestDeleteSkill}
          categoryDraft={skillCategoryDraft}
          onCategoryDraftChange={(value) => setSkillCategoryDraft(value)}
          onSaveCategory={handleSaveSkillCategory}
          hasCategoryChanged={hasSelectedSkillCategoryChanged}
          isSavingCategory={isSavingSkillCategory}
          roleBindings={selectedSkillRoleBindings}
          unboundRoleLabels={selectedSkillUnboundRoleLabels}
          onToggleRole={handleSkillDetailRoleToggle}
        />
      )}

      {skillPendingDelete && createPortal(
        <ConfirmDialog
          isOpen={true}
          title={'删除技能'}
          message={'确定删除技能“{name}”吗？'.replace('{name}', getSkillDisplayName(skillPendingDelete))}
          onConfirm={handleConfirmDeleteSkill}
          onCancel={handleCancelDeleteSkill}
          confirmLabel={'确认删除'}
          cancelLabel={'取消'}
          confirmTone="danger"
          pending={isDeletingSkill}
          details={skillActionError ? <div className="text-xs text-red-500">{skillActionError}</div> : undefined}
        />
      , document.body)}

      {showCleanConfirm && createPortal(
        <ConfirmDialog
          isOpen={true}
          title={'清理无效技能'}
          message={`以下 ${invalidSkills.length} 个技能的 SKILL.md 无法读取，将被删除：`}
          onConfirm={handleCleanInvalidSkills}
          onCancel={() => setShowCleanConfirm(false)}
          confirmLabel={'确认清理'}
          cancelLabel={'取消'}
          confirmTone="danger"
          details={(
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {invalidSkills.map(s => (
                <li key={s.id} className="text-xs px-2 py-1 rounded-lg dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary truncate">
                  {s.name || s.id}
                </li>
              ))}
            </ul>
          )}
        />
      , document.body)}

      {/* ## {提取} ConfirmDialog
          这里仍是手写 fixed confirm 壳。
          后续适合统一抽成 ConfirmDialog，让 Skills / MCP / Sidebar / ScheduledTasks 共用。 */}
      {showDuplicateCleanConfirm && createPortal(
        <ConfirmDialog
          isOpen={true}
          title={'清理重复副本'}
          message={`将按同名分组保留每组最新的 1 个，删除其余 ${duplicateSkillCount} 个旧副本。`}
          onConfirm={handleCleanDuplicateSkills}
          onCancel={() => setShowDuplicateCleanConfirm(false)}
          confirmLabel={'确认清理'}
          cancelLabel={'取消'}
          confirmTone="accent"
          pending={isCleaningDuplicates}
          details={(
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {duplicateSkillGroups.map((group) => (
                <li key={group.displayName} className="rounded-lg px-2 py-1 text-xs dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {`${getSkillDisplayName(group.entries[0])}：保留 ${group.entries[0].id}，删除 ${group.entries.slice(1).map((item) => item.id).join('、')}`}
                </li>
              ))}
            </ul>
          )}
        />
      , document.body)}

      {/* ## {提取} ImportDialog
          GitHub 导入仍是手写 fixed dialog。
          后续适合统一抽成 ImportDialog / CatalogImportDialog。 */}
      {isGithubImportOpen && createPortal(
        <ImportDialog
          isOpen={true}
          title={'从 GitHub 导入'}
          description={'支持仓库链接与子目录链接；若仓库内有多个技能，请精确指向单个技能目录或 SKILL.md。'}
          onConfirm={handleImportFromGithub}
          onCancel={() => setIsGithubImportOpen(false)}
          confirmLabel={'导入'}
          confirmDisabled={isDownloadingSkill || !skillDownloadSource.trim()}
          pending={isDownloadingSkill}
          body={(
            <div className="space-y-3">
              {renderImportTargetPicker()}
              <div className="text-xs font-semibold tracking-wide dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'URL'}
              </div>
              <input
                ref={githubImportInputRef}
                type="text"
                value={skillDownloadSource}
                onChange={(e) => setSkillDownloadSource(e.target.value)}
                placeholder={'例如：owner/repo 或 GitHub tree/blob 链接'}
                className="w-full px-3 py-2.5 text-sm rounded-xl dark:bg-claude-darkBg bg-claude-bg dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
              />
              <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'示例：owner/repo；https://github.com/owner/repo/tree/main/SKILLs/my-skill'}
              </p>
              <div>
                <div className="text-xs font-semibold dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'显示别名'}
                </div>
                <input
                  type="text"
                  value={skillDisplayAlias}
                  onChange={(e) => setSkillDisplayAlias(e.target.value)}
                  placeholder={'可选：只改界面显示名，不改 skill_id'}
                  className="mt-2 w-full px-3 py-2.5 text-sm rounded-xl dark:bg-claude-darkBg bg-claude-bg dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
                />
              </div>
              <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'导入成功后会立刻按上面的安装对象绑定；如果一个都不勾，则默认按全局安装。'}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300">
                {claudeCliSkillsNotice}
              </p>
              {skillActionError && (
                <div className="text-xs text-red-500">
                  {skillActionError}
                </div>
              )}
            </div>
          )}
        />
      , document.body)}

    </div>
  );
};

export default SkillsManager;
