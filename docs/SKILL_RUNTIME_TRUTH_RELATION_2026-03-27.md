# Skills / Runtime 四路真相关系表（2026-03-27）

> 目标：把当前项目里最容易混淆的 4 份“看起来都像技能真相”的东西拆开。
> 原则：只以当前代码为事实，不拿设计稿顶替 live 行为。

---

## 1. 先说结论

当前技能运行链不是单点真相，而是 **四路分工**：

1. `app_config`
   - 管角色运行设定
   - 不直接决定“技能绑定关系”
2. `skill_role_configs`
   - 管角色技能绑定主数据
   - 是技能绑定的写入真相
3. `roles/<role>/skills.json`
   - 管当前角色最终可见技能索引
   - 是角色技能可见性的运行真相
4. `roles/<role>/role-capabilities.json`
   - 管当前角色运行能力快照
   - 是排障和观测真相，不是原始写入源

---

## 2. 四路表

| 项 | 物理位置 | 性质 | 谁写入 | 谁读取 | sync 方向 | 代码事实 |
|---|---|---|---|---|---|---|
| `app_config` | `uclaw.sqlite -> kv(key='app_config')` | 角色设定主真相 | `server/routes/store.ts`、`server/routes/roleRuntime.ts` | `server/src/index.ts`、`server/libs/httpSessionExecutor.ts`、`server/libs/roleRuntimeViews.ts`、`server/routes/dialog.ts` 等 | `app_config -> role-settings.json / executor / 路由视图` | 角色 API URL、modelId、native capabilities 都从这里解出 |
| `skill_role_configs` | SQLite 表 `skill_role_configs` | 角色技能绑定主真相 | `server/routes/skillRoleConfigs.ts`、`server/routes/store.ts`、恢复链 `server/libs/skillBindingRecovery.ts` | `server/libs/roleSkillFiles.ts`、`server/libs/roleRuntimeViews.ts`、`src/main/skillManager.ts` | `skill_role_configs -> roles/<role>/skills.json -> role-capabilities.json` | 绑定关系在 DB；不是 file-first |
| `roles/<role>/skills.json` | 运行目录 `roles/<role>/skills.json` | 角色技能可见索引真相 | `server/libs/roleSkillFiles.ts:270` 的 `syncRoleSkillIndexes(...)` | `server/libs/roleRuntimeViews.ts`、前端 skills 视图、排障链 | `(skill_role_configs + runtime SKILLs) -> skills.json` | 只代表当前角色最终能看见什么 skill |
| `roles/<role>/role-capabilities.json` | 运行目录 `roles/<role>/role-capabilities.json` | 运行能力快照 / 观测真相 | `server/libs/roleRuntimeViews.ts:328` 的 `syncRoleCapabilitySnapshot(...)` | `server/routes/roleRuntime.ts`、前端运行态排障视图 | `skills.json + runtime MCP + native capabilities -> role-capabilities.json` | 汇总面，不是绑定写口 |

---

## 3. 每一路到底回答什么问题

### 3.1 `app_config`

回答：

- 这个角色是否启用？
- 这个角色用哪个 `apiUrl` / `modelId` / `apiFormat`？
- 哪些 native capabilities 对这个角色开启？

不回答：

- 这个角色绑定了哪些技能
- 这个角色当前最终能看到哪些 skill

代码锚点：

- `server/routes/store.ts:472`
- `server/routes/roleRuntime.ts:48`
- `server/libs/roleRuntimeViews.ts:167`
- `server/libs/httpSessionExecutor.ts:312`

---

### 3.2 `skill_role_configs`

回答：

- 某个 skill 是否绑定到某个 role
- 绑定 scope 是 `all` 还是单角色
- 绑定是否启用

不回答：

- 运行时仓库里这个 skill 目录是否还存在
- 角色最终是否真的还能看到这个 skill

因为：

- DB 里可能有绑定
- 但运行时 `SKILLs/<id>/SKILL.md` 已丢失
- 这时后续同步会把它清洗掉

代码锚点：

- `server/libs/roleSkillFiles.ts:98`
- `server/libs/roleSkillFiles.ts:158`
- `server/routes/skillRoleConfigs.ts`
- `src/main/skillManager.ts:1671`

---

### 3.3 `roles/<role>/skills.json`

回答：

- 当前角色最终可见、可用的 skill 索引是什么
- 对应 config / secret 文件路径在哪
- 源 skill 路径最终落到哪里

不回答：

- 角色 API/model 设定
- MCP 运行态可用面

它是怎么来的：

1. 先扫 `skill_role_configs`
2. 再和运行时仓库 `userData/SKILLs` 对齐
3. 清理失效 binding / 遗留 config / secret
4. 重写 `roles/<role>/skills.json`

代码锚点：

- `server/libs/roleSkillFiles.ts:158`
- `server/libs/roleSkillFiles.ts:270`
- `src/main/skillManager.ts:1052`
- `src/main/skillManager.ts:1219`

---

### 3.4 `roles/<role>/role-capabilities.json`

回答：

- 当前角色最终 `availableSkills`
- 当前角色最终 `runtimeMcpTools`
- 当前角色最终启用的 native capabilities
- 当前 warning / invalidBindings / unboundWorkspaceSkills

不回答：

- 这份能力是从哪个单一路径“直接写入”的

因为它是汇总快照，不是写源。

代码锚点：

- `server/libs/roleRuntimeViews.ts:328`
- `server/libs/roleRuntimeViews.ts:342`
- `server/routes/roleRuntime.ts:185`
- `src/main/mcpStore.ts:239`

---

## 4. 实际同步链

### 4.1 技能仓库变化

触发点：

- `server/routes/skills.ts`

结果：

1. 技能仓库变化
2. 重建 `roles/<role>/skills.json`
3. 重建 `roles/<role>/role-capabilities.json`

含义：

- 仓库层不是最终真相
- 但会推动角色真相重算

---

### 4.2 绑定关系变化

触发点：

- `server/routes/skillRoleConfigs.ts`
- `server/routes/store.ts`

结果：

1. 更新 `skill_role_configs`
2. 重建 `roles/<role>/skills.json`
3. 重建 `roles/<role>/role-capabilities.json`

---

### 4.3 MCP 变化

触发点：

- `server/routes/mcp.ts`

结果：

- 重建 `role-capabilities.json`

不直接重建：

- `skills.json`

因为 MCP 不属于 skill 索引层。

---

### 4.4 app_config 变化

触发点：

- `server/routes/store.ts`
- `server/routes/roleRuntime.ts`

结果：

- 重建 `role-settings.json`
- 重建 `role-capabilities.json`

重点：

- `app_config` 变化会影响角色设定和 native capabilities
- 但不直接生成 skill binding 主数据

---

## 5. 最容易踩错的地方

### 5.1 误把 `app_config` 当技能绑定源

错误。

`app_config` 是角色运行设定真相，不是技能绑定表。

---

### 5.2 误把 `skill_role_configs` 当最终运行态结果

错误。

它只是绑定主数据。
如果仓库里 skill 已失效，后续同步会把最终结果清掉。

---

### 5.3 误把 `role-capabilities.json` 当直接配置文件

错误。

它是汇总快照，便于前端排障与 runtime 观察。

---

### 5.4 误把 `roles/<role>/skills.json` 当总仓库

错误。

它只回答“这个角色最后可见什么”，不是“系统里一共有什么”。

---

## 6. 噪音 / 误导项

### 6.1 `role-settings.json`

它是：

- `app_config` 的只读投影

不是：

- 角色设定原始真相

证据：

- `server/libs/roleRuntimeViews.ts:167`

---

### 6.2 `unboundWorkspaceSkills`

它是：

- 仓库里存在，但当前角色未绑定的候选清单

不是：

- 当前角色已可调用能力

证据：

- `server/libs/roleRuntimeViews.ts:385`

---

### 6.3 legacy Memory MCP

它是：

- 兼容记录

不是：

- 会话实际注入的 runtime MCP

证据：

- `src/main/mcpStore.ts:239`

---

### 6.4 外部 Claude skills 根目录

它是：

- 可选附加仓库

不是：

- 默认必然参与的 live 仓库

证据：

- `src/main/skillManager.ts:1801`

前提：

- `UCLAW_ENABLE_EXTERNAL_CLAUDE_SKILLS` 开启后才参与。

---

## 7. 现在可以用一句话收口

如果只想判断“当前角色到底能用什么”：

按这个顺序核：

1. `app_config.agentRoles.<role>`
2. `skill_role_configs`
3. `roles/<role>/skills.json`
4. `roles/<role>/role-capabilities.json`
5. `mcpStore.getRuntimeEnabledServers(roleKey)`

其中：

- 1 是角色运行设定真相
- 2 是技能绑定真相
- 3 是角色技能可见真相
- 4 是运行能力快照真相
- 5 是 runtime MCP 最终注入真相

这五步分开，后面排障就不会再漂。
