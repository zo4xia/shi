// IM 平台分类
export const CHINA_IM_PLATFORMS = ['feishu', 'wecom', 'wechatbot'] as const;
export const GLOBAL_IM_PLATFORMS = ['telegram', 'discord'] as const;
export const COMING_SOON_IM_PLATFORMS = [] as const;

export const isComingSoonIMPlatform = (platform: string): boolean => {
  return COMING_SOON_IM_PLATFORMS.includes(platform as (typeof COMING_SOON_IM_PLATFORMS)[number]);
};

/**
 * 根据语言获取可见的 IM 平台
 */
export const getVisibleIMPlatforms = (language: 'zh' | 'en'): readonly string[] => {
  // 开发环境下显示所有平台
  // if (import.meta.env.DEV) {
  //   return [...CHINA_IM_PLATFORMS, ...GLOBAL_IM_PLATFORMS];
  // }

  // 中文 → 中国版，英文 → 国际版
  if (language === 'zh') {
    return CHINA_IM_PLATFORMS;
  }
  return [...CHINA_IM_PLATFORMS, ...GLOBAL_IM_PLATFORMS];
};
