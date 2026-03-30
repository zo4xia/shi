import { z } from 'zod';
import {
  hasBrowserObserverRuntime,
  runBrowserObserver,
  type BrowserObservationTarget,
} from '../browserObserverRuntime';
import type {
  NativeCapabilityAddon,
  NativeCapabilityRuntimeContext,
} from './types';

const ATTACHMENT_INPUT_LABEL = '输入文件:';

function hasAttachedFileReference(text: string): boolean {
  return String(text || '')
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith(ATTACHMENT_INPUT_LABEL));
}

function listObservationWarnings(observation: Record<string, unknown>): string[] {
  const warnings = observation.warnings;
  return Array.isArray(warnings)
    ? warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function buildCurrentPageObservationLimitMessage(
  currentPage: { url: string; title?: string | null },
  observation: Record<string, unknown>
): string | null {
  const observedUrl = typeof observation.pageUrl === 'string' ? observation.pageUrl.trim() : '';
  const warningText = listObservationWarnings(observation).join(' \n');
  const authLike = /(login|sign[\s-]?in|auth|oauth|passport|sso|accounts\/page\/login|in-browser session|登录态)/i
    .test(`${observedUrl} ${warningText}`);
  if (!authLike) {
    return null;
  }

  const sourceLabel = currentPage.title?.trim()
    ? `${currentPage.title.trim()} (${currentPage.url})`
    : currentPage.url;
  const redirected = observedUrl && observedUrl !== currentPage.url;

  return [
    `小眼睛这次没拿到当前页的真实 DOM：${sourceLabel}`,
    redirected
      ? `当前只拿到了按 URL 重抓后的结果，并且已经跳到了登录/鉴权页：${observedUrl}`
      : '当前页依赖浏览器里的登录态或 live DOM，这次 URL 重抓拿到的是鉴权壳页。',
    '这不是页面消失，而是现有轻观察还没有直接接入你眼前那层真实页面上下文。需要继续时，请改用重浏览器链路。',
  ].join('\n');
}

function detectBrowserEyesIntent(text: string): {
  target: BrowserObservationTarget | 'current_page';
} | null {
  const rawText = String(text || '').trim();
  if (!rawText) {
    return null;
  }

  if (hasAttachedFileReference(rawText)) {
    return null;
  }

  const asksToInspect = /(看看|看一下|观察|观察下|inspect|observe|analyze|分析一下|读一下)/i.test(rawText);
  const pageLike = /(页面|网页|当前页|current page|current tab|this page|webpage|site)/i.test(rawText);
  const pureObservationOnly = isPureBrowserObservationRequest(rawText);

  const httpMatch = rawText.match(/https?:\/\/[^\s<>"')\]]+/i);
  if (httpMatch?.[0] && asksToInspect && pureObservationOnly) {
    return { target: { mode: 'url', value: httpMatch[0] } };
  }

  const htmlPathMatch = rawText.match(/(?:[A-Za-z]:\\|\/)[^\s"'<>]+\.html?\b/i);
  if (htmlPathMatch?.[0] && asksToInspect && pureObservationOnly) {
    return { target: { mode: 'file', value: htmlPathMatch[0] } };
  }

  if (asksToInspect && pageLike && pureObservationOnly) {
    return { target: 'current_page' };
  }

  return null;
}

function isPureBrowserObservationRequest(text: string): boolean {
  return !/(点击|填写|输入|提交|登录|操作|执行|帮我做|修复|定位|分析原因|总结|提取|对比|然后|接着|并且|并|再|搜索|筛选|导出|下载|保存|修改|生成|回答|告诉我|why|how|click|type|submit|login|filter|export|download|save|fix|summarize|extract|compare|then|next)/i.test(
    text
  );
}

function formatObservation(observation: Record<string, unknown>, sourceLabel: string): string {
  const json = JSON.stringify(observation, null, 2);
  return [
    `小眼睛观察结果：${sourceLabel}`,
    '把它当作轻量 DOM 侦察，不是绝对真相。',
    '```json',
    json.length > 5000 ? `${json.slice(0, 5000)}\n...` : json,
    '```',
  ].join('\n');
}

export function buildBrowserEyesSystemPrompt(_context: NativeCapabilityRuntimeContext): string | null {
  if (!hasBrowserObserverRuntime()) {
    return null;
  }

  return [
    '## Native Browser Eyes',
    '- A lightweight browser-eyes observer is available for structured pages.',
    '- Use `browser_observe_page` before heavy browser automation when the user mainly wants to understand the current page or a specific URL.',
    '- Treat the observation as DOM-first reconnaissance, not pixel-perfect truth.',
  ].join('\n');
}

export function createBrowserEyesSdkTools(
  toolFactory: (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: any) => Promise<any>
  ) => any,
  context: NativeCapabilityRuntimeContext
): any[] {
  if (!hasBrowserObserverRuntime()) {
    return [];
  }

  return [
    toolFactory(
      'browser_observe_page',
      'Inspect a webpage or the current embedded browser page and return a lightweight structured observation.',
      {
        url: z.string().optional(),
        file_path: z.string().optional(),
        use_current_page: z.boolean().optional(),
      },
      async (args: { url?: string; file_path?: string; use_current_page?: boolean }) => {
        try {
          let target: BrowserObservationTarget | null = null;
          let sourceLabel = '';
          let currentPageForLimitCheck: { url: string; title?: string | null } | null = null;

          if (args.use_current_page) {
            const currentPage = context.readCurrentBrowserPage?.() ?? null;
            if (!currentPage?.url) {
              throw new Error('当前没有可用的嵌入页面。');
            }
            currentPageForLimitCheck = currentPage;
            target = { mode: 'url', value: currentPage.url };
            sourceLabel = currentPage.title ? `${currentPage.title} (${currentPage.url})` : currentPage.url;
          } else if (typeof args.url === 'string' && args.url.trim()) {
            target = { mode: 'url', value: args.url.trim() };
            sourceLabel = args.url.trim();
          } else if (typeof args.file_path === 'string' && args.file_path.trim()) {
            target = { mode: 'file', value: args.file_path.trim() };
            sourceLabel = args.file_path.trim();
          } else {
            throw new Error('需要提供 url / file_path，或者 use_current_page=true。');
          }

          const observation = await runBrowserObserver(target);
          if (!observation) {
            throw new Error('小眼睛暂时没有观察到有效结果。');
          }
          if (currentPageForLimitCheck) {
            const limitMessage = buildCurrentPageObservationLimitMessage(currentPageForLimitCheck, observation);
            if (limitMessage) {
              throw new Error(limitMessage);
            }
          }

          return {
            content: [{
              type: 'text',
              text: formatObservation(observation, sourceLabel),
            }],
          } as any;
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            }],
            isError: true,
          } as any;
        }
      }
    ),
  ];
}

export async function tryHandleBrowserEyesDirectTurn(
  params: {
    prompt: string;
    emitResult: (text: string, metadata?: Record<string, unknown>) => void;
  },
  context: NativeCapabilityRuntimeContext
): Promise<boolean> {
  const intent = detectBrowserEyesIntent(params.prompt);
  if (!intent || !hasBrowserObserverRuntime()) {
    return false;
  }

  let target: BrowserObservationTarget | null = null;
  let sourceLabel = '';
  let currentPageForLimitCheck: { url: string; title?: string | null } | null = null;

  if (intent.target === 'current_page') {
    const currentPage = context.readCurrentBrowserPage?.() ?? null;
    if (!currentPage?.url) {
      return false;
    }
    currentPageForLimitCheck = currentPage;
    target = { mode: 'url', value: currentPage.url };
    sourceLabel = currentPage.title ? `${currentPage.title} (${currentPage.url})` : currentPage.url;
  } else {
    target = intent.target;
    sourceLabel = intent.target.value;
  }

  const observation = await runBrowserObserver(target);
  if (!observation) {
    return false;
  }
  if (currentPageForLimitCheck) {
    const limitMessage = buildCurrentPageObservationLimitMessage(currentPageForLimitCheck, observation);
    if (limitMessage) {
      params.emitResult(limitMessage, {
        nativeAction: 'browser-observe-limit',
      });
      return true;
    }
  }

  params.emitResult(formatObservation(observation, sourceLabel), {
    nativeAction: 'browser-observe',
  });
  return true;
}

export const nativeBrowserEyesAddon: NativeCapabilityAddon = {
  id: 'browser-eyes-native-addon',
  title: '小眼睛观察',
  description: '用轻量 DOM 观察快速看页面，不先上重浏览器。',
  isAvailable: () => hasBrowserObserverRuntime(),
  getSystemPrompt: buildBrowserEyesSystemPrompt,
  createSdkTools: createBrowserEyesSdkTools,
  tryHandleDirectTurn: tryHandleBrowserEyesDirectTurn,
};
