import { showGlobalToast } from '../services/toast';
import DataBackup from './DataBackup';
/**
 * {标记} 功能: 应用设置页面
 * {标记} 二开改造: 4身份Agent配置 + claW特价API iframe + 记忆管理配置
 * {标记} 关键块: #66-184 (claW iframe), #2700-2764 (Agent角色UI), #1570-1653 (保存逻辑)
 * {标记} 集成: 与agentRoleConfig.ts/memoryManagementPreset.ts/embeddedBrowser.ts紧密耦合
 * {标记} 状态: Agent配置UI完整✅ / 跨渠道一体化缺失❌
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { configService } from '../services/config';
import { apiService } from '../services/api';
import type { AppUpdateInfo } from '../services/appUpdate';
import { themeService } from '../services/theme';
// i18n removed — hardcoded Chinese
import { coworkService } from '../services/cowork';
import { localStore } from '../services/store';
import ErrorMessage from './ErrorMessage';
import { XMarkIcon, SignalIcon, CheckCircleIcon, XCircleIcon, CubeIcon, EnvelopeIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { EyeIcon, EyeSlashIcon, XCircleIcon as XCircleIconSolid } from '@heroicons/react/20/solid';
import PlusCircleIcon from './icons/PlusCircleIcon';
import IMSettings from './im/IMSettings';
import NativeCapabilitiesSettings from './settings/NativeCapabilitiesSettings';
import {
  AgentRoleApiConfigCard,
  AgentRoleIdentityCard,
  AgentRoleStatusCard,
} from './settings/AgentRoleModelCards';
import EmbeddedIframeView from './EmbeddedIframeView';
import { useDispatch, useSelector } from 'react-redux';
import { setAvailableModels } from '../store/slices/modelSlice';
import { RootState } from '../store';
import ThemedSelect from './ui/ThemedSelect';
import {
  AGENT_ROLE_LABELS,
  AGENT_ROLE_ORDER,
  CONFIRMED_DESIGNER_IMAGE_MODEL_HINTS,
  buildAvailableModelsFromAgentRoles,
  buildProviderConfigsFromAgentRoles,
  createDefaultAgentRoles,
  getAgentRoleDisplayAvatar,
  getDesignerImageApiTypeOptions,
  isAgentRoleProviderKey,
  normalizeAgentRolesForSave,
  pickNextApiKey,
  resolveAgentRolesFromConfig,
  type AgentRoleConfigMap,
  type AgentRoleKey,
  type CompatibleApiFormat,
} from '../../shared/agentRoleConfig';
import {
  buildConversationFileCacheUpdate,
  resolveConversationFileCacheConfig,
} from '../../shared/conversationFileCacheConfig';
import type {
  CoworkUserMemoryEntry,
  CoworkMemoryStats,
  CoworkBroadcastBoardSnapshot,
} from '../types/cowork';
import { defaultConfig, type AppConfig, getVisibleProviders } from '../config';
import {
  normalizeNativeCapabilitiesConfig,
  type NativeCapabilitiesConfig,
} from '../../shared/nativeCapabilities/config';
import {
  OpenAIIcon,
  DeepSeekIcon,
  GeminiIcon,
  AnthropicIcon,
  MoonshotIcon,
  ZhipuIcon,
  MiniMaxIcon,
  YouDaoZhiYunIcon,
  QwenIcon,
  XiaomiIcon,
  StepfunIcon,
  VolcengineIcon,
  OpenRouterIcon,
  OllamaIcon,
  CustomProviderIcon,
} from './icons/providers';
import { hasAutoLaunch } from '../utils/platform';
// Settings helpers and constants
import {
  getEffectiveApiFormat,
  buildOpenAICompatibleChatCompletionsUrl,
  CONNECTIVITY_TEST_TOKEN_BUDGET,
  isVolcengineV3BaseUrl,
} from './settings/settingsHelpers';
import {
  resolveBaseUrl,
} from './settings/settingsConstants';
import CoworkMemorySettingsPanel from './settings/CoworkMemorySettingsPanel';
import SettingsSectionCard from './settings/SettingsSectionCard';
import SettingsTabShell from './settings/SettingsTabShell';
import SettingsFieldGroup from './settings/SettingsFieldGroup';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { renderAgentRoleAvatar } from '../utils/agentRoleDisplay';
import ModalWrapper from './ui/ModalWrapper';

// 特价 API 套餐卡片 — 珍珠白风格
const ClawApiIframeView: React.FC = () => {
  const bigPlans = [
    {
      name: 'GPT 5.4',
      badge: '推荐',
      desc: '工具调用 · 全能型号',
      price: '9元',
      unit: '/M token',
      btnText: '白菜价购买',
      href: 'https://api.ujiapp.com/pricing?provider=OpenAI',
      iconColor: 'text-violet-500',
      badgeBg: 'bg-violet-500',
    },
    {
      name: 'Nano Banana 2',
      badge: '生图',
      desc: '快速生图 · 搭配模板',
      price: '0.2元',
      unit: '/张',
      btnText: '保送毕业',
      href: 'https://api.ujiapp.com/pricing?provider=Google',
      iconColor: 'text-amber-500',
      badgeBg: 'bg-amber-500',
    },
  ];

  const smallPlans = [
    {
      name: 'GPT 5 Mini',
      price: '2元',
      unit: '/百万token',
      href: 'https://api.ujiapp.com/pricing?keyword=mini&group=default',
      dot: 'bg-rose-400',
      btnText: '特价',
    },
    {
      name: 'Haiku 4-5',
      price: '5元',
      unit: '/百万token',
      href: 'https://api.ujiapp.com/pricing?keyword=haiku&provider=Anthropic',
      dot: 'bg-amber-400',
      btnText: '特价',
    },
    {
      name: 'Gemini 3 Flash',
      price: '2.4元',
      unit: '/百万token',
      href: 'https://api.ujiapp.com/pricing?provider=Google',
      dot: 'bg-emerald-400',
      btnText: '特价',
    },
  ];

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 py-4 sm:p-6 space-y-6">
      {/* 标题 */}
      <div>
        <h3 className="text-base font-semibold dark:text-claude-darkText text-claude-text">特价 API 套餐</h3>
        <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary mt-0.5">官转白菜价，按量计费，随用随充</p>
      </div>

      <div className="flex flex-col sm:flex-row items-start gap-3 rounded-xl border border-claude-border dark:border-claude-darkBorder bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset px-4 py-3">
        <span className="inline-flex shrink-0 items-center rounded-full bg-claude-accent px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-white">
          赞助商活动
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium leading-5 dark:text-claude-darkText text-claude-text">
            本区为合作活动信息展示，价格、库存、规则与可用模型请以跳转页面实时信息为准。
          </p>
          <p className="mt-0.5 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
            购买前请自行核对适用场景与资费说明，本应用仅做信息聚合展示。
          </p>
        </div>
      </div>

      {/* 大卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {bigPlans.map(plan => (
          <a
            key={plan.name}
            href={plan.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col no-underline rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface transition-all hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover hover:border-claude-accent/30 shadow-sm"
          >
            <div className="flex-1 px-5 pt-5 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base font-semibold dark:text-claude-darkText text-claude-text">{plan.name}</span>
                <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${plan.badgeBg}`}>{plan.badge}</span>
              </div>
              <p className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">{plan.desc}</p>
              <div className="mt-4">
                <span className="text-2xl font-light tracking-tight dark:text-claude-darkText text-claude-text">{plan.price}</span>
                <span className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary ml-1">{plan.unit}</span>
              </div>
            </div>
            <div className="px-5 pb-5 pt-2">
              <div className="btn-primary flex items-center justify-center w-full text-sm py-2">
                {plan.btnText}
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* 小卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {smallPlans.map(plan => (
          <a
            key={plan.name}
            href={plan.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col justify-between no-underline rounded-xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-claude-surface px-4 py-4 transition-all hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover hover:border-claude-accent/30 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-1.5 h-1.5 rounded-full ${plan.dot} flex-shrink-0`} />
              <span className="text-sm font-medium dark:text-claude-darkText text-claude-text truncate">{plan.name}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <span className="text-lg font-light dark:text-claude-darkText text-claude-text">{plan.price}</span>
                <span className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary ml-1">{plan.unit}</span>
              </div>
              <span className="text-xs font-medium text-claude-accent/90 dark:text-claude-accent">
                {plan.btnText} &rarr;
              </span>
            </div>
          </a>
        ))}
      </div>

      {/* 联系方式 */}
      <p className="pt-2 text-center text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary pb-4">
        不会弄？加 Q/微信：<span className="font-medium dark:text-claude-darkText text-claude-text select-all">ooc1920</span> 协助配置
      </p>
    </div>
  );
};

// 资源下载 iframe 组件
const ResourcesView: React.FC = () => {
  const resourceUrl = 'https://aieasy.hashnode.space/default-guide/5z656ga5ywl6zeo5oyh5y2x/ai';

  return <EmbeddedIframeView title="资源下载" url={resourceUrl} />;
};

const SETTINGS_DESKTOP_CONTENT_WRAP_CLASS = 'mx-auto w-full max-w-[1100px]';

type TabType = 'general' | 'model' | 'nativeCapabilities' | 'im' | 'coworkMemory' | 'conversationCache' | 'clawApi' | 'resources' | 'dataBackup';

const CONVERSATION_FILE_BACKUP_STATE_KEY = 'conversationFileCache.lastBackupDate';

function joinDisplayPath(basePath: string, leaf: string): string {
  const normalizedBase = basePath.trim().replace(/[\\/]+$/, '');
  const normalizedLeaf = leaf.trim().replace(/^[\\/]+/, '');
  if (!normalizedBase) return normalizedLeaf;
  if (!normalizedLeaf) return normalizedBase;
  return `${normalizedBase}/${normalizedLeaf}`;
}

export type SettingsOpenOptions = {
  initialTab?: TabType;
  notice?: string;
};

interface SettingsProps extends SettingsOpenOptions {
  onClose: () => void;
  onUpdateFound?: (info: AppUpdateInfo) => void;
}

const providerKeys = [
  'openai',
  'gemini',
  'anthropic',
  'deepseek',
  'moonshot',
  'zhipu',
  'minimax',
  'volcengine',
  'qwen',
  'youdao_zhiyun',
  'stepfun',
  'xiaomi',
  'openrouter',
  'ollama',
  'custom',
] as const;

type ProviderType = (typeof providerKeys)[number];
type ProvidersConfig = NonNullable<AppConfig['providers']>;
type ProviderConfig = ProvidersConfig[string];
type ProviderConnectionTestResult = {
  success: boolean;
  message: string;
  provider: string;
};

const normalizeSettingsTab = (tab?: TabType): TabType => {
  // {BREAKPOINT} SETTINGS-DEFAULT-TAB
  // {FLOW} SETTINGS-DEFAULT-CLAWAPI: 未显式指定 tab 时默认落到 `clawApi`，若用户感觉“像跳进了别的页面”，这里是优先核查点之一。
  if (!tab || tab === 'general') {
    return 'clawApi';
  }
  return tab;
};

const providerMeta: Record<ProviderType, { label: string; icon: React.ReactNode }> = {
  openai: { label: 'OpenAI', icon: <OpenAIIcon /> },
  deepseek: { label: 'DeepSeek', icon: <DeepSeekIcon /> },
  gemini: { label: 'Gemini', icon: <GeminiIcon /> },
  anthropic: { label: 'Anthropic', icon: <AnthropicIcon /> },
  moonshot: { label: 'Moonshot', icon: <MoonshotIcon /> },
  zhipu: { label: 'Zhipu', icon: <ZhipuIcon /> },
  minimax: { label: 'MiniMax', icon: <MiniMaxIcon /> },
  youdao_zhiyun: { label: 'Youdao', icon: <YouDaoZhiYunIcon /> },
  qwen: { label: 'Qwen', icon: <QwenIcon /> },
  xiaomi: { label: 'Xiaomi', icon: <XiaomiIcon /> },
  stepfun: { label: 'StepFun', icon: <StepfunIcon /> },
  volcengine: { label: 'Volcengine', icon: <VolcengineIcon /> },
  openrouter: { label: 'OpenRouter', icon: <OpenRouterIcon /> },
  ollama: { label: 'Ollama', icon: <OllamaIcon /> },
  custom: { label: 'Custom', icon: <CustomProviderIcon /> },
};

// {标记} UI-ONLY-PRESET: 这里只做前端展示层隐藏，不追求绝对安全。
// 真实地址仍会保存到运行配置里，但不会在设置页对普通用户明文展示。
const SYSTEM_API_PRESETS: Record<AgentRoleKey, {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  apiFormat: CompatibleApiFormat;
}> = {
  organizer: {
    apiUrl: 'https://api2.penguinsaichat.dpdns.org/v1',
    apiKey: 'sk-LirGm42ajDl40AW078ilXv4vlVPPwIgyXPq4jHLqL9V7mGjL',
    modelId: 'MiniMax-M2.7',
    apiFormat: 'openai',
  },
  writer: {
    apiUrl: 'https://api2.penguinsaichat.dpdns.org/v1',
    apiKey: 'sk-LirGm42ajDl40AW078ilXv4vlVPPwIgyXPq4jHLqL9V7mGjL',
    modelId: 'MiniMax-M2.7',
    apiFormat: 'openai',
  },
  designer: {
    apiUrl: 'https://api2.penguinsaichat.dpdns.org/v1',
    apiKey: 'sk-LirGm42ajDl40AW078ilXv4vlVPPwIgyXPq4jHLqL9V7mGjL',
    modelId: 'MiniMax-M2.7',
    apiFormat: 'openai',
  },
  analyst: {
    apiUrl: 'https://api2.penguinsaichat.dpdns.org/v1',
    apiKey: 'sk-LirGm42ajDl40AW078ilXv4vlVPPwIgyXPq4jHLqL9V7mGjL',
    modelId: 'MiniMax-M2.7',
    apiFormat: 'openai',
  },
};

// All helper functions are now imported from './settings/settingsHelpers'

// Local helper functions (not in settingsHelpers)
const getDefaultProviders = (): ProvidersConfig => {
  const providers = (defaultConfig.providers ?? {}) as ProvidersConfig;
  const entries = Object.entries(providers) as Array<[string, ProviderConfig]>;
  return Object.fromEntries(
    entries.map(([providerKey, providerConfig]) => [
      providerKey,
      {
        ...providerConfig,
        models: providerConfig.models?.map(model => ({
          ...model,
          supportsImage: model.supportsImage ?? false,
        })),
      },
    ])
  ) as ProvidersConfig;
};

const getDefaultActiveProvider = (): ProviderType => {
  const providers = (defaultConfig.providers ?? {}) as ProvidersConfig;
  const firstEnabledProvider = providerKeys.find(providerKey => providers[providerKey]?.enabled);
  return firstEnabledProvider ?? providerKeys[0];
};

const getDefaultActiveAgentRole = (): AgentRoleKey => AGENT_ROLE_ORDER[0];

const isAgentRoleReady = (role: AgentRoleConfigMap[AgentRoleKey]): boolean => (
  role.enabled && Boolean(role.apiUrl.trim()) && Boolean(role.apiKey.trim()) && Boolean(role.modelId.trim())
);

const resolveExplicitDefaultRole = (
  roles: AgentRoleConfigMap,
  activeRole: AgentRoleKey,
  currentDefaultProvider?: string,
): AgentRoleConfigMap[AgentRoleKey] | null => {
  const activeRoleConfig = roles[activeRole];
  if (isAgentRoleReady(activeRoleConfig)) {
    return activeRoleConfig;
  }

  if (currentDefaultProvider && AGENT_ROLE_ORDER.includes(currentDefaultProvider as AgentRoleKey)) {
    const existingDefaultRole = roles[currentDefaultProvider as AgentRoleKey];
    if (isAgentRoleReady(existingDefaultRole)) {
      return existingDefaultRole;
    }
  }

  return null;
};

const Settings: React.FC<SettingsProps> = ({ onClose, initialTab, notice, onUpdateFound: _onUpdateFound }) => {
  const dispatch = useDispatch();
  const isMobileViewport = useIsMobileViewport();
  // 状态
  const [activeTab, setActiveTab] = useState<TabType>(normalizeSettingsTab(initialTab));
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [autoLaunch, setAutoLaunchState] = useState(false);
  const [useSystemProxy, setUseSystemProxy] = useState(false);
  const [conversationCacheDirectory, setConversationCacheDirectory] = useState('');
  const [isUpdatingAutoLaunch, setIsUpdatingAutoLaunch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(notice ?? null);
  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null);
  const [isTestResultModalOpen, setIsTestResultModalOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const initialThemeRef = useRef<'light' | 'dark' | 'system'>(themeService.getTheme());
  const didSaveRef = useRef(false);

  // Add state for active provider
  const [activeProvider, setActiveProvider] = useState<ProviderType>(getDefaultActiveProvider());
  const [showApiKey, setShowApiKey] = useState(false);
  const [showConversationCacheHint, setShowConversationCacheHint] = useState(false);
  const [conversationBackupStamp, setConversationBackupStamp] = useState<string | null>(null);
  const [showCoworkContinuityNote, setShowCoworkContinuityNote] = useState(false);

  // Add state for providers configuration
  const [providers, setProviders] = useState<ProvidersConfig>(() => getDefaultProviders());
  const [agentRoles, setAgentRoles] = useState<AgentRoleConfigMap>(() => createDefaultAgentRoles());
  const [apiUrlManualModeByRole, setApiUrlManualModeByRole] = useState<Record<AgentRoleKey, boolean>>({
    organizer: false,
    writer: false,
    designer: false,
    analyst: false,
  });
  const [nativeCapabilities, setNativeCapabilities] = useState<NativeCapabilitiesConfig>(() => normalizeNativeCapabilitiesConfig(defaultConfig.nativeCapabilities));
  const [activeRole, setActiveRole] = useState<AgentRoleKey>(getDefaultActiveAgentRole());

  // 创建引用来确保内容区域的滚动
  const contentRef = useRef<HTMLDivElement>(null);

  // 快捷键设置
  const [shortcuts, setShortcuts] = useState({
    newChat: 'Ctrl+N',
    search: 'Ctrl+F',
    settings: 'Ctrl+,',
  });

  // State for model editing
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [isEditingModel, setIsEditingModel] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');
  const [newModelId, setNewModelId] = useState('');
  const [newModelSupportsImage, setNewModelSupportsImage] = useState(false);
  const [modelFormError, setModelFormError] = useState<string | null>(null);

  // About tab
  const [, setAppVersion] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [_logoClickCount, _setLogoClickCount] = useState(0);
  const [_testModeUnlocked, setTestModeUnlocked] = useState(false);
  const [showWorkspacePath, setShowWorkspacePath] = useState(false);
  const [showEnvSyncTargetPath, setShowEnvSyncTargetPath] = useState(false);

  // Workspace info (web build)
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [envSyncTargetPath, setEnvSyncTargetPath] = useState<string>('');
  const [envSyncTargetExists, setEnvSyncTargetExists] = useState<boolean | null>(null);
  const [_dataDirPath, _setDataDirPath] = useState<string>('');

  useEffect(() => {
    const appInfoApi = window.electron?.appInfo;
    if (appInfoApi) {
      appInfoApi.getVersion().then(setAppVersion).catch((error) => {
        console.error('Failed to load app version:', error);
      });
      appInfoApi.getRuntimePaths().then((result) => {
        if (result.workspacePath) {
          setWorkspacePath(result.workspacePath);
        }
        setEnvSyncTargetPath(result.envSyncTargetPath || '');
        setEnvSyncTargetExists(result.envSyncTargetExists);
      }).catch((error) => {
        console.error('Failed to load runtime paths:', error);
      });
    }

    // Backward-compatible fallback if runtime path API is not available.
    if (window.electron?.workspace) {
      window.electron.workspace.getPath().then(result => {
        if (result.success && result.path) {
          setWorkspacePath(result.path);
        }
      });
    }
  }, []);

  useEffect(() => {
    setShowApiKey(false);
  }, [activeProvider]);

  const coworkConfig = useSelector((state: RootState) => state.cowork.config);

  const [coworkMemoryEnabled, setCoworkMemoryEnabled] = useState<boolean>(coworkConfig.memoryEnabled ?? true);
  const [coworkMemoryLlmJudgeEnabled, setCoworkMemoryLlmJudgeEnabled] = useState<boolean>(coworkConfig.memoryLlmJudgeEnabled ?? false);
  const [coworkMemoryEntries, setCoworkMemoryEntries] = useState<CoworkUserMemoryEntry[]>([]);
  const [coworkMemoryStats, setCoworkMemoryStats] = useState<CoworkMemoryStats | null>(null);
  const [coworkBroadcastBoards, setCoworkBroadcastBoards] = useState<CoworkBroadcastBoardSnapshot[]>([]);
  const [coworkMemoryListLoading, setCoworkMemoryListLoading] = useState<boolean>(false);
  const [coworkMemoryQuery, setCoworkMemoryQuery] = useState<string>('');
  // {标记} P0-身份筛选-DYNAMIC: 记忆归桶按真实 agentRoleKey，前端筛选不能只写死四主角色。
  const [coworkMemoryAgentRoleKey, setCoworkMemoryAgentRoleKey] = useState<string | 'all'>('all');
  const [coworkMemoryEditingId, setCoworkMemoryEditingId] = useState<string | null>(null);
  const [coworkMemoryDraftText, setCoworkMemoryDraftText] = useState<string>('');
  const [showMemoryModal, setShowMemoryModal] = useState<boolean>(false);
  const [dailyMemoryEnabled, setDailyMemoryEnabled] = useState<boolean>(false);
  const [dailyMemoryApiUrl, setDailyMemoryApiUrl] = useState<string>('');
  const [dailyMemoryApiKey, setDailyMemoryApiKey] = useState<string>('');
  const [dailyMemoryModelId, setDailyMemoryModelId] = useState<string>('');
  const [dailyMemoryApiFormat, setDailyMemoryApiFormat] = useState<'anthropic' | 'openai'>('openai');

  const conversationBackupDir = useMemo(() => (
    conversationBackupStamp ? joinDisplayPath(conversationCacheDirectory, conversationBackupStamp) : ''
  ), [conversationBackupStamp, conversationCacheDirectory]);

  const conversationBackupManifestPath = useMemo(() => (
    conversationBackupDir ? joinDisplayPath(conversationBackupDir, 'manifest.json') : ''
  ), [conversationBackupDir]);

  useEffect(() => {
    setCoworkMemoryEnabled(coworkConfig.memoryEnabled ?? true);
    setCoworkMemoryLlmJudgeEnabled(coworkConfig.memoryLlmJudgeEnabled ?? false);
  }, [
    coworkConfig.memoryEnabled,
    coworkConfig.memoryLlmJudgeEnabled,
  ]);

  const loadConversationBackupState = useCallback(async () => {
    try {
      const value = await localStore.getItem<string>(CONVERSATION_FILE_BACKUP_STATE_KEY);
      setConversationBackupStamp(typeof value === 'string' && value.trim() ? value.trim() : null);
    } catch (error) {
      console.error('Failed to load conversation backup state:', error);
      setConversationBackupStamp(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        await configService.init();
        if (cancelled) {
          return;
        }

        const config = configService.getConfig();
        setSettingsLoadFailed(false);

        initialThemeRef.current = config.theme;
        setTheme(config.theme);
        setLanguage(config.language);
        setUseSystemProxy(config.useSystemProxy ?? false);
        const conversationFileCache = resolveConversationFileCacheConfig(config);
        setConversationCacheDirectory(conversationFileCache.directory);
        setDailyMemoryEnabled(config.dailyMemory?.enabled === true);
        setDailyMemoryApiUrl(config.dailyMemory?.apiUrl ?? '');
        setDailyMemoryApiKey(config.dailyMemory?.apiKey ?? '');
        setDailyMemoryModelId(config.dailyMemory?.modelId ?? '');
        setDailyMemoryApiFormat(config.dailyMemory?.apiFormat === 'anthropic' ? 'anthropic' : 'openai');
        void loadConversationBackupState();
        const savedTestMode = config.app?.testMode ?? false;
        setTestMode(savedTestMode);
        if (savedTestMode) setTestModeUnlocked(true);

        const autoLaunchApi = window.electron?.autoLaunch;
        if (autoLaunchApi) {
          autoLaunchApi.get().then(({ enabled }) => {
            if (!cancelled) {
              setAutoLaunchState(enabled);
            }
          }).catch(err => {
            console.error('Failed to load auto-launch setting:', err);
          });
        }

        if (config.api) {
          const normalizedApiBaseUrl = config.api.baseUrl.toLowerCase();
          if (normalizedApiBaseUrl.includes('openai')) {
            setActiveProvider('openai');
            setProviders(prev => ({
              ...prev,
              openai: {
                ...prev.openai,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('deepseek')) {
            setActiveProvider('deepseek');
            setProviders(prev => ({
              ...prev,
              deepseek: {
                ...prev.deepseek,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('moonshot.ai') || normalizedApiBaseUrl.includes('moonshot.cn')) {
            setActiveProvider('moonshot');
            setProviders(prev => ({
              ...prev,
              moonshot: {
                ...prev.moonshot,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('bigmodel.cn')) {
            setActiveProvider('zhipu');
            setProviders(prev => ({
              ...prev,
              zhipu: {
                ...prev.zhipu,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('minimax')) {
            setActiveProvider('minimax');
            setProviders(prev => ({
              ...prev,
              minimax: {
                ...prev.minimax,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('openapi.youdao.com')) {
            setActiveProvider('youdao_zhiyun');
            setProviders(prev => ({
              ...prev,
              youdao_zhiyun: {
                ...prev.youdao_zhiyun,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('dashscope')) {
            setActiveProvider('qwen');
            setProviders(prev => ({
              ...prev,
              qwen: {
                ...prev.qwen,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('stepfun')) {
            setActiveProvider('stepfun');
            setProviders(prev => ({
              ...prev,
              stepfun: {
                ...prev.stepfun,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('openrouter.ai')) {
            setActiveProvider('openrouter');
            setProviders(prev => ({
              ...prev,
              openrouter: {
                ...prev.openrouter,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('googleapis')) {
            setActiveProvider('gemini');
            setProviders(prev => ({
              ...prev,
              gemini: {
                ...prev.gemini,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('anthropic')) {
            setActiveProvider('anthropic');
            setProviders(prev => ({
              ...prev,
              anthropic: {
                ...prev.anthropic,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          } else if (normalizedApiBaseUrl.includes('ollama') || normalizedApiBaseUrl.includes('11434')) {
            setActiveProvider('ollama');
            setProviders(prev => ({
              ...prev,
              ollama: {
                ...prev.ollama,
                enabled: true,
                apiKey: config.api.key,
                baseUrl: config.api.baseUrl
              }
            }));
          }
        }

        if (config.providers) {
          setProviders(prev => {
            const merged = {
              ...prev,
              ...config.providers,
            };

            const firstEnabledProvider = providerKeys.find(providerKey => merged[providerKey]?.enabled);
            if (firstEnabledProvider) {
              setActiveProvider(firstEnabledProvider);
            }

            return Object.fromEntries(
              Object.entries(merged).map(([providerKey, providerConfig]) => {
                const models = providerConfig.models?.map(model => ({
                  ...model,
                  supportsImage: model.supportsImage ?? false,
                }));
                return [
                  providerKey,
                  {
                    ...providerConfig,
                    apiFormat: getEffectiveApiFormat(providerKey, (providerConfig as ProviderConfig).apiFormat),
                    models,
                  },
                ];
              })
            ) as ProvidersConfig;
          });
        }

        const resolvedAgentRoles = resolveAgentRolesFromConfig(config);
        setAgentRoles(resolvedAgentRoles);
        setNativeCapabilities(normalizeNativeCapabilitiesConfig(config.nativeCapabilities));
        const firstEnabledRole = AGENT_ROLE_ORDER.find((key) => resolvedAgentRoles[key].enabled);
        setActiveRole(firstEnabledRole ?? getDefaultActiveAgentRole());

        if (config.shortcuts) {
          setShortcuts(prev => ({
            ...prev,
            ...config.shortcuts,
          }));
        }
        setSettingsLoaded(true);
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : 'Failed to load settings');
          setSettingsLoadFailed(true);
          setSettingsLoaded(true);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [loadConversationBackupState]);

  useEffect(() => {
    if (activeTab !== 'conversationCache') {
      return;
    }
    void loadConversationBackupState();
  }, [activeTab, loadConversationBackupState]);

  useEffect(() => {
    return () => {
      if (didSaveRef.current) {
        return;
      }
      themeService.setTheme(initialThemeRef.current);
    };
  }, []);

  // 监听标签页切换，确保内容区域滚动到顶部
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    setNoticeMessage(notice ?? null);
  }, [notice]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(normalizeSettingsTab(initialTab));
    }
  }, [initialTab]);


  // Compute visible providers based on language
  const visibleProviders = useMemo(() => {
    const visibleKeys = getVisibleProviders(language);
    const filtered: Partial<ProvidersConfig> = {};
    for (const key of visibleKeys) {
      if (providers[key as keyof ProvidersConfig]) {
        filtered[key as keyof ProvidersConfig] = providers[key as keyof ProvidersConfig];
      }
    }
    return filtered as ProvidersConfig;
  }, [language, providers]);

  // Ensure activeProvider is always in visibleProviders when language changes
  useEffect(() => {
    const visibleKeys = Object.keys(visibleProviders) as ProviderType[];
    if (visibleKeys.length > 0 && !visibleKeys.includes(activeProvider)) {
      // If current activeProvider is not visible, switch to first visible provider
      const firstEnabledVisible = visibleKeys.find(key => visibleProviders[key]?.enabled);
      setActiveProvider(firstEnabledVisible ?? visibleKeys[0]);
    }
  }, [visibleProviders, activeProvider]);

  const hasCoworkConfigChanges = (coworkConfig.executionMode || 'local') !== 'local'
    || coworkMemoryEnabled !== coworkConfig.memoryEnabled
    || coworkMemoryLlmJudgeEnabled !== coworkConfig.memoryLlmJudgeEnabled;

  const coworkMemoryRoleOptions = useMemo(() => {
    const ordered = new Set<string>([
      ...AGENT_ROLE_ORDER,
      ...coworkMemoryEntries
        .map((entry) => entry.agentRoleKey?.trim() || '')
        .filter(Boolean),
      activeRole,
      ...(coworkMemoryAgentRoleKey !== 'all' ? [coworkMemoryAgentRoleKey] : []),
    ]);

    return Array.from(ordered);
  }, [activeRole, coworkMemoryAgentRoleKey, coworkMemoryEntries]);

  const loadCoworkMemoryData = useCallback(async () => {
    setCoworkMemoryListLoading(true);
    const effectiveAgentRoleKey = coworkMemoryAgentRoleKey !== 'all' ? coworkMemoryAgentRoleKey : undefined;
    try {
      const [entries, stats, boards] = await Promise.all([
        coworkService.listMemoryEntries({
          query: coworkMemoryQuery.trim() || undefined,
          agentRoleKey: effectiveAgentRoleKey,
        }),
        coworkService.getMemoryStats({
          agentRoleKey: effectiveAgentRoleKey,
        }),
        coworkService.listBroadcastBoards({
          agentRoleKey: effectiveAgentRoleKey,
          limit: 24,
        }),
      ]);
      setCoworkMemoryEntries(entries);
      setCoworkMemoryStats(stats);
      setCoworkBroadcastBoards(boards);
    } catch (loadError) {
      console.error('Failed to load cowork memory data:', loadError);
      setCoworkMemoryEntries([]);
      setCoworkMemoryStats(null);
      setCoworkBroadcastBoards([]);
    } finally {
      setCoworkMemoryListLoading(false);
    }
  }, [
    coworkMemoryQuery,
    coworkMemoryAgentRoleKey,
  ]);

  useEffect(() => {
    if (activeTab !== 'coworkMemory') return;
    void loadCoworkMemoryData();
  }, [activeTab, loadCoworkMemoryData]);

  useEffect(() => {
    if (activeTab !== 'coworkMemory') return;

    const refresh = () => {
      void loadCoworkMemoryData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    const intervalId = window.setInterval(refresh, 12000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab, loadCoworkMemoryData]);

  const resetCoworkMemoryEditor = () => {
    setCoworkMemoryEditingId(null);
    setCoworkMemoryDraftText('');
    setShowMemoryModal(false);
  };

  const handleSaveCoworkMemoryEntry = async () => {
    const text = coworkMemoryDraftText.trim();
    if (!text) return;
    const targetAgentRoleKey = coworkMemoryAgentRoleKey !== 'all' ? coworkMemoryAgentRoleKey : activeRole;
    const targetModelId = AGENT_ROLE_ORDER.includes(targetAgentRoleKey as AgentRoleKey)
      ? agentRoles[targetAgentRoleKey as AgentRoleKey]?.modelId?.trim() || undefined
      : undefined;

    setCoworkMemoryListLoading(true);
    try {
      if (coworkMemoryEditingId) {
        const updatedEntry = await coworkService.updateMemoryEntry({
          id: coworkMemoryEditingId,
          text,
          status: 'created',
          isExplicit: true,
        });
        if (!updatedEntry) {
          throw new Error('更新记忆条目失败');
        }
      } else {
        const createdEntry = await coworkService.createMemoryEntry({
          text,
          isExplicit: true,
          agentRoleKey: targetAgentRoleKey,
          modelId: targetModelId,
        });
        if (!createdEntry) {
          throw new Error('新增记忆条目失败');
        }
      }
      resetCoworkMemoryEditor();
      await loadCoworkMemoryData();
      
      // 显示保存成功提示
      showGlobalToast('设置已保存');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存记忆条目失败');
    } finally {
      setCoworkMemoryListLoading(false);
    }
  };

  const handleEditCoworkMemoryEntry = (entry: CoworkUserMemoryEntry) => {
    setCoworkMemoryEditingId(entry.id);
    setCoworkMemoryDraftText(entry.text);
    setShowMemoryModal(true);
  };

  const handleDeleteCoworkMemoryEntry = async (entry: CoworkUserMemoryEntry) => {
    setCoworkMemoryListLoading(true);
    try {
      const deleted = await coworkService.deleteMemoryEntry({ id: entry.id });
      if (!deleted) {
        throw new Error('删除记忆条目失败');
      }
      if (coworkMemoryEditingId === entry.id) {
        resetCoworkMemoryEditor();
      }
      await loadCoworkMemoryData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除记忆条目失败');
    } finally {
      setCoworkMemoryListLoading(false);
    }
  };

  const handleOpenCoworkMemoryModal = () => {
    resetCoworkMemoryEditor();
    setShowMemoryModal(true);
  };

  const handleRefreshCoworkMemoryData = () => {
    void loadCoworkMemoryData();
  };

  const handleClearBroadcastBoard = async (agentRoleKey: string) => {
    const normalizedRoleKey = agentRoleKey.trim();
    if (!normalizedRoleKey) {
      return;
    }

    setCoworkMemoryListLoading(true);
    try {
      const cleared = await coworkService.clearBroadcastBoard({ agentRoleKey: normalizedRoleKey });
      if (!cleared) {
        throw new Error('清空广播板失败');
      }
      await loadCoworkMemoryData();
      showGlobalToast('广播板已清空');
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : '清空广播板失败');
    } finally {
      setCoworkMemoryListLoading(false);
    }
  };

  const handleAgentRoleChange = useCallback((roleKey: AgentRoleKey, field: keyof AgentRoleConfigMap[AgentRoleKey], value: string | boolean) => {
    setAgentRoles((prev) => ({
      ...prev,
      [roleKey]: {
        ...prev[roleKey],
        [field]: value,
      },
    }));
  }, []);

  const handleAgentRoleSelect = useCallback((roleKey: AgentRoleKey) => {
    setActiveRole(roleKey);
    setShowApiKey(false);
    setIsTestResultModalOpen(false);
    setTestResult(null);
  }, []);

  const handleAgentRoleToggle = useCallback((roleKey: AgentRoleKey) => {
    setAgentRoles((prev) => ({
      ...prev,
      [roleKey]: {
        ...prev[roleKey],
        enabled: !prev[roleKey].enabled,
      },
    }));
  }, []);

  const handleApplySystemApiPreset = useCallback((roleKey: AgentRoleKey) => {
    const preset = SYSTEM_API_PRESETS[roleKey];
    handleAgentRoleChange(roleKey, 'apiUrl', preset.apiUrl);
    handleAgentRoleChange(roleKey, 'apiKey', preset.apiKey);
    handleAgentRoleChange(roleKey, 'modelId', preset.modelId);
    handleAgentRoleChange(roleKey, 'apiFormat', preset.apiFormat);
    handleAgentRoleChange(roleKey, 'enabled', true);
    setApiUrlManualModeByRole((prev) => ({
      ...prev,
      [roleKey]: false,
    }));
    showGlobalToast('已应用系统体验预设');
  }, [handleAgentRoleChange]);

  const handleEnableManualApiUrlEdit = useCallback((roleKey: AgentRoleKey) => {
    setApiUrlManualModeByRole((prev) => ({
      ...prev,
      [roleKey]: true,
    }));
  }, []);

  // {埋点} ⚡ API连通性测试入口 (ID: api-test-001) → settingsHelpers.buildURL → electronShim.api.fetch → apiProxy /api/api/fetch
  const handleTestAgentRoleConnection = useCallback(async () => {
    const role = normalizeAgentRolesForSave(agentRoles)[activeRole];
    const testingApiKey = pickNextApiKey(role.apiKey, activeRole) || role.apiKey;
    setIsTesting(true);
    setIsTestResultModalOpen(false);
    setTestResult(null);

    if (!testingApiKey) {
      showTestResultModal({ success: false, message: '需要设置API密钥' }, role.label);
      setIsTesting(false);
      return;
    }

    if (!role.modelId) {
      showTestResultModal({ success: false, message: '请先添加模型' }, role.label);
      setIsTesting(false);
      return;
    }

    try {
      const normalizedBaseUrl = role.apiUrl.replace(/\/+$/, '');
      const useOpenAICompatibleProbe = role.apiFormat === 'openai' || isVolcengineV3BaseUrl(normalizedBaseUrl);
      let response: Awaited<ReturnType<typeof window.electron.api.fetch>>;

      if (!useOpenAICompatibleProbe) {
        const anthropicUrl = /\/v\d+$/.test(normalizedBaseUrl)
          ? `${normalizedBaseUrl}/messages`
          : `${normalizedBaseUrl}/v1/messages`;
        response = await window.electron.api.fetch({
          url: anthropicUrl,
          method: 'POST',
          headers: {
            'x-api-key': testingApiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: role.modelId,
            max_tokens: CONNECTIVITY_TEST_TOKEN_BUDGET,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        });
      } else {
        response = await window.electron.api.fetch({
          url: buildOpenAICompatibleChatCompletionsUrl(normalizedBaseUrl, activeRole),
          method: 'POST',
          headers: {
            Authorization: `Bearer ${testingApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: role.modelId,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: CONNECTIVITY_TEST_TOKEN_BUDGET,
          }),
        });
      }

      // {埋点} 🔌 测试结果处理 (ID: api-test-006) response.ok → 启用角色 + 显示成功弹窗
      if (response.ok) {
        showTestResultModal({ success: true, message: `${role.label} (${role.modelId}) 连接成功` }, role.label);
        handleAgentRoleChange(activeRole, 'enabled', true);
      } else {
        const data = response.data || {};
        const errorMessage = data.error?.message || data.message || `${'连接失败'}: ${response.status}`;
        showTestResultModal({ success: false, message: errorMessage }, role.label);
      }
    } catch (err) {
      showTestResultModal({
        success: false,
        message: err instanceof Error ? err.message : '连接失败',
      }, role.label);
    } finally {
      setIsTesting(false);
    }
  }, [activeRole, agentRoles, handleAgentRoleChange]);

  const handleBrowseConversationCacheDirectory = useCallback(async () => {
    try {
      const result = await window.electron?.dialog?.selectDirectory();
      if (result?.success && result.path) {
        setConversationCacheDirectory(result.path);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleOpenShellPath = useCallback(async (targetPath: string, mode: 'open' | 'reveal' = 'reveal') => {
    if (!targetPath.trim()) {
      return;
    }

    try {
      const shellApi = window.electron?.shell;
      const result = mode === 'open'
        ? await shellApi?.openPath(targetPath)
        : await shellApi?.showItemInFolder(targetPath);

      if (!result?.success) {
        showGlobalToast(`打开失败：${result?.error || '路径不可用'}`);
      }
    } catch (openError) {
      showGlobalToast(openError instanceof Error ? openError.message : '打开路径失败');
    }
  }, []);

  // {埋点} 💾 配置保存入口 (ID: settings-save-001) normalizeAgentRoles → buildProviderConfigs → configService.updateConfig
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const currentConfig = configService.getConfig();
      const normalizedAgentRoles = normalizeAgentRolesForSave(agentRoles);
      const normalizedProviders = Object.fromEntries(
        Object.entries(providers).map(([providerKey, providerConfig]) => {
          const apiFormat = getEffectiveApiFormat(providerKey, providerConfig.apiFormat);
          return [
            providerKey,
            {
              ...providerConfig,
              apiFormat,
              baseUrl: resolveBaseUrl(providerKey as ProviderType, providerConfig.baseUrl, apiFormat),
            },
          ];
        })
      ) as ProvidersConfig;

      const roleProviders = buildProviderConfigsFromAgentRoles(normalizedAgentRoles);
      const mergedProviders = {
        ...normalizedProviders,
        ...roleProviders,
      } as ProvidersConfig;

      const explicitDefaultRole = resolveExplicitDefaultRole(
        normalizedAgentRoles,
        activeRole,
        currentConfig.model.defaultModelProvider,
      );
      const persistedDefaultProvider = (
        currentConfig.model.defaultModelProvider
        && !isAgentRoleProviderKey(currentConfig.model.defaultModelProvider)
      )
        ? currentConfig.model.defaultModelProvider
        : undefined;
      const runtimeDefaultApi = explicitDefaultRole
        ? {
          apiKey: explicitDefaultRole.apiKey,
          baseUrl: explicitDefaultRole.apiUrl,
        }
        : {
          apiKey: currentConfig.api.key,
          baseUrl: currentConfig.api.baseUrl,
        };

      await configService.updateConfig({
        api: {
          key: runtimeDefaultApi.apiKey,
          baseUrl: runtimeDefaultApi.baseUrl,
        },
        model: {
          ...currentConfig.model,
          defaultModel: explicitDefaultRole?.modelId || currentConfig.model.defaultModel,
          defaultModelProvider: persistedDefaultProvider,
        },
        providers: mergedProviders,
        agentRoles: normalizedAgentRoles,
        nativeCapabilities,
        dailyMemory: {
          enabled: dailyMemoryEnabled,
          apiUrl: dailyMemoryApiUrl.trim(),
          apiKey: dailyMemoryApiKey.trim(),
          modelId: dailyMemoryModelId.trim(),
          apiFormat: dailyMemoryApiFormat,
        },
        theme,
        language,
        useSystemProxy,
        ...buildConversationFileCacheUpdate(conversationCacheDirectory, true),
        shortcuts,
        app: {
          ...currentConfig.app,
          testMode,
        },
      });

      // 应用主题
      themeService.setTheme(theme);

      // 同步前端当前 API 客户端到显式默认角色，避免被隐式主角色推断带偏。
      apiService.setConfig({
        apiKey: runtimeDefaultApi.apiKey,
        baseUrl: runtimeDefaultApi.baseUrl,
      });

      dispatch(setAvailableModels(buildAvailableModelsFromAgentRoles(normalizedAgentRoles)));

      if (hasCoworkConfigChanges) {
        await coworkService.updateConfig({
          executionMode: 'local',
          memoryEnabled: coworkMemoryEnabled,
          memoryLlmJudgeEnabled: coworkMemoryLlmJudgeEnabled,
        });
      }

      didSaveRef.current = true;
      
      // 显示保存成功提示
      showGlobalToast('设置已保存');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // 标签页切换处理
  const handleTabChange = (tab: TabType) => {
    if (tab !== 'model') {
      setIsAddingModel(false);
      setIsEditingModel(false);
      setEditingModelId(null);
      setNewModelName('');
      setNewModelId('');
      setNewModelSupportsImage(false);
      setModelFormError(null);
    }
    setActiveTab(tab);
  };

  // 快捷键更新处理
  // 阻止点击设置窗口时事件传播到背景
  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleSaveNewModel = () => {
    const modelId = newModelId.trim();

    if (activeProvider === 'ollama') {
      // For Ollama, only the model name (stored as modelId) is required
      if (!modelId) {
        setModelFormError('请填写模型名称');
        return;
      }
    } else {
      const modelName = newModelName.trim();
      if (!modelName || !modelId) {
        setModelFormError('请填写模型名称和模型ID');
        return;
      }
    }

    // For Ollama, auto-fill display name from modelId if not provided
    const modelName = activeProvider === 'ollama'
      ? (newModelName.trim() && newModelName.trim() !== modelId ? newModelName.trim() : modelId)
      : newModelName.trim();

    const currentModels = providers[activeProvider].models ?? [];
    const duplicateModel = currentModels.find(
      model => model.id === modelId && (!isEditingModel || model.id !== editingModelId)
    );
    if (duplicateModel) {
      setModelFormError('模型ID已存在，请使用不同的ID');
      return;
    }

    const nextModel = {
      id: modelId,
      name: modelName,
      supportsImage: newModelSupportsImage,
    };
    const updatedModels = isEditingModel && editingModelId
      ? currentModels.map(model => (model.id === editingModelId ? nextModel : model))
      : [...currentModels, nextModel];

    setProviders(prev => ({
      ...prev,
      [activeProvider]: {
        ...prev[activeProvider],
        models: updatedModels
      }
    }));

    setIsAddingModel(false);
    setIsEditingModel(false);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelId('');
    setNewModelSupportsImage(false);
    setModelFormError(null);
  };

  const handleCancelModelEdit = () => {
    setIsAddingModel(false);
    setIsEditingModel(false);
    setEditingModelId(null);
    setNewModelName('');
    setNewModelId('');
    setNewModelSupportsImage(false);
    setModelFormError(null);
  };

  const handleModelDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelModelEdit();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveNewModel();
    }
  };

  const showTestResultModal = (
    result: Omit<ProviderConnectionTestResult, 'provider'>,
    provider: string
  ) => {
    setTestResult({
      ...result,
      provider,
    });
    setIsTestResultModalOpen(true);
  };

  // 渲染标签页
  const sidebarTabs: { key: TabType; label: string; subtitle: string; icon: React.ReactNode }[] = useMemo(() => [
    { key: 'model',          label: 'API 配置',          subtitle: '模型、密钥与连接', icon: <CubeIcon className="h-5 w-5" /> },
    { key: 'nativeCapabilities', label: '外挂能力', subtitle: '底层插件、优先级、角色开关', icon: <PlusCircleIcon className="h-5 w-5" /> },
    { key: 'clawApi',        label: '特价 API',          subtitle: '活动与购买入口', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-4-8h8m-9.75 9.75h11.5A2.25 2.25 0 0020 17.5V6.5A2.25 2.25 0 0017.75 4.25H6.25A2.25 2.25 0 004 6.5v11a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ), },
    { key: 'im',             label: '消息频道',          subtitle: '飞书与频道配置', icon: <SignalIcon className="h-5 w-5" /> },
    { key: 'conversationCache', label: '对话文件', subtitle: '缓存、导出与目录', icon: <EnvelopeIcon className="h-5 w-5" /> },
    { key: 'coworkMemory',   label: '记忆管理', subtitle: '连续性与记忆条目', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ), },
    { key: 'resources',      label: '资源下载', subtitle: '工具与指南入口', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ), },
    { key: 'dataBackup',    label: '数据备份', subtitle: '导出、备份与恢复', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ), },
  ], []);

  const activeTabLabel = useMemo(() => {
    return sidebarTabs.find(t => t.key === activeTab)?.label ?? '';
  }, [activeTab, sidebarTabs]);

  const renderTabContent = () => {
    switch(activeTab) {
      case 'general':
        return (
          <SettingsTabShell isMobileViewport={isMobileViewport}>
            <SettingsSectionCard
              title="语言"
              description="应用界面的显示语言。"
            >
              <div className={isMobileViewport ? 'w-full' : 'w-[180px]'}>
                <ThemedSelect
                  id="language"
                  value={language}
                  onChange={(value) => {
                    setLanguage(value as 'zh' | 'en');
                  }}
                  options={[
                    { value: 'zh', label: '中文' },
                    { value: 'en', label: 'English' }
                  ]}
                />
              </div>
            </SettingsSectionCard>

            {workspacePath && (
              <SettingsSectionCard
                title="当前工作目录"
                description="当前运行时使用的工作区位置。"
                actions={(
                  <button
                    type="button"
                    onClick={() => setShowWorkspacePath((value) => !value)}
                    className="px-2.5 py-1 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {showWorkspacePath ? '收起路径' : '查看路径'}
                  </button>
                )}
              >
                {showWorkspacePath ? (
                  <div className="text-sm break-all font-mono dark:text-claude-darkSecondaryText text-claude-textSecondary">
                    {workspacePath}
                  </div>
                ) : (
                  <div className="text-sm dark:text-claude-darkSecondaryText text-claude-textSecondary">
                    {'路径已收起，需要时可展开查看。'}
                  </div>
                )}
              </SettingsSectionCard>
            )}

            {envSyncTargetPath && (
              <SettingsSectionCard
                title="环境同步文件"
                description="保存 API / IM 配置时，会同步写到这个环境文件。"
                actions={(
                  <button
                    type="button"
                    onClick={() => setShowEnvSyncTargetPath((value) => !value)}
                    className="px-2.5 py-1 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {showEnvSyncTargetPath ? '收起路径' : '查看路径'}
                  </button>
                )}
              >
                {showEnvSyncTargetPath && (
                  <div className="text-sm break-all font-mono dark:text-claude-darkSecondaryText text-claude-textSecondary">
                    {envSyncTargetPath}
                  </div>
                )}
                <div className={`${showEnvSyncTargetPath ? 'mt-3' : ''} text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary`}>
                  {envSyncTargetExists === false
                    ? '当前目标文件不存在，设置保存时不会回写到环境文件。'
                    : 'Linux 部署可通过 UCLAW_ENV_FILE 指向 /etc/uclaw/uclaw.env。'}
                </div>
              </SettingsSectionCard>
            )}

            {hasAutoLaunch() && (
              <SettingsSectionCard
                title="开机自启动"
                description="系统启动时自动运行应用。"
              >
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm dark:text-claude-darkSecondaryText text-claude-secondaryText">
                    {'系统启动时自动运行应用'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoLaunch}
                    onClick={async () => {
                      if (isUpdatingAutoLaunch) return;
                      const next = !autoLaunch;
                      setIsUpdatingAutoLaunch(true);
                      try {
                        const result = await window.electron.autoLaunch.set(next);
                        if (result.success) {
                          setAutoLaunchState(next);
                        } else {
                          setError(result.error || 'Failed to update auto-launch setting');
                        }
                      } catch (err) {
                        console.error('Failed to set auto-launch:', err);
                        setError('Failed to update auto-launch setting');
                      } finally {
                        setIsUpdatingAutoLaunch(false);
                      }
                    }}
                    disabled={isUpdatingAutoLaunch}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                      isUpdatingAutoLaunch ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                      autoLaunch
                        ? 'bg-claude-accent'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autoLaunch ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </SettingsSectionCard>
            )}

            <SettingsSectionCard
              title="使用系统代理"
              description="开启后网络请求将跟随系统代理，保存后生效。"
            >
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm dark:text-claude-darkSecondaryText text-claude-secondaryText">
                  {'开启后网络请求将跟随系统代理（保存后生效）'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useSystemProxy}
                  onClick={() => {
                    setUseSystemProxy((prev) => !prev);
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                    useSystemProxy
                      ? 'bg-claude-accent'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      useSystemProxy ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </SettingsSectionCard>

            <SettingsSectionCard
              title="外观"
              description="桌面端预览优先直观看样式，避免单列长卷。"
              className={isMobileViewport ? '' : 'col-span-2'}
            >
              <div className={`${isMobileViewport ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-3 gap-4'}`}>
                {([
                  { value: 'light' as const, label: '浅色' },
                  { value: 'dark' as const, label: '深色' },
                  { value: 'system' as const, label: '跟随系统' },
                ]).map((option) => {
                  const isSelected = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTheme(option.value);
                        themeService.setTheme(option.value);
                      }}
                      className={`flex flex-col items-center rounded-xl border-2 p-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-claude-accent bg-claude-accent/5 dark:bg-claude-accent/10'
                          : 'dark:border-claude-darkBorder border-claude-border hover:border-claude-accent/50 dark:hover:border-claude-accent/50'
                      }`}
                    >
                      <svg viewBox="0 0 120 80" className="w-full h-auto rounded-md mb-2 overflow-hidden" xmlns="http://www.w3.org/2000/svg">
                        {option.value === 'light' && (
                          <>
                            <rect width="120" height="80" fill="#F8F9FB" />
                            <rect x="0" y="0" width="30" height="80" fill="#EBEDF0" />
                            <rect x="4" y="8" width="22" height="4" rx="2" fill="#C8CBD0" />
                            <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#D5D7DB" />
                            <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#D5D7DB" />
                            <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#D5D7DB" />
                            <rect x="36" y="8" width="78" height="64" rx="4" fill="#FFFFFF" />
                            <rect x="42" y="16" width="50" height="4" rx="2" fill="#D5D7DB" />
                            <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                            <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#E2E4E7" />
                            <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#E2E4E7" />
                            <rect x="42" y="46" width="40" height="4" rx="2" fill="#D5D7DB" />
                            <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                            <rect x="42" y="60" width="58" height="3" rx="1.5" fill="#E2E4E7" />
                          </>
                        )}
                        {option.value === 'dark' && (
                          <>
                            <rect width="120" height="80" fill="#0F1117" />
                            <rect x="0" y="0" width="30" height="80" fill="#151820" />
                            <rect x="4" y="8" width="22" height="4" rx="2" fill="#3A3F4B" />
                            <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#2A2F3A" />
                            <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#2A2F3A" />
                            <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#2A2F3A" />
                            <rect x="36" y="8" width="78" height="64" rx="4" fill="#1A1D27" />
                            <rect x="42" y="16" width="50" height="4" rx="2" fill="#3A3F4B" />
                            <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#252930" />
                            <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#252930" />
                            <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#252930" />
                            <rect x="42" y="46" width="40" height="4" rx="2" fill="#3A3F4B" />
                            <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#252930" />
                            <rect x="42" y="60" width="58" height="3" rx="1.5" fill="#252930" />
                          </>
                        )}
                        {option.value === 'system' && (
                          <>
                            <defs>
                              <clipPath id="left-half">
                                <rect x="0" y="0" width="60" height="80" />
                              </clipPath>
                              <clipPath id="right-half">
                                <rect x="60" y="0" width="60" height="80" />
                              </clipPath>
                            </defs>
                            <g clipPath="url(#left-half)">
                              <rect width="120" height="80" fill="#F8F9FB" />
                              <rect x="0" y="0" width="30" height="80" fill="#EBEDF0" />
                              <rect x="4" y="8" width="22" height="4" rx="2" fill="#C8CBD0" />
                              <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#D5D7DB" />
                              <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#D5D7DB" />
                              <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#D5D7DB" />
                              <rect x="36" y="8" width="78" height="64" rx="4" fill="#FFFFFF" />
                              <rect x="42" y="16" width="50" height="4" rx="2" fill="#D5D7DB" />
                              <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                              <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#E2E4E7" />
                              <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#E2E4E7" />
                              <rect x="42" y="46" width="40" height="4" rx="2" fill="#D5D7DB" />
                              <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#E2E4E7" />
                            </g>
                            <g clipPath="url(#right-half)">
                              <rect width="120" height="80" fill="#0F1117" />
                              <rect x="0" y="0" width="30" height="80" fill="#151820" />
                              <rect x="4" y="8" width="22" height="4" rx="2" fill="#3A3F4B" />
                              <rect x="4" y="16" width="18" height="3" rx="1.5" fill="#2A2F3A" />
                              <rect x="4" y="22" width="20" height="3" rx="1.5" fill="#2A2F3A" />
                              <rect x="4" y="28" width="16" height="3" rx="1.5" fill="#2A2F3A" />
                              <rect x="36" y="8" width="78" height="64" rx="4" fill="#1A1D27" />
                              <rect x="42" y="16" width="50" height="4" rx="2" fill="#3A3F4B" />
                              <rect x="42" y="24" width="66" height="3" rx="1.5" fill="#252930" />
                              <rect x="42" y="30" width="60" height="3" rx="1.5" fill="#252930" />
                              <rect x="42" y="36" width="55" height="3" rx="1.5" fill="#252930" />
                              <rect x="42" y="46" width="40" height="4" rx="2" fill="#3A3F4B" />
                              <rect x="42" y="54" width="66" height="3" rx="1.5" fill="#252930" />
                            </g>
                            <line x1="60" y1="0" x2="60" y2="80" stroke="#888" strokeWidth="0.5" />
                          </>
                        )}
                      </svg>
                      <span className={`text-xs font-medium ${
                        isSelected
                          ? 'text-claude-accent'
                          : 'dark:text-claude-darkText text-claude-text'
                      }`}>
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </SettingsSectionCard>
          </SettingsTabShell>
        );

      case 'conversationCache':
        return (
          <SettingsTabShell
            isMobileViewport={isMobileViewport}
            mobileClassName="space-y-5"
            desktopClassName="grid grid-cols-2 gap-4"
          >
            <SettingsSectionCard
              title="对话文件缓存目录"
              description="这里保存对话快照以及浏览器端暂存文件。"
              actions={(
                <button
                  type="button"
                  onClick={() => setShowConversationCacheHint((value) => !value)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium dark:border-claude-darkBorder/70 border-claude-border/70 dark:text-claude-darkTextSecondary text-claude-textSecondary"
                >
                  <InformationCircleIcon className="h-3.5 w-3.5" />
                  {'说明'}
                </button>
              )}
            >
              <SettingsFieldGroup
                label="对话文件缓存目录"
                labelFor="conversation-cache-directory"
              >
                <div className="flex items-center gap-2">
                  <input
                    id="conversation-cache-directory"
                    type="text"
                    value={conversationCacheDirectory}
                    onChange={(event) => setConversationCacheDirectory(event.target.value)}
                    placeholder={'输入缓存目录，例如 ./conversation-cache 或 /data/uclaw/conversation-cache'}
                    className="flex-1 rounded-lg border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface bg-white px-3 py-2 text-sm dark:text-claude-darkText text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => { void handleBrowseConversationCacheDirectory(); }}
                    className="px-3 py-2 text-sm rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {'浏览'}
                  </button>
                </div>
              </SettingsFieldGroup>

              {showConversationCacheHint && (
                <div className="rounded-lg dark:bg-claude-darkSurfaceInset bg-claude-surfaceInset px-3 py-3 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'系统会把每日对话快照写到这里；浏览器端上传的暂存文件、Markdown 导出和图片导出也会优先往这里归档。运行中的 skills/workspace 仍会优先保留工作目录内的真实路径，避免打断 OpenClaw skills 读文件。'}
                </div>
              )}
            </SettingsSectionCard>

            <SettingsSectionCard
              title="最近一次对话归档"
              description="查看最新归档状态并快速跳转目录。"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {!conversationCacheDirectory.trim() ? (
                    <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {'请先配置缓存目录，系统才会写入每日归档。'}
                    </div>
                  ) : conversationBackupStamp ? (
                    <div className="space-y-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      <div>{`日期目录：${conversationBackupStamp}`}</div>
                      <div>{'需要时可用下方按钮打开归档目录或定位清单文件。'}</div>
                    </div>
                  ) : (
                    <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {'暂未检测到已写入的每日归档，等本轮对话收口后系统会生成今日快照。'}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { void loadConversationBackupState(); }}
                  className="px-3 py-1.5 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                >
                  {'刷新'}
                </button>
              </div>

              {conversationBackupStamp && conversationCacheDirectory.trim() && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void handleOpenShellPath(conversationBackupDir, 'open'); }}
                    className="px-3 py-1.5 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {'打开归档目录'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleOpenShellPath(conversationBackupManifestPath, 'reveal'); }}
                    className="px-3 py-1.5 text-xs rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkTextSecondary text-claude-textSecondary hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors"
                  >
                    {'定位 manifest'}
                  </button>
                </div>
              )}
            </SettingsSectionCard>
          </SettingsTabShell>
        );

      case 'im':
        return (
          <div className="h-full min-h-[540px]">
            <IMSettings />
          </div>
        );

      case 'nativeCapabilities':
        return (
          <NativeCapabilitiesSettings
            value={nativeCapabilities}
            onChange={setNativeCapabilities}
          />
        );

      case 'coworkMemory':
        return (
          <CoworkMemorySettingsPanel
            showCoworkContinuityNote={showCoworkContinuityNote}
            coworkMemoryEnabled={coworkMemoryEnabled}
            coworkMemoryLlmJudgeEnabled={coworkMemoryLlmJudgeEnabled}
            coworkBroadcastBoards={coworkBroadcastBoards}
            coworkMemoryEntries={coworkMemoryEntries}
            coworkMemoryStats={coworkMemoryStats}
            coworkMemoryListLoading={coworkMemoryListLoading}
            coworkMemoryQuery={coworkMemoryQuery}
            coworkMemoryRoleOptions={coworkMemoryRoleOptions}
            coworkMemoryAgentRoleKey={coworkMemoryAgentRoleKey}
            showMemoryModal={showMemoryModal}
            coworkMemoryEditingId={coworkMemoryEditingId}
            coworkMemoryDraftText={coworkMemoryDraftText}
            dailyMemoryEnabled={dailyMemoryEnabled}
            dailyMemoryApiUrl={dailyMemoryApiUrl}
            dailyMemoryApiKey={dailyMemoryApiKey}
            dailyMemoryModelId={dailyMemoryModelId}
            dailyMemoryApiFormat={dailyMemoryApiFormat}
            onToggleContinuityNote={() => setShowCoworkContinuityNote((value) => !value)}
            onCoworkMemoryEnabledChange={setCoworkMemoryEnabled}
            onCoworkMemoryLlmJudgeEnabledChange={setCoworkMemoryLlmJudgeEnabled}
            onDailyMemoryEnabledChange={setDailyMemoryEnabled}
            onDailyMemoryApiUrlChange={setDailyMemoryApiUrl}
            onDailyMemoryApiKeyChange={setDailyMemoryApiKey}
            onDailyMemoryModelIdChange={setDailyMemoryModelId}
            onDailyMemoryApiFormatChange={setDailyMemoryApiFormat}
            onRefresh={handleRefreshCoworkMemoryData}
            onClearBroadcastBoard={handleClearBroadcastBoard}
            onOpenModal={handleOpenCoworkMemoryModal}
            onRoleFilterChange={setCoworkMemoryAgentRoleKey}
            onQueryChange={setCoworkMemoryQuery}
            onEditEntry={handleEditCoworkMemoryEntry}
            onDeleteEntry={handleDeleteCoworkMemoryEntry}
            onCloseModal={resetCoworkMemoryEditor}
            onDraftChange={setCoworkMemoryDraftText}
            onSaveEntry={handleSaveCoworkMemoryEntry}
          />
        );

      // ## 发现可疑一坨屎山，插旗
      // model 页当前把角色列表、角色编辑、API 配置、协议、生图、测试全塞在一个 case 里。
      // 先做分区换装，不碰保存链和连接测试逻辑。
      case 'model': {
        const activeRoleConfig = agentRoles[activeRole];
        const activeRolePreset = SYSTEM_API_PRESETS[activeRole];
        const isUsingSystemPreset = activeRoleConfig.apiUrl.trim() === activeRolePreset.apiUrl
          && activeRoleConfig.modelId.trim() === activeRolePreset.modelId
          && activeRoleConfig.apiKey.trim() === activeRolePreset.apiKey
          && activeRoleConfig.apiFormat === activeRolePreset.apiFormat
          && !apiUrlManualModeByRole[activeRole];

        return (
          <div className={isMobileViewport ? 'space-y-4' : 'grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-5'}>
            <section className="space-y-3 rounded-2xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/50 bg-claude-surface p-4 sm:p-5 overflow-y-auto min-h-0">
              <div className="px-1 pb-2 border-b dark:border-claude-darkBorder border-claude-border">
                <h3 className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                  {'角色配置'}
                </h3>
                <p className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'模型列表已收口为 4 个 Agent 角色，每个角色绑定一套通用兼容 API。'}
                </p>
              </div>

              {AGENT_ROLE_ORDER.map((roleKey) => {
                const role = agentRoles[roleKey];
                const ready = isAgentRoleReady(role);

                return (
                  <button
                    key={roleKey}
                    type="button"
                    onClick={() => handleAgentRoleSelect(roleKey)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      activeRole === roleKey
                        ? 'border-claude-accent bg-claude-accent/10 dark:bg-claude-accent/15'
                        : 'border-claude-border dark:border-claude-darkBorder bg-claude-surface dark:bg-claude-darkSurface/50 hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/80 text-base shadow-sm dark:border-white/10 dark:bg-white/[0.08]">
                            {renderAgentRoleAvatar(getAgentRoleDisplayAvatar(roleKey, agentRoles), {
                              alt: role.label,
                              className: 'h-full w-full object-cover text-[16px] leading-none flex items-center justify-center',
                            })}
                          </span>
                          <span className={`text-sm font-medium ${activeRole === roleKey ? 'text-claude-accent' : 'dark:text-claude-darkText text-claude-text'}`}>
                            {role.label}
                          </span>
                          {role.supportsImage && (
                            <span className="rounded-md bg-claude-accent/10 px-1.5 py-0.5 text-[10px] text-claude-accent">
                              {'图片输入'}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                          {role.description}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ready ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'}`}>
                            {ready ? '已配置' : '待配置'}
                          </span>
                          {role.modelId && (
                            <span className="rounded-full border border-claude-border dark:border-claude-darkBorder px-2 py-0.5 text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                              {role.modelId}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={`mt-0.5 flex h-5 w-9 items-center rounded-full transition-colors ${role.enabled ? 'bg-claude-accent' : 'bg-claude-border dark:bg-claude-darkBorder'}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAgentRoleToggle(roleKey);
                        }}
                      >
                        <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${role.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            <section className="space-y-4 rounded-2xl border dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/50 bg-claude-surface p-4 sm:p-5 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
              <div className="flex items-center justify-between rounded-xl border px-4 py-3 dark:border-claude-darkBorder border-claude-border dark:bg-claude-darkSurface/40 bg-claude-surface/40">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-claude-border bg-white/80 text-lg shadow-sm dark:border-claude-darkBorder dark:bg-white/[0.08]">
                    {renderAgentRoleAvatar(activeRoleConfig.avatar, {
                      alt: activeRoleConfig.label,
                      fallback: getAgentRoleDisplayAvatar(activeRole, null),
                      className: 'h-full w-full object-cover text-lg leading-none flex items-center justify-center',
                    })}
                  </span>
                  <div>
                    <h3 className="text-base font-medium dark:text-claude-darkText text-claude-text">
                      {activeRoleConfig.label}
                    </h3>
                    <p className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {activeRoleConfig.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isAgentRoleReady(activeRoleConfig) ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'}`}>
                    {isAgentRoleReady(activeRoleConfig) ? '已配置' : '待配置'}
                  </span>
                  <button
                    type="button"
                    onClick={() => { void handleTestAgentRoleConnection(); }}
                    disabled={isTesting || !activeRoleConfig.apiKey.trim() || !activeRoleConfig.modelId.trim() || !activeRoleConfig.apiUrl.trim()}
                    className="inline-flex items-center rounded-full border dark:border-claude-darkBorder border-claude-border px-3 py-1.5 text-xs font-medium text-claude-text dark:text-claude-darkText transition-colors hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {'检测'}
                  </button>
                </div>
              </div>

              <AgentRoleIdentityCard
                isMobileViewport={isMobileViewport}
                activeRole={activeRole}
                roleConfig={activeRoleConfig}
                onLabelChange={(value) => handleAgentRoleChange(activeRole, 'label', value)}
                onAvatarChange={(value) => handleAgentRoleChange(activeRole, 'avatar', value)}
              />

              <AgentRoleApiConfigCard
                isMobileViewport={isMobileViewport}
                activeRole={activeRole}
                roleConfig={activeRoleConfig}
                isUsingSystemPreset={isUsingSystemPreset}
                showApiKey={showApiKey}
                onToggleShowApiKey={() => setShowApiKey(!showApiKey)}
                onApplySystemPreset={() => handleApplySystemApiPreset(activeRole)}
                onEnableManualApiUrlEdit={() => handleEnableManualApiUrlEdit(activeRole)}
                onOpenBuyKey={() => { void window.electron?.shell?.openExternal?.('https://www.feishu.cn/invitation/page/add_contact/?token=202v2dcb-120d-45ec-a736-131b34dc8026&unique_id=FbSH9BXDAeOfS6vxXyvEqA=='); }}
                onApiUrlChange={(value) => handleAgentRoleChange(activeRole, 'apiUrl', value)}
                onClearApiUrl={() => handleAgentRoleChange(activeRole, 'apiUrl', '')}
                onApiKeyChange={(value) => handleAgentRoleChange(activeRole, 'apiKey', value)}
                onClearApiKey={() => handleAgentRoleChange(activeRole, 'apiKey', '')}
                onModelIdChange={(value) => handleAgentRoleChange(activeRole, 'modelId', value)}
                onApiFormatChange={(value) => handleAgentRoleChange(activeRole, 'apiFormat', value)}
                onImageApiTypeChange={(value) => handleAgentRoleChange(activeRole, 'imageApiType', value)}
              />

            </section>
          </div>
        );
      }

      case 'clawApi':
        return (
          <ClawApiIframeView />
        );

      case 'resources':
        return (
          <ResourcesView />
        );

      case 'dataBackup':
        return (
          <DataBackup />
        );

      default:
        return null;
    }
  };

  // ## {提取} SettingsMobileShell
  // 当前 Settings 已开始拥有移动端专用壳。
  // 后续应继续把外层 page-shell、桌面双栏壳、移动端单列壳彻底收成独立公共层。
  return (
    <div
      className={`fixed inset-0 z-50 modal-backdrop-pearl flex ${isMobileViewport ? 'items-stretch justify-stretch' : 'items-center justify-center'}`}
      onClick={onClose}
    >
      <div
        className={`relative ${isMobileViewport ? 'flex-col' : 'flex'} w-full modal-pearl overflow-hidden modal-content`}
        style={{
          width: isMobileViewport ? '100vw' : 'min(90vw, var(--uclaw-app-max-width), calc(90vh * 1.6))',
          minWidth: isMobileViewport ? '100vw' : 'min(var(--uclaw-shell-min-width), 90vw)',
          minHeight: isMobileViewport ? '100dvh' : 'min(var(--uclaw-shell-min-height), 90vh)',
          maxHeight: isMobileViewport ? '100dvh' : '90vh',
          borderRadius: isMobileViewport ? '0' : 'var(--uclaw-shell-radius)',
          aspectRatio: isMobileViewport ? 'auto' : 'var(--uclaw-shell-aspect-ratio)',
        }}
        onClick={handleSettingsClick}
      >
        <button
          type="button"
          onClick={onClose}
          className={`absolute z-20 dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:text-claude-darkText hover:text-claude-text p-2 dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-xl transition-colors ${
            isMobileViewport ? 'right-3 top-3' : 'right-5 top-5'
          }`}
          aria-label="关闭设置"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        {/* Left sidebar */}
        <div
          className={`${isMobileViewport ? 'w-full flex-none border-b dark:border-claude-darkBorder border-claude-border' : 'w-[clamp(248px,22%,296px)] shrink-0'} flex flex-col sidebar-pearl overflow-y-auto`}
          style={{
            borderTopLeftRadius: isMobileViewport ? '0' : 'var(--uclaw-shell-radius)',
            borderBottomLeftRadius: isMobileViewport ? '0' : 'var(--uclaw-shell-radius)',
          }}
        >
          {isMobileViewport ? (
            <div className="px-4 pt-3 pb-2">
              <h2 className="text-[15px] font-semibold dark:text-claude-darkText text-claude-text">{'设置'}</h2>
            </div>
          ) : (
            <div className="px-6 pt-6 pb-4">
              <div className="rounded-2xl border dark:border-claude-darkBorder border-claude-border bg-claude-surface dark:bg-claude-darkSurface/50 px-4 py-4">
                <h2 className="text-base font-semibold dark:text-claude-darkText text-claude-text">{'设置'}</h2>
                <p className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'把模型、频道、记忆和文件入口轻轻收在一起。'}
                </p>
              </div>
            </div>
          )}
          <div className={`${isMobileViewport ? 'contents' : 'px-4 pb-4'}`}>
            {isMobileViewport ? (
              /* ## {提取} SettingsMobileTabStrip
                  当前移动端设置导航改成横向切换栏。
                  后续可抽成轻量 tab-strip，供其它大设置页或管理页复用。 */
              <div className="mx-3 mb-2 rounded-2xl border dark:border-claude-darkBorder border-claude-border bg-claude-surface dark:bg-claude-darkSurface/50 p-2">
                <div className="flex gap-2 overflow-x-auto px-1 pb-1 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {sidebarTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => handleTabChange(tab.key)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
                        activeTab === tab.key
                          ? 'border-claude-accent/30 bg-gradient-to-r from-claude-accent/14 to-claude-accent/6 text-claude-accent shadow-sm'
                          : 'border-claude-border dark:border-claude-darkBorder bg-claude-surface dark:bg-claude-darkSurface text-claude-textSecondary dark:text-claude-darkTextSecondary'
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        activeTab === tab.key
                          ? 'bg-white/80 dark:bg-white/10'
                          : 'bg-transparent'
                      }`}>
                        {tab.icon}
                      </span>
                      <span className="truncate font-medium">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <nav className="flex flex-col gap-1 rounded-2xl border dark:border-claude-darkBorder border-claude-border bg-claude-surface dark:bg-claude-darkSurface/50 p-2">
                {sidebarTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => handleTabChange(tab.key)}
                    className={`group flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-colors duration-200 ease-out text-left relative overflow-hidden ${
                      activeTab === tab.key
                        ? 'bg-gradient-to-r from-claude-accent/16 to-claude-accent/8 text-claude-accent shadow-[0_10px_24px_rgba(193,156,133,0.14)]'
                        : 'dark:text-claude-darkTextSecondary text-claude-textSecondary dark:hover:text-claude-darkText hover:text-claude-text dark:hover:bg-claude-darkSurfaceHover/50 hover:bg-claude-surfaceHover/50'
                    }`}
                  >
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-colors duration-200 ease-out"
                      style={{
                        height: activeTab === tab.key ? '60%' : '0%',
                        opacity: activeTab === tab.key ? 1 : 0,
                        background: activeTab === tab.key 
                          ? 'linear-gradient(180deg, #E0B8A8 0%, #D4A894 100%)'
                          : 'linear-gradient(180deg, rgba(59,130,246,0.6) 0%, rgba(59,130,246,0.4) 100%)',
                        transform: `translateY(-50%) scale(${activeTab === tab.key ? 1 : 0})`,
                      }}
                    />
                    <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                      activeTab === tab.key
                        ? 'border-claude-accent/20 bg-white/80 text-claude-accent dark:border-claude-accent/20 dark:bg-white/10'
                        : 'border-transparent bg-white/40 dark:bg-white/[0.04]'
                    }`}>
                      {tab.icon}
                    </span>
                    <span className="relative z-10 min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{tab.label}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-normal dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        {tab.subtitle}
                      </span>
                    </span>
                    {activeTab === tab.key && (
                      <span className="relative z-10 h-2 w-2 shrink-0 rounded-full bg-claude-accent/80 shadow-[0_0_0_4px_rgba(224,184,168,0.16)]" />
                    )}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>

        {/* Right content */}
        <div
          className={`relative flex-1 flex flex-col min-w-0 ${isMobileViewport ? 'min-h-0 w-full' : ''} overflow-hidden bg-gradient-pearl`}
          style={{
            borderTopRightRadius: isMobileViewport ? '0' : 'var(--uclaw-shell-radius)',
            borderBottomRightRadius: isMobileViewport ? '0' : 'var(--uclaw-shell-radius)',
          }}
        >
          {/* Content header */}
          <div className={`flex items-center ${isMobileViewport ? 'px-4 pt-3 pb-2 pr-14' : 'px-8 pt-6 pb-4 pr-16'} shrink-0`}>
            <h3 className={`${isMobileViewport ? 'text-sm' : 'text-base'} font-semibold dark:text-claude-darkText text-claude-text`}>{activeTabLabel}</h3>
          </div>

          {noticeMessage && (
            <div className={isMobileViewport ? 'px-4' : 'px-8'}>
              <ErrorMessage
                message={noticeMessage}
                onClose={() => setNoticeMessage(null)}
              />
            </div>
          )}

          {error && (
            <div className={isMobileViewport ? 'px-4' : 'px-8'}>
              <ErrorMessage
                message={error}
                onClose={() => setError(null)}
              />
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={isMobileViewport ? 'contents' : 'flex flex-col flex-1 overflow-hidden'}
          >
            {isMobileViewport ? (
              <>
                {/* Tab content */}
                <div
                  ref={contentRef}
                  className="px-4 py-3 flex-1 overflow-y-auto"
                  style={{ scrollbarGutter: 'stable' }}
                >
                  {settingsLoaded ? (
                    settingsLoadFailed ? (
                      <div className="flex h-full min-h-[320px] items-center justify-center">
                        <div className="max-w-lg rounded-2xl border border-red-300/60 bg-red-50/80 px-5 py-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                          <div className="font-medium">{'设置读取失败'}</div>
                          <div className="mt-2 leading-6">
                            {error || '当前没有拿到配置真值。为避免把默认配置误写回去，保存已被暂时禁用。'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      renderTabContent()
                    )
                  ) : (
                    <div className="flex h-full min-h-[320px] items-center justify-center">
                      <div className="rounded-2xl border border-claude-border/60 bg-claude-surface/60 px-5 py-4 text-sm text-claude-textSecondary dark:border-claude-darkBorder/60 dark:bg-claude-darkSurface/50 dark:text-claude-darkTextSecondary">
                        正在读取设置真值...
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer buttons */}
              <div className="flex flex-col-reverse items-stretch gap-2 px-4 py-3 dark:border-claude-darkBorder border-claude-border border-t bg-gradient-pearl-footer shrink-0">
                {activeTab === 'im' ? (
                  <>
                    <div className="text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      {'消息频道会在字段失焦后即时保存。这里不再额外提交，避免和右侧启停状态打架。'}
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full px-4 py-2 dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-xl transition-colors text-sm font-medium border dark:border-claude-darkBorder border-claude-border"
                    >
                      {'关闭'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full px-4 py-2 dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-xl transition-colors text-sm font-medium border dark:border-claude-darkBorder border-claude-border"
                    >
                      {'取消'}
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving || !settingsLoaded || settingsLoadFailed}
                      className="w-full px-4 py-2 bg-gradient-to-r from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white rounded-xl transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
                    >
                      {isSaving ? '保存中...' : '保存'}
                    </button>
                  </>
                )}
              </div>
              </>
            ) : (
              <div className={`${SETTINGS_DESKTOP_CONTENT_WRAP_CLASS} flex flex-col flex-1 min-h-0`}>
                {/* Tab content */}
                <div
                  ref={contentRef}
                  className="flex-1 overflow-y-auto py-6"
                  style={{ scrollbarGutter: 'stable' }}
                >
                  {settingsLoaded ? (
                    settingsLoadFailed ? (
                      <div className="flex h-full min-h-[320px] items-center justify-center">
                        <div className="max-w-lg rounded-2xl border border-red-300/60 bg-red-50/80 px-5 py-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                          <div className="font-medium">{'设置读取失败'}</div>
                          <div className="mt-2 leading-6">
                            {error || '当前没有拿到配置真值。为避免把默认配置误写回去，保存已被暂时禁用。'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      renderTabContent()
                    )
                  ) : (
                    <div className="flex h-full min-h-[320px] items-center justify-center">
                      <div className="rounded-2xl border border-claude-border/60 bg-claude-surface/60 px-5 py-4 text-sm text-claude-textSecondary dark:border-claude-darkBorder/60 dark:bg-claude-darkSurface/50 dark:text-claude-darkTextSecondary">
                        正在读取设置真值...
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer buttons */}
                <div className="bg-gradient-pearl-footer py-5 shrink-0">
                  <div className="flex items-center justify-end gap-4 border-t dark:border-claude-darkBorder border-claude-border pt-4">
                  {activeTab === 'im' ? (
                    <>
                      <div className="mr-auto text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        {'消息频道会在字段失焦后即时保存。这里不再额外提交，避免和右侧启停状态打架。'}
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-xl transition-colors text-sm font-medium border dark:border-claude-darkBorder border-claude-border"
                      >
                        {'关闭'}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-xl transition-colors text-sm font-medium border dark:border-claude-darkBorder border-claude-border"
                      >
                        {'取消'}
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving || !settingsLoaded || settingsLoadFailed}
                        className="px-5 py-2.5 bg-gradient-to-r from-purple-400 to-purple-600 hover:from-purple-500 hover:to-purple-700 text-white rounded-xl transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40"
                      >
                        {isSaving ? '保存中...' : '保存'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              </div>
            )}
          </form>

        </div>

        {/* ## {提取} SettingsSubModal
            Settings 内部的局部小弹层正在迁出。
            这里后续应统一收口到 SettingsSubModal / ModalWrapper，不再在页面壳里继续叠 absolute overlay。 */}
        {isTestResultModalOpen && testResult && (
          <ModalWrapper
            isOpen={true}
            onClose={() => setIsTestResultModalOpen(false)}
            title={'连接测试结果'}
            maxWidth="md"
            maxHeight="60vh"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
                  {'连接测试结果'}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                <span>{providerMeta[testResult.provider as ProviderType]?.label ?? testResult.provider}</span>
                <span className="text-[11px]">•</span>
                <span className={`inline-flex items-center gap-1 ${testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {testResult.success ? (
                    <CheckCircleIcon className="h-4 w-4" />
                  ) : (
                    <XCircleIcon className="h-4 w-4" />
                  )}
                  {testResult.success ? '连接成功' : '连接失败'}
                </span>
              </div>

              <p className="mt-3 text-xs leading-5 dark:text-claude-darkText text-claude-text whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                {testResult.message}
              </p>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsTestResultModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
                >
                  {'关闭'}
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}

        {(isAddingModel || isEditingModel) && (
          <ModalWrapper
            isOpen={true}
            onClose={handleCancelModelEdit}
            title={isEditingModel ? '编辑模型' : '添加新模型'}
            maxWidth="md"
            maxHeight="70vh"
          >
              <div onKeyDown={handleModelDialogKeyDown}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
                    {isEditingModel ? '编辑模型' : '添加新模型'}
                  </div>
                </div>

                {modelFormError && (
                  <p className="mb-3 text-xs text-red-600 dark:text-red-400">
                    {modelFormError}
                  </p>
                )}

                <div className="space-y-3">
                  {activeProvider === 'ollama' ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                          {'模型名称'}
                        </label>
                        <input
                          autoFocus
                          type="text"
                          value={newModelId}
                          onChange={(e) => {
                            setNewModelId(e.target.value);
                            if (!newModelName || newModelName === newModelId) {
                              setNewModelName(e.target.value);
                            }
                            if (modelFormError) {
                              setModelFormError(null);
                            }
                          }}
                          className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                          placeholder={'qwen3:8b'}
                        />
                        <p className="mt-1 text-[11px] dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/70">
                          {'输入 Ollama 中已安装的模型名称，如 qwen3:8b、lfm2:latest'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                          {'显示名称（可选）'}
                        </label>
                        <input
                          type="text"
                          value={newModelName === newModelId ? '' : newModelName}
                          onChange={(e) => {
                            setNewModelName(e.target.value || newModelId);
                            if (modelFormError) {
                              setModelFormError(null);
                            }
                          }}
                          className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                          placeholder={'我的 Qwen3 模型'}
                        />
                        <p className="mt-1 text-[11px] dark:text-claude-darkTextSecondary/70 text-claude-textSecondary/70">
                          {'自定义在列表中显示的名称，留空则使用模型名称'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                          {'模型名称'}
                        </label>
                        <input
                          autoFocus
                          type="text"
                          value={newModelName}
                          onChange={(e) => {
                            setNewModelName(e.target.value);
                            if (modelFormError) {
                              setModelFormError(null);
                            }
                          }}
                          className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                          placeholder="GPT-4"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary mb-1">
                          {'模型ID'}
                        </label>
                        <input
                          type="text"
                          value={newModelId}
                          onChange={(e) => {
                            setNewModelId(e.target.value);
                            if (modelFormError) {
                              setModelFormError(null);
                            }
                          }}
                          className="block w-full rounded-xl bg-claude-surfaceInset dark:bg-claude-darkSurfaceInset dark:border-claude-darkBorder border-claude-border border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-xs"
                          placeholder="gpt-4"
                        />
                      </div>
                    </>
                  )}
                  <div className="flex items-center space-x-2">
                    <input
                      id={`${activeProvider}-supportsImage`}
                      type="checkbox"
                      checked={newModelSupportsImage}
                      onChange={(e) => setNewModelSupportsImage(e.target.checked)}
                      className="h-3.5 w-3.5 text-claude-accent focus:ring-claude-accent dark:bg-claude-darkSurface bg-claude-surface border-claude-border dark:border-claude-darkBorder rounded"
                    />
                    <label
                      htmlFor={`${activeProvider}-supportsImage`}
                      className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary"
                    >
                      {'支持图像输入'}
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 mt-4">
                  <button
                    type="button"
                    onClick={handleCancelModelEdit}
                    className="px-3 py-1.5 text-xs dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover rounded-xl border dark:border-claude-darkBorder border-claude-border"
                  >
                    {'取消'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewModel}
                    className="px-3 py-1.5 text-xs text-white bg-claude-accent hover:bg-claude-accentHover rounded-xl"
                  >
                    {'保存'}
                  </button>
                </div>
              </div>
          </ModalWrapper>
        )}
      </div>
    </div>
  );
};

export default Settings; 


