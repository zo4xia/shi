/**
 * Settings 组件辅助函数
 * 
 * FLOW: 设置辅助 步骤1: 定义设置页面所需的辅助函数
 * 
 * @module components/settings/settingsHelpers
 */

/**
 * 复制文本到剪贴板 (降级方案)
 * 
 * @param text - 要复制的文本
 * @returns 是否成功
 */
export function copyTextFallback(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-999999px';
  textarea.style.top = '-999999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  
  try {
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    document.body.removeChild(textarea);
    return false;
  }
}

/**
 * 复制文本到剪贴板 (现代 API)
 * 
 * @param text - 要复制的文本
 * @returns 是否成功
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return copyTextFallback(text);
  } catch (err) {
    console.error('Failed to copy text:', err);
    return copyTextFallback(text);
  }
}

/**
 * 解析 URL 显示文本
 * 
 * @param url - URL 字符串
 * @returns 显示文本
 */
export function getUrlDisplayText(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname !== '/' ? parsed.pathname : ''}`;
  } catch {
    return url;
  }
}

/**
 * 解析打开 URL (添加协议)
 * 
 * @param url - URL 字符串
 * @returns 完整 URL
 */
export function resolveOpenUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('localhost') || url.startsWith('127.0.0.1')) {
    return `http://${url}`;
  }
  return `https://${url}`;
}

/**
 * 规范化 Base URL
 * 
 * @param baseUrl - Base URL 字符串
 * @returns 规范化后的 URL
 */
// {埋点} 📦 URL规范化 (ID: api-test-002) trim + 去末尾斜杠，不做toLowerCase
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function isVolcengineV3BaseUrl(baseUrl: string): boolean {
  const normalized = normalizeBaseUrl(baseUrl).toLowerCase();
  return normalized.includes('ark.cn-beijing.volces.com/api/v3')
    || normalized.includes('ark.cn-beijing.volces.com/api/coding/v3');
}

/**
 * 规范化 API 格式
 * 
 * @param value - 原始值
 * @returns 规范化后的格式
 */
export function normalizeApiFormat(value: unknown): 'anthropic' | 'openai' {
  return (value === 'openai' ? 'openai' : 'anthropic') as 'anthropic' | 'openai';
}

/**
 * 获取提供商的固定 API 格式
 * 
 * @param provider - 提供商类型
 * @returns API 格式或 null
 */
export function getFixedApiFormatForProvider(provider: string): 'anthropic' | 'openai' | null {
  const anthropicProviders = ['anthropic', 'claude', 'deepseek', 'moonshot', 'zhipu', 'minimax', 'qwen', 'xiaomi'];
  const openaiProviders = ['openai', 'gemini', 'ollama', 'custom', 'stepfun', 'youdaozhiyun', 'youdao_zhiyun', 'volcengine'];
  
  if (anthropicProviders.includes(provider.toLowerCase())) {
    return 'anthropic';
  }
  if (openaiProviders.includes(provider.toLowerCase())) {
    return 'openai';
  }
  return null;
}

/**
 * 获取有效的 API 格式
 * 
 * @param provider - 提供商类型
 * @param value - 原始值
 * @returns API 格式
 */
export function getEffectiveApiFormat(provider: string, value: unknown): 'anthropic' | 'openai' {
  const fixed = getFixedApiFormatForProvider(provider);
  if (fixed) return fixed;
  return normalizeApiFormat(value);
}

/**
 * 是否显示 API 格式选择器
 * 
 * @param provider - 提供商类型
 * @returns 是否显示
 */
export function shouldShowApiFormatSelector(provider: string): boolean {
  return getFixedApiFormatForProvider(provider) === null;
}

/**
 * 是否提供商需要 API Key
 * 
 * @param provider - 提供商类型
 * @returns 是否需要
 */
export function providerRequiresApiKey(provider: string): boolean {
  return provider !== 'ollama';
}

/**
 * 构建OpenAI兼容的聊天完成URL
 * 
 * @param baseUrl - 基础URL
 * @param provider - 提供商
 * @returns 完整URL
 */
// {埋点} 📦 URL构建 (ID: api-test-003) normalizeBaseUrl() + /v1/chat/completions，已含/v1时不重复
export function buildOpenAICompatibleChatCompletionsUrl(
  baseUrl: string,
  _provider: string
): string {
  const normalized = normalizeBaseUrl(baseUrl);

  // 如果 URL 已经以 /vN 结尾，不要重复添加版本前缀
  if (/\/v\d+$/.test(normalized)) {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/v1/chat/completions`;
}

/**
 * 构建OpenAI Responses URL
 * 
 * @param baseUrl - 基础URL
 * @returns 完整URL
 */
// {埋点} 📦 Responses URL构建 (ID: api-test-003b) 同上逻辑，/v1去重
export function buildOpenAIResponsesUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/v\d+$/.test(normalized)) {
    return `${normalized}/responses`;
  }
  return `${normalized}/v1/responses`;
}

/**
 * 提供商是否应使用OpenAI Responses
 * 
 * @param provider - 提供商
 * @returns 是否使用
 */
export function shouldUseOpenAIResponsesForProvider(provider: string): boolean {
  return ['ollama'].includes(provider.toLowerCase());
}

/**
 * 提供商是否应使用 max_completion_tokens (OpenAI)
 * 
 * @param provider - 提供商
 * @param modelId - 模型ID
 * @returns 是否使用
 */
export function shouldUseMaxCompletionTokensForOpenAI(
  provider: string,
  modelId?: string
): boolean {
  // OpenAI 的新模型使用 max_completion_tokens
  if (provider.toLowerCase() === 'openai') {
    // GPT-4.1, GPT-4.1-mini, GPT-4.1-nano 等新模型
    if (modelId?.startsWith('gpt-4.1') || modelId?.startsWith('gpt-4o-mini')) {
      return true;
    }
  }
  return false;
}

/**
 * 连通性测试 Token 预算
 */
export const CONNECTIVITY_TEST_TOKEN_BUDGET = 64;

/**
 * 联系邮箱
 */
export const ABOUT_CONTACT_EMAIL = '';
