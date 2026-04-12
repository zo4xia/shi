import { EyeIcon, EyeSlashIcon, XCircleIcon as XCircleIconSolid } from '@heroicons/react/20/solid';
import { SignalIcon } from '@heroicons/react/24/outline';
import React from 'react';
import {
    getAgentRoleDisplayAvatar,
    getDesignerImageApiTypeOptions,
    type AgentRoleConfigEntry,
    type CompatibleApiFormat,
} from '../../../shared/agentRoleConfig';
import { renderAgentRoleAvatar } from '../../utils/agentRoleDisplay';
import ThemedSelect from '../ui/ThemedSelect';

const AgentRoleCardShell: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="space-y-4 rounded-[24px] border border-white/60 bg-white/55 p-4 shadow-[0_10px_24px_rgba(203,174,150,0.08)] dark:border-white/10 dark:bg-white/[0.03]">
    <div>
      <h4 className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
        {title}
      </h4>
      <p className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
        {description}
      </p>
    </div>
    {children}
  </section>
);

interface AgentRoleIdentityCardProps {
  isMobileViewport: boolean;
  activeRole: string;
  roleConfig: AgentRoleConfigEntry;
  onLabelChange: (value: string) => void;
  onAvatarChange: (value: string) => void;
}

export const AgentRoleIdentityCard: React.FC<AgentRoleIdentityCardProps> = ({
  isMobileViewport,
  activeRole,
  roleConfig,
  onLabelChange,
  onAvatarChange,
}) => {
  return (
    <AgentRoleCardShell
      title="角色信息"
      description="先把这个角色是谁、长什么样收清楚。"
    >
      <div className={isMobileViewport ? 'space-y-4' : 'grid grid-cols-2 gap-4'}>
        <div>
          <label htmlFor={`${activeRole}-label`} className="mb-1 block text-xs font-medium dark:text-claude-darkText text-claude-text">
            {'角色昵称'}
          </label>
          <input
            id={`${activeRole}-label`}
            type="text"
            value={roleConfig.label}
            onChange={(event) => onLabelChange(event.target.value)}
            className="block w-full rounded-xl border dark:border-claude-darkBorder border-claude-border bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset px-3 py-2 text-xs text-claude-text dark:text-claude-darkText focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30"
            placeholder="给这个角色起个好认的名字"
          />
        </div>

        <div>
          <label htmlFor={`${activeRole}-avatar`} className="mb-1 block text-xs font-medium dark:text-claude-darkText text-claude-text">
            {'角色头像'}
          </label>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-claude-border bg-white/80 text-lg shadow-sm dark:border-claude-darkBorder dark:bg-white/[0.08]">
              {renderAgentRoleAvatar(roleConfig.avatar, {
                alt: roleConfig.label,
                fallback: getAgentRoleDisplayAvatar(roleConfig.key, null),
                className: 'h-full w-full object-cover text-lg leading-none flex items-center justify-center',
              })}
            </span>
            <input
              id={`${activeRole}-avatar`}
              type="text"
              value={roleConfig.avatar ?? ''}
              onChange={(event) => onAvatarChange(event.target.value)}
              className="block w-full rounded-xl border dark:border-claude-darkBorder border-claude-border bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset px-3 py-2 text-xs text-claude-text dark:text-claude-darkText focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30"
              placeholder="可填 emoji、短字符，或图片 URL"
            />
          </div>
        </div>
      </div>
    </AgentRoleCardShell>
  );
};

interface AgentRoleApiConfigCardProps {
  isMobileViewport: boolean;
  activeRole: string;
  roleConfig: AgentRoleConfigEntry;
  isUsingSystemPreset: boolean;
  showApiKey: boolean;
  onToggleShowApiKey: () => void;
  onApplySystemPreset: () => void;
  onEnableManualApiUrlEdit: () => void;
  onOpenBuyKey: () => void;
  onApiUrlChange: (value: string) => void;
  onClearApiUrl: () => void;
  onApiKeyChange: (value: string) => void;
  onClearApiKey: () => void;
  onModelIdChange: (value: string) => void;
  onApiFormatChange: (value: CompatibleApiFormat) => void;
  onImageApiTypeChange: (value: string) => void;
}

export const AgentRoleApiConfigCard: React.FC<AgentRoleApiConfigCardProps> = ({
  isMobileViewport,
  activeRole,
  roleConfig,
  isUsingSystemPreset,
  showApiKey,
  onToggleShowApiKey,
  onApplySystemPreset,
  onEnableManualApiUrlEdit,
  onOpenBuyKey,
  onApiUrlChange,
  onClearApiUrl,
  onApiKeyChange,
  onClearApiKey,
  onModelIdChange,
  onApiFormatChange,
  onImageApiTypeChange,
}) => {
  return (
    <AgentRoleCardShell
      title="API 配置"
      description="线路、Key、模型与协议都收在这一块，不再拉成长卷。"
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <label htmlFor={`${activeRole}-apiUrl`} className="block text-xs font-medium dark:text-claude-darkText text-claude-text">
              {'API 线路'}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onApplySystemPreset}
                className="shrink-0 rounded-lg border border-claude-accent/30 px-2 py-1 text-[11px] font-medium text-claude-accent transition-colors hover:bg-claude-accent/5 dark:border-claude-accent/40 dark:text-claude-accent dark:hover:bg-claude-accent/10"
              >
                {'使用系统预设'}
              </button>
              {roleConfig.apiUrl && (
                <button
                  type="button"
                  onClick={onEnableManualApiUrlEdit}
                  className="shrink-0 rounded-lg border dark:border-claude-darkBorder border-claude-border px-2 py-1 text-[11px] font-medium text-claude-textSecondary dark:text-claude-darkTextSecondary transition-colors hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover"
                >
                  {'手动填写'}
                </button>
              )}
              <button
                type="button"
                onClick={onOpenBuyKey}
                className="shrink-0 rounded-lg border dark:border-claude-darkBorder border-claude-border px-2 py-1 text-[11px] font-medium text-claude-textSecondary dark:text-claude-darkTextSecondary transition-colors hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover"
              >
                {'点击购买 Key'}
              </button>
            </div>
          </div>
          <div className="relative">
            <input
              id={`${activeRole}-apiUrl`}
              type={isUsingSystemPreset ? 'password' : 'text'}
              value={isUsingSystemPreset ? '已使用系统预设线路' : roleConfig.apiUrl}
              readOnly={isUsingSystemPreset}
              onChange={(event) => onApiUrlChange(event.target.value)}
              className="block w-full rounded-xl border dark:border-claude-darkBorder border-claude-border bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset px-3 py-2 pr-8 text-xs text-claude-text dark:text-claude-darkText"
              placeholder={isUsingSystemPreset ? '点击“使用系统预设”后自动应用' : '请输入 API Base URL'}
              onCopy={isUsingSystemPreset ? (event) => event.preventDefault() : undefined}
              onCut={isUsingSystemPreset ? (event) => event.preventDefault() : undefined}
              onPaste={isUsingSystemPreset ? (event) => event.preventDefault() : undefined}
              onContextMenu={isUsingSystemPreset ? (event) => event.preventDefault() : undefined}
            />
            {roleConfig.apiUrl && (
              <div className="absolute inset-y-0 right-2 flex items-center">
                <button
                  type="button"
                  onClick={onClearApiUrl}
                  className="rounded p-0.5 text-claude-textSecondary dark:text-claude-darkTextSecondary transition-colors hover:text-claude-accent"
                  title={'清除'}
                >
                  <XCircleIconSolid className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={isMobileViewport ? 'space-y-4' : 'grid grid-cols-2 gap-4'}>
          <div>
            <label htmlFor={`${activeRole}-apiKey`} className="mb-1 block text-xs font-medium dark:text-claude-darkText text-claude-text">
              {'API Key（支持多个）'}
            </label>
            <div className="relative">
              <input
                id={`${activeRole}-apiKey`}
                type={showApiKey ? 'text' : 'password'}
                value={roleConfig.apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                className="block w-full rounded-xl border dark:border-claude-darkBorder border-claude-border bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset px-3 py-2 pr-16 text-xs text-claude-text dark:text-claude-darkText focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30"
                placeholder={'输入你的 API Key'}
              />
              <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                {roleConfig.apiKey && (
                  <button
                    type="button"
                    onClick={onClearApiKey}
                    className="rounded p-0.5 text-claude-textSecondary dark:text-claude-darkTextSecondary transition-colors hover:text-claude-accent"
                    title={'清除'}
                  >
                    <XCircleIconSolid className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onToggleShowApiKey}
                  className="rounded p-0.5 text-claude-textSecondary dark:text-claude-darkTextSecondary transition-colors hover:text-claude-accent"
                  title={showApiKey ? '隐藏' : '显示'}
                >
                  {showApiKey ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
              {'多个 Key 用英文逗号隔开，运行时会自动轮询。'}
            </p>
          </div>

          <div>
            <label htmlFor={`${activeRole}-modelId`} className="mb-1 block text-xs font-medium dark:text-claude-darkText text-claude-text">
              {'模型 ID'}
            </label>
            <input
              id={`${activeRole}-modelId`}
              type="text"
              value={roleConfig.modelId}
              onChange={(event) => onModelIdChange(event.target.value)}
              className="block w-full rounded-xl border dark:border-claude-darkBorder border-claude-border bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset px-3 py-2 text-xs text-claude-text dark:text-claude-darkText focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30"
              placeholder="国产 MiniMax-M2.7"
            />
          </div>
        </div>

        <div className={isMobileViewport ? 'space-y-4' : `grid gap-4 ${roleConfig.key === 'designer' ? 'grid-cols-[minmax(0,1fr)_220px]' : 'grid-cols-1'}`}>
          <div>
            <label className="mb-1 block text-xs font-medium dark:text-claude-darkText text-claude-text">
              {'兼容协议'}
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name={`${activeRole}-apiFormat`}
                  value="anthropic"
                  checked={roleConfig.apiFormat === 'anthropic'}
                  onChange={() => onApiFormatChange('anthropic')}
                  className="h-3.5 w-3.5 bg-claude-surface text-claude-accent focus:ring-claude-accent dark:bg-claude-darkSurface"
                />
                <span className="ml-2 text-xs dark:text-claude-darkText text-claude-text">
                  {'Anthropic 兼容'}
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name={`${activeRole}-apiFormat`}
                  value="openai"
                  checked={roleConfig.apiFormat === 'openai'}
                  onChange={() => onApiFormatChange('openai')}
                  className="h-3.5 w-3.5 bg-claude-surface text-claude-accent focus:ring-claude-accent dark:bg-claude-darkSurface"
                />
                <span className="ml-2 text-xs dark:text-claude-darkText text-claude-text">
                  {'OpenAI 兼容'}
                </span>
              </label>
            </div>
          </div>

          {roleConfig.key === 'designer' && (
            <div>
              <label htmlFor={`${activeRole}-imageApiType`} className="mb-1 block text-xs font-medium dark:text-claude-darkText text-claude-text">
                {'生图接口类型'}
              </label>
              <ThemedSelect
                id={`${activeRole}-imageApiType`}
                value={roleConfig.imageApiType}
                onChange={onImageApiTypeChange}
                options={getDesignerImageApiTypeOptions(roleConfig.imageApiType).map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
              />
            </div>
          )}
        </div>
      </div>
    </AgentRoleCardShell>
  );
};

interface AgentRoleStatusCardProps {
  roleConfig: AgentRoleConfigEntry;
  isTesting: boolean;
  onTestConnection: () => void;
}

export const AgentRoleStatusCard: React.FC<AgentRoleStatusCardProps> = ({
  roleConfig,
  isTesting,
  onTestConnection,
}) => {
  return (
    <AgentRoleCardShell
      title="测试与状态"
      description="这里保留连接测试和当前配置状态，不和字段区混在一起。"
    >
      <button
        type="button"
        onClick={onTestConnection}
        disabled={isTesting || !roleConfig.apiKey.trim() || !roleConfig.modelId.trim() || !roleConfig.apiUrl.trim()}
        className="inline-flex items-center rounded-xl border dark:border-claude-darkBorder border-claude-border px-3 py-1.5 text-xs font-medium text-claude-text dark:text-claude-darkText transition-colors hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SignalIcon className="mr-1.5 h-3.5 w-3.5" />
        {isTesting ? '测试中...' : '测试连接'}
      </button>
      <p className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
        {'这里只保留角色级 API 配置主链：URL、Key、模型、协议与连接测试。'}
      </p>
    </AgentRoleCardShell>
  );
};
