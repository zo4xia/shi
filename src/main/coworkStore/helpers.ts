/**
 * CoworkStore 辅助函数
 * 
 * FLOW: 会话存储辅助 步骤1: 定义会话存储所需的辅助函数
 * 
 * @module main/coworkStore/helpers
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import * as Constants from './constants';
import { getProjectRoot } from '../../shared/runtimeDataPaths';
/** Memory guard level — kept inline after removing coworkMemoryExtractor */
export type CoworkMemoryGuardLevel = 'strict' | 'standard' | 'relaxed';

const CHINESE_QUESTION_PREFIX_RE = /^(?:请问|问下|问一下|是否|能否|可否|为什么|为何|怎么|如何|谁|什么|哪(?:里|儿|个)?|几|多少|要不要|会不会|是不是|能不能|可不可以|行不行|对不对|好不好)/u;
const ENGLISH_QUESTION_PREFIX_RE = /^(?:what|who|why|how|when|where|which|is|are|am|do|does|did|can|could|would|will|should)\b/i;
const QUESTION_INLINE_RE = /(是不是|能不能|可不可以|要不要|会不会|有没有|对不对|好不好)/i;
const QUESTION_SUFFIX_RE = /(吗|么|呢|嘛)\s*$/u;

export function isQuestionLikeMemoryText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().replace(/[。！!]+$/g, '').trim();
  if (!normalized) return false;
  if (/[？?]\s*$/.test(normalized)) return true;
  if (CHINESE_QUESTION_PREFIX_RE.test(normalized)) return true;
  if (ENGLISH_QUESTION_PREFIX_RE.test(normalized)) return true;
  if (QUESTION_INLINE_RE.test(normalized)) return true;
  if (QUESTION_SUFFIX_RE.test(normalized)) return true;
  return false;
}

/**
 * 获取默认工作目录
 * 
 * @returns 默认工作目录路径
 */
export function getDefaultWorkingDirectory(): string {
  const defaultDir = path.join(getProjectRoot(), 'uploud');
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
  } catch {
    return getProjectRoot();
  }
  return defaultDir;
}

/**
 * 规范化最近工作空间路径
 * 
 * @param cwd - 当前工作目录
 * @returns 规范化后的路径
 */
export function normalizeRecentWorkspacePath(cwd: string): string {
  const resolved = path.resolve(cwd);
  const marker = `${path.sep}${Constants.TASK_WORKSPACE_CONTAINER_DIR}${path.sep}`;
  const markerIndex = resolved.lastIndexOf(marker);
  if (markerIndex > 0) {
    return resolved.slice(0, markerIndex);
  }
  return resolved;
}

/**
 * 规范化记忆保护级别
 * 
 * @param value - 输入值
 * @returns 规范化后的保护级别
 */
export function normalizeMemoryGuardLevel(value: string | undefined): CoworkMemoryGuardLevel {
  if (value === 'strict' || value === 'standard' || value === 'relaxed') return value;
  return Constants.DEFAULT_MEMORY_GUARD_LEVEL;
}

/**
 * 解析布尔配置
 * 
 * @param value - 输入值
 * @param fallback - 默认值
 * @returns 布尔值
 */
export function parseBooleanConfig(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

/**
 * 限制用户记忆最大条目数
 * 
 * @param value - 输入值
 * @returns 限制后的值
 */
export function clampMemoryUserMemoriesMaxItems(value: number): number {
  if (!Number.isFinite(value)) return Constants.DEFAULT_MEMORY_USER_MEMORIES_MAX_ITEMS;
  return Math.max(
    Constants.MIN_MEMORY_USER_MEMORIES_MAX_ITEMS,
    Math.min(Constants.MAX_MEMORY_USER_MEMORIES_MAX_ITEMS, Math.floor(value))
  );
}

/**
 * 规范化记忆文本
 * 
 * @param value - 输入文本
 * @returns 规范化后的文本
 */
export function normalizeMemoryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * 提取对话搜索词
 * 
 * @param value - 输入文本
 * @returns 搜索词数组
 */
export function extractConversationSearchTerms(value: string): string[] {
  const normalized = normalizeMemoryText(value).toLowerCase();
  if (!normalized) return [];

  const terms: string[] = [];
  const seen = new Set<string>();
  const addTerm = (term: string): void => {
    const normalizedTerm = normalizeMemoryText(term).toLowerCase();
    if (!normalizedTerm) return;
    if (/^[a-z0-9]$/i.test(normalizedTerm)) return;
    if (seen.has(normalizedTerm)) return;
    seen.add(normalizedTerm);
    terms.push(normalizedTerm);
  };

  // Keep the full phrase and additionally match by per-token terms.
  addTerm(normalized);
  const tokens = normalized
    .split(/[\s,，、|/\\;；]+/g)
    .map((token) => token.replace(/^['"`]+|['"`]+$/g, '').trim())
    .filter(Boolean);

  for (const token of tokens) {
    addTerm(token);
    if (terms.length >= 8) break;
  }

  return terms.slice(0, 8);
}

/**
 * 规范化记忆匹配键
 * 
 * @param value - 输入文本
 * @returns 规范化后的匹配键
 */
export function normalizeMemoryMatchKey(value: string): string {
  return normalizeMemoryText(value)
    .toLowerCase()
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 规范化记忆语义键
 * 
 * @param value - 输入文本
 * @returns 规范化后的语义键
 */
export function normalizeMemorySemanticKey(value: string): string {
  const key = normalizeMemoryMatchKey(value);
  if (!key) return '';
  return key
    .replace(/^(?:the user|user|i am|i m|i|my|me)\s+/i, '')
    .replace(/^(?:该用户|这个用户|用户|本人|我的|我们|咱们|咱|我|你的|你)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 构建词频映射
 * 
 * @param value - 输入文本
 * @returns 词频映射
 */
export function buildTokenFrequencyMap(value: string): Map<string, number> {
  const tokens = value
    .split(/\s+/g)
    .map((token) => token.trim())
    .filter(Boolean);
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
  return map;
}

/**
 * 计算词重叠分数
 * 
 * @param left - 左侧文本
 * @param right - 右侧文本
 * @returns 重叠分数
 */
export function scoreTokenOverlap(left: string, right: string): number {
  const leftMap = buildTokenFrequencyMap(left);
  const rightMap = buildTokenFrequencyMap(right);
  if (leftMap.size === 0 || rightMap.size === 0) return 0;

  let leftCount = 0;
  let rightCount = 0;
  let intersection = 0;
  for (const count of leftMap.values()) leftCount += count;
  for (const count of rightMap.values()) rightCount += count;
  for (const [token, leftValue] of leftMap.entries()) {
    intersection += Math.min(leftValue, rightMap.get(token) || 0);
  }

  const denominator = Math.min(leftCount, rightCount);
  if (denominator <= 0) return 0;
  return intersection / denominator;
}

/**
 * 构建字符二元组映射
 * 
 * @param value - 输入文本
 * @returns 字符二元组映射
 */
export function buildCharacterBigramMap(value: string): Map<string, number> {
  const compact = value.replace(/\s+/g, '').trim();
  if (!compact) return new Map<string, number>();
  if (compact.length <= 1) return new Map<string, number>([[compact, 1]]);

  const map = new Map<string, number>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2);
    map.set(gram, (map.get(gram) || 0) + 1);
  }
  return map;
}

/**
 * 计算字符二元组 Dice 系数
 * 
 * @param left - 左侧文本
 * @param right - 右侧文本
 * @returns Dice 系数
 */
export function scoreCharacterBigramDice(left: string, right: string): number {
  const leftMap = buildCharacterBigramMap(left);
  const rightMap = buildCharacterBigramMap(right);
  if (leftMap.size === 0 || rightMap.size === 0) return 0;

  let leftCount = 0;
  let rightCount = 0;
  let intersection = 0;
  for (const count of leftMap.values()) leftCount += count;
  for (const count of rightMap.values()) rightCount += count;
  for (const [gram, leftValue] of leftMap.entries()) {
    intersection += Math.min(leftValue, rightMap.get(gram) || 0);
  }

  const denominator = leftCount + rightCount;
  if (denominator <= 0) return 0;
  return (2 * intersection) / denominator;
}

/**
 * 相似度缓存
 */
const similarityCache = new Map<string, number>();

/**
 * 获取缓存的相似度分数
 * 
 * @param left - 左侧文本
 * @param right - 右侧文本
 * @returns 缓存的分数或 null
 */
export function getCachedSimilarity(left: string, right: string): number | null {
  const key = `${left}|||${right}`;
  if (similarityCache.has(key)) {
    return similarityCache.get(key)!;
  }
  return null;
}

/**
 * 设置缓存的相似度分数
 * 
 * @param left - 左侧文本
 * @param right - 右侧文本
 * @param score - 分数
 */
export function setCachedSimilarity(left: string, right: string, score: number): void {
  const key = `${left}|||${right}`;
  similarityCache.set(key, score);
  
  // Evict old entries if cache is too large
  if (similarityCache.size > Constants.SIMILARITY_CACHE_MAX_SIZE) {
    const keys = Array.from(similarityCache.keys());
    const toDelete = keys.slice(0, Math.floor(keys.length * 0.1));
    toDelete.forEach(k => similarityCache.delete(k));
  }
}

/**
 * 计算记忆相似度分数
 * 
 * @param left - 左侧文本
 * @param right - 右侧文本
 * @returns 相似度分数
 */
export function scoreMemorySimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;

  // FIX: Check cache first to avoid redundant calculations
  const cached = getCachedSimilarity(left, right);
  if (cached !== null) return cached;

  const compactLeft = left.replace(/\s+/g, '');
  const compactRight = right.replace(/\s+/g, '');
  if (compactLeft && compactLeft === compactRight) {
    const score = 1;
    setCachedSimilarity(left, right, score);
    return score;
  }

  let phraseScore = 0;
  if (compactLeft && compactRight && (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))) {
    phraseScore = Math.min(compactLeft.length, compactRight.length) / Math.max(compactLeft.length, compactRight.length);
  }

  const score = Math.max(
    phraseScore,
    scoreTokenOverlap(left, right),
    scoreCharacterBigramDice(left, right)
  );
  
  setCachedSimilarity(left, right, score);
  return score;
}

/**
 * 计算记忆文本质量分数
 * 
 * @param value - 输入文本
 * @returns 质量分数
 */
export function scoreMemoryTextQuality(value: string): number {
  const normalized = normalizeMemoryText(value);
  if (!normalized) return 0;
  let score = normalized.length;
  if (/^(?:该用户|这个用户|用户)\s*/u.test(normalized)) {
    score -= 12;
  }
  if (/^(?:the user|user)\b/i.test(normalized)) {
    score -= 12;
  }
  if (/^(?:我|我的|我是|我有|我会|我喜欢|我偏好)/u.test(normalized)) {
    score += 4;
  }
  if (/^(?:i|i am|i'm|my)\b/i.test(normalized)) {
    score += 4;
  }
  return score;
}

/**
 * 选择优先记忆文本
 * 
 * @param currentText - 当前文本
 * @param incomingText - 新文本
 * @returns 优先的文本
 */
export function choosePreferredMemoryText(currentText: string, incomingText: string): string {
  const normalizedCurrent = truncate(normalizeMemoryText(currentText), Constants.MEMORY_TEXT_MAX_LENGTH);
  const normalizedIncoming = truncate(normalizeMemoryText(incomingText), Constants.MEMORY_TEXT_MAX_LENGTH);
  if (!normalizedCurrent) return normalizedIncoming;
  if (!normalizedIncoming) return normalizedCurrent;

  const currentScore = scoreMemoryTextQuality(normalizedCurrent);
  const incomingScore = scoreMemoryTextQuality(normalizedIncoming);
  if (incomingScore > currentScore + 1) return normalizedIncoming;
  if (currentScore > incomingScore + 1) return normalizedCurrent;
  return normalizedIncoming.length >= normalizedCurrent.length ? normalizedIncoming : normalizedCurrent;
}

/**
 * 截断文本
 * 
 * @param value - 输入文本
 * @param maxLength - 最大长度
 * @returns 截断后的文本
 */
function truncate(value: string, maxLength: number): string {
  if (!value) return value;
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trim();
}

/**
 * 判断是否是有意义的删除片段
 * 
 * @param value - 输入文本
 * @returns 是否有意义
 */
export function isMeaningfulDeleteFragment(value: string): boolean {
  if (!value) return false;
  const tokens = value.split(/\s+/g).filter(Boolean);
  if (tokens.length >= 2) return true;
  if (/[\u3400-\u9fff]/u.test(value)) return value.length >= 4;
  return value.length >= 6;
}

/**
 * 检查目标是否包含作为有界短语
 * 
 * @param target - 目标文本
 * @param fragment - 片段
 * @returns 是否包含
 */
export function includesAsBoundedPhrase(target: string, fragment: string): boolean {
  if (!target || !fragment) return false;
  const paddedTarget = ` ${target} `;
  const paddedFragment = ` ${fragment} `;
  if (paddedTarget.includes(paddedFragment)) {
    return true;
  }
  // CJK phrases are often unsegmented, so token boundaries are unreliable.
  if (/[\u3400-\u9fff]/u.test(fragment) && !fragment.includes(' ')) {
    return target.includes(fragment);
  }
  return false;
}

/**
 * 计算删除匹配分数
 * 
 * @param targetKey - 目标键
 * @param queryKey - 查询键
 * @returns 匹配分数
 */
export function scoreDeleteMatch(targetKey: string, queryKey: string): number {
  if (!targetKey || !queryKey) return 0;
  if (targetKey === queryKey) {
    return 1000 + queryKey.length;
  }
  if (!isMeaningfulDeleteFragment(queryKey)) {
    return 0;
  }
  if (includesAsBoundedPhrase(targetKey, queryKey)) {
    return 500 + queryKey.length;
  }
  if (includesAsBoundedPhrase(queryKey, targetKey)) {
    return 400 + targetKey.length;
  }
  const similarity = scoreMemorySimilarity(targetKey, queryKey);
  if (similarity > Constants.MEMORY_NEAR_DUPLICATE_MIN_SCORE) {
    return 300 + Math.round(similarity * 100);
  }
  return 0;
}
