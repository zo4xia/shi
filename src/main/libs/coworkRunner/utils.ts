/**
 * Cowork Runner 工具函数
 * 
 * FLOW: 工具函数 步骤1: 定义会话运行时所需的辅助函数
 * 
 * @module coworkRunner/utils
 */

import path from 'path';

// API: N/A (内部工具函数)

/**
 * 转义正则表达式特殊字符
 * 
 * @param value - 原始字符串
 * @returns 转义后的字符串
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 查找 skills 标记位置
 * 
 * @param value - 命令行字符串
 * @returns skills 标记的位置索引
 */
export function findSkillsMarkerIndex(value: string): number {
  const match = value.match(/(?:^|\s)\/skills\//);
  return match ? (match.index ?? 0) + match[0].length - '/skills/'.length : -1;
}

/**
 * 检查路径是否在基础路径内
 * 
 * @param basePath - 基础路径
 * @param targetPath - 目标路径
 * @returns 是否在基础路径内
 */
export function isPathWithin(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedBase, resolvedTarget);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * 从多个根路径解析技能路径
 * 
 * @param skillName - 技能名称
 * @param roots - 根路径数组
 * @returns 解析后的技能路径
 */
export function resolveSkillPathFromRoots(
  skillName: string,
  roots: string[]
): string | null {
  for (const root of roots) {
    const resolved = path.resolve(root, skillName);
    if (resolved.startsWith(root)) {
      return resolved;
    }
  }
  return null;
}

/**
 * 检测二进制文件的魔数
 * 
 * @param filePath - 文件路径
 * @returns 检测到的二进制类型或 'unknown'
 */
export function detectBinaryMagic(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const knownBinaries = {
    '.exe': 'PE32',
    '.dll': 'PE32',
    '.so': 'ELF',
    '.dylib': 'Mach-O',
    '.a': 'AR',
    '.lib': 'COFF',
    '.o': 'ELF',
    '.obj': 'COFF',
  };
  return knownBinaries[ext as keyof typeof knownBinaries] || 'unknown';
}

/**
 * 总结运行时二进制信息
 * 
 * @param runtimeBinary - 二进制路径
 * @returns 格式化的摘要
 */
export function summarizeRuntimeBinary(runtimeBinary: string): string {
  const basename = path.basename(runtimeBinary);
  const dir = path.dirname(runtimeBinary);
  const binaryType = detectBinaryMagic(runtimeBinary);
  return `${basename} (${binaryType}, ${dir})`;
}

/**
 * 提取 URL 中的主机
 * 
 * @param rawValue - URL 字符串
 * @returns 主机名或 null
 */
export function extractHostFromUrl(rawValue: string | undefined): string | null {
  if (!rawValue) return null;
  try {
    const url = new URL(rawValue);
    return url.host;
  } catch {
    return null;
  }
}

/**
 * 格式化端点用于日志记录
 * 
 * @param rawValue - 原始端点值
 * @returns 格式化的端点或 null
 */
export function summarizeEndpointForLog(rawValue: string | undefined): string | null {
  if (!rawValue) return null;
  try {
    const url = new URL(rawValue);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return rawValue;
  }
}

/**
 * 合并 NO_PROXY 列表
 * 
 * @param currentValue - 当前 NO_PROXY 值
 * @param requiredHosts - 需要添加的主机列表
 * @returns 合并后的 NO_PROXY 列表
 */
export function mergeNoProxyList(
  currentValue: string | undefined,
  requiredHosts: string[]
): string {
  const current = currentValue ? currentValue.split(',').map(h => h.trim()) : [];
  const merged = [...new Set([...current, ...requiredHosts])];
  return merged.filter(Boolean).join(',');
}

/**
 * 在参数前添加 node require
 * 
 * @param args - 原始参数数组
 * @param scriptPath - 脚本路径
 * @returns 修改后的参数数组
 */
export function prependNodeRequireArg(args: string[], scriptPath: string): string[] {
  return ['-r', scriptPath, ...args];
}
