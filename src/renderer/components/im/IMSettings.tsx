/**
 * IM Settings Component
 * Configuration UI for Feishu and supported IM bots
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SignalIcon, XMarkIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { EyeIcon, EyeSlashIcon, XCircleIcon as XCircleIconSolid } from '@heroicons/react/20/solid';
import { RootState } from '../../store';
import { imService } from '../../services/im';
import { showGlobalToast } from '../../services/toast';
import { setDingTalkConfig, setFeishuConfig, setQQConfig, setTelegramConfig, setDiscordConfig, setNimConfig, setXiaomifengConfig, setWecomConfig, setWechatBotConfig, setImaConfig, clearError } from '../../store/slices/imSlice';
import type { IMPlatform, IMConnectivityCheck, IMConnectivityTestResult, IMGatewayConfig } from '../../types/im';
import { getVisibleIMPlatforms, isComingSoonIMPlatform } from '../../utils/regionFilter';
import { AGENT_ROLE_ICONS, AGENT_ROLE_LABELS, AGENT_ROLE_ORDER } from '../../../shared/agentRoleConfig';

type IMSidebarItem = IMPlatform | 'ima';
type WechatBotQrLoginState = {
  sessionId: string;
  qrcodeUrl: string;
  phase: 'wait' | 'scanned' | 'confirmed' | 'expired' | 'error';
  expiresAt: number;
  lastError: string | null;
  usageTips: string[];
  messageForms: string[];
};

// Platform metadata
const platformMeta: Record<IMPlatform, { label: string; logo: string }> = {
  dingtalk: { label: '钉钉', logo: 'dingding.png' },
  feishu: { label: '飞书', logo: 'feishu.png' },
  qq: { label: 'QQ', logo: '' },
  telegram: { label: 'Telegram', logo: '' },
  discord: { label: 'Discord', logo: '' },
  nim: { label: '云信', logo: '' },
  xiaomifeng: { label: '小蜜蜂', logo: '' },
  wecom: { label: '企业微信', logo: '' },
  wechatbot: { label: '个人微信 Bot', logo: '' },
};

const verdictColorClass: Record<IMConnectivityTestResult['verdict'], string> = {
  pass: 'bg-green-500/15 text-green-600 dark:text-green-400',
  warn: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
  fail: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const checkLevelColorClass: Record<IMConnectivityCheck['level'], string> = {
  pass: 'text-green-600 dark:text-green-400',
  info: 'text-sky-600 dark:text-sky-400',
  warn: 'text-yellow-700 dark:text-yellow-300',
  fail: 'text-red-600 dark:text-red-400',
};

const platformNameMap: Record<string, string> = {
  dingtalk: '钉钉', feishu: '飞书', qq: 'QQ', telegram: 'Telegram',
  discord: 'Discord', nim: '云信', xiaomifeng: '小蜜蜂', wecom: '企业微信', wechatbot: '个人微信 Bot',
  ima: '微信拓展',
};

const connectivityCheckTitleMap: Record<string, string> = {
  missing_credentials: '配置项缺失', auth_check: '凭证鉴权', gateway_running: 'IM 渠道启用状态',
  inbound_activity: '入站消息活动', outbound_activity: '出站消息活动', platform_last_error: '平台最近错误',
  feishu_group_requires_mention: '飞书群聊触发规则', feishu_event_subscription_required: '飞书事件订阅要求',
  discord_group_requires_mention: 'Discord 群聊触发规则', telegram_privacy_mode_hint: 'Telegram Privacy Mode',
  dingtalk_bot_membership_hint: '钉钉会话权限', nim_p2p_only_hint: '云信私聊模式',
};

const connectivityCheckSuggestionMap: Record<string, string> = {
  missing_credentials: '补全必填配置项后重试。', auth_check: '核对平台凭证、应用权限和发布状态。',
  gateway_running: '若显示未启用，请点击对应 IM 渠道胶囊按钮启用；启用后确认网络可访问平台服务。',
  inbound_activity: '向机器人发一条测试消息；群聊场景请 @机器人。',
  outbound_activity: '检查机器人发消息权限、可见范围和会话回包权限。',
  platform_last_error: '根据错误提示修复后再重测。',
  feishu_group_requires_mention: '在群聊中使用 @机器人 + 内容。',
  feishu_event_subscription_required: '在飞书后台开启 im.message.receive_v1 并发布版本。',
  discord_group_requires_mention: '在频道中使用 @机器人 + 内容。',
  telegram_privacy_mode_hint: '在 @BotFather 调整 Privacy Mode 设置。',
  dingtalk_bot_membership_hint: '确认机器人已加入目标会话并允许收发消息。',
  nim_p2p_only_hint: '通过私聊方式向机器人账号发送消息。',
};

const connectivityVerdictMap: Record<string, string> = {
  pass: '可对话', warn: '需关注', fail: '不可用',
};

// Helper function to translate IM error messages
function translateIMError(error: string | null): string {
  if (!error) return '';
  return error;
}

const IMSettings: React.FC = () => {
  const dispatch = useDispatch();
  const { config, status, isLoading } = useSelector((state: RootState) => state.im);
  const [activePlatform, setActivePlatform] = useState<IMSidebarItem>('feishu');
  const [testingPlatform, setTestingPlatform] = useState<IMPlatform | null>(null);
  const [connectivityResults, setConnectivityResults] = useState<Partial<Record<IMPlatform, IMConnectivityTestResult>>>({});
  const [connectivityModalPlatform, setConnectivityModalPlatform] = useState<IMPlatform | null>(null);
  const [allowedUserIdInput, setAllowedUserIdInput] = useState('');
  const [configLoaded, setConfigLoaded] = useState(false);
  // Re-entrancy guard for gateway toggle to prevent rapid ON→OFF→ON
  const [togglingPlatform, setTogglingPlatform] = useState<IMPlatform | null>(null);
  // Track visibility of password fields (eye toggle)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [showImaHelp, setShowImaHelp] = useState(false);
  const [showFeishuPoolHint, setShowFeishuPoolHint] = useState(false);
  const [wechatBotQrLogin, setWechatBotQrLogin] = useState<WechatBotQrLoginState | null>(null);
  const feishuAutoSaveToastTimerRef = useRef<number | null>(null);
  const feishuPersistTimerRef = useRef<number | null>(null);
  const feishuPersistVersionRef = useRef(0);

  // Track the last-persisted NIM credentials so we can detect real changes on save
  const savedNimConfigRef = useRef<{ appKey: string; account: string; token: string }>({
    appKey: config.nim.appKey,
    account: config.nim.account,
    token: config.nim.token,
  });

  // Reset password visibility when switching platforms
  useEffect(() => {
    setShowSecrets({});
  }, [activePlatform]);

  // Initialize IM service and subscribe status updates
  useEffect(() => {
    let cancelled = false;
    void imService.init().then(() => {
      if (!cancelled) {
        setConfigLoaded(true);
      }
    });
    return () => {
      cancelled = true;
      if (feishuAutoSaveToastTimerRef.current) {
        window.clearTimeout(feishuAutoSaveToastTimerRef.current);
        feishuAutoSaveToastTimerRef.current = null;
      }
      if (feishuPersistTimerRef.current) {
        window.clearTimeout(feishuPersistTimerRef.current);
        feishuPersistTimerRef.current = null;
      }
    };
  }, []);

  const persistFeishuApps = async (
    apps: typeof config.feishu.apps,
    enabledOverride?: boolean,
    version?: number
  ) => {
    const nextEnabled = enabledOverride ?? apps.some((app) => app.enabled);
    try {
      await imService.updateConfig({
        feishu: {
          ...config.feishu,
          enabled: nextEnabled,
          apps,
        },
      });
      if (version === undefined || version === feishuPersistVersionRef.current) {
        showGlobalToast('设置已保存');
      }
    } catch (error) {
      console.error('[IMSettings] Failed to persist feishu apps:', error);
      if (version === undefined || version === feishuPersistVersionRef.current) {
        showGlobalToast('飞书应用保存失败');
      }
    }
  };

  const scheduleFeishuPersist = (apps: typeof config.feishu.apps, enabledOverride?: boolean) => {
    feishuPersistVersionRef.current += 1;
    const version = feishuPersistVersionRef.current;
    if (feishuPersistTimerRef.current) {
      window.clearTimeout(feishuPersistTimerRef.current);
    }
    feishuPersistTimerRef.current = window.setTimeout(() => {
      feishuPersistTimerRef.current = null;
      void persistFeishuApps(apps, enabledOverride, version);
    }, 320);
  };

  // {标记} 添加新的飞书应用
  const handleAddFeishuApp = () => {
    const newApp = {
      id: `app-${Date.now()}`,
      name: '新应用',
      appId: '',
      appSecret: '',
      agentRoleKey: 'organizer',
      enabled: true,
      createdAt: Date.now(),
    };
    const updatedApps = [...(config.feishu.apps || []), newApp];
    dispatch(setFeishuConfig({ apps: updatedApps }));
    void persistFeishuApps(updatedApps, true);
  };

  // {标记} 删除飞书应用
  const handleDeleteFeishuApp = (appId: string) => {
    const updatedApps = (config.feishu.apps || []).filter(app => app.id !== appId);
    dispatch(setFeishuConfig({ apps: updatedApps }));
    void persistFeishuApps(updatedApps, updatedApps.some(app => app.enabled));
  };

  // {标记} 修改飞书应用字段
  const handleFeishuAppChange = (appId: string, field: string, value: any) => {
    const updatedApps = (config.feishu.apps || []).map(app =>
      app.id === appId ? { ...app, [field]: value } : app
    );
    dispatch(setFeishuConfig({ apps: updatedApps }));
    scheduleFeishuPersist(updatedApps);
  };

  const handleToggleFeishuApp = (appId: string) => {
    const updatedApps = (config.feishu.apps || []).map(app =>
      app.id === appId ? { ...app, enabled: !app.enabled } : app
    );
    dispatch(setFeishuConfig({ apps: updatedApps }));
    void persistFeishuApps(updatedApps, updatedApps.some(app => app.enabled));
  };

  // Handle QQ config change
  const handleQQChange = (field: 'appId' | 'appSecret', value: string) => {
    dispatch(setQQConfig({ [field]: value }));
  };

  // Handle Telegram config change
  const handleTelegramChange = (field: 'botToken' | 'allowedUserIds', value: string | string[]) => {
    dispatch(setTelegramConfig({ [field]: value }));
  };

  // Handle Discord config change
  const handleDiscordChange = (field: 'botToken', value: string) => {
    dispatch(setDiscordConfig({ [field]: value }));
  };

  // Handle NIM config change
  const handleNimChange = (
    field: 'appKey' | 'account' | 'token' | 'accountWhitelist' | 'teamPolicy' | 'teamAllowlist' | 'qchatEnabled' | 'qchatServerIds',
    value: string | boolean
  ) => {
    dispatch(setNimConfig({ [field]: value }));
  };

  // Handle Xiaomifeng config change
  const handleXiaomifengChange = (field: 'clientId' | 'secret', value: string) => {
    dispatch(setXiaomifengConfig({ [field]: value }));
  };

  // Handle WeCom config change
  const handleWecomChange = (field: 'botId' | 'secret', value: string) => {
    dispatch(setWecomConfig({ [field]: value }));
  };

  const handleWechatBotChange = (
    field: 'agentRoleKey' | 'botAccountId' | 'linkedUserId' | 'baseUrl' | 'botToken' | 'syncBotReplies',
    value: string | boolean
  ) => {
    dispatch(setWechatBotConfig({ [field]: value }));
  };

  const persistWechatBotConfig = async (
    nextWechatBotConfig: typeof config.wechatbot,
    options?: {
      restartIfEnabled?: boolean;
      successMessage?: string;
    }
  ) => {
    await imService.updateConfig({ wechatbot: nextWechatBotConfig });

    const shouldRefreshBridge = options?.restartIfEnabled && nextWechatBotConfig.enabled;
    if (!shouldRefreshBridge) {
      if (options?.successMessage) {
        showGlobalToast(options.successMessage);
      }
      return;
    }

    const bridgeReady = Boolean(
      nextWechatBotConfig.botAccountId
      && nextWechatBotConfig.botToken
      && nextWechatBotConfig.agentRoleKey
    );

    if (!bridgeReady) {
      await imService.stopGateway('wechatbot');
      await imService.refreshRuntimeStatus('wechatbot');
      showGlobalToast('个人微信桥接已保存；当前绑定还不完整，桥接已先停止。');
      return;
    }

    await imService.stopGateway('wechatbot');
    const started = await imService.startGateway('wechatbot');
    if (!started) {
      showGlobalToast('个人微信配置已保存，但桥接重载失败，请检查当前绑定。');
      return;
    }

    showGlobalToast(options?.successMessage || '个人微信桥接已按最新绑定刷新');
  };

  const handleImaChange = (field: 'clientId' | 'apiKey', value: string) => {
    dispatch(setImaConfig({ [field]: value }));
  };

  const saveImaConfig = async (override?: Partial<typeof config.ima>) => {
    if (!configLoaded) return;
    const nextIma = { ...config.ima, ...(override ?? {}) };
    await imService.updateConfig({ ima: nextIma });
    showGlobalToast('设置已保存');
  };

  const handleWechatBotQrLogin = async () => {
    const result = await imService.startWechatBotQrLogin();
    if (!result.success || !result.value) {
      showGlobalToast(result.error || '个人微信官方扫码暂不可用');
      return;
    }
    setWechatBotQrLogin({
      sessionId: result.value.sessionId,
      qrcodeUrl: result.value.qrcodeUrl,
      phase: result.value.phase,
      expiresAt: result.value.expiresAt,
      lastError: result.value.lastError ?? null,
      usageTips: result.value.usageTips ?? [],
      messageForms: result.value.result?.messageForms ?? [],
    });
    showGlobalToast('二维码已获取，请用微信扫码确认');
  };

  useEffect(() => {
    if (!wechatBotQrLogin) {
      return;
    }
    if (wechatBotQrLogin.phase === 'confirmed' || wechatBotQrLogin.phase === 'expired' || wechatBotQrLogin.phase === 'error') {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const result = await imService.waitWechatBotQrLogin(wechatBotQrLogin.sessionId);
        if (cancelled) {
          return;
        }
        if (!result.success || !result.value) {
          setWechatBotQrLogin((prev) => (
            prev && prev.sessionId === wechatBotQrLogin.sessionId
              ? { ...prev, phase: 'error', lastError: result.error || '个人微信扫码状态获取失败' }
              : prev
          ));
          showGlobalToast(result.error || '个人微信扫码状态获取失败');
          return;
        }

        const login = result.value;
        setWechatBotQrLogin((prev) => (
          prev && prev.sessionId === login.sessionId
            ? {
                ...prev,
                qrcodeUrl: login.qrcodeUrl || prev.qrcodeUrl,
                phase: login.phase,
                expiresAt: login.expiresAt,
                lastError: login.lastError ?? null,
                messageForms: login.result?.messageForms ?? prev.messageForms,
              }
            : prev
        ));

        if (login.phase === 'confirmed' && login.result) {
          const nextWechatBotConfig = {
            ...config.wechatbot,
            botAccountId: login.result.botAccountId,
            linkedUserId: login.result.linkedUserId,
            baseUrl: login.result.baseUrl,
            botToken: login.result.botToken,
          };
          dispatch(setWechatBotConfig(nextWechatBotConfig));
          await persistWechatBotConfig(nextWechatBotConfig, {
            restartIfEnabled: true,
            successMessage: '个人微信授权成功，Bot 信息已回填',
          });
          return;
        }

        if (login.phase === 'expired') {
          showGlobalToast('二维码已过期，请重新发起扫码');
          return;
        }

        if (login.phase === 'error') {
          showGlobalToast(login.lastError || '个人微信扫码失败');
        }
      })();
    }, wechatBotQrLogin.phase === 'scanned' ? 600 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wechatBotQrLogin, config.wechatbot, dispatch]);

  // Save config on blur — also auto-triggers NIM connectivity test when
  // the NIM toggle is ON and credential fields have changed.
  const handleSaveConfig = async () => {
    if (!configLoaded) return;

    if (activePlatform === 'wechatbot') {
      await persistWechatBotConfig(config.wechatbot, {
        restartIfEnabled: true,
        successMessage: '设置已保存',
      });
      return;
    }

    await imService.updateConfig({ [activePlatform]: config[activePlatform] });

    showGlobalToast('设置已保存');

    // Detect NIM credential changes while the gateway is enabled (only for NIM platform)
    if (activePlatform === 'nim') {
      const prev = savedNimConfigRef.current;
      const cur = config.nim;
      const nimCredentialsChanged =
        cur.appKey !== prev.appKey ||
        cur.account !== prev.account ||
        cur.token !== prev.token;

      // Update the snapshot regardless
      savedNimConfigRef.current = { appKey: cur.appKey, account: cur.account, token: cur.token };

      if (nimCredentialsChanged && cur.enabled && cur.appKey && cur.account && cur.token) {
        // Auto-run connectivity test: stop → start → test (silently, no modal)
        await imService.stopGateway('nim');
        await imService.startGateway('nim');
        await runConnectivityTest('nim', { nim: cur } as Partial<IMGatewayConfig>);
      }
    }
  };

  // Save NIM config with explicit updated fields (for select/toggle that need immediate save)
  // This avoids the race condition where Redux state hasn't updated yet
  const saveNimConfigWithUpdate = async (updates: Partial<typeof config.nim>) => {
    if (!configLoaded) return;
    const updatedNimConfig = { ...config.nim, ...updates };
    await imService.updateConfig({ nim: updatedNimConfig });
    
    // 显示保存成功提示
    showGlobalToast('设置已保存');
  };

  const getCheckTitle = (code: IMConnectivityCheck['code']): string => {
    return connectivityCheckTitleMap[code] || code;
  };

  const getCheckSuggestion = (check: IMConnectivityCheck): string | undefined => {
    if (check.suggestion) {
      return check.suggestion;
    }
    if (check.code === 'gateway_running' && check.level === 'pass') {
      return undefined;
    }
    const suggestion = connectivityCheckSuggestionMap[check.code];
    if (!suggestion) {
      return undefined;
    }
    return suggestion;
  };

  const formatTestTime = (timestamp: number): string => {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return String(timestamp);
    }
  };

  const runConnectivityTest = async (
    platform: IMPlatform,
    configOverride?: Partial<IMGatewayConfig>
  ): Promise<IMConnectivityTestResult | null> => {
    setTestingPlatform(platform);
    const result = await imService.testGateway(platform, configOverride);
    if (result) {
      setConnectivityResults((prev) => ({ ...prev, [platform]: result }));
    }
    setTestingPlatform(null);
    return result;
  };

  // Toggle gateway on/off and persist enabled state
  const toggleGateway = async (platform: IMPlatform) => {
    // Re-entrancy guard: if a toggle is already in progress for this platform, bail out.
    // This prevents rapid ON→OFF→ON clicks from causing concurrent native SDK init/uninit.
    if (togglingPlatform === platform) return;
    setTogglingPlatform(platform);

    try {
      const isEnabled = config[platform].enabled;
      const newEnabled = !isEnabled;

      // Map platform to its Redux action
      const setConfigAction = getSetConfigAction(platform);

      // Update Redux state
      dispatch(setConfigAction({ enabled: newEnabled }));

      // Persist the updated config (construct manually since Redux state hasn't re-rendered yet)
      await imService.updateConfig({ [platform]: { ...config[platform], enabled: newEnabled } });

      if (newEnabled) {
        dispatch(clearError());
        const success = await imService.startGateway(platform);
        if (!success) {
          // Rollback enabled state on failure
          dispatch(setConfigAction({ enabled: false }));
          await imService.updateConfig({ [platform]: { ...config[platform], enabled: false } });
        } else {
          await runConnectivityTest(platform, {
            [platform]: { ...config[platform], enabled: true },
          } as Partial<IMGatewayConfig>);
        }
      } else {
        await imService.stopGateway(platform);
      }
    } finally {
      setTogglingPlatform(null);
    }
  };

  const dingtalkConnected = status.dingtalk.connected;
  const feishuConnected = status.feishu.connected;
  const telegramConnected = status.telegram.connected;
  const discordConnected = status.discord.connected;
  const nimConnected = status.nim.connected;
  const xiaomifengConnected = status.xiaomifeng?.connected ?? false;
  const qqConnected = status.qq?.connected ?? false;
  const wecomConnected = status.wecom?.connected ?? false;
  const wechatbotConnected = status.wechatbot?.connected ?? false;

  // Compute visible platforms
  const platforms = useMemo<IMPlatform[]>(() => {
    return getVisibleIMPlatforms('zh') as IMPlatform[];
  }, []);

  const primaryPlatforms = useMemo<IMPlatform[]>(
    () => platforms.filter((platform) => platform !== 'wecom' && platform !== 'wechatbot'),
    [platforms]
  );

  const wechatExtensionPlatforms = useMemo<IMPlatform[]>(
    () => platforms.filter((platform) => platform === 'wecom' || platform === 'wechatbot'),
    [platforms]
  );

  // Ensure activePlatform is always in visible platforms
  useEffect(() => {
    if (activePlatform !== 'ima' && platforms.length > 0 && !platforms.includes(activePlatform)) {
      // If current activePlatform is not visible, switch to first visible platform
      setActivePlatform(platforms[0]);
    }
  }, [platforms, activePlatform]);

  // Check if platform can be started
  const canStart = (platform: IMPlatform): boolean => {
    if (platform === 'dingtalk') {
      return !!(config.dingtalk.clientId && config.dingtalk.clientSecret);
    }
    if (platform === 'telegram') {
      return !!config.telegram.botToken;
    }
    if (platform === 'discord') {
      return !!config.discord.botToken;
    }
    if (platform === 'nim') {
      return !!(config.nim.appKey && config.nim.account && config.nim.token);
    }
    if (platform === 'xiaomifeng') {
      return !!(config.xiaomifeng.clientId && config.xiaomifeng.secret);
    }
    if (platform === 'qq') {
      return !!(config.qq.appId && config.qq.appSecret);
    }
    if (platform === 'wecom') {
      return !!(config.wecom.botId && config.wecom.secret);
    }
    if (platform === 'wechatbot') {
      return !!(config.wechatbot.botAccountId && config.wechatbot.botToken && config.wechatbot.agentRoleKey);
    }
    if (platform === 'feishu') {
      return config.feishu.apps.some(app => app.enabled && Boolean(app.appId && app.appSecret));
    }
    return false;
  };

  // Get platform enabled state (persisted toggle state)
  const isPlatformEnabled = (platform: IMPlatform): boolean => {
    return config[platform].enabled;
  };

  // Get platform connection status (runtime state)
  const getPlatformConnected = (platform: IMPlatform): boolean => {
    if (platform === 'dingtalk') return dingtalkConnected;
    if (platform === 'telegram') return telegramConnected;
    if (platform === 'discord') return discordConnected;
    if (platform === 'nim') return nimConnected;
    if (platform === 'xiaomifeng') return xiaomifengConnected;
    if (platform === 'qq') return qqConnected;
    if (platform === 'wecom') return wecomConnected;
    if (platform === 'wechatbot') return wechatbotConnected;
    return feishuConnected;
  };

  // Get platform transient starting status
  const getPlatformStarting = (platform: IMPlatform): boolean => {
    if (platform === 'discord') return status.discord.starting;
    return false;
  };

  const handleConnectivityTest = async (platform: IMPlatform) => {
    // Re-entrancy guard: if a test is already running, do nothing.
    if (testingPlatform) return;

    setConnectivityModalPlatform(platform);
    // 1. Persist latest config to backend (without changing enabled state)
    await imService.updateConfig({
      [platform]: config[platform],
    } as Partial<IMGatewayConfig>);

    // Run connectivity test (always passes configOverride so the backend uses
    // the latest unsaved credential values from the form).
    await runConnectivityTest(platform, {
      [platform]: config[platform],
    } as Partial<IMGatewayConfig>);
  };

  // Handle platform toggle
  const handlePlatformToggle = (platform: IMPlatform) => {
    // Block toggle if a toggle is already in progress for any platform
    if (togglingPlatform) return;
    const isEnabled = isPlatformEnabled(platform);
    // Can toggle ON if credentials are present, can always toggle OFF
    const canToggle = isEnabled || canStart(platform);
    if (canToggle && !isLoading) {
      setActivePlatform(platform);
      toggleGateway(platform);
    }
  };

  // Toggle gateway on/off - map platform to Redux action
  const getSetConfigAction = (platform: IMPlatform) => {
    const actionMap: Record<IMPlatform, any> = {
      dingtalk: setDingTalkConfig,
      feishu: setFeishuConfig,
      qq: setQQConfig,
      telegram: setTelegramConfig,
      discord: setDiscordConfig,
      nim: setNimConfig,
      xiaomifeng: setXiaomifengConfig,
      wecom: setWecomConfig,
      wechatbot: setWechatBotConfig,
    };
    return actionMap[platform];
  };

  const handleRestartFeishuGateway = async () => {
    try {
      setTogglingPlatform('feishu');
      await imService.stopGateway('feishu');
      const started = await imService.startGateway('feishu');
      if (started) {
        showGlobalToast('飞书网关已按最新配置重启');
      } else {
        showGlobalToast('飞书网关重启失败，请检查应用配置');
      }
    } finally {
      setTogglingPlatform(null);
    }
  };

  const handleRefreshFeishuRuntime = async () => {
    await imService.refreshRuntimeStatus('feishu');
    showGlobalToast('已刷新飞书连接状态');
  };

  const renderConnectivityTestButton = (platform: IMPlatform, label?: string) => (
    <button
      type="button"
      onClick={() => handleConnectivityTest(platform)}
      disabled={isLoading || testingPlatform === platform}
      className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-xl border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <SignalIcon className="h-3.5 w-3.5 mr-1.5" />
      {testingPlatform === platform
        ? '测试中...'
        : label ?? (connectivityResults[platform]
          ? '重新检查'
          : '检查配置')}
    </button>
  );

  useEffect(() => {
    if (!connectivityModalPlatform) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConnectivityModalPlatform(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [connectivityModalPlatform]);

  const hasImaCredentials = Boolean(config.ima.clientId && config.ima.apiKey);
  const activeGatewayPlatform = activePlatform === 'ima' ? null : activePlatform;
  const activeGatewayEnabled = activeGatewayPlatform ? isPlatformEnabled(activeGatewayPlatform) : false;
  const activeGatewayCanStart = activeGatewayPlatform ? canStart(activeGatewayPlatform) : false;
  const activeGatewayConnected = activeGatewayPlatform
    ? getPlatformConnected(activeGatewayPlatform) || getPlatformStarting(activeGatewayPlatform)
    : false;
  const activeGatewayToggleDisabled = !activeGatewayPlatform
    || Boolean(togglingPlatform)
    || isLoading
    || !(activeGatewayEnabled || activeGatewayCanStart);
  const activePanelLabel = activePlatform === 'ima'
    ? '微信扩展凭证'
    : `${platformNameMap[activePlatform] || activePlatform}设置`;
  const activePanelStatusClass = activePlatform === 'ima'
    ? (hasImaCredentials
      ? 'bg-green-500/15 text-green-600 dark:text-green-400'
      : 'bg-gray-500/15 text-gray-500 dark:text-gray-400')
    : getPlatformStarting(activePlatform)
      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
      : getPlatformConnected(activePlatform)
      ? 'bg-green-500/15 text-green-600 dark:text-green-400'
      : isPlatformEnabled(activePlatform)
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
        : canStart(activePlatform)
          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
          : 'bg-gray-500/15 text-gray-500 dark:text-gray-400';
  const activePanelStatusLabel = activePlatform === 'ima'
    ? (hasImaCredentials ? '已配置' : '待填写')
    : getPlatformStarting(activePlatform)
      ? '启动中'
      : getPlatformConnected(activePlatform)
      ? '运行中'
      : isPlatformEnabled(activePlatform)
        ? '已启用'
        : canStart(activePlatform)
          ? '待启用'
          : '待配置';
  const activePanelDescription = activePlatform === 'ima'
    ? '统一保管微信扩展能力的凭证，不占用消息渠道启停位。'
    : activeGatewayConnected
      ? '渠道已经联通，可以继续调整凭证并重新做联通检查。'
      : activeGatewayEnabled
        ? '渠道已启用，等待平台侧联通或下一次消息触发。'
        : activeGatewayCanStart
          ? '凭证已经完整，可以从这里启用渠道。'
          : '先补全凭证，启停和联通检查会在这里继续。';

  const getSidebarStatusMeta = (platform: IMSidebarItem) => {
    if (platform === 'ima') {
      return hasImaCredentials
        ? {
            badgeClass: 'bg-green-500/15 text-green-700 dark:text-green-300',
            badgeLabel: '已配置',
            description: '统一保管微信拓展凭证。',
          }
        : {
            badgeClass: 'bg-gray-500/15 text-gray-500 dark:text-gray-400',
            badgeLabel: '待填写',
            description: '先把 Client ID 和 API Key 放在这里。',
          };
    }

    const isConnected = getPlatformConnected(platform) || getPlatformStarting(platform);
    const isEnabled = isPlatformEnabled(platform);

    if (isConnected) {
      return {
        badgeClass: 'bg-green-500/15 text-green-700 dark:text-green-300',
        badgeLabel: getPlatformStarting(platform) ? '启动中' : '运行中',
        description: '消息入口已联通，可继续检查状态。',
      };
    }

    if (isEnabled) {
      return {
        badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        badgeLabel: '已启用',
        description: '渠道开关已开，等待平台侧联通。',
      };
    }

    if (canStart(platform)) {
      return {
        badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
        badgeLabel: '可启用',
        description: '凭证完整，可以去右侧启用。',
      };
    }

    return {
      badgeClass: 'bg-gray-500/15 text-gray-500 dark:text-gray-400',
      badgeLabel: '待配置',
      description: '先补全凭证，再启用渠道。',
    };
  };

  const hasFeishuAppCredentials = (app: typeof config.feishu.apps[number]) => {
    return Boolean(app.appId && app.appSecret);
  };

  const feishuConfiguredAppIds = status.feishu.configuredAppIds ?? [];
  const feishuOnlineAppIds = status.feishu.onlineAppIds ?? [];
  const feishuConfiguredCount = status.feishu.configuredCount ?? feishuConfiguredAppIds.length;
  const feishuOnlineCount = status.feishu.onlineCount ?? feishuOnlineAppIds.length;
  const feishuMissingAppIds = feishuConfiguredAppIds.filter((appId) => !feishuOnlineAppIds.includes(appId));

  if (!configLoaded) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center">
        <div className="rounded-2xl border border-claude-border/60 bg-claude-surface/60 px-5 py-4 text-sm text-claude-textSecondary dark:border-claude-darkBorder/60 dark:bg-claude-darkSurface/50 dark:text-claude-darkTextSecondary">
          正在读取频道配置...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-4 xl:flex-row">
        {/* Platform List - Left Side */}
        <div className="xl:w-64 xl:flex-shrink-0 rounded-[24px] border border-claude-border/70 bg-white/70 p-3 shadow-[0_10px_30px_rgba(196,170,148,0.12)] dark:border-claude-darkBorder/70 dark:bg-claude-darkSurface/40 dark:shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
        <div className="mb-3 px-1">
          <div className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
            {'频道入口'}
          </div>
          <div className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'先选一个消息入口，再在右侧填写凭证和联通状态。'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {primaryPlatforms.map((platform) => {
          const meta = platformMeta[platform];
          const isComingSoon = isComingSoonIMPlatform(platform);
          const statusMeta = getSidebarStatusMeta(platform);
          return (
            <div
              key={platform}
              onClick={() => setActivePlatform(platform)}
              className={`flex items-start gap-2.5 rounded-2xl border p-3 cursor-pointer transition-colors ${
                activePlatform === platform
                  ? 'bg-claude-accent/10 dark:bg-claude-accent/20 border-claude-accent/30 shadow-subtle'
                  : 'dark:bg-claude-darkSurface/50 bg-claude-surface hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover border-transparent'
              }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/80 dark:bg-claude-darkBorder/25">
                  {meta.logo ? (
                  <img
                    src={meta.logo}
                    alt={meta.label}
                    className="w-6 h-6 object-contain rounded-md"
                  />
                  ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-claude-accent">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                  )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-sm font-medium truncate ${
                    activePlatform === platform
                      ? 'text-claude-accent'
                      : 'dark:text-claude-darkText text-claude-text'
                  }`}>
                    {platformNameMap[platform] || platform}
                  </span>
                  {isComingSoon && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      {'即将上线'}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {statusMeta.description}
                </div>
              </div>
              <div className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.badgeClass}`}>
                {statusMeta.badgeLabel}
              </div>
            </div>
          );
        })}
        </div>

        <div className="mt-4 border-t border-claude-border/60 pt-4 dark:border-claude-darkBorder/60">
          <div className="px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] dark:text-claude-darkTextSecondary text-claude-textSecondary">
            {'微信扩展'}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <div
            onClick={() => setActivePlatform('ima')}
            className={`flex items-start gap-2.5 rounded-2xl border p-3 cursor-pointer transition-colors ${
              activePlatform === 'ima'
                ? 'bg-claude-accent/10 dark:bg-claude-accent/20 border-claude-accent/30 shadow-subtle'
                : 'dark:bg-claude-darkSurface/50 bg-claude-surface hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover border-transparent'
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              {'微'}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium truncate ${
                activePlatform === 'ima'
                  ? 'text-claude-accent'
                  : 'dark:text-claude-darkText text-claude-text'
              }`}>
                {'微信拓展'}
              </div>
              <div className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary truncate">
                {getSidebarStatusMeta('ima').description}
              </div>
            </div>
            <div className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getSidebarStatusMeta('ima').badgeClass}`}>
              {getSidebarStatusMeta('ima').badgeLabel}
            </div>
          </div>

          {wechatExtensionPlatforms.map((platform) => {
            const meta = platformMeta[platform];
            const statusMeta = getSidebarStatusMeta(platform);
            return (
              <div
                key={platform}
                onClick={() => setActivePlatform(platform)}
                className={`flex items-start gap-2.5 rounded-2xl border p-3 cursor-pointer transition-colors ${
                  activePlatform === platform
                    ? 'bg-claude-accent/10 dark:bg-claude-accent/20 border-claude-accent/30 shadow-subtle'
                    : 'dark:bg-claude-darkSurface/50 bg-claude-surface hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover border-transparent'
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-white/80 dark:bg-claude-darkBorder/25">
                    {meta.logo ? (
                      <img src={meta.logo} alt={meta.label} className="w-6 h-6 object-contain rounded-md" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-claude-accent">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                      </svg>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium truncate ${
                    activePlatform === platform
                      ? 'text-claude-accent'
                      : 'dark:text-claude-darkText text-claude-text'
                  }`}>
                    {platformNameMap[platform] || platform}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {statusMeta.description}
                  </div>
                </div>
                <div className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.badgeClass}`}>
                  {statusMeta.badgeLabel}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      {/* Platform Settings - Right Side */}
      <div className="relative flex-1 min-w-0 min-h-0 rounded-[24px] border border-claude-border/70 bg-white/55 p-4 shadow-[0_12px_32px_rgba(196,170,148,0.10)] dark:border-claude-darkBorder/70 dark:bg-claude-darkSurface/35 dark:shadow-[0_12px_24px_rgba(0,0,0,0.18)]">
        <div className="space-y-4 pr-1">
        {/* Header with status */}
        <div className="flex flex-col gap-3 border-b pb-4 dark:border-claude-darkBorder/60 border-claude-border/60 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white dark:bg-claude-darkBorder/30 p-1">
              {activePlatform !== 'ima' && platformMeta[activePlatform].logo ? (
              <img
                src={platformMeta[activePlatform].logo}
                alt={platformMeta[activePlatform].label}
                className="w-4 h-4 object-contain rounded"
              />
              ) : activePlatform === 'ima' ? (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{'微'}</span>
              ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-claude-accent">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
              )}
            </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium dark:text-claude-darkText text-claude-text">
                  {activePanelLabel}
                </h3>
                <div className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {activePanelDescription}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${activePanelStatusClass}`}>
                {activePanelStatusLabel}
              </div>
              {activeGatewayPlatform && (
                <>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    activeGatewayEnabled
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-gray-500/15 text-gray-500 dark:text-gray-400'
                  }`}>
                    {activeGatewayEnabled ? '渠道已启用' : '渠道未启用'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    activeGatewayCanStart
                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-500/15 text-gray-500 dark:text-gray-400'
                  }`}>
                    {activeGatewayCanStart ? '凭证已就绪' : '待补凭证'}
                  </span>
                </>
              )}
            </div>
          </div>
          {activeGatewayPlatform && (
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {renderConnectivityTestButton(activeGatewayPlatform, '联通检查')}
              <button
                type="button"
                onClick={() => handlePlatformToggle(activeGatewayPlatform)}
                disabled={activeGatewayToggleDisabled}
                className={`inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeGatewayEnabled
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300'
                    : 'bg-claude-accent text-white hover:bg-claude-accent/90'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {togglingPlatform === activeGatewayPlatform
                  ? '切换中...'
                  : activeGatewayEnabled
                    ? '停用渠道'
                    : '启用渠道'}
              </button>
            </div>
          )}
        </div>

        {activePlatform === 'ima' && (
          <div className="rounded-2xl border dark:border-claude-darkBorder/60 border-claude-border/60 bg-gradient-to-br from-[#f8efe8] via-white to-[#f6f8fb] dark:from-claude-darkSurface dark:via-claude-darkSurface/90 dark:to-claude-darkSurface/70 px-4 py-4 shadow-subtle">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
                  {'微信生态扩展能力'}
                </div>
                <div className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'这里只填 IMA Client ID 和 API Key。保存后会自动同步。'}
                </div>
              </div>
              <div className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                hasImaCredentials
                  ? 'bg-green-500/15 text-green-700 dark:text-green-300'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
              }`}>
                {hasImaCredentials ? '已配置' : '待填写'}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImaHelp((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition-colors dark:border-emerald-800/70 dark:bg-emerald-950/20 dark:text-emerald-200"
              >
                <InformationCircleIcon className="h-3.5 w-3.5" />
                {'说明'}
              </button>
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-claude-text shadow-sm dark:bg-claude-darkSurface/70 dark:text-claude-darkText">
                {'底层能力包：ima-note'}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'IMA Client ID'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={config.ima.clientId}
                    onChange={(e) => handleImaChange('clientId', e.target.value)}
                    onBlur={() => { void saveImaConfig(); }}
                    className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-white/85 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-sm transition-colors"
                    placeholder="ac27..."
                  />
                  {config.ima.clientId && (
                    <div className="absolute right-2 inset-y-0 flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          handleImaChange('clientId', '');
                          void saveImaConfig({ clientId: '' });
                        }}
                        className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                        title={'清除'}
                      >
                        <XCircleIconSolid className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'IMA API Key'}
                </label>
                <div className="relative">
                  <input
                    type={showSecrets['ima.apiKey'] ? 'text' : 'password'}
                    value={config.ima.apiKey}
                    onChange={(e) => handleImaChange('apiKey', e.target.value)}
                    onBlur={() => { void saveImaConfig(); }}
                    className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-white/85 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-sm transition-colors"
                    placeholder="••••••••••••"
                  />
                  <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                    {config.ima.apiKey && (
                      <button
                        type="button"
                        onClick={() => {
                          handleImaChange('apiKey', '');
                          void saveImaConfig({ apiKey: '' });
                        }}
                        className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                        title={'清除'}
                      >
                        <XCircleIconSolid className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSecrets(prev => ({ ...prev, 'ima.apiKey': !prev['ima.apiKey'] }))}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={showSecrets['ima.apiKey'] ? '隐藏' : '显示'}
                    >
                      {showSecrets['ima.apiKey'] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {showImaHelp && (
              <div className="mt-4 rounded-xl border border-claude-border/60 bg-white/70 px-3 py-3 text-[11px] leading-5 dark:border-claude-darkBorder/60 dark:bg-claude-darkSurface/60 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                <div>{'这里只统一保管 IMA 凭证，不再散落到角色 secret 面板。'}</div>
                <div>{'是否给哪个角色使用，请去 Skills 安装 ima-note 到全局或指定角色。'}</div>
                <div>{'后续微信插件扫码授权之类的特例，也会继续收口到这里。'}</div>
              </div>
            )}
          </div>
        )}

        {activePlatform === 'wechatbot' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-[#eef7ef] via-white to-[#f7fbf7] px-4 py-4 shadow-subtle dark:border-emerald-900/30 dark:from-claude-darkSurface dark:via-claude-darkSurface/90 dark:to-claude-darkSurface/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
                    {'个人微信 WechatBot'}
                  </div>
                  <div className="mt-1 text-xs leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'这里收口个人微信官方桥接配置。微信官方负责消息收发与媒体处理，我们只负责角色绑定、记忆贯通与消息同步。'}
                  </div>
                </div>
                <div className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  config.wechatbot.botAccountId && config.wechatbot.botToken
                    ? 'bg-green-500/15 text-green-700 dark:text-green-300'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                }`}>
                  {config.wechatbot.botAccountId && config.wechatbot.botToken ? '已登记' : '待扫码'}
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-3 text-[11px] leading-5 text-amber-800 dark:text-amber-200">
                <div>{'一个微信号同一时刻只能绑定一个角色。'}</div>
                <div>{'绑定后，微信对话会和该角色在飞书/Web 的记忆贯通。'}</div>
                <div>{'如果改绑角色，旧角色会自动解绑。bot 自己的回复只做同步，不会反向再触发 AI。'}</div>
              </div>

              <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/8 px-3 py-3 text-[11px] leading-5 text-sky-800 dark:text-sky-200">
                <div>{'一期范围：文本消息 + 文档类内容。'}</div>
                <div>{'语音消息请先使用微信侧转文字后再发送给 Bot。'}</div>
                <div>{'多媒体回传和复杂文件形态暂不作为这期硬目标。'}</div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void handleWechatBotQrLogin(); }}
                  disabled={wechatBotQrLogin !== null && (wechatBotQrLogin.phase === 'wait' || wechatBotQrLogin.phase === 'scanned')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                >
                  <SignalIcon className="h-3.5 w-3.5" />
                  {wechatBotQrLogin !== null && (wechatBotQrLogin.phase === 'wait' || wechatBotQrLogin.phase === 'scanned')
                    ? '扫码进行中'
                    : '扫码授权（官方）'}
                </button>
                {wechatBotQrLogin && (
                  <button
                    type="button"
                    onClick={() => setWechatBotQrLogin(null)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-claude-border/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-claude-text transition-colors hover:bg-claude-surface dark:border-claude-darkBorder/60 dark:bg-claude-darkSurface/70 dark:text-claude-darkText"
                  >
                    {'关闭扫码窗'}
                  </button>
                )}
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-claude-text shadow-sm dark:bg-claude-darkSurface/70 dark:text-claude-darkText">
                  {'模式：官方桥接 / 我方记忆主线'}
                </span>
                {wechatBotQrLogin?.messageForms?.length ? (
                  <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                    {`消息形式：${wechatBotQrLogin.messageForms.join(' / ')}`}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'绑定角色'}
                </label>
                <select
                  value={config.wechatbot.agentRoleKey}
                  onChange={(e) => {
                    const nextWechatBotConfig = {
                      ...config.wechatbot,
                      agentRoleKey: e.target.value,
                    };
                    dispatch(setWechatBotConfig(nextWechatBotConfig));
                    void persistWechatBotConfig(nextWechatBotConfig, {
                      restartIfEnabled: true,
                      successMessage: e.target.value
                        ? '绑定角色已更新；个人微信后续消息会按新角色进入主线。'
                        : '绑定角色已清空；个人微信桥接已等待重新确认。',
                    });
                  }}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                >
                  <option value="">{'请选择一个角色'}</option>
                  {AGENT_ROLE_ORDER.map((roleKey) => (
                    <option key={roleKey} value={roleKey}>
                      {AGENT_ROLE_LABELS[roleKey]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between rounded-xl border px-4 py-3 dark:border-claude-darkBorder/60 border-claude-border/60">
                <div>
                  <div className="text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'同步 Bot 回复'}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'把微信 Bot 自己发出的回复同步回我们的系统时间线，但不再次触发 AI。'}
                  </div>
                </div>
                <div
                  className={`w-10 h-5 rounded-full flex items-center transition-colors cursor-pointer ${
                    config.wechatbot.syncBotReplies ? 'bg-green-500' : 'dark:bg-claude-darkBorder bg-claude-border'
                  }`}
                  onClick={() => {
                    const nextValue = !config.wechatbot.syncBotReplies;
                    const nextWechatBotConfig = {
                      ...config.wechatbot,
                      syncBotReplies: nextValue,
                    };
                    dispatch(setWechatBotConfig(nextWechatBotConfig));
                    void persistWechatBotConfig(nextWechatBotConfig, {
                      restartIfEnabled: true,
                      successMessage: nextValue ? '已开启 Bot 回复同步' : '已关闭 Bot 回复同步',
                    });
                  }}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                      config.wechatbot.syncBotReplies ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'Bot Account ID'}
                </label>
                <input
                  type="text"
                  value={config.wechatbot.botAccountId}
                  onChange={(e) => handleWechatBotChange('botAccountId', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                  placeholder="扫码成功后由官方返回"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'扫码用户 ID'}
                </label>
                <input
                  type="text"
                  value={config.wechatbot.linkedUserId}
                  onChange={(e) => handleWechatBotChange('linkedUserId', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                  placeholder="扫码成功后由官方返回"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'官方 Base URL'}
                </label>
                <input
                  type="text"
                  value={config.wechatbot.baseUrl}
                  onChange={(e) => handleWechatBotChange('baseUrl', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                  placeholder="https://ilinkai.weixin.qq.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'Bot Token'}
                </label>
                <div className="relative">
                  <input
                    type={showSecrets['wechatbot.botToken'] ? 'text' : 'password'}
                    value={config.wechatbot.botToken}
                    onChange={(e) => handleWechatBotChange('botToken', e.target.value)}
                    onBlur={handleSaveConfig}
                    className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-10 text-sm transition-colors"
                    placeholder="扫码成功后由官方返回"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, 'wechatbot.botToken': !prev['wechatbot.botToken'] }))}
                    className="absolute right-2 inset-y-0 flex items-center p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                    title={showSecrets['wechatbot.botToken'] ? '隐藏' : '显示'}
                  >
                    {showSecrets['wechatbot.botToken'] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-1">
              {renderConnectivityTestButton('wechatbot', '检查桥接')}
            </div>

            {status.wechatbot?.botId && (
              <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                {`已登记 Bot：${status.wechatbot.botId}`}
              </div>
            )}

            {status.wechatbot?.botUsername && (
              <div className="text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary bg-claude-surfaceHover/60 dark:bg-claude-darkSurfaceHover/40 px-3 py-2 rounded-lg">
                {`扫码用户：${status.wechatbot.botUsername}`}
              </div>
            )}

            {status.wechatbot?.lastError && (
              <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {status.wechatbot.lastError}
              </div>
            )}
          </div>
        )}

        {/* Feishu Settings */}
        {activePlatform === 'feishu' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
              <div className="font-medium">{'修改配置后，如未及时生效，请点击“重启飞书网关”或“刷新状态”。'}</div>
              <div className="mt-1">
                {`配置中的应用 ${feishuConfiguredCount} 个，当前在线 ${feishuOnlineCount} 个。`}
                {feishuMissingAppIds.length > 0 ? ` 未在线：${feishuMissingAppIds.join('、')}` : ' 当前配置与在线网关数量一致。'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { void handleRestartFeishuGateway(); }}
                disabled={Boolean(togglingPlatform) || isLoading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-claude-accent text-white hover:bg-claude-accent/90 transition-colors disabled:opacity-60"
              >
                {'重启飞书网关'}
              </button>
              <button
                type="button"
                onClick={() => { void handleRefreshFeishuRuntime(); }}
                disabled={Boolean(togglingPlatform) || isLoading}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border dark:border-claude-darkBorder border-claude-border dark:text-claude-darkText text-claude-text hover:bg-claude-surfaceHover dark:hover:bg-claude-darkSurfaceHover transition-colors disabled:opacity-60"
              >
                {'刷新状态'}
              </button>
            </div>

            {/* {标记} 飞书应用列表 */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowFeishuPoolHint((value) => !value)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/8 px-2.5 py-1 text-[11px] font-medium text-amber-700 transition-colors dark:text-amber-300"
              >
                <InformationCircleIcon className="h-3.5 w-3.5" />
                {'应用池说明'}
              </button>
              {showFeishuPoolHint && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] leading-5 text-amber-700 dark:text-amber-300">
                  {'这里保存的是飞书应用候选池。运行时会优先使用“已纳入启动候选且凭证完整”的应用，不是每一条都单独常驻运行。'}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  飞书应用列表
                </label>
                <button
                  type="button"
                  onClick={handleAddFeishuApp}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-claude-accent text-white hover:bg-claude-accent/90 transition-colors"
                >
                  + 添加应用
                </button>
              </div>

              {(config.feishu.apps || []).length === 0 && (
                <div className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary text-center py-8 border border-dashed border-claude-border/60 dark:border-claude-darkBorder/60 rounded-lg">
                  暂无应用，点击"添加应用"创建第一个飞书应用
                </div>
              )}

              {(config.feishu.apps || []).map((app) => (
                <div key={app.id} className="min-w-0 p-4 rounded-lg border border-claude-border/60 dark:border-claude-darkBorder/60 bg-claude-surface/40 dark:bg-claude-darkSurface/40 space-y-3">
                  {/* 应用头部 */}
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <input
                      type="text"
                      value={app.name}
                      onChange={(e) => handleFeishuAppChange(app.id, 'name', e.target.value)}
                      className="min-w-0 flex-1 text-sm font-medium bg-transparent border-none focus:outline-none focus:ring-0 dark:text-claude-darkText text-claude-text px-0"
                      placeholder="应用名称"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteFeishuApp(app.id)}
                      className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                      title="删除应用"
                    >
                      <XCircleIconSolid className="h-5 w-5" />
                    </button>
                  </div>

                  {/* App ID */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      App ID
                    </label>
                    <input
                      type="text"
                      value={app.appId}
                      onChange={(e) => handleFeishuAppChange(app.id, 'appId', e.target.value)}
                      className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                      placeholder="cli_xxxxx"
                    />
                  </div>

                  {/* App Secret */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      App Secret
                    </label>
                    <div className="relative">
                      <input
                        type={showSecrets[`feishu.${app.id}.appSecret`] ? 'text' : 'password'}
                        value={app.appSecret}
                        onChange={(e) => handleFeishuAppChange(app.id, 'appSecret', e.target.value)}
                        className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-10 text-sm transition-colors"
                        placeholder="••••••••••••"
                      />
                      <div className="absolute right-2 inset-y-0 flex items-center">
                        <button
                          type="button"
                          onClick={() => setShowSecrets(prev => ({ ...prev, [`feishu.${app.id}.appSecret`]: !prev[`feishu.${app.id}.appSecret`] }))}
                          className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                          title={showSecrets[`feishu.${app.id}.appSecret`] ? 'Hide' : 'Show'}
                        >
                          {showSecrets[`feishu.${app.id}.appSecret`] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* {标记} 内部角色模型绑定 */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                      内部角色模型绑定
                    </label>
                    <select
                      value={app.agentRoleKey}
                      onChange={(e) => handleFeishuAppChange(app.id, 'agentRoleKey', e.target.value)}
                      className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                    >
                      <option value="organizer">{`${AGENT_ROLE_ICONS.organizer} ${AGENT_ROLE_LABELS.organizer}`}</option>
                      <option value="writer">{`${AGENT_ROLE_ICONS.writer} ${AGENT_ROLE_LABELS.writer}`}</option>
                      <option value="designer">{`${AGENT_ROLE_ICONS.designer} ${AGENT_ROLE_LABELS.designer}`}</option>
                      <option value="analyst">{`${AGENT_ROLE_ICONS.analyst} ${AGENT_ROLE_LABELS.analyst}`}</option>
                    </select>
                  </div>

                  {/* 应用动作区 */}
                  <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        app.enabled
                          ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-500/15 text-gray-500 dark:text-gray-400'
                      }`}>
                        {app.enabled ? '已纳入候选' : '未纳入'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        hasFeishuAppCredentials(app)
                          ? 'bg-green-500/15 text-green-700 dark:text-green-300'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      }`}>
                        {hasFeishuAppCredentials(app) ? '凭证完整' : '待补凭证'}
                      </span>
                    </div>
                    <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-start">
                      <span className="text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        纳入启动候选
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleFeishuApp(app.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          app.enabled ? 'bg-claude-accent' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={app.enabled ? '停用此应用' : '启用此应用'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            app.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-1">
              {renderConnectivityTestButton('feishu', '检查飞书配置')}
            </div>

            {/* Error display */}
            {status.feishu.error && (
              <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {status.feishu.error}
              </div>
            )}
          </div>
        )}

        {/* QQ Settings */}
        {activePlatform === 'qq' && (
          <div className="space-y-3">
            {/* AppID */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                AppID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={config.qq.appId}
                  onChange={(e) => handleQQChange('appId', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-sm transition-colors"
                  placeholder="102xxxxx"
                />
                {config.qq.appId && (
                  <div className="absolute right-2 inset-y-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => { handleQQChange('appId', ''); void imService.updateConfig({ qq: { ...config.qq, appId: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* AppSecret */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                AppSecret
              </label>
              <div className="relative">
                <input
                  type={showSecrets['qq.appSecret'] ? 'text' : 'password'}
                  value={config.qq.appSecret}
                  onChange={(e) => handleQQChange('appSecret', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-sm transition-colors"
                  placeholder="••••••••••••"
                />
                <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                  {config.qq.appSecret && (
                    <button
                      type="button"
                      onClick={() => { handleQQChange('appSecret', ''); void imService.updateConfig({ qq: { ...config.qq, appSecret: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, 'qq.appSecret': !prev['qq.appSecret'] }))}
                    className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                    title={showSecrets['qq.appSecret'] ? '隐藏' : '显示'}
                  >
                    {showSecrets['qq.appSecret'] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-1">
              {renderConnectivityTestButton('qq')}
            </div>

            {/* Error display */}
            {status.qq?.lastError && (
              <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {status.qq.lastError}
              </div>
            )}
          </div>
        )}

        {/* Telegram Settings */}
        {activePlatform === 'telegram' && (
          <div className="space-y-3">
            {/* Bot Token */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Bot Token
              </label>
              <div className="relative">
                <input
                  type={showSecrets['telegram.botToken'] ? 'text' : 'password'}
                  value={config.telegram.botToken}
                  onChange={(e) => handleTelegramChange('botToken', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-sm transition-colors"
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                />
                <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                  {config.telegram.botToken && (
                    <button
                      type="button"
                      onClick={() => { handleTelegramChange('botToken', ''); void imService.updateConfig({ telegram: { ...config.telegram, botToken: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, 'telegram.botToken': !prev['telegram.botToken'] }))}
                    className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                    title={showSecrets['telegram.botToken'] ? '隐藏' : '显示'}
                  >
                    {showSecrets['telegram.botToken'] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {'从 @BotFather 获取 Bot Token'}
              </p>
            </div>

            {/* Allowed User IDs */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Allowed User IDs
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={allowedUserIdInput}
                  onChange={(e) => setAllowedUserIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const id = allowedUserIdInput.trim();
                      if (id && !(config.telegram.allowedUserIds || []).includes(id)) {
                        const newIds = [...(config.telegram.allowedUserIds || []), id];
                        handleTelegramChange('allowedUserIds', newIds);
                        setAllowedUserIdInput('');
                        void imService.updateConfig({ telegram: { ...config.telegram, allowedUserIds: newIds } });
                      }
                    }
                  }}
                  className="block flex-1 rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                  placeholder={'输入 Telegram User ID'}
                />
                <button
                  type="button"
                  onClick={() => {
                    const id = allowedUserIdInput.trim();
                    if (id && !(config.telegram.allowedUserIds || []).includes(id)) {
                      const newIds = [...(config.telegram.allowedUserIds || []), id];
                      handleTelegramChange('allowedUserIds', newIds);
                      setAllowedUserIdInput('');
                      void imService.updateConfig({ telegram: { ...config.telegram, allowedUserIds: newIds } });
                    }
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-claude-accent/10 text-claude-accent hover:bg-claude-accent/20 transition-colors"
                >
                  {'添加'}
                </button>
              </div>
              {(config.telegram.allowedUserIds || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(config.telegram.allowedUserIds || []).map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border dark:text-claude-darkText text-claude-text"
                    >
                      {id}
                      <button
                        type="button"
                        onClick={() => {
                          const newIds = (config.telegram.allowedUserIds || []).filter((uid) => uid !== id);
                          handleTelegramChange('allowedUserIds', newIds);
                          void imService.updateConfig({ telegram: { ...config.telegram, allowedUserIds: newIds } });
                        }}
                        className="text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      >
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {'限制只有白名单中的用户可以与 Bot 交互。留空则允许所有用户。'}
              </p>
            </div>

            <div className="pt-1">
              {renderConnectivityTestButton('telegram')}
            </div>

            {/* Bot username display */}
            {status.telegram.botUsername && (
              <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                Bot: @{status.telegram.botUsername}
              </div>
            )}

            {/* Error display */}
            {status.telegram.lastError && (
              <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {status.telegram.lastError}
              </div>
            )}
          </div>
        )}

        {/* Discord Settings */}
        {activePlatform === 'discord' && (
          <div className="space-y-3">
            {/* Bot Token */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Bot Token
              </label>
              <div className="relative">
                <input
                  type={showSecrets['discord.botToken'] ? 'text' : 'password'}
                  value={config.discord.botToken}
                  onChange={(e) => handleDiscordChange('botToken', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-sm transition-colors"
                  placeholder="MTIzNDU2Nzg5MDEyMzQ1Njc4OQ..."
                />
                <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                  {config.discord.botToken && (
                    <button
                      type="button"
                      onClick={() => { handleDiscordChange('botToken', ''); void imService.updateConfig({ discord: { ...config.discord, botToken: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, 'discord.botToken': !prev['discord.botToken'] }))}
                    className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                    title={showSecrets['discord.botToken'] ? '隐藏' : '显示'}
                  >
                    {showSecrets['discord.botToken'] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                从 Discord Developer Portal 获取 Bot Token
              </p>
            </div>

            <div className="pt-1">
              {renderConnectivityTestButton('discord')}
            </div>

            {/* Bot username display */}
            {status.discord.botUsername && (
              <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                Bot: {status.discord.botUsername}
              </div>
            )}

            {/* Error display */}
            {status.discord.lastError && (
              <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {status.discord.lastError}
              </div>
            )}
          </div>
        )}

        {/* NIM (NetEase IM) Settings */}
        {activePlatform === 'nim' && (
          <div className="space-y-3">
            {/* How to get NIM credentials */}
            <div className="mb-3 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30">
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                {'如何获取云信凭证：'}
              </p>
              <ol className="mt-2 text-xs text-blue-600 dark:text-blue-400 space-y-1 list-decimal list-inside">
                <li>{'登录网易云信控制台（yunxin.163.com）'}</li>
                <li>{'创建或选择应用，获取 App Key'}</li>
                <li>{'在"账号数-子功能配置"中创建 IM 账号（accid）'}</li>
                <li>{'为该账号生成 Token（密码）- 建议长期有效'}</li>
              </ol>
            </div>

            {/* App Key */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                App Key
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={config.nim.appKey}
                  onChange={(e) => handleNimChange('appKey', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-sm transition-colors"
                  placeholder="your_app_key"
                />
                {config.nim.appKey && (
                  <div className="absolute right-2 inset-y-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => { handleNimChange('appKey', ''); void imService.updateConfig({ nim: { ...config.nim, appKey: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {'从云信控制台应用信息中获取'}
              </p>
            </div>

            {/* Account */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Account (accid)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={config.nim.account}
                  onChange={(e) => handleNimChange('account', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-sm transition-colors"
                  placeholder={'机器人账号ID'}
                />
                {config.nim.account && (
                  <div className="absolute right-2 inset-y-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => { handleNimChange('account', ''); void imService.updateConfig({ nim: { ...config.nim, account: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {'在云信控制台"账号管理"中创建的 IM 账号 ID'}
              </p>
            </div>

            {/* Token */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Token
              </label>
              <div className="relative">
                <input
                  type={showSecrets['nim.token'] ? 'text' : 'password'}
                  value={config.nim.token}
                  onChange={(e) => handleNimChange('token', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-sm transition-colors"
                  placeholder="••••••••••••"
                />
                <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                  {config.nim.token && (
                    <button
                      type="button"
                      onClick={() => { handleNimChange('token', ''); void imService.updateConfig({ nim: { ...config.nim, token: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, 'nim.token': !prev['nim.token'] }))}
                    className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                    title={showSecrets['nim.token'] ? '隐藏' : '显示'}
                  >
                    {showSecrets['nim.token'] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {'为该账号生成的访问凭证（建议设置为长期有效）'}
              </p>
            </div>

            {/* Account Whitelist */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'白名单账号'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={config.nim.accountWhitelist}
                  onChange={(e) => handleNimChange('accountWhitelist', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-sm transition-colors"
                  placeholder="account1,account2"
                />
                {config.nim.accountWhitelist && (
                  <div className="absolute right-2 inset-y-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => { handleNimChange('accountWhitelist', ''); void imService.updateConfig({ nim: { ...config.nim, accountWhitelist: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {'填写允许与机器人对话的云信账号，多个账号用逗号分隔。留空则不限制，响应所有账号的消息。'}
              </p>
            </div>

            {/* Team Policy (群消息策略) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                {'群消息策略'}
              </label>
              <select
                value={config.nim.teamPolicy || 'disabled'}
                onChange={(e) => {
                  const newValue = e.target.value as 'disabled' | 'open' | 'allowlist';
                  handleNimChange('teamPolicy', newValue);
                  saveNimConfigWithUpdate({ teamPolicy: newValue });
                }}
                className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
              >
                <option value="disabled">{'禁用 - 不响应群消息'}</option>
                <option value="open">{'开放 - 响应所有群的@消息'}</option>
                <option value="allowlist">{'白名单 - 仅响应指定群的@消息'}</option>
              </select>
              <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                {'群消息仅响应@机器人的消息'}
              </p>
            </div>

            {/* Team Allowlist - only show when policy is 'allowlist' */}
            {config.nim.teamPolicy === 'allowlist' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'群白名单'}
                </label>
                <input
                  type="text"
                  value={config.nim.teamAllowlist || ''}
                  onChange={(e) => handleNimChange('teamAllowlist', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                  placeholder="team_id_1,team_id_2"
                />
                <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  {'填写允许响应的群ID，多个用逗号分隔'}
                </p>
              </div>
            )}

            {/* QChat Enable Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'启用圈组 (QChat)'}
                </label>
                <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary mt-0.5">
                  {'订阅圈组消息，仅响应@机器人的消息'}
                </p>
              </div>
              <div
                className={`w-10 h-5 rounded-full flex items-center transition-colors cursor-pointer ${
                  config.nim.qchatEnabled ? 'bg-green-500' : 'dark:bg-claude-darkBorder bg-claude-border'
                }`}
                onClick={() => {
                  const newValue = !config.nim.qchatEnabled;
                  handleNimChange('qchatEnabled', newValue);
                  saveNimConfigWithUpdate({ qchatEnabled: newValue });
                }}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                    config.nim.qchatEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </div>
            </div>

            {/* QChat Server IDs - only show when QChat is enabled */}
            {config.nim.qchatEnabled && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                  {'圈组服务器 ID'}
                </label>
                <input
                  type="text"
                  value={config.nim.qchatServerIds || ''}
                  onChange={(e) => handleNimChange('qchatServerIds', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 text-sm transition-colors"
                  placeholder={'留空自动发现所有已加入的服务器'}
                />
                <p className="text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                  {'指定要订阅的服务器 ID，多个用逗号分隔。留空则自动订阅所有已加入的服务器。'}
                </p>
              </div>
            )}

            <div className="pt-1">
              {renderConnectivityTestButton('nim')}
            </div>

            {/* Bot account display */}
            {status.nim.botAccount && (
              <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                Account: {status.nim.botAccount}
              </div>
            )}

            {/* Error display */}
            {status.nim.lastError && (
              <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {status.nim.lastError}
              </div>
            )}
          </div>
        )}

        {/* 小蜜蜂设置*/}
        {activePlatform === 'xiaomifeng' && (
          <div className="space-y-3">
            {/* Client ID */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Client ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={config.xiaomifeng.clientId}
                  onChange={(e) => handleXiaomifengChange('clientId', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-sm transition-colors"
                  placeholder={'小蜜蜂助理Client ID'}
                />
                {config.xiaomifeng.clientId && (
                  <div className="absolute right-2 inset-y-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => { handleXiaomifengChange('clientId', ''); void imService.updateConfig({ xiaomifeng: { ...config.xiaomifeng, clientId: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Client Secret */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Client Secret
              </label>
              <div className="relative">
                <input
                  type={showSecrets['xiaomifeng.secret'] ? 'text' : 'password'}
                  value={config.xiaomifeng.secret}
                  onChange={(e) => handleXiaomifengChange('secret', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-sm transition-colors"
                  placeholder="••••••••••••"
                />
                <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                  {config.xiaomifeng.secret && (
                    <button
                      type="button"
                      onClick={() => { handleXiaomifengChange('secret', ''); void imService.updateConfig({ xiaomifeng: { ...config.xiaomifeng, secret: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, 'xiaomifeng.secret': !prev['xiaomifeng.secret'] }))}
                    className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                    title={showSecrets['xiaomifeng.secret'] ? '隐藏' : '显示'}
                  >
                    {showSecrets['xiaomifeng.secret'] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-1">
              {renderConnectivityTestButton('xiaomifeng')}
            </div>

            {/* Bot account display */}
            {status.xiaomifeng?.botAccount && (
              <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                Account: {status.xiaomifeng.botAccount}
              </div>
            )}

            {/* Error display */}
            {status.xiaomifeng?.lastError && (
              <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {translateIMError(status.xiaomifeng.lastError)}
              </div>
            )}
          </div>
        )}

        {/* WeCom (企业微信) Settings */}
        {activePlatform === 'wecom' && (
          <div className="space-y-3">
            {/* Bot ID */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Bot ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={config.wecom.botId}
                  onChange={(e) => handleWecomChange('botId', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-8 text-sm transition-colors"
                  placeholder={'您的 Bot ID'}
                />
                {config.wecom.botId && (
                  <div className="absolute right-2 inset-y-0 flex items-center">
                    <button
                      type="button"
                      onClick={() => { handleWecomChange('botId', ''); void imService.updateConfig({ wecom: { ...config.wecom, botId: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Secret */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Secret
              </label>
              <div className="relative">
                <input
                  type={showSecrets['wecom.secret'] ? 'text' : 'password'}
                  value={config.wecom.secret}
                  onChange={(e) => handleWecomChange('secret', e.target.value)}
                  onBlur={handleSaveConfig}
                  className="block w-full rounded-lg dark:bg-claude-darkSurface/80 bg-claude-surface/80 dark:border-claude-darkBorder/60 border-claude-border/60 border focus:border-claude-accent focus:ring-1 focus:ring-claude-accent/30 dark:text-claude-darkText text-claude-text px-3 py-2 pr-16 text-sm transition-colors"
                  placeholder="••••••••••••"
                />
                <div className="absolute right-2 inset-y-0 flex items-center gap-1">
                  {config.wecom.secret && (
                    <button
                      type="button"
                      onClick={() => { handleWecomChange('secret', ''); void imService.updateConfig({ wecom: { ...config.wecom, secret: '' } }); }}
                      className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                      title={'清除'}
                    >
                      <XCircleIconSolid className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSecrets(prev => ({ ...prev, 'wecom.secret': !prev['wecom.secret'] }))}
                    className="p-0.5 rounded text-claude-textSecondary dark:text-claude-darkTextSecondary hover:text-claude-accent transition-colors"
                    title={showSecrets['wecom.secret'] ? '隐藏' : '显示'}
                  >
                    {showSecrets['wecom.secret'] ? <EyeIcon className="h-4 w-4" /> : <EyeSlashIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-1">
              {renderConnectivityTestButton('wecom')}
            </div>

            {/* Bot ID display */}
            {status.wecom?.botId && (
              <div className="text-xs text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                Bot ID: {status.wecom.botId}
              </div>
            )}

            {/* Error display */}
            {status.wecom?.lastError && (
              <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                {status.wecom.lastError}
              </div>
            )}
          </div>
        )}

        {connectivityModalPlatform && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setConnectivityModalPlatform(null)}
          >
            <div
              className="w-full max-w-2xl dark:bg-claude-darkSurface bg-claude-surface rounded-2xl shadow-modal border dark:border-claude-darkBorder border-claude-border overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b dark:border-claude-darkBorder border-claude-border flex items-center justify-between">
                <div className="text-sm font-semibold dark:text-claude-darkText text-claude-text">
                  {`${platformNameMap[connectivityModalPlatform] || connectivityModalPlatform} ${'连通性诊断'}`}
                </div>
                <button
                  type="button"
                  aria-label={'关闭'}
                  onClick={() => setConnectivityModalPlatform(null)}
                  className="p-1 rounded-md dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 max-h-[65vh] overflow-y-auto">
                {testingPlatform === connectivityModalPlatform ? (
                  <div className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'测试中...'}
                  </div>
                ) : connectivityResults[connectivityModalPlatform] ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${verdictColorClass[connectivityResults[connectivityModalPlatform]!.verdict]}`}>
                        {connectivityResults[connectivityModalPlatform]!.verdict === 'pass' ? (
                          <CheckCircleIcon className="h-3.5 w-3.5" />
                        ) : connectivityResults[connectivityModalPlatform]!.verdict === 'warn' ? (
                          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                        ) : (
                          <XCircleIcon className="h-3.5 w-3.5" />
                        )}
                        {connectivityVerdictMap[connectivityResults[connectivityModalPlatform]!.verdict] || connectivityResults[connectivityModalPlatform]!.verdict}
                      </div>
                      <div className="text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                        {`${'最近测试'}: ${formatTestTime(connectivityResults[connectivityModalPlatform]!.testedAt)}`}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {connectivityResults[connectivityModalPlatform]!.checks.map((check, index) => (
                        <div
                          key={`${check.code}-${index}`}
                          className="rounded-lg border dark:border-claude-darkBorder/60 border-claude-border/60 px-2.5 py-2 dark:bg-claude-darkSurface/25 bg-white/70"
                        >
                          <div className={`text-xs font-medium ${checkLevelColorClass[check.level]}`}>
                            {getCheckTitle(check.code)}
                          </div>
                          <div className="mt-1 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                            {check.message}
                          </div>
                          {getCheckSuggestion(check) && (
                            <div className="mt-1 text-[11px] dark:text-claude-darkTextSecondary text-claude-textSecondary">
                              {`${'建议'}: ${getCheckSuggestion(check)}`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm dark:text-claude-darkTextSecondary text-claude-textSecondary">
                    {'尚未执行诊断。建议启用后立即测试。'}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t dark:border-claude-darkBorder border-claude-border flex items-center justify-end">
                {renderConnectivityTestButton(connectivityModalPlatform)}
              </div>
            </div>
          </div>
        )}

        {wechatBotQrLogin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-claude-border bg-claude-surface shadow-modal dark:border-claude-darkBorder dark:bg-claude-darkSurface">
              <div className="flex items-center justify-between border-b border-claude-border px-4 py-3 dark:border-claude-darkBorder">
                <div>
                  <div className="text-sm font-semibold text-claude-text dark:text-claude-darkText">
                    {'个人微信扫码授权'}
                  </div>
                  <div className="mt-1 text-xs text-claude-textSecondary dark:text-claude-darkTextSecondary">
                    {'扫码成功后会自动回填 Bot 信息；角色绑定仍由你自己确认。'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWechatBotQrLogin(null)}
                  className="p-1 rounded-md dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover dark:text-claude-darkTextSecondary text-claude-textSecondary"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-4 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl border border-claude-border/60 bg-white dark:border-claude-darkBorder/60">
                    <iframe
                      src={wechatBotQrLogin.qrcodeUrl}
                      title="wechatbot-qr"
                      className="h-[320px] w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open(wechatBotQrLogin.qrcodeUrl, '_blank', 'noopener,noreferrer')}
                    className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                  >
                    {'二维码没显示？在新窗口打开'}
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-claude-border/60 bg-white/70 px-3 py-3 dark:border-claude-darkBorder/60 dark:bg-claude-darkSurface/40">
                    <div className="text-xs font-medium text-claude-text dark:text-claude-darkText">
                      {'当前状态'}
                    </div>
                    <div className="mt-2 text-sm text-claude-textSecondary dark:text-claude-darkTextSecondary">
                      {wechatBotQrLogin.phase === 'wait' && '等待扫码'}
                      {wechatBotQrLogin.phase === 'scanned' && '已扫码，等待微信确认'}
                      {wechatBotQrLogin.phase === 'confirmed' && '授权成功，Bot 信息已回填'}
                      {wechatBotQrLogin.phase === 'expired' && '二维码已过期'}
                      {wechatBotQrLogin.phase === 'error' && (wechatBotQrLogin.lastError || '扫码失败')}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-3 text-[11px] leading-5 text-amber-800 dark:text-amber-200">
                    <div>{'一期先支持文本与文档类内容。'}</div>
                    <div>{'语音消息请在微信侧先转文字，再发给 Bot。'}</div>
                  </div>

                  {wechatBotQrLogin.usageTips.map((tip) => (
                    <div
                      key={tip}
                      className="rounded-lg border border-sky-500/20 bg-sky-500/8 px-3 py-2 text-[11px] leading-5 text-sky-800 dark:text-sky-200"
                    >
                      {tip}
                    </div>
                  ))}

                  {wechatBotQrLogin.messageForms.length > 0 && (
                    <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-300">
                      {`当前识别到的消息形式：${wechatBotQrLogin.messageForms.join(' / ')}`}
                    </div>
                  )}

                  {wechatBotQrLogin.lastError && wechatBotQrLogin.phase !== 'confirmed' && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                      {wechatBotQrLogin.lastError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
    </>
  );
};

export default IMSettings;
