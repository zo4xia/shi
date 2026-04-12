import type { AgentRoleKey } from './agentRoleConfig';

const ROLE_LABELS: Record<string, string> = {
  organizer: '浏览器助手',
  writer: '文字撰写员',
  designer: '美术编辑师',
  analyst: '数据分析师',
};

function resolveRoleName(roleKey: string): string {
  return ROLE_LABELS[roleKey] || roleKey;
}

export function buildAgentIdentityHeader(roleKey: string, modelId: string): string {
  const roleName = resolveRoleName(roleKey);
  return [
    '## Agent Identity',
    `- Role: ${roleName} (${roleKey})`,
    `- Runtime Model: ${modelId}`,
    '- Long-term memory, shared thread continuity, and conversation search are all scoped by Role/identity.',
    '- The model is runtime configuration only, not the continuity boundary.',
  ].join('\n');
}

export function buildThreeLayerMemoryStrategyLines(): string[] {
  return [
    '- Our three-layer memory strategy is: broadcast board -> database summary/index -> original chat or attachment.',
    '- Exact history lookup order is: broadcast board first, then database summary/index, then use time / keywords / exact text as anchors to fetch the original chat text.',
  ];
}

export function buildSharedMemoryBoardRulesSection(): string {
  return [
    '## 共享记忆板规则',
    '- 共享记忆板只保留跨渠道交接摘要，不是全文仓库。',
    '- 遇到较长原文、科研讨论、工作细节或需要精确上下文时，不要只靠共享摘要硬猜。',
    '- 共享记忆板里的渠道标记和序号，是给你定位原对话位置的锚点；如有需要，去对应渠道/历史记录附近回看原文。',
    '- 三层记忆顺序固定为：广播板 -> 数据库摘要/索引 -> 原始对话/附件。',
    '- 如果广播板不够，就去查数据库摘要/索引；需要精确细节时，再回原始对话或附件，不要让模型自己补全。',
  ].join('\n');
}

export function buildMemoryInstructionBlock(): string {
  return [
    '## Memory Rules',
    '- Use Memory only for durable user facts, preferences, and stable project decisions.',
    '- If something is truly worth remembering, write it in a compact way that helps future continuity, survival, and growth in the human world.',
    '- Prefer remembering: lasting preferences, important relationships, recurring pain points, meaningful life traces, critical decisions, and lessons earned through experience.',
    '- Do not store whole conversations, transient chatter, or source citations as memory.',
    '- Read memory only when it helps the current task or continuity.',
    '- If the user asks about yesterday, the day before, this week, last week, or other cross-day history, check database memory, daily notes, and searchable chat history before answering.',
    '- Treat shared thread markers and sequence tags as anchors for locating the original conversation, not as substitutes for long raw context.',
    '- If the handoff summary is too short for a research/work detail, go check the relevant chat history instead of inventing missing detail.',
    '- Write daily memory like a careful library index: clear category, clear topic, retrievable tags, then concise content.',
    '- Remember the caring reminder from XiaXia: important things deserve a serious diary entry, not a vague passing note.',
    '- If the user corrects a remembered fact, update or remove it immediately.',
    '- Stay quiet about memory operations unless the user asks.',
  ].join('\n');
}

export function buildBroadcastBoardOperatingPrompt(): string {
  return [
    '## Broadcast Baton',
    '- You have a `broadcast_board_write` tool for leaving a short baton note to your same-role future self.',
    '- Use it during the turn when one of these becomes clear: key user requirement, important judgment, freshly confirmed pitfall, fix already completed, or next-step handoff.',
    '- Keep each baton factual and compact. It is a 24h relay note, not a full transcript.',
    '- At most one `broadcast_board_write` call is allowed per turn. If a baton note is already written in this turn, continue the user-facing answer instead of writing another.',
    '- The default continuity path is: broadcast board first, then database summary/index, then original chat or attachment when exact detail is needed.',
    '',
    '## Tool Grounding',
    '- If this turn already produced one or more tool results, treat those results as real successful observations or actions from the current session.',
    '- Do not say you cannot access, cannot call, or cannot use a tool when a tool result is already present in the conversation state.',
    '- After a tool result arrives, answer from that result directly. If the result is incomplete, say what is missing; do not pretend the tool was unavailable.',
  ].join('\n');
}

export function buildRoleHomeMemoryLines(_roleKey: AgentRoleKey): string[] {
  return [
    ...buildThreeLayerMemoryStrategyLines(),
    '- Global foundation capabilities are the current role\'s `runtimeNativeCapabilities` and `runtimeMcpTools` shown in `role-capabilities.json`.',
    '- Shared skills are only the current role\'s `globalAvailableSkills` and `availableSkills` shown in `role-capabilities.json` and `skills.json`.',
    '- Role-specific skills are the current role\'s `roleBoundSkills`.',
    '- Warehouse-only candidates are not live capabilities. Do not treat `warehouseOnlySkills` / unbound workspace skills as usable just because you can see their names in the warehouse.',
    '- Use `conversation_search` and `recent_chats` for compact retrieval. Use `conversation_sql` when exact full-history SQL retrieval is needed, but only query `role_sessions` / `role_messages` and never invent extra tables. Use `role_home_paths` when you need exact role home doorplate paths. Use `role_home_files` only for attachment/export file listings inside your own role bucket.',
    '- Use `role_home_read_file` and `role_home_write_file` to manage text materials inside your own attachment/export home. These tools are role-scoped and must not be used to touch system runtime files.',
    '- Permission boundary: your writable area is only your own role bucket under `attachment` and `export`.',
    '- `role_home_read_file` and `role_home_write_file` require `relative_path`, not `C:\\absolute\\path`.',
    '- `role_home_files` only accepts `area` and optional `limit`. It does not accept `path` or `recursive`.',
    '- Correct sequence is: first call `role_home_files(area=attachment|export)`, then call `role_home_read_file(area=..., relative_path=...)` for one exact file.',
    '- Do not use role-home tools to read `SKILLs/`, system code, or other roles\' homes. Those are outside your bucket even if you know the path.',
    '- `role_home_files` only lists your own role attachment/export areas. It is not a general workspace file browser and it must not be used to enumerate runtime role-home files.',
    '- If native tool use is incompatible with the current provider/model, stop retrying the same wall. Switch to the unified textual tool fallback protocol instead of pretending tools are missing.',
    '- Use these relative paths as the ground truth for what belongs to your current role.',
  ];
}

export function buildToolCompatibilityFallbackSection(compatibilityReason: string): string {
  return [
    '## Tool Compatibility Notice',
    '- The current provider/model did not execute tool completions for this turn.',
    '- Treat this as a compatibility wall for this request shape, not as proof that the tool is missing.',
    '- Do not say the tool is missing from the project, hidden by the UI, or unconfigured if this turn already attempted tool completion.',
    '- If the user asked for a tool call, explain that the current provider/model could not execute tool completions for this request shape, then continue instead of ending the run.',
    '- Unified fallback: native tool use is unsupported here, so switch to `textual_tool_protocol` instead of retrying raw tool_calls / function_call / invoke markup.',
    '- Some providers, especially MiniMax, may emit provider-native tool syntax such as `<invoke>` or `<minimax:tool_call>` even when the executor tool loop is not actually compatible. Treat those as provider syntax traces, not as a completed real tool call.',
    '- This fallback path is already the compatibility retry. After hitting this wall, do not keep slamming native tool syntax. Change protocol and continue.',
    '- `textual_tool_protocol` means: clearly state which tool you intended to use, list the exact parameters you need, and continue in a grounded non-native form instead of outputting raw tool syntax.',
    '- Do not end your answer with only a compatibility notice.',
    '- After at most one short compatibility sentence, you must continue the task itself in the same reply.',
    '- If the task can still be solved without the tool, solve it directly instead of stopping.',
    '- If the tool is still needed, output a compact textual tool plan with the exact tool name, parameters, expected result, and next step, then continue with the best grounded progress you can make right now.',
    `- Compatibility reason: ${compatibilityReason}`,
  ].join('\n');
}
