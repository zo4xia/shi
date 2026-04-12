/**
 * {祖传勿改} Tool Use Compacter - 工具调用优化器
 * {标记} 功能：压缩工具描述，减少 token 消耗
 * {标记} 用途：优化 System Prompt 中的工具描述
 * {标记} 来源：复用已有路径，不重复造轮子
 * {验证} 2026-03-17 创建：基于 CoworkRunner 现有工具系统
 * {警告} 修改此文件会影响所有工具调用的 token 消耗
 */

/**
 * 工具描述接口
 */
export interface ToolDescription {
  name: string;
  description: string;
  inputSchema?: object;
}

/**
 * 优化配置
 */
export interface CompacterOptions {
  /** 最大描述长度（字符） */
  maxDescriptionLength?: number;
  /** 是否移除冗余词汇 */
  removeRedundancy?: boolean;
  /** 是否使用缩写 */
  useAbbreviations?: boolean;
  /** 是否移除示例 */
  removeExamples?: boolean;
}

/**
 * 常见冗余词汇映射（用于移除）
 */
const REDUNDANT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // 移除冗余前缀
  { pattern: /这是一个 (?:非常 | 强大 | 高效) 的/g, replacement: '' },
  { pattern: /可以帮助你/g, replacement: '用于' },
  { pattern: /用来/g, replacement: '用于' },
  { pattern: /主要 (?:用于 |用来)/g, replacement: '用于' },
  
  // 移除冗余后缀
  { pattern: /等等/g, replacement: '' },
  { pattern: /各种/g, replacement: '' },
  { pattern: /多种/g, replacement: '' },
  { pattern: /相关/g, replacement: '' },
  
  // 简化表达
  { pattern: /的功能/g, replacement: '' },
  { pattern: /的能力/g, replacement: '' },
  { pattern: /操作/g, replacement: '操作' },
  { pattern: /进行/g, replacement: '' },
];

/**
 * 常见术语缩写映射
 */
const ABBREVIATIONS: Record<string, string> = {
  // 技术术语
  'JavaScript': 'JS',
  'TypeScript': 'TS',
  'Python': 'Py',
  'Application': 'App',
  'Application Programming Interface': 'API',
  'Integrated Development Environment': 'IDE',
  'Software Development Kit': 'SDK',
  'Model Context Protocol': 'MCP',
  
  // 常用词
  '信息': '信息',
  '数据': '数据',
  '文件': '文件',
  '系统': '系统',
};

/**
 * {祖传勿改} 压缩工具描述
 * {标记} 功能：将冗长的工具描述压缩为简洁版本
 * {标记} 用途：减少 System Prompt token 消耗
 * 
 * @param tool - 原始工具描述
 * @param options - 优化配置
 * @returns 压缩后的工具描述
 */
export function compactToolDescription(
  tool: ToolDescription,
  options: CompacterOptions = {}
): string {
  const {
    maxDescriptionLength = 80,
    removeRedundancy = true,
    useAbbreviations = false,
    removeExamples = true,
  } = options;

  let description = tool.description.trim();

  // 1. 移除示例（如果有）
  if (removeExamples) {
    description = description.replace(/例如 [：:].*$/g, '');
    description = description.replace(/示例 [：:].*$/g, '');
    description = description.replace(/eg[：:].*$/gi, '');
  }

  // 2. 移除冗余词汇
  if (removeRedundancy) {
    for (const { pattern, replacement } of REDUNDANT_PATTERNS) {
      description = description.replace(pattern, replacement);
    }
  }

  // 3. 使用缩写
  if (useAbbreviations) {
    for (const [full, abbr] of Object.entries(ABBREVIATIONS)) {
      const regex = new RegExp(full, 'gi');
      description = description.replace(regex, abbr);
    }
  }

  // 4. 清理多余空格
  description = description
    .replace(/\s+/g, ' ')
    .replace(/\s*，\s*/g, '，')
    .replace(/\s*。\s*/g, '。')
    .trim();

  // 5. 截断过长描述
  if (description.length > maxDescriptionLength) {
    description = description.substring(0, maxDescriptionLength - 3) + '...';
  }

  return description;
}

/**
 * {祖传勿改} 批量压缩工具列表
 * {标记} 功能：批量压缩多个工具描述
 * {标记} 用途：优化整个工具系统的 token 消耗
 * 
 * @param tools - 工具描述数组
 * @param options - 优化配置
 * @returns 压缩后的工具描述数组
 */
export function compactToolsBatch(
  tools: ToolDescription[],
  options: CompacterOptions = {}
): ToolDescription[] {
  return tools.map(tool => ({
    ...tool,
    description: compactToolDescription(tool, options),
  }));
}

/**
 * {祖传勿改} 优化工具描述（针对 Skills）
 * {标记} 功能：优化 Skills 工具描述
 * {标记} 用途：减少 skillManager.buildAutoRoutingPrompt() 的 token 消耗
 * 
 * @param skillName - 技能名称
 * @param skillDescription - 技能描述
 * @returns 优化后的描述
 */
export function compactSkillDescription(
  skillName: string,
  skillDescription: string
): string {
  // Skills 特殊处理：保留名称关键词
  const keywords = extractKeywords(skillName);
  
  let optimized = compactToolDescription(
    { name: skillName, description: skillDescription },
    {
      maxDescriptionLength: 60,
      removeRedundancy: true,
      useAbbreviations: false,
      removeExamples: true,
    }
  );

  // 确保包含关键词
  for (const keyword of keywords) {
    if (!optimized.includes(keyword) && optimized.length < 80) {
      optimized += ` [${keyword}]`;
    }
  }

  return optimized;
}

/**
 * {祖传勿改} 优化工具描述（针对 MCP）
 * {标记} 功能：优化 MCP 服务器描述
 * {标记} 用途：减少 mcpStore.getEnabledServers() 返回的 token 消耗
 * 
 * @param mcpName - MCP 名称
 * @param mcpDescription - MCP 描述
 * @returns 优化后的描述
 */
export function compactMcpDescription(
  mcpName: string,
  mcpDescription: string
): string {
  // MCP 特殊处理：保留角色适用范围提示，但不要把运行模型元信息误写成身份键
  const roleMatch = mcpDescription.match(/\((organizer|writer|designer|analyst|all)[^\)]*\)/i);
  const roleHint = roleMatch ? roleMatch[0] : '';
  
  let optimized = compactToolDescription(
    { name: mcpName, description: mcpDescription },
    {
      maxDescriptionLength: 50,
      removeRedundancy: true,
      useAbbreviations: true,
      removeExamples: true,
    }
  );

  // 保留角色范围提示
  if (roleHint && !optimized.includes(roleHint)) {
    optimized += ` ${roleHint}`;
  }

  return optimized;
}

/**
 * 提取关键词（用于工具名称）
 */
function extractKeywords(name: string): string[] {
  // 提取连字符分隔的关键词
  const parts = name.split('-');
  const keywords: string[] = [];
  
  for (const part of parts) {
    if (part.length > 2) {
      keywords.push(part);
    }
  }
  
  // 提取大写字母开头的词
  const camelCase = name.match(/[A-Z][a-z]+/g);
  if (camelCase) {
    keywords.push(...camelCase);
  }
  
  return keywords.slice(0, 3); // 最多 3 个关键词
}

/**
 * {祖传勿改} 计算工具描述 token 数（估算）
 * {标记} 功能：估算工具描述的 token 消耗
 * {标记} 用途：优化前后对比
 * 
 * @param description - 工具描述
 * @returns 估算的 token 数（中文字符数*1.5 + 英文字符数）
 */
export function estimateTokenCount(description: string): number {
  const chineseChars = (description.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishChars = (description.match(/[a-zA-Z0-9]/g) || []).length;
  
  // 中文约 1.5 tokens/字，英文约 1 token/4 字符
  return Math.ceil(chineseChars * 1.5 + englishChars * 0.25);
}

/**
 * {祖传勿改} 对比优化前后的 token 消耗
 * {标记} 功能：对比优化效果
 * {标记} 用途：验证优化是否有效
 * 
 * @param original - 原始描述
 * @param optimized - 优化后描述
 * @returns 优化报告
 */
export function compareOptimization(
  original: string,
  optimized: string
): {
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  savedPercentage: number;
} {
  const originalTokens = estimateTokenCount(original);
  const optimizedTokens = estimateTokenCount(optimized);
  const savedTokens = originalTokens - optimizedTokens;
  const savedPercentage = originalTokens > 0 
    ? (savedTokens / originalTokens) * 100 
    : 0;

  return {
    originalTokens,
    optimizedTokens,
    savedTokens,
    savedPercentage,
  };
}
