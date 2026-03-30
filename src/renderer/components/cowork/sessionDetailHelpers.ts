/**
 * CoworkSessionDetail 组件辅助函数
 * 
 * FLOW: 会话详情辅助 步骤1: 定义会话详情页面所需的辅助函数
 * 
 * @module components/cowork/sessionDetailHelpers
 */

/**
 * 自动滚动阈值
 */
export const AUTO_SCROLL_THRESHOLD = 120;

/**
 * 导出文件名非法字符模式
 */
export const INVALID_FILE_NAME_PATTERN = /[<>:"/\\|?*\u0000-\u001F]/g;

/**
 * 净化导出文件名
 * 
 * @param value - 原始文件名
 * @returns 净化后的文件名
 */
export function sanitizeExportFileName(value: string): string {
  const sanitized = value.replace(INVALID_FILE_NAME_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  return sanitized || 'cowork-session';
}

/**
 * 格式化导出时间戳
 * 
 * @param value - 日期对象
 * @returns 格式化的时间戳字符串
 */
export function formatExportTimestamp(value: Date): string {
  const pad = (num: number): string => String(num).padStart(2, '0');
  return `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}`;
}

/**
 * 截图区域
 */
export type CaptureRect = { x: number; y: number; width: number; height: number };

/**
 * 最大导出画布高度
 */
export const MAX_EXPORT_CANVAS_HEIGHT = 32760;

/**
 * 最大导出分段数
 */
export const MAX_EXPORT_SEGMENTS = 240;

/**
 * 等待下一帧
 * 
 * @returns Promise
 */
export function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

/**
 * 从 Base64 加载图片
 * 
 * @param pngBase64 - Base64 编码的 PNG
 * @returns HTMLImageElement
 */
export function loadImageFromBase64(pngBase64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode captured image'));
    img.src = `data:image/png;base64,${pngBase64}`;
  });
}

/**
 * DOM 矩形转换为截图区域
 * 
 * @param rect - DOMRect 对象
 * @returns CaptureRect 对象
 */
export function domRectToCaptureRect(rect: DOMRect): CaptureRect {
  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

function cloneNodeWithInlineStyles(node: Node): Node {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.cloneNode(true);
  }

  if (!(node instanceof Element)) {
    return node.cloneNode(false);
  }

  const clone = node.cloneNode(false) as HTMLElement;
  const sourceElement = node as HTMLElement;
  const targetElement = clone as HTMLElement;
  const computedStyle = window.getComputedStyle(sourceElement);

  for (const propertyName of Array.from(computedStyle)) {
    targetElement.style.setProperty(
      propertyName,
      computedStyle.getPropertyValue(propertyName),
      computedStyle.getPropertyPriority(propertyName),
    );
  }

  if (sourceElement instanceof HTMLImageElement && sourceElement.currentSrc && clone instanceof HTMLImageElement) {
    clone.setAttribute('src', sourceElement.currentSrc);
  }
  if (sourceElement instanceof HTMLCanvasElement) {
    const img = document.createElement('img');
    img.src = sourceElement.toDataURL();
    img.width = sourceElement.width;
    img.height = sourceElement.height;
    return img;
  }
  if (sourceElement instanceof HTMLTextAreaElement) {
    targetElement.textContent = sourceElement.value;
  }
  if (sourceElement instanceof HTMLInputElement) {
    sourceElement.setAttribute('value', sourceElement.value);
    if (sourceElement.checked) {
      sourceElement.setAttribute('checked', 'checked');
    } else {
      sourceElement.removeAttribute('checked');
    }
  }

  for (const child of Array.from(node.childNodes)) {
    clone.appendChild(cloneNodeWithInlineStyles(child));
  }

  return clone;
}

export async function captureScrollableViewportAsPngBase64(container: HTMLElement): Promise<string> {
  const width = Math.max(1, Math.round(container.clientWidth));
  const height = Math.max(1, Math.round(container.clientHeight));
  const viewport = document.createElement('div');
  const viewportStyle = window.getComputedStyle(container);
  for (const propertyName of Array.from(viewportStyle)) {
    viewport.style.setProperty(
      propertyName,
      viewportStyle.getPropertyValue(propertyName),
      viewportStyle.getPropertyPriority(propertyName),
    );
  }
  viewport.style.width = `${width}px`;
  viewport.style.height = `${height}px`;
  viewport.style.overflow = 'hidden';
  viewport.style.position = 'fixed';
  viewport.style.left = '-100000px';
  viewport.style.top = '0';
  viewport.style.margin = '0';

  const contentLayer = document.createElement('div');
  contentLayer.style.width = `${Math.max(container.scrollWidth, width)}px`;
  contentLayer.style.height = `${Math.max(container.scrollHeight, height)}px`;
  contentLayer.style.transform = `translate(${-container.scrollLeft}px, ${-container.scrollTop}px)`;
  contentLayer.style.transformOrigin = 'top left';

  for (const child of Array.from(container.childNodes)) {
    contentLayer.appendChild(cloneNodeWithInlineStyles(child));
  }

  viewport.appendChild(contentLayer);
  document.body.appendChild(viewport);

  try {
    await waitForNextFrame();
    const serialized = new XMLSerializer().serializeToString(viewport);
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
      `<foreignObject width="100%" height="100%">`,
      serialized,
      '</foreignObject>',
      '</svg>',
    ].join('');
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to render DOM snapshot'));
        img.src = svgUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas context unavailable');
      }

      context.drawImage(image, 0, 0, width, height);
      const pngDataUrl = canvas.toDataURL('image/png');
      const base64Index = pngDataUrl.indexOf(',');
      if (base64Index < 0) {
        throw new Error('Failed to encode viewport image');
      }
      return pngDataUrl.slice(base64Index + 1);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  } finally {
    document.body.removeChild(viewport);
  }
}

/**
 * 格式化未知值
 * 
 * @param value - 未知值
 * @returns 字符串表示
 */
export function formatUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * 从未知值中获取字符串数组
 * 
 * @param value - 未知值
 * @returns 字符串数组或 null
 */
export function getStringArray(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const lines = value.filter((item) => typeof item === 'string') as string[];
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Todo 状态
 */
export type TodoStatus = 'completed' | 'in_progress' | 'pending' | 'unknown';

/**
 * 解析的 Todo 项目
 */
export type ParsedTodoItem = {
  primaryText: string;
  secondaryText: string | null;
  status: TodoStatus;
};

/**
 * 规范化工具名称
 * 
 * @param value - 工具名称
 * @returns 规范化后的工具名称
 */
export function normalizeToolName(value: string): string {
  return value.toLowerCase().replace(/[\s_]+/g, '');
}

/**
 * 检查是否是 TodoWrite 工具
 * 
 * @param toolName - 工具名称
 * @returns 是否是 TodoWrite 工具
 */
export function isTodoWriteToolName(toolName: string | undefined): boolean {
  if (!toolName) return false;
  return normalizeToolName(toolName) === 'todowrite';
}

/**
 * 将未知值转换为修剪后的字符串
 * 
 * @param value - 未知值
 * @returns 修剪后的字符串或 null
 */
export function toTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 规范化 Todo 状态
 * 
 * @param value - 未知值
 * @returns TodoStatus
 */
export function normalizeTodoStatus(value: unknown): TodoStatus {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/-/g, '_')
    : '';

  if (normalized === 'completed') return 'completed';
  if (normalized === 'in_progress' || normalized === 'running') return 'in_progress';
  if (normalized === 'pending' || normalized === 'todo') return 'pending';
  return 'unknown';
}

/**
 * 解析 TodoWrite 工具的项目
 * 
 * @param input - 输入值
 * @returns 解析后的 Todo 项目数组或 null
 */
export function parseTodoWriteItems(input: unknown): ParsedTodoItem[] | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.todos)) return null;

  const items: ParsedTodoItem[] = [];
  for (const todo of record.todos) {
    if (!todo || typeof todo !== 'object') continue;

    const todoRecord = todo as Record<string, unknown>;
    const primaryText = toTrimmedString(todoRecord.task ?? todoRecord.text);
    const secondaryText = toTrimmedString(todoRecord.description ?? todoRecord.details);
    const status = normalizeTodoStatus(todoRecord.status);

    if (primaryText) {
      items.push({ primaryText, secondaryText, status });
    }
  }

  return items.length > 0 ? items : null;
}

/**
 * 获取 TodoWrite 工具的摘要
 * 
 * @param items - Todo 项目数组
 * @returns 摘要字符串
 */
export function getTodoWriteSummary(items: ParsedTodoItem[]): string {
  const completedCount = items.filter((item) => item.status === 'completed').length;
  const totalCount = items.length;
  const percentage = Math.round((completedCount / totalCount) * 100);
  return `Progress: ${completedCount}/${totalCount} (${percentage}%)`;
}

/**
 * 获取工具输入摘要
 * 
 * @param toolName - 工具名称
 * @param input - 输入值
 * @param maxLength - 最大长度
 * @returns 摘要字符串
 */
export function getToolInputSummary(
  _toolName: string,
  input: unknown,
  maxLength: number = 100
): string {
  if (input === null || input === undefined) {
    return '';
  }
  if (typeof input === 'string') {
    return input.length > maxLength ? `${input.slice(0, maxLength)}...` : input;
  }
  if (typeof input === 'object') {
    const str = JSON.stringify(input);
    return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
  }
  return String(input);
}

/**
 * 格式化工具输入
 * 
 * @param toolName - 工具名称
 * @param input - 输入值
 * @param format - 格式
 * @returns 格式化的字符串
 */
export function formatToolInput(
  toolName: string,
  input: unknown,
  format: 'summary' | 'json' = 'summary'
): string {
  if (format === 'json') {
    return typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input);
  }
  return getToolInputSummary(toolName, input);
}

export type AssistantContentBlock =
  | { type: 'markdown'; content: string }
  | { type: 'tool_trace'; content: string }
  | { type: 'html'; content: string };

const TOOL_TRACE_START_RE = /^Tool call:/i;
const TOOL_TRACE_DETAIL_RE = /^(?:[\u2022*-]\s+|Path:|•\s+|[-*]\s+)/i;
const HTML_BLOCK_TAG_RE = /<\/?(?:br|hr|h[1-6]|table|thead|tbody|tr|td|th|p|blockquote|ul|ol|li|div|section|article|details|summary)\b/i;

function normalizeAssistantSection(section: string): string {
  return section.replace(/\r\n/g, '\n').trim();
}

export function isToolTraceSection(section: string): boolean {
  const normalized = normalizeAssistantSection(section);
  if (!normalized) return false;

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || !lines.some((line) => TOOL_TRACE_START_RE.test(line))) {
    return false;
  }

  return lines.every((line) => TOOL_TRACE_START_RE.test(line) || TOOL_TRACE_DETAIL_RE.test(line));
}

export function isHtmlSection(section: string): boolean {
  const normalized = normalizeAssistantSection(section);
  if (!normalized) return false;
  return HTML_BLOCK_TAG_RE.test(normalized);
}

export function splitAssistantContentBlocks(content: string): AssistantContentBlock[] {
  const normalized = (content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const sections = normalized
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  const blocks: AssistantContentBlock[] = [];

  for (const section of sections) {
    const nextBlock: AssistantContentBlock = isToolTraceSection(section)
      ? { type: 'tool_trace', content: section }
      : isHtmlSection(section)
        ? { type: 'html', content: section }
        : { type: 'markdown', content: section };

    const previous = blocks[blocks.length - 1];
    if (previous && previous.type === nextBlock.type) {
      previous.content = `${previous.content}\n\n${nextBlock.content}`;
      continue;
    }

    blocks.push(nextBlock);
  }

  return blocks;
}

/**
 * 检查值是否是字符串
 * 
 * @param value - 值
 * @returns 是否是字符串
 */
export function hasText(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * 安全解码 URI 组件
 * 
 * @param value - URI 编码的字符串
 * @returns 解码后的字符串
 */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 移除哈希和查询参数
 * 
 * @param value - URL 字符串
 * @returns 移除后的字符串
 */
export function stripHashAndQuery(value: string): string {
  return value.split('#')[0].split('?')[0];
}

/**
 * 移除文件协议
 * 
 * @param value - URL 字符串
 * @returns 移除后的字符串
 */
export function stripFileProtocol(value: string): string {
  return value.replace(/^file:\/+/, '/');
}

/**
 * 检查是否有协议
 * 
 * @param value - URL 字符串
 * @returns 是否有协议
 */
export function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

/**
 * 检查是否是绝对路径
 * 
 * @param value - 路径字符串
 * @returns 是否是绝对路径
 */
export function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\\/.test(value);
}

/**
 * 检查是否是相对路径
 * 
 * @param value - 路径字符串
 * @returns 是否是相对路径
 */
export function isRelativePath(value: string): boolean {
  return !isAbsolutePath(value) && !hasScheme(value);
}

/**
 * 解析根相对路径
 * 
 * @param value - 路径字符串
 * @returns 解析后的路径或 null
 */
export function parseRootRelativePath(value: string): string | null {
  if (!value.startsWith('~/')) return null;
  
  const rest = value.slice(2);
  if (!rest) return null;
  
  // 检查是否包含非法字符
  if (rest.includes('..')) return null;
  
  return rest;
}

/**
 * 规范化本地路径
 * 
 * @param value - 路径字符串
 * @param cwd - 当前工作目录
 * @returns 规范化后的路径
 */
export function normalizeLocalPath(
  value: string,
  cwd: string
): string {
  // 处理根相对路径 (~/)
  const rootRelative = parseRootRelativePath(value);
  if (rootRelative !== null) {
    return `/${rootRelative}`;
  }

  // 处理相对路径
  if (isRelativePath(value)) {
    const pathParts = cwd.split('/').filter(Boolean);
    const valueParts = value.split('/').filter(Boolean);
    
    for (const part of valueParts) {
      if (part === '..') {
        pathParts.pop();
      } else if (part !== '.') {
        pathParts.push(part);
      }
    }
    
    return `/${pathParts.join('/')}`;
  }

  // 处理绝对路径或带协议的路径
  return value;
}

/**
 * 从 cwd 转换为绝对路径
 * 
 * @param filePath - 文件路径
 * @param cwd - 当前工作目录
 * @returns 绝对路径
 */
export function toAbsolutePathFromCwd(filePath: string, cwd: string): string {
  if (isAbsolutePath(filePath) || hasScheme(filePath)) {
    return filePath;
  }
  return normalizeLocalPath(filePath, cwd);
}
