export const RUNTIME_FLOW_TAGS = {
  skillFile: {
    label: '技能仓',
    line: '技能进入仓库后，还要完成角色绑定，才会出现在当前角色对话里。',
  },
  roleIndex: {
    label: '角色可见结果',
    line: '这里只看当前角色真正会带上的技能，不展示底层存放细节。',
  },
  appConfigRoleSettings: {
    label: '角色设定',
    line: '角色基础设定会同步成只读视图，方便核对当前是否可用。',
  },
  capabilitySnapshot: {
    label: '角色能力快照',
    line: '系统会汇总当前角色的技能、外接能力和原生能力，形成最终可用结果。',
  },
  skillBindingRecovery: {
    label: '技能绑定恢复',
    line: '当绑定关系异常时，系统会按当前角色结果重新整理可用能力。',
  },
  builtinMcp: {
    label: '系统预置能力',
    line: '系统预置能力启用后，会按角色范围进入当前对话。',
  },
  customMcp: {
    label: '外接能力',
    line: '外接能力接入后，会按角色范围决定当前能不能用。',
  },
  runtimeMcpTruth: {
    label: '当前接入结果',
    line: '这里只看当前角色真正已经接上的外接能力。',
  },
  memoryStore: {
    label: '记忆落库',
    line: '记忆相关内容会同步回系统记忆链，24 小时热缓存只负责临时承接。',
  },
  legacyMemoryCompat: {
    label: '旧版兼容项',
    line: '旧版兼容项只保留历史兼容，不作为当前会话的正式接入能力。',
  },
  memorySkill: {
    label: '记忆整理Skill',
    line: '记忆整理会按计划处理内容，并写回长期记忆。',
  },
} as const;

export type RuntimeFlowTagKey = keyof typeof RUNTIME_FLOW_TAGS;
