import React from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import PuzzleIcon from '../icons/PuzzleIcon';
import TrashIcon from '../icons/TrashIcon';
import { AGENT_ROLE_ORDER, AGENT_ROLE_SHORT_LABELS } from '../../../shared/agentRoleConfig';
import { Skill, getSkillDisplayName } from '../../types/skill';

export type RoleOptionKey = 'all' | typeof AGENT_ROLE_ORDER[number];

interface SkillDetailOverlayProps {
  skill: Skill;
  description: string;
  sourceLabel: string;
  onClose: () => void;
  onToggleEnabled: () => void;
  onDeleteRequest: (skill: Skill) => void;
  categoryDraft: string;
  onCategoryDraftChange: (value: string) => void;
  onSaveCategory: () => void;
  hasCategoryChanged: boolean;
  isSavingCategory: boolean;
  roleBindings: Array<{ roleKey: RoleOptionKey }>;
  unboundRoleLabels: string[];
  onToggleRole: (roleKey: RoleOptionKey) => void;
}

const roleOptions: Array<{ key: RoleOptionKey; label: string }> = [
  { key: 'all', label: '全部角色（公共）' },
  ...AGENT_ROLE_ORDER.map((key) => ({
    key,
    label: AGENT_ROLE_SHORT_LABELS[key] || key,
  })),
];

const SkillDetailOverlay: React.FC<SkillDetailOverlayProps> = ({
  skill,
  description,
  sourceLabel,
  onClose,
  onToggleEnabled,
  onDeleteRequest,
  categoryDraft,
  onCategoryDraftChange,
  onSaveCategory,
  hasCategoryChanged,
  isSavingCategory,
  roleBindings,
  unboundRoleLabels,
  onToggleRole,
}) => {
  const handleDeleteClick = () => {
    onClose();
    onDeleteRequest(skill);
  };

  const isRoleBound = (roleKey: RoleOptionKey) => (
    roleBindings.some((binding) => binding.roleKey === roleKey)
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/36 backdrop-blur-sm px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-[28px] border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface shadow-2xl p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl dark:bg-claude-darkBg bg-claude-bg flex items-center justify-center flex-shrink-0">
              <PuzzleIcon className="h-5 w-5 dark:text-claude-darkTextSecondary text-claude-textSecondary" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-base font-semibold dark:text-claude-darkText text-claude-text truncate">
                {getSkillDisplayName(skill)}
              </div>
              <div className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {'点击必要信息再展开，首屏不堆满。'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:text-claude-darkText hover:text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors flex-shrink-0"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm leading-6 dark:text-claude-darkTextSecondary text-claude-textSecondary">
          {description}
        </p>

        <div className="mb-5 rounded-2xl border dark:border-claude-darkBorder/70 border-claude-border/70 bg-black/5 dark:bg-white/5 px-4 py-3">
          <div className="mb-2 text-xs font-semibold tracking-wide dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'来源与状态'}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
          {skill.isOfficial && (
            <span className="px-2 py-1 rounded-full bg-claude-accent/10 text-claude-accent font-medium">
              {'官方'}
            </span>
          )}
            <span className="px-2 py-1 rounded-full dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover dark:text-claude-darkText text-claude-text font-medium">
              {sourceLabel}
            </span>
            <span className={`px-2 py-1 rounded-full font-medium ${
              skill.enabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
            }`}>
              {skill.enabled ? '已开启' : '已关闭'}
            </span>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border dark:border-claude-darkBorder/70 border-claude-border/70 bg-black/5 dark:bg-white/5 px-4 py-3">
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
              onClick={onSaveCategory}
              disabled={!hasCategoryChanged || isSavingCategory}
              className="px-3 py-1.5 text-xs rounded-lg border border-claude-accent/30 bg-claude-accent/10 text-claude-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingCategory ? '保存中...' : '保存'}
            </button>
          </div>
          <input
            type="text"
            value={categoryDraft}
            onChange={(event) => onCategoryDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void onSaveCategory();
              }
            }}
            placeholder={'例如：安装部署 / 数据处理 / 前端体验'}
            className="mt-3 w-full px-3 py-2 text-sm rounded-xl dark:bg-claude-darkBg bg-claude-bg dark:text-claude-darkText text-claude-text dark:placeholder-claude-darkTextSecondary placeholder-claude-textSecondary border dark:border-claude-darkBorder border-claude-border focus:outline-none focus:ring-2 focus:ring-claude-accent"
          />
          {(skill.tags ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(skill.tags ?? []).map((tag) => (
                <span
                  key={`${skill.id}:tag:${tag}`}
                  className="px-2 py-1 text-[11px] rounded-full dark:bg-claude-darkSurfaceHover bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mb-5 rounded-2xl border dark:border-claude-darkBorder/70 border-claude-border/70 bg-black/5 dark:bg-white/5 px-4 py-3">
          <div className="text-xs font-semibold tracking-wide dark:text-claude-darkTextSecondary text-claude-textSecondary mb-2">
            {'角色绑定'}
          </div>
          <p className="mb-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'选中角色后，这个技能才会进入对应角色的真实对话能力。'}
          </p>
          <div className="flex flex-wrap gap-2">
            {roleOptions.map((role) => {
              const bound = isRoleBound(role.key);
              return (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => onToggleRole(role.key)}
                  className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    bound
                      ? 'border-claude-accent bg-claude-accent/10 text-claude-accent'
                      : 'dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover'
                  }`}
                >
                  {role.label}
                </button>
              );
            })}
          </div>
          {roleBindings.length === 0 && (
            <p className="mt-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'当前未绑定任何角色，所以不会进入真实运行链；请选择上方角色或“全部角色（公共）”后才会生效。'}
            </p>
          )}
          {roleBindings.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-slate-50/90 dark:bg-slate-900/40 px-3 py-2.5 space-y-1.5">
              <div className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                {'真实运行状态'}
              </div>
              <div className="text-[11px] leading-5 text-slate-600 dark:text-slate-300/90">
                {'技能已经装入系统；只有上面已勾选的角色，在真实对话里才会看到它。'}
              </div>
              {unboundRoleLabels.length > 0 && (
                <div className="text-[11px] leading-5 text-amber-700 dark:text-amber-300">
                  {`当前未生效角色：${unboundRoleLabels.join(' / ')}`}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          {!skill.isBuiltIn ? (
            <button
              type="button"
              onClick={handleDeleteClick}
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
              skill.enabled ? 'bg-claude-accent' : 'dark:bg-claude-darkBorder bg-claude-border'
            }`}
            onClick={onToggleEnabled}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white shadow-md transform transition-transform ${
                skill.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SkillDetailOverlay;
