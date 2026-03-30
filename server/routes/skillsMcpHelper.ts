import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import {
  AGENT_ROLE_LABELS,
  AGENT_ROLE_ORDER,
  pickNextApiKey,
  resolveAgentRolesFromConfig,
  type AgentRoleKey,
} from '../../src/shared/agentRoleConfig';
import { getProjectRoot } from '../../src/shared/runtimeDataPaths';
import { normalizeSkillsMcpAssistantByRole } from '../../src/shared/skillsMcpAssistantConfig';
import { ensureRoleRuntimeDirs, getRoleRoot, getRolesRoot } from '../libs/roleSkillFiles';
import { getRoleCapabilitySnapshotPath, syncRoleCapabilitySnapshot } from '../libs/roleRuntimeViews';
import type { RequestContext } from '../src/index';

// {标记} P0-SKILLS-MCP-HELPER: 独立外挂式小帮手，只处理 Skills / MCP 诊断与说明
// {标记} 边界: 不进入主对话、不写连续性记忆、不在普通聊天流里接收明文密钥
// {标记} NO-TOUCH-HELPER-ROUTE
// 这个路由是前端小助手弹窗的唯一活入口。
// 如果将来要重构为真实 LLM 调用，必须“整段替换完成后再切换”，不能在半路删除或留空，否则前端会直接断链。

type SkillsMcpHelperManifest = {
  name: string;
  mode: 'standalone-plugin';
  promptPath: string;
  prompt: string;
  boundaries: string[];
  tasks: string[];
  directories: {
    workspaceRoot: string;
    bundledSkillsRoot: string;
    runtimeUserDataPath: string;
    runtimeSkillsRoot: string;
    rolesRoot: string;
    mcpStorage: string;
    skillBindingStorage: string;
    helperApiKeyEnv: string;
  };
  roleDirectories: Record<string, string>;
};

type SkillsMcpHelperChatInput = {
  message?: string;
  contextLabel?: 'Skills' | 'MCP';
  roleKey?: AgentRoleKey;
};

type HelperRuntimeBindingRow = {
  roleKey: string;
  skillId: string;
  skillName: string;
};

type HelperRuntimeSkillState = {
  id: string;
  name: string;
  scope: string;
  sourcePath: string;
  configPath: string;
  secretPath: string;
  hasConfig: boolean;
  hasSecrets: boolean;
};

type HelperRuntimeMcpState = {
  id: string;
  name: string;
  transportType: string;
  scope: string;
  enabled: boolean;
  callable: boolean;
};

type SkillsMcpHelperRuntimeState = {
  roleKey: AgentRoleKey;
  roleLabel: string;
  checkedAt: number;
  roleRoot: string;
  runtimeSkillsRoot: string;
  skillsIndexPath: string;
  capabilitySnapshotPath: string;
  bindingRows: HelperRuntimeBindingRow[];
  availableSkills: HelperRuntimeSkillState[];
  warehouseOnlySkills: Array<{
    id: string;
    name: string;
    enabled: boolean;
    sourcePath: string;
  }>;
  runtimeMcpTools: HelperRuntimeMcpState[];
  configuredMcpServers: HelperRuntimeMcpState[];
  warnings: string[];
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function buildAnthropicMessagesUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return '/v1/messages';
  if (normalized.endsWith('/v1/messages')) return normalized;
  if (normalized.endsWith('/messages')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}/messages`;
  return `${normalized}/v1/messages`;
}

function buildOpenAIChatUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return '/v1/chat/completions';
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (/\/v\d+$/.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function isVolcengineV3BaseUrl(baseUrl: string): boolean {
  const normalized = normalizeBaseUrl(baseUrl).toLowerCase();
  return normalized.includes('ark.cn-beijing.volces.com/api/v3')
    || normalized.includes('ark.cn-beijing.volces.com/api/coding/v3');
}

function extractTextFromOpenAIResponse(payload: any): string {
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('\n')
      .trim();
    if (text) return text;
  }
  return '';
}

function extractTextFromAnthropicResponse(payload: any): string {
  const content = Array.isArray(payload?.content) ? payload.content : [];
  const text = content
    .map((item) => (item?.type === 'text' && typeof item?.text === 'string' ? item.text : ''))
    .join('\n')
    .trim();
  return text;
}

function resolveRoleKey(roleKey: unknown): AgentRoleKey {
  if (typeof roleKey === 'string' && AGENT_ROLE_ORDER.includes(roleKey as AgentRoleKey)) {
    return roleKey as AgentRoleKey;
  }
  return 'organizer';
}

function containsAny(source: string, patterns: string[]): boolean {
  return patterns.some((pattern) => source.includes(pattern));
}

function readRoleSkillBindings(
  store: RequestContext['store'],
  roleKey: AgentRoleKey,
): HelperRuntimeBindingRow[] {
  const result = store.getDatabase().exec(
    `SELECT role_key, skill_id, skill_name
     FROM skill_role_configs
     WHERE enabled = 1 AND (role_key = ? OR role_key = ?)
     ORDER BY installed_at ASC`,
    [roleKey, 'all'],
  );

  if (!result.length || !result[0].values.length) {
    return [];
  }

  return result[0].values.map((row) => ({
    roleKey: String(row[0] ?? ''),
    skillId: String(row[1] ?? ''),
    skillName: String(row[2] ?? ''),
  }));
}

function isMcpCallableForRole(scope: string, roleKey: AgentRoleKey, enabled: boolean): boolean {
  if (!enabled) return false;
  return scope === 'all' || scope === roleKey;
}

function buildRuntimeState(req: Request, roleKey: AgentRoleKey): SkillsMcpHelperRuntimeState {
  const userDataPath = String(req.app.get('userDataPath') || '');
  const { store, skillManager, mcpStore } = req.context as RequestContext;
  const snapshot = syncRoleCapabilitySnapshot(userDataPath, roleKey, store, skillManager, mcpStore).snapshot;
  const bindingRows = readRoleSkillBindings(store, roleKey);

  const availableSkills = snapshot.availableSkills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    scope: skill.scope,
    sourcePath: skill.sourcePath,
    configPath: skill.configPath,
    secretPath: skill.secretPath,
    hasConfig: fs.existsSync(skill.configPath),
    hasSecrets: fs.existsSync(skill.secretPath),
  }));

  const configuredMcpServers = mcpStore.listServers().map((server) => ({
    id: server.id,
    name: server.name,
    transportType: server.transportType,
    scope: server.agentRoleKey,
    enabled: server.enabled,
    callable: isMcpCallableForRole(server.agentRoleKey, roleKey, server.enabled),
  }));

  return {
    roleKey,
    roleLabel: AGENT_ROLE_LABELS[roleKey],
    checkedAt: Date.now(),
    roleRoot: getRoleRoot(userDataPath, roleKey),
    runtimeSkillsRoot: snapshot.paths.runtimeSkillsRoot,
    skillsIndexPath: snapshot.paths.skillsIndexPath,
    capabilitySnapshotPath: getRoleCapabilitySnapshotPath(userDataPath, roleKey),
    bindingRows,
    availableSkills,
    warehouseOnlySkills: snapshot.unboundWorkspaceSkills,
    runtimeMcpTools: snapshot.runtimeMcpTools.map((tool) => ({
      ...tool,
      enabled: true,
      callable: true,
    })),
    configuredMcpServers,
    warnings: snapshot.warnings,
  };
}

function findMentionedSkill(
  rawMessage: string,
  runtime: SkillsMcpHelperRuntimeState,
): (HelperRuntimeSkillState | { id: string; name: string; enabled: boolean; sourcePath: string }) | null {
  const message = rawMessage.toLowerCase();
  const candidates = [...runtime.availableSkills, ...runtime.warehouseOnlySkills];
  return candidates.find((skill) => (
    message.includes(skill.id.toLowerCase()) || message.includes(skill.name.toLowerCase())
  )) ?? null;
}

function findMentionedMcp(rawMessage: string, runtime: SkillsMcpHelperRuntimeState): HelperRuntimeMcpState | null {
  const message = rawMessage.toLowerCase();
  return runtime.configuredMcpServers.find((server) => (
    message.includes(server.id.toLowerCase()) || message.includes(server.name.toLowerCase())
  )) ?? null;
}

function buildRuntimeCheckChain(runtime: SkillsMcpHelperRuntimeState): string[] {
  return [
    `1. 运行时总仓库：${runtime.runtimeSkillsRoot}`,
    '2. 绑定表：SQLite:skill_role_configs',
    `3. 角色索引：${runtime.skillsIndexPath}`,
    `4. 最终能力快照：${runtime.capabilitySnapshotPath}`,
  ];
}

function buildGenericRuntimeVerificationReply(
  input: SkillsMcpHelperChatInput,
  manifest: SkillsMcpHelperManifest,
  runtime: SkillsMcpHelperRuntimeState,
): string {
  const contextLabel = input.contextLabel === 'MCP' ? 'MCP' : 'Skills';
  const lines = [
    `结论：${runtime.roleLabel}（${runtime.roleKey}）当前的 ${contextLabel} 运行视图已经按真实运行态核验。`,
    `- 当前可用 Skills：${runtime.availableSkills.length}`,
    `- 运行时可用 MCP：${runtime.runtimeMcpTools.length}`,
    `- 只进仓库未生效 Skills：${runtime.warehouseOnlySkills.length}`,
    '原因：',
    ...buildRuntimeCheckChain(runtime),
    '同步规则：',
    '- 后台在 Skills 导入、删除、启停、角色绑定变更后，会重建 roles/<role>/skills.json 与 role-capabilities.json。',
    '- 后台在 MCP 增删改、启停后，会重建 role-capabilities.json。',
  ];

  if (runtime.warnings.length > 0) {
    lines.push('当前警告：');
    for (const warning of runtime.warnings.slice(0, 3)) {
      lines.push(`- ${warning}`);
    }
  }

  if (contextLabel === 'Skills') {
    lines.push('下一步：如果你刚装的新 skill 只出现在总仓库、没有进入 roles/<role>/skills.json，那它还没有真实生效。');
  } else {
    lines.push('下一步：如果一个 MCP 只在配置表里存在，但不在 role-capabilities.json 的 runtimeMcpTools 里，它当前就不算真的可用。');
  }

  lines.push(`当前小助手配置位置：${manifest.directories.helperApiKeyEnv}`);
  return lines.join('\n');
}

function buildSkillRuntimeVerificationReply(
  skill: HelperRuntimeSkillState | { id: string; name: string; enabled: boolean; sourcePath: string },
  runtime: SkillsMcpHelperRuntimeState,
): string {
  const isBound = runtime.availableSkills.some((boundSkill) => boundSkill.id === skill.id);
  const binding = runtime.bindingRows.find((row) => row.skillId === skill.id);

  if (!isBound) {
    return [
      `结论：${skill.name}（${skill.id}）已经进了总仓库，但当前角色 ${runtime.roleKey} 还没有真实生效。`,
      '原因：',
      `- 运行时仓库里找到了它：${skill.sourcePath}`,
      `- 角色绑定表 skill_role_configs 没有把它落成当前角色可用结果`,
      `- 当前角色最终只认：${runtime.skillsIndexPath} 和 ${runtime.capabilitySnapshotPath}`,
      '下一步：去绑定目标角色；只有进入 roles/<role>/skills.json / availableSkills，它才算当前角色真的能用。',
    ].join('\n');
  }

  const boundSkill = runtime.availableSkills.find((item) => item.id === skill.id)!;
  return [
    `结论：${boundSkill.name}（${boundSkill.id}）已经真实生效到 ${runtime.roleKey}。`,
    '原因：',
    `- 绑定表已命中：${binding ? `${binding.roleKey} -> ${binding.skillId}` : `${runtime.roleKey} -> ${boundSkill.id}`}`,
    `- 角色索引已命中：${runtime.skillsIndexPath}`,
    `- 最终能力快照已命中：${runtime.capabilitySnapshotPath}`,
    `- 普通配置：${boundSkill.hasConfig ? '已存在' : '暂未写入'} -> ${boundSkill.configPath}`,
    `- 密钥配置：${boundSkill.hasSecrets ? '已存在' : '暂未写入'} -> ${boundSkill.secretPath}`,
    '下一步：如果功能还是不对，继续检查 skill-configs / skill-secrets 字段是否齐全，而不是再去猜仓库目录。',
  ].join('\n');
}

function buildMcpRuntimeVerificationReply(
  server: HelperRuntimeMcpState,
  runtime: SkillsMcpHelperRuntimeState,
): string {
  if (server.callable) {
    return [
      `结论：${server.name}（${server.id}）当前对 ${runtime.roleKey} 是真实可用的。`,
      '原因：',
      `- MCP 配置表已存在：SQLite:mcp_servers`,
      `- 当前作用域：${server.scope}`,
      `- transport：${server.transportType}`,
      `- 最终能力快照已命中：${runtime.capabilitySnapshotPath}`,
      '下一步：如果调用仍异常，再查 command / args / env / url 本身是否缺字段。',
    ].join('\n');
  }

  return [
    `结论：${server.name}（${server.id}）目前还没有对 ${runtime.roleKey} 真实生效。`,
    '原因：',
    `- 它在 MCP 配置表里存在，但当前 callable = false`,
    `- enabled：${server.enabled ? 'true' : 'false'}`,
    `- scope：${server.scope}`,
    `- 当前角色最终只认：${runtime.capabilitySnapshotPath} 里的 runtimeMcpTools`,
    '下一步：检查是否禁用、是否绑错角色，或者虽然创建了记录但没有进入当前角色的 runtimeMcpTools。',
  ].join('\n');
}

function buildRuntimeVerificationReply(
  input: SkillsMcpHelperChatInput,
  manifest: SkillsMcpHelperManifest,
  runtime: SkillsMcpHelperRuntimeState,
): string | null {
  const rawMessage = String(input.message || '').trim();
  const message = rawMessage.toLowerCase();
  const verificationPatterns = [
    '同步',
    '更新',
    '生效',
    '真实',
    '真的',
    '绑定',
    '核验',
    '检查',
    '监听',
    '变化',
    '能用',
    '可用',
    '可调用',
    '写进去',
    '有没有写进去',
    '有没有生效',
    '有没有更新',
    '是不是好的',
  ];

  const mentionedSkill = findMentionedSkill(rawMessage, runtime);
  if (mentionedSkill) {
    return buildSkillRuntimeVerificationReply(mentionedSkill, runtime);
  }

  const mentionedMcp = findMentionedMcp(rawMessage, runtime);
  if (mentionedMcp) {
    return buildMcpRuntimeVerificationReply(mentionedMcp, runtime);
  }

  if (containsAny(message, verificationPatterns)) {
    return buildGenericRuntimeVerificationReply(input, manifest, runtime);
  }

  return null;
}

function buildRuntimeSummaryForPrompt(runtime: SkillsMcpHelperRuntimeState): string {
  const skillSummary = runtime.availableSkills.length > 0
    ? runtime.availableSkills.map((skill) => `${skill.name}(${skill.id})`).join(', ')
    : 'none';
  const warehouseOnlySummary = runtime.warehouseOnlySkills.length > 0
    ? runtime.warehouseOnlySkills.slice(0, 12).map((skill) => `${skill.name}(${skill.id})`).join(', ')
    : 'none';
  const mcpSummary = runtime.runtimeMcpTools.length > 0
    ? runtime.runtimeMcpTools.map((server) => `${server.name}(${server.id})`).join(', ')
    : 'none';

  return [
    `实时核验时间：${new Date(runtime.checkedAt).toISOString()}`,
    `角色：${runtime.roleLabel} (${runtime.roleKey})`,
    `当前真实可用 Skills（角色绑定 + 全局可用）：${skillSummary}`,
    `当前仓库已装但未生效 Skills：${warehouseOnlySummary}`,
    `当前真实可用 MCP：${mcpSummary}`,
    `角色索引：${runtime.skillsIndexPath}`,
    `最终能力快照：${runtime.capabilitySnapshotPath}`,
    ...(runtime.warnings.length > 0
      ? ['当前警告：', ...runtime.warnings.map((warning) => `- ${warning}`)]
      : []),
  ].join('\n');
}

function buildChatReply(
  input: SkillsMcpHelperChatInput,
  manifest: SkillsMcpHelperManifest,
  runtime: SkillsMcpHelperRuntimeState,
): string {
  const rawMessage = String(input.message || '').trim();
  const message = rawMessage.toLowerCase();
  const contextLabel = input.contextLabel === 'MCP' ? 'MCP' : 'Skills';

  const runtimeVerificationReply = buildRuntimeVerificationReply(input, manifest, runtime);
  if (runtimeVerificationReply) {
    return runtimeVerificationReply;
  }

  if (!rawMessage) {
    return '请直接告诉我你卡在哪里，比如“这个 skill 缺密钥”“为什么装不上”“MCP 绑定到哪个角色”。';
  }

  if (containsAny(message, ['密钥', 'api key', 'apikey', 'token', 'client id', 'clientid', 'secret'])) {
    return [
      '如果是需要填写密钥的 Skills / MCP，我可以先帮你判断要填哪些字段。',
      '请不要把明文密钥继续发在普通聊天里。',
      '新的规则是：角色可见技能走各自的 `skills.json`，普通配置走角色目录下的 `skill-configs/`，密钥走角色目录下的 `skill-secrets/`。',
      '如果要配 Skills / MCP 小帮手本身，也是在对应角色下面分别填写 API URL、API Key 和提示词。',
      '我可以帮你判断应该写给哪个角色、哪个 skill、缺哪些字段，但不在普通聊天里回显密钥。',
      `当前小帮手配置位置：${manifest.directories.helperApiKeyEnv}`,
      `当前角色真实索引：${runtime.skillsIndexPath}`,
    ].join('\n');
  }

  if (containsAny(message, ['skill.md', 'skll.md', '格式', '结构', '目录', '导入失败', '装不上', '安装失败', '失败'])) {
    return [
      `先看 ${contextLabel} 的结构对不对。`,
      contextLabel === 'Skills'
        ? '标准 Skill 至少要有一个 `SKILL.md`。如果导入的是目录，目录里必须能找到它。'
        : 'MCP 先看 transport 类型、command / args / url / env 这些关键字段有没有缺。',
      `内置 Skills 目录：${manifest.directories.bundledSkillsRoot}`,
      `运行时 Skills 目录：${manifest.directories.runtimeSkillsRoot}`,
      `当前角色最终技能索引：${runtime.skillsIndexPath}`,
    ].join('\n');
  }

  if (containsAny(message, ['绑定', '角色', 'agent', '员工', '归谁', '给谁'])) {
    return [
      '如果是 Skills，看的是 `skill_role_configs` 和角色目录下的 `skills.json`；如果是 MCP，要看它绑定到哪个角色，或者是不是 `all`。',
      `角色技能绑定存储：${manifest.directories.skillBindingStorage}`,
      `角色目录根路径：${manifest.directories.rolesRoot}`,
      `MCP 存储：${manifest.directories.mcpStorage}`,
      `当前角色最终能力快照：${runtime.capabilitySnapshotPath}`,
    ].join('\n');
  }

  if (containsAny(message, ['路径', '目录', '放哪', '在哪里', '文件夹'])) {
    return [
      `工作区：${manifest.directories.workspaceRoot}`,
      `运行时用户目录：${manifest.directories.runtimeUserDataPath}`,
      `运行时 Skills 目录：${manifest.directories.runtimeSkillsRoot}`,
      `角色目录根路径：${manifest.directories.rolesRoot}`,
      `当前角色目录：${runtime.roleRoot}`,
    ].join('\n');
  }

  if (containsAny(message, ['mcp'])) {
    return [
      'MCP 我先看四件事：有没有创建成功、transport 对不对、关键配置缺不缺、有没有绑定到正确角色。',
      `MCP 配置表：${manifest.directories.mcpStorage}`,
      `当前角色最终能力快照：${runtime.capabilitySnapshotPath}`,
    ].join('\n');
  }

  if (containsAny(message, ['skill', 'skills'])) {
    return [
      'Skills 我先看四件事：有没有 `SKILL.md`、有没有缺环境变量、有没有绑定到正确角色、角色自己的 `skills.json` 有没有同步。',
      `运行时 Skills 目录：${manifest.directories.runtimeSkillsRoot}`,
      `角色目录根路径：${manifest.directories.rolesRoot}`,
      `当前角色最终技能索引：${runtime.skillsIndexPath}`,
    ].join('\n');
  }

  return [
    '我现在只处理 Skills / MCP 相关问题。',
    '你可以直接问我：',
    '- 这个 skill 为什么装不上',
    '- 这个 MCP 缺什么配置',
    '- 这个 skill 的密钥填哪里',
    '- 这个能力现在绑给了哪个角色',
  ].join('\n');
}

function resolvePromptPath(): string {
  return path.join(getProjectRoot(), 'docs', 'prompts', 'skills-mcp-helper.prompt.md');
}

async function buildRemoteHelperReply(
  req: Request,
  input: SkillsMcpHelperChatInput,
  manifest: SkillsMcpHelperManifest,
  runtime: SkillsMcpHelperRuntimeState,
): Promise<string | null> {
  const roleKey = resolveRoleKey(input.roleKey);
  const { store } = req.context as RequestContext;
  const appConfig = store.get('app_config') as any;
  const roleConfigs = resolveAgentRolesFromConfig(appConfig);
  const helperConfigs = normalizeSkillsMcpAssistantByRole(appConfig?.helpers ?? {});
  const helperConfig = helperConfigs[roleKey];
  const roleConfig = roleConfigs[roleKey];
  const helperModelId = helperConfig.modelId?.trim() || roleConfig?.modelId?.trim() || '';

  if (!helperConfig.apiUrl?.trim() || !helperConfig.apiKey?.trim() || !helperModelId) {
    return null;
  }
  const rotatedHelperApiKey = pickNextApiKey(
    helperConfig.apiKey.trim(),
    `skills-mcp-helper:${roleKey}`
  ) || helperConfig.apiKey.trim();

  const contextLabel = input.contextLabel === 'MCP' ? 'MCP' : 'Skills';
  const systemPrompt = [
    manifest.prompt.trim(),
    helperConfig.prompt.trim(),
    '输出规则：先给结论，再给原因，再给下一步。',
    '默认简短，不绕远路，不要先讲大段背景。',
    `当前角色：${roleConfig.label} (${roleKey})`,
    `当前上下文：${contextLabel}`,
    `运行时 Skills 目录：${manifest.directories.runtimeSkillsRoot}`,
    `角色目录根路径：${manifest.directories.rolesRoot}`,
    `MCP 存储：${manifest.directories.mcpStorage}`,
    `技能绑定存储：${manifest.directories.skillBindingStorage}`,
    '真实更新核验顺序固定为：运行时仓库 -> skill_role_configs -> roles/<role>/skills.json -> roles/<role>/role-capabilities.json。',
    '如果一个技能只在仓库存在，没有进入 roles/<role>/skills.json / availableSkills，就必须明确说“只进仓库，还没真实生效”。',
    '如果一个 MCP 没有进入 role-capabilities.json 的 runtimeMcpTools，就必须明确说“当前角色还不能真实调用”。',
    buildRuntimeSummaryForPrompt(runtime),
  ].filter(Boolean).join('\n\n');

  const userPrompt = [
    `请只回答 ${contextLabel} 小助手问题。`,
    `目标角色：${roleConfig.label} (${roleKey})`,
    `用户问题：${String(input.message || '').trim()}`,
  ].join('\n');

  try {
    const useOpenAICompatibleFormat = roleConfig.apiFormat === 'openai' || isVolcengineV3BaseUrl(helperConfig.apiUrl);
    if (!useOpenAICompatibleFormat) {
      const response = await fetch(buildAnthropicMessagesUrl(helperConfig.apiUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': rotatedHelperApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: helperModelId,
          max_tokens: 800,
          temperature: 0.2,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!response.ok) {
        return null;
      }
      const payload = await response.json().catch(() => null);
      const text = extractTextFromAnthropicResponse(payload);
      return text || null;
    }

    const response = await fetch(buildOpenAIChatUrl(helperConfig.apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rotatedHelperApiKey}`,
      },
      body: JSON.stringify({
        model: helperModelId,
        max_tokens: 800,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }
    const payload = await response.json().catch(() => null);
    const text = extractTextFromOpenAIResponse(payload);
    return text || null;
  } catch {
    return null;
  }
}

function buildManifest(req: Request): SkillsMcpHelperManifest {
  const userDataPath = String(req.app.get('userDataPath') || '');
  ensureRoleRuntimeDirs(userDataPath);
  const promptPath = resolvePromptPath();
  const prompt = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';
  const rolesRoot = getRolesRoot(userDataPath);
  const roleDirectories = Object.fromEntries(
    AGENT_ROLE_ORDER.map((roleKey) => [roleKey, getRoleRoot(userDataPath, roleKey)])
  );

  return {
    name: 'skills-mcp-helper',
    mode: 'standalone-plugin',
    promptPath,
    prompt,
    boundaries: [
      '只处理 Skills 和 MCP 问题',
      '不进入主对话、连续性记忆、24h 共享线程',
      '不在普通聊天流中处理明文密钥',
      '不根据一句聊天指令安装未知内容',
      '不执行高风险动作',
    ],
    tasks: [
      '诊断 Skills / MCP 导入失败、安装失败、绑定失败、配置缺失',
      '输出人话版原因和下一步',
      '识别缺少的密钥、依赖、结构问题',
      '为安全配置入口提供字段说明',
    ],
    directories: {
      workspaceRoot: String(req.app.get('workspace') || getProjectRoot()),
      bundledSkillsRoot: path.join(getProjectRoot(), 'SKILLs'),
      runtimeUserDataPath: userDataPath,
      runtimeSkillsRoot: path.join(userDataPath, 'SKILLs'),
      rolesRoot,
      mcpStorage: 'SQLite:mcp_servers',
      skillBindingStorage: 'SQLite:skill_role_configs',
      helperApiKeyEnv: 'app_config.helpers.skillsMcpAssistantByRole.<roleKey>',
    },
    roleDirectories,
  };
}

export function setupSkillsMcpHelperRoutes(app: Router) {
  const router = Router();

  router.get('/manifest', (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        manifest: buildManifest(req),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load skills/mcp helper manifest',
      });
    }
  });

  router.post('/chat', (req: Request, res: Response) => {
    void (async () => {
      try {
        const manifest = buildManifest(req);
        const input = (req.body ?? {}) as SkillsMcpHelperChatInput;
        const runtime = buildRuntimeState(req, resolveRoleKey(input.roleKey));
        const forcedRuntimeReply = buildRuntimeVerificationReply(input, manifest, runtime);
        const remoteReply = forcedRuntimeReply
          ? null
          : await buildRemoteHelperReply(req, input, manifest, runtime);
        const reply = forcedRuntimeReply || remoteReply || buildChatReply(input, manifest, runtime);
        res.json({
          success: true,
          reply,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to build skills/mcp helper reply',
        });
      }
    })();
  });

  app.use('/api/skills-mcp-helper', router);
}
