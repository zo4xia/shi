// {路标} FLOW-PAGE-SKILLS
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import SearchIcon from '../icons/SearchIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import UploadIcon from '../icons/UploadIcon';
import FolderOpenIcon from '../icons/FolderOpenIcon';
import LinkIcon from '../icons/LinkIcon';
import PuzzleIcon from '../icons/PuzzleIcon';
import TrashIcon from '../icons/TrashIcon';
import {
  skillService,
  type RoleCapabilitySnapshotFile,
  type SkillRoleConfigEntry,
} from '../../services/skill';
import { showGlobalToast } from '../../services/toast';
import { setSkills } from '../../store/slices/skillSlice';
import { RootState } from '../../store';
import { Skill, getSkillDisplayName, getSkillFilterLabels } from '../../types/skill';
import { WebFileOperations } from '../../utils/fileOperations';
import ErrorMessage from '../ErrorMessage';
import { AGENT_ROLE_ORDER, AGENT_ROLE_SHORT_LABELS } from '../../../shared/agentRoleConfig';
import { RUNTIME_FLOW_TAGS } from '../../../shared/runtimeFlowTags';

const HIDDEN_SKILL_IDS = new Set(['daily-memory-extraction']);

const SkillsManager: React.FC = () => {
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
  const [importTargetRoleKeys, setImportTargetRoleKeys] = useState<string[]>([]);
  const [showRuntimeHint, setShowRuntimeHint] = useState(false);
  const [showCompatHint, setShowCompatHint] = useState(false);
  const [showSelectedSkillPath, setShowSelectedSkillPath] = useState(false);
  const [skillDisplayAlias, setSkillDisplayAlias] = useState('');
  const [selectedSkillLabels, setSelectedSkillLabels] = useState<string[]>([]);
  const [skillCategoryDraft, setSkillCategoryDraft] = useState('');
  const [isSavingSkillCategory, setIsSavingSkillCategory] = useState(false);

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
      setShowSelectedSkillPath(false);
      return;
    }
    setSkillCategoryDraft(selectedSkill.category ?? '');
    setIsSavingSkillCategory(false);
    setShowSelectedSkillPath(false);
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

  const formatSkillDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const locale = 'zh-CN';
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
  };

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
    scope: string;
    configPath: string;
    secretPath: string;
  }> => {
    const bindings = new Map<string, {
      roleKey: 'all' | typeof AGENT_ROLE_ORDER[number];
      scope: string;
      configPath: string;
      secretPath: string;
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
            scope: boundSkill.scope,
            configPath: boundSkill.configPath,
            secretPath: boundSkill.secretPath,
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

  const getSkillTypeLabel = (skill: Skill) => {
    if (skill.id === 'daily-memory-extraction') {
      return RUNTIME_FLOW_TAGS.memorySkill.label;
    }
    return RUNTIME_FLOW_TAGS.skillFile.label;
  };

  const getSkillFlowLine = (skill: Skill) => {
    if (skill.id === 'daily-memory-extraction') {
      return RUNTIME_FLOW_TAGS.memorySkill.line;
    }
    return RUNTIME_FLOW_TAGS.skillFile.line;
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
    showGlobalToast(importSuccessMessage);
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
      showGlobalToast(importSuccessMessage);
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
      showGlobalToast(importSuccessMessage);
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

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {'为您的智能体提供预封装且可重复的最佳实践与工具'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowRuntimeHint((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 dark:border-sky-800/70 bg-sky-50/90 dark:bg-sky-950/20 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-200 transition-colors"
        >
          <InformationCircleIcon className="h-3.5 w-3.5" />
          {'说明'}
        </button>
        <button
          type="button"
          onClick={() => setShowCompatHint((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/20 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-200 transition-colors"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          {'兼容提示'}
        </button>
      </div>

      {showRuntimeHint && (
        <div className="rounded-2xl border border-sky-200/80 dark:border-sky-800/70 bg-sky-50/90 dark:bg-sky-950/20 px-4 py-3 space-y-1.5">
          <p className="text-sm leading-6 text-sky-700 dark:text-sky-200">
            {'这里直接读取角色能力真相视图。真实运行目录以应用数据目录下的 SKILLs、roles/<role>/skills.json 与 role-capabilities.json 为准。'}
          </p>
          <div className="space-y-1 text-xs leading-5 text-sky-600 dark:text-sky-300/90">
            <div>{RUNTIME_FLOW_TAGS.skillFile.line}</div>
            <div>{RUNTIME_FLOW_TAGS.roleIndex.line}</div>
            <div>{'前端默认只展示当前角色真正可用的结果：角色绑定 + 全局可用。'}</div>
            <div>{'注意：内置 Memory / Playwright 这类工具服务器不在这里，它们属于 MCP。'}</div>
          </div>
        </div>
      )}

      {showCompatHint && (
        <div className="rounded-2xl border border-amber-200/80 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/20 px-4 py-3">
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

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
          <input
            type="text"
            placeholder={'搜索技能'}
            value={skillSearchQuery}
            onChange={(e) => setSkillSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl dark:bg-claude-darkSurface bg-claude-surface dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
          />
        </div>
        {invalidSkills.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCleanConfirm(true)}
            disabled={isCleaningInvalid}
            className="px-3 py-2 text-sm rounded-xl border transition-colors border-red-300 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <TrashIcon className="h-4 w-4" />
            <span>{isCleaningInvalid ? '清理中...' : `清理无效 (${invalidSkills.length})`}</span>
          </button>
        )}
        <div className="relative">
          <button
            ref={addSkillButtonRef}
            type="button"
            onClick={() => setIsAddSkillMenuOpen(prev => !prev)}
            className="px-3 py-2 text-sm rounded-xl border transition-colors dark:bg-claude-darkSurface bg-claude-surface dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover flex items-center gap-2"
          >
            <PlusCircleIcon className="h-4 w-4" />
            <span>{'添加'}</span>
          </button>

          {isAddSkillMenuOpen && (
            <div
              ref={addSkillMenuRef}
              className="absolute right-0 mt-2 w-80 rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-lg z-50 overflow-hidden"
            >
              <div className="px-3 py-3 border-b dark:border-claude-darkBorder/70 border-claude-border/70">
                {renderImportTargetPicker()}
                <div className="mt-3">
                  <div className="text-xs font-semibold dark:text-claude-darkText text-claude-text">
                    {'显示别名'}
                  </div>
                  <input
                    type="text"
                    value={skillDisplayAlias}
                    onChange={(e) => setSkillDisplayAlias(e.target.value)}
                    placeholder={'可选：只改界面显示名，不改 skill_id'}
                    className="mt-2 w-full px-3 py-2 text-sm rounded-xl dark:bg-claude-darkBg bg-claude-bg dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleUploadSkillZip}
                disabled={isDownloadingSkill}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors disabled:opacity-50"
              >
                <UploadIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                <span>{'上传 .zip'}</span>
              </button>
              <button
                type="button"
                onClick={handleUploadSkillFolder}
                disabled={isDownloadingSkill}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors disabled:opacity-50"
              >
                <FolderOpenIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                <span>{'上传文件夹'}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenGithubImport}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
              >
                <LinkIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                <span>{'从 GitHub 导入'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {availableSkillLabels.length > 0 && (
        <div className="mb-4 rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/35 bg-claude-surface/35 p-3">
          <div className="text-xs font-semibold dark:text-claude-darkText text-claude-text">
            {'标签 / 分类'}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {availableSkillLabels.map((label) => {
              const checked = selectedSkillLabels.includes(label);
              return (
                <label
                  key={label}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors ${
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

      <div className="grid grid-cols-2 gap-4">
        {filteredSkills.length === 0 ? (
          <div className="col-span-2 text-center py-8 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'暂无可用技能'}
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className="rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/50 bg-claude-surface/50 p-3 transition-colors hover:border-claude-accent/50 cursor-pointer"
              onClick={() => setSelectedSkill(skill)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg dark:bg-claude-darkSurface bg-claude-surface flex items-center justify-center flex-shrink-0">
                    <PuzzleIcon className="h-4 w-4 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                  </div>
                  <span className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate">
                    {getSkillDisplayName(skill)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!skill.isBuiltIn && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRequestDeleteSkill(skill); }}
                      className="p-1 rounded-lg text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      title={'删除技能'}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                  <div
                    className={`w-9 h-5 rounded-full flex items-center transition-colors cursor-pointer flex-shrink-0 ${
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

              <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary line-clamp-2 mb-2">
                {skillService.getLocalizedSkillDescription(skill.id, skill.name, skill.description)}
              </p>

              <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400 mb-2">
                {getSkillFlowLine(skill)}
              </p>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {getSkillFilterLabels(skill).map((label) => (
                  <span key={`${skill.id}:${label}`} className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-300 font-medium">
                    {label}
                  </span>
                ))}
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
                  {getSkillTypeLabel(skill)}
                </span>
                {skill.isOfficial && (
                  <>
                    <span className="px-1.5 py-0.5 rounded bg-claude-accent/10 text-claude-accent font-medium">
                      {'官方'}
                    </span>
                    <span>·</span>
                  </>
                )}
                {skill.version && (
                  <>
                    <span className="px-1.5 py-0.5 rounded dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover font-medium">
                      v{skill.version}
                    </span>
                    <span>·</span>
                  </>
                )}
                <span>{formatSkillDate(skill.updatedAt)}</span>
                {(() => {
                  const bindings = getSkillRoleBindings(skill);
                  return (
                    <>
                      <span>·</span>
                      {bindings.length === 0 ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                          未绑定
                        </span>
                      ) : (
                        bindings.map(b => (
                          <span key={`${skill.id}:${b.roleKey}`} className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                            {b.roleKey === 'all' ? '公共' : (AGENT_ROLE_SHORT_LABELS[b.roleKey] || b.roleKey)}
                          </span>
                        ))
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-400 font-medium">
                        {getSkillSourceLabel(skill)}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedSkill && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedSkill(null)}
        >
          <div
            className="w-full max-w-md mx-4 rounded-2xl dark:bg-claude-darkSurface bg-claude-surface border dark:border-claude-darkBorder border-claude-border shadow-2xl p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg dark:bg-claude-darkBg bg-claude-bg flex items-center justify-center flex-shrink-0">
                  <PuzzleIcon className="h-5 w-5 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold dark:text-claude-darkText text-claude-text truncate">
                    {getSkillDisplayName(selectedSkill)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSkill(null)}
                className="p-1.5 rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:text-claude-darkText hover:text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors flex-shrink-0"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary mb-4">
              {skillService.getLocalizedSkillDescription(selectedSkill.id, selectedSkill.name, selectedSkill.description)}
            </p>

            <div className="space-y-2 mb-5">
              {selectedSkill.isOfficial && (
                <div className="flex items-center text-xs">
                  <span className="w-16 flex-shrink-0 dark:text-claude-darkTextSecondary text-claude-textSecondary">{'来源'}</span>
                  <span className="px-1.5 py-0.5 rounded bg-claude-accent/10 text-claude-accent font-medium">
                    {'官方'}
                  </span>
                </div>
              )}
              <div className="flex items-center text-xs">
                <span className="w-16 flex-shrink-0 dark:text-claude-darkTextSecondary text-claude-textSecondary">{'来源'}</span>
                <span className="px-1.5 py-0.5 rounded dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover dark:text-claude-darkText text-claude-text font-medium">
                  {getSkillSourceLabel(selectedSkill)}
                </span>
              </div>
              <div className="flex items-start text-xs">
                <span className="w-16 flex-shrink-0 pt-1 dark:text-claude-darkTextSecondary text-claude-textSecondary">{'位置'}</span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setShowSelectedSkillPath((value) => !value)}
                    className="inline-flex items-center rounded-lg px-2 py-1 text-left font-medium text-claude-accent transition-colors hover:bg-claude-accent/10"
                  >
                    {showSelectedSkillPath ? '收起路径' : '点击查看路径'}
                  </button>
                  {showSelectedSkillPath && (
                    <div
                      className="mt-2 rounded-xl dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover px-2.5 py-2 dark:text-claude-darkText text-claude-text break-all"
                      title={selectedSkill.skillPath}
                    >
                      {selectedSkill.skillPath}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-5 rounded-xl border dark:border-claude-darkBorder/70 border-claude-border/70 bg-black/5 dark:bg-white/5 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wide dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'分类'}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'只改当前 Skills 面板里的本地分类，不回写到底层 SKILL.md。'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveSkillCategory}
                  disabled={!hasSelectedSkillCategoryChanged || isSavingSkillCategory}
                  className="px-3 py-1.5 text-xs rounded-lg border border-claude-accent/30 bg-claude-accent/10 text-claude-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingSkillCategory ? '保存中...' : '保存'}
                </button>
              </div>
              <input
                type="text"
                value={skillCategoryDraft}
                onChange={(event) => setSkillCategoryDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSaveSkillCategory();
                  }
                }}
                placeholder={'例如：安装部署 / 数据处理 / 前端体验'}
                className="mt-3 w-full px-3 py-2 text-sm rounded-xl dark:bg-claude-darkBg bg-claude-bg dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
              />
              {(selectedSkill.tags ?? []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedSkill.tags ?? []).map((tag) => (
                    <span
                      key={`${selectedSkill.id}:tag:${tag}`}
                      className="px-2 py-1 text-[11px] rounded-full dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-5">
              <div className="text-xs font-semibold tracking-wide dark:text-claude-darkTextSecondary text-claude-textSecondary mb-2">
                {'角色绑定'}
              </div>
              <p className="mb-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {RUNTIME_FLOW_TAGS.roleIndex.line}
              </p>
              <div className="flex flex-wrap gap-2">
                {[{ key: 'all', label: '全部角色（公共）' }, ...AGENT_ROLE_ORDER.map((key) => ({ key, label: AGENT_ROLE_SHORT_LABELS[key] }))].map((role) => {
                  const isBound = getSkillRoleBindings(selectedSkill).some((binding) => binding.roleKey === role.key);
                  return (
                    <button
                      key={role.key}
                      type="button"
                      onClick={() => handleToggleSkillRole(selectedSkill, role.key)}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                        isBound
                          ? 'border-claude-accent bg-claude-accent/10 text-claude-accent'
                          : 'dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover'
                      }`}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
              {getSkillRoleBindings(selectedSkill).length === 0 && (
                <p className="mt-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'当前未绑定任何角色，所以不会进入真实运行链；请选择上方角色或“全部角色（公共）”后才会生效。'}
                </p>
              )}
              {getSkillRoleBindings(selectedSkill).length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-slate-50/90 dark:bg-slate-900/40 px-3 py-2.5 space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {'真实运行状态'}
                  </div>
                  <div className="text-[11px] leading-5 text-slate-600 dark:text-slate-300/90">
                    {'技能已经装入系统；只有上面已勾选的角色，在真实对话里才会看到它。'}
                  </div>
                  {getUnboundRoleLabels(selectedSkill).length > 0 && (
                    <div className="text-[11px] leading-5 text-amber-700 dark:text-amber-300">
                      {`当前未生效角色：${getUnboundRoleLabels(selectedSkill).join(' / ')}`}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              {!selectedSkill.isBuiltIn ? (
                <button
                  type="button"
                  onClick={() => { setSelectedSkill(null); handleRequestDeleteSkill(selectedSkill); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <TrashIcon className="h-4 w-4" />
                  {'删除技能'}
                </button>
              ) : (
                <div />
              )}
              <div
                className={`w-9 h-5 rounded-full flex items-center transition-colors cursor-pointer flex-shrink-0 ${
                  selectedSkill.enabled ? 'bg-claude-accent' : 'dark:bg-claude-darkBorder bg-claude-border'
                }`}
                onClick={() => {
                  handleToggleSkill(selectedSkill.id);
                  setSelectedSkill({ ...selectedSkill, enabled: !selectedSkill.enabled });
                }}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white shadow-md transform transition-transform ${
                    selectedSkill.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {skillPendingDelete && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={handleCancelDeleteSkill}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-2xl dark:bg-claude-darkSurface bg-claude-surface border dark:border-claude-darkBorder border-claude-border shadow-2xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
              {'删除技能'}
            </div>
            <p className="mt-2 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'确定删除技能“{name}”吗？'.replace('{name}', getSkillDisplayName(skillPendingDelete))}
            </p>
            {skillActionError && (
              <div className="mt-3 text-xs text-red-500">
                {skillActionError}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelDeleteSkill}
                disabled={isDeletingSkill}
                className="px-3 py-1.5 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {'取消'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSkill}
                disabled={isDeletingSkill}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {'确认删除'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {showCleanConfirm && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowCleanConfirm(false)}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-2xl dark:bg-claude-darkSurface bg-claude-surface border dark:border-claude-darkBorder border-claude-border shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold dark:text-claude-darkText text-claude-text">
              {'清理无效技能'}
            </div>
            <p className="mt-2 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {`以下 ${invalidSkills.length} 个技能的 SKILL.md 无法读取，将被删除：`}
            </p>
            <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {invalidSkills.map(s => (
                <li key={s.id} className="text-xs px-2 py-1 rounded-lg dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary truncate">
                  {s.name || s.id}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCleanConfirm(false)}
                className="px-3 py-1.5 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
              >
                {'取消'}
              </button>
              <button
                type="button"
                onClick={handleCleanInvalidSkills}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                {'确认清理'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {isGithubImportOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setIsGithubImportOpen(false)}
        >
          <div
            className="w-full max-w-md mx-4 rounded-2xl dark:bg-claude-darkSurface bg-claude-surface border dark:border-claude-darkBorder border-claude-border shadow-2xl p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold dark:text-claude-darkText text-claude-text">
                  {'从 GitHub 导入'}
                </div>
                <p className="mt-1 text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'支持仓库链接与子目录链接；若仓库内有多个技能，将自动全部导入。'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGithubImportOpen(false)}
                className="p-1.5 rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:text-claude-darkText hover:text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

              <div className="mt-5 space-y-3">
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
              <button
                type="button"
                onClick={handleImportFromGithub}
                disabled={isDownloadingSkill || !skillDownloadSource.trim()}
                className="w-full py-2.5 rounded-xl bg-claude-accent text-white text-sm font-medium hover:bg-claude-accent/90 transition-colors disabled:opacity-50"
              >
                {isDownloadingSkill ? '导入中...' : '导入'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

    </div>
  );
};

export default SkillsManager;
