export const RUNTIME_FLOW_TAGS = {
  skillFile: {
    label: 'Skill文件夹',
    line: 'Skill文件夹 -> skill_role_configs -> roles/<role>/skills.json -> 会话可见',
  },
  roleIndex: {
    label: '角色索引',
    line: '角色索引 -> roles/<role>/skills.json -> 当前角色能看见什么',
  },
  appConfigRoleSettings: {
    label: '角色设定真相',
    line: 'app_config.agentRoles -> roles/<role>/role-settings.json(只读投影) -> 运行设定排查',
  },
  capabilitySnapshot: {
    label: '角色能力快照',
    line: 'skills.json + runtime MCP + native capabilities -> roles/<role>/role-capabilities.json -> 会话可用面核对',
  },
  skillBindingRecovery: {
    label: '技能绑定恢复',
    line: '角色索引快照 -> skill_role_configs 修复 -> roles/<role>/skills.json / role-capabilities.json 重建',
  },
  builtinMcp: {
    label: '内置MCP',
    line: '内置MCP -> server启动预装 -> mcp_servers -> 会话运行时注入',
  },
  customMcp: {
    label: '自定义MCP',
    line: '自定义MCP -> mcp_servers -> 按角色过滤 -> 会话运行时注入',
  },
  runtimeMcpTruth: {
    label: '运行态MCP真相',
    line: 'mcp_servers -> getEnabledServers -> getRuntimeEnabledServers -> legacy Memory compat 剔除后注入',
  },
  memoryStore: {
    label: '记忆落库',
    line: 'Memory MCP -> CoworkRunner运行时注入 -> uclaw.sqlite(user_memories)；identity_thread_24h 仅作24h热缓存画板',
  },
  legacyMemoryCompat: {
    label: '旧记忆MCP',
    line: '旧 Memory MCP -> 仅兼容展示/历史记录 -> 不参与会话或定时任务运行注入',
  },
  memorySkill: {
    label: '记忆整理Skill',
    line: 'daily-memory-extraction -> Skill文件夹 -> 定时/接口触发 -> 写回 user_memories/长期记忆链 -> 清空 identity_thread_24h 热缓存',
  },
} as const;

export type RuntimeFlowTagKey = keyof typeof RUNTIME_FLOW_TAGS;
