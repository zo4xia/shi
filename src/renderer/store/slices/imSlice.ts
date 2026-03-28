import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  createDefaultIMState,
  mergeIMConfig,
  normalizeIMConfig,
  type DingTalkConfig,
  type DiscordConfig,
  type FeishuConfig,
  type IMGatewayConfig,
  type IMPlatform,
  type IMPlatformStatus,
  type IMState,
  type ImaConfig,
  type NimConfig,
  type QQConfig,
  type TelegramConfig,
  type WechatBotConfig,
  type WecomConfig,
  type XiaomifengConfig,
} from '../../types/im.ts';

const initialState: IMState = createDefaultIMState();

const applyPlatformConfigUpdate = <T extends IMPlatform>(
  state: IMState,
  platform: T,
  payload: Partial<IMGatewayConfig[T]>
) => {
  state.config[platform] = {
    ...state.config[platform],
    ...payload,
  } as IMGatewayConfig[T];
};

const imSlice = createSlice({
  name: 'im',
  initialState,
  reducers: {
    // {埋点} 💾 IM Redux (ID: im-redux-001) hydrateIMState合并config+status
    hydrateIMState: (state, action: PayloadAction<Partial<IMState>>) => {
      if (typeof action.payload.isLoading === 'boolean') {
        state.isLoading = action.payload.isLoading;
      }

      if (action.payload.config) {
        state.config = mergeIMConfig(state.config, action.payload.config);
      }

      if (action.payload.status) {
        (Object.keys(action.payload.status) as IMPlatform[]).forEach((platform) => {
          state.status[platform] = {
            ...state.status[platform],
            ...action.payload.status?.[platform],
          };
        });
      }
    },
    setIMLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    // {埋点} 🔄 平台状态更新 (ID: im-status-001) setPlatformStatus → state.status[platform]
    setPlatformStatus: (state, action: PayloadAction<{ platform: IMPlatform; status: Partial<IMPlatformStatus> }>) => {
      const { platform, status } = action.payload;
      state.status[platform] = {
        ...state.status[platform],
        ...status,
      };

      if (Object.prototype.hasOwnProperty.call(status, 'lastError') && !Object.prototype.hasOwnProperty.call(status, 'error')) {
        state.status[platform].error = status.lastError ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(status, 'error') && !Object.prototype.hasOwnProperty.call(status, 'lastError')) {
        state.status[platform].lastError = status.error ?? null;
      }
    },
    setDingTalkConfig: (state, action: PayloadAction<Partial<DingTalkConfig>>) => {
      applyPlatformConfigUpdate(state, 'dingtalk', action.payload);
    },
    setFeishuConfig: (state, action: PayloadAction<Partial<FeishuConfig>>) => {
      applyPlatformConfigUpdate(state, 'feishu', action.payload);
    },
    setQQConfig: (state, action: PayloadAction<Partial<QQConfig>>) => {
      applyPlatformConfigUpdate(state, 'qq', action.payload);
    },
    setTelegramConfig: (state, action: PayloadAction<Partial<TelegramConfig>>) => {
      applyPlatformConfigUpdate(state, 'telegram', {
        ...action.payload,
        allowedUserIds: action.payload.allowedUserIds
          ? action.payload.allowedUserIds.filter((value): value is string => typeof value === 'string')
          : state.config.telegram.allowedUserIds,
      });
    },
    setDiscordConfig: (state, action: PayloadAction<Partial<DiscordConfig>>) => {
      applyPlatformConfigUpdate(state, 'discord', action.payload);
    },
    setNimConfig: (state, action: PayloadAction<Partial<NimConfig>>) => {
      applyPlatformConfigUpdate(state, 'nim', action.payload);
    },
    setXiaomifengConfig: (state, action: PayloadAction<Partial<XiaomifengConfig>>) => {
      applyPlatformConfigUpdate(state, 'xiaomifeng', action.payload);
    },
    setWecomConfig: (state, action: PayloadAction<Partial<WecomConfig>>) => {
      applyPlatformConfigUpdate(state, 'wecom', action.payload);
    },
    setWechatBotConfig: (state, action: PayloadAction<Partial<WechatBotConfig>>) => {
      applyPlatformConfigUpdate(state, 'wechatbot', action.payload);
    },
    setImaConfig: (state, action: PayloadAction<Partial<ImaConfig>>) => {
      state.config.ima = {
        ...state.config.ima,
        ...action.payload,
      };
    },
    replaceIMConfig: (state, action: PayloadAction<Partial<IMGatewayConfig>>) => {
      state.config = normalizeIMConfig(action.payload);
    },
    clearError: (state) => {
      (Object.keys(state.status) as IMPlatform[]).forEach((platform) => {
        state.status[platform].error = null;
        state.status[platform].lastError = null;
      });
    },
  },
});

export const {
  hydrateIMState,
  setIMLoading,
  setPlatformStatus,
  setDingTalkConfig,
  setFeishuConfig,
  setQQConfig,
  setTelegramConfig,
  setDiscordConfig,
  setNimConfig,
  setXiaomifengConfig,
  setWecomConfig,
  setWechatBotConfig,
  setImaConfig,
  replaceIMConfig,
  clearError,
} = imSlice.actions;

export default imSlice.reducer;
