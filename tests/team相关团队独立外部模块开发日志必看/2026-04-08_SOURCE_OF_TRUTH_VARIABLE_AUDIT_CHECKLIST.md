# 真相源 / 变量巡检清单（2026-04-08）

记录时间：2026-04-08

标签：

- `变量清单`
- `真相源巡检`
- `唯一命名`
- `参数统一`
- `边查边记`

## 这份清单怎么用

这不是一次性文档。

这是以后我们一边看代码、一边巡检时要带着走的清单。

原则只有一个：

```text
同一个概念，在一个独立体里必须尽量只有一个名字、一个主真相源。
```

如果不能马上只剩一个，
也必须明确：

- 哪个是真相源
- 哪个是兜底
- 哪个是派生视图
- 哪个只是历史兼容名

---

## 1. 当前已经明确的真相源层级

### 1.1 运行态主真相源

- SQLite `kv(app_config)`
- SQLite `kv(im_config)`
- SQLite 会话 / 消息 / 记忆相关表

### 1.2 部署兜底

- `.env`
- `.env.example`
- `deploy/linux/*.env.example`

### 1.3 前端默认壳

- `src/renderer/config.ts`

### 1.4 运行态派生视图

- `.uclaw/web/roles/*/role-settings.json`
- `.uclaw/web/roles/*/role-capabilities.json`
- `.uclaw/web/roles/*/skills.json`

### 1.5 Bundled / 用户态技能仓

- `SKILLs/`
- `.uclaw/web/SKILLs/`

---

## 2. 当前巡检重点概念

### 2.1 API 配置

要检查的名字：

- `api.key`
- `api.baseUrl`
- `UCLAW_API_KEY`
- `UCLAW_API_BASE_URL`
- `providers.*.apiKey`
- `providers.*.baseUrl`
- `agentRoles.*.apiKey`
- `agentRoles.*.apiUrl`

当前判断：

- 这组最容易打架
- 运行时应优先以 `kv(app_config)` 为准
- `.env` 只能是兜底，不该和数据库平级

### 2.2 模型配置

要检查的名字：

- `model.defaultModel`
- `model.defaultModelProvider`
- `providers.*.models`
- `agentRoles.*.modelId`
- `UCLAW_DEFAULT_MODEL`
- `UCLAW_DEFAULT_MODEL_<ROLE>`

当前判断：

- “默认模型”与“角色模型”是两层概念
- 如果没说清，很容易把全局默认和角色当前模型混成一个东西

### 2.3 身份边界

要检查的名字：

- `agentRoleKey`
- `modelId`
- `all`
- `sourceType`

硬规则：

- `agentRoleKey` 是身份真理
- `modelId` 不是身份
- `all` 不是存储桶

补充铁律：

- 模型会变，但角色不能漂
- 角色记忆只能跟角色走，不能跟模型走
- 如果切模型后像换了一个人，先当 bug 查，不当正常行为接受

### 2.4 IM / 飞书 / IMA

要检查的名字：

- `im_config`
- `UCLAW_FEISHU_*`
- `IMA_OPENAPI_CLIENTID`
- `IMA_OPENAPI_APIKEY`
- `UCLAW_IMA_OPENAPI_CLIENTID`
- `UCLAW_IMA_OPENAPI_APIKEY`

当前判断：

- `im_config` 不是轻写
- 它会波及 `.env`、角色 secret、运行时桥接
- IMA 还有主名 / 兼容名双口径，要特别防止误判

### 2.5 路径概念

要检查的名字：

- `workspace`
- `workspaceRoot`
- `workingDirectory`
- `UCLAW_WORKSPACE`
- `UCLAW_APP_ROOT`
- `UCLAW_DATA_PATH`
- `userDataPath`
- `resolveRuntimeRoot`
- `resolveRuntimeUserDataPath`

当前判断：

- `workspace / workingDirectory / userDataPath` 容易被说成一回事
- 实际不是

### 2.6 Team 自身配置

要检查的名字：

- `teamTaskDefinition`
- `initialTeamRuntime`
- `SeatConfig.baseUrl`
- `SeatConfig.modelOrEngine`
- `savePath`
- `voice`
- `format`

当前判断：

- `team` 要保持 feature-local
- 不要再去偷主家园配置
- 以后继续拆时，优先看 `teamRuntimeConfig.ts`

---

## 3. 巡检时必须回答的 5 个问题

每扫到一个变量 / 参数 / 配置概念，都要问：

1. 它的主真相源是哪一层？
2. 它有没有别名 / 旧名 / 兼容名？
3. 它有没有被同步回别的层？
4. 页面上看到的值，是原始值还是派生视图？
5. 如果它错了，应该先改哪里，而不是改哪里看起来最方便？

---

## 4. 当前已经确认的几条口径

### 4.1 角色设定视图不是原始真相源

文件：

- `server/libs/roleRuntimeViews.ts`

明确写着：

- `role-settings.json` 是只读视图
- 真正运行时仍以 `kv(app_config)` 为准

### 4.2 `.env` 不是运行时第一真相源

文件：

- `src/main/libs/claudeSettings.ts`

明确逻辑：

- 先读数据库 `app_config`
- 数据库没有可用配置时，才回退 `.env`

### 4.3 `store.ts` 不是普通写口

文件：

- `server/routes/store.ts`

明确逻辑：

- 写 `app_config / im_config` 会联动 `.env`、角色视图、skills、secret/runtime 文件
- 所以它不是普通 KV 写入

---

## 5. 巡检记录格式

以后新增巡检结果，统一按这个格式续写：

```text
## 巡检项：<概念名>
主真相源：
兼容别名：
派生视图：
当前冲突：
建议收口：
相关文件：
```

---

## 6. 当前一句话提醒

不要再用“我看到哪里就改哪里”的方式碰配置。

先问：

```text
这个值到底属于哪一层真相源？
```

只有这样，
我们后面做“一个独立体内有且只有一个”的统一，
才不会越修越乱。

---

## 7. 第一轮巡检结果：API / 模型 / 身份

### 巡检项：API 配置

主真相源：

- `kv(app_config)`
- 读取主链在 `src/main/libs/claudeSettings.ts -> resolveCurrentApiConfig(...)`

兼容别名：

- `UCLAW_API_BASE_URL` / `LOBSTERAI_API_BASE_URL`
- `UCLAW_API_KEY` / `LOBSTERAI_API_KEY`
- 以及按角色后缀的 `UCLAW_API_*_<ROLE>`

派生视图：

- `.env` 会被 `server/routes/store.ts -> syncAppConfigToEnv(...)` 反向同步
- `roles/<role>/role-settings.json` 只是只读视图，不是原始配置源

当前冲突：

- `.env.example` 文字口径仍偏“优先读 .env”
- 但真实运行时逻辑是“数据库优先，.env 兜底”
- `app_config` 内同时存在：
  - `api.key / api.baseUrl`
  - `providers.*`
  - `agentRoles.*`
  三层 API 相关字段

建议收口：

- 明确规定：
  - `app_config.agentRoles.*` = 角色实际运行配置
  - `app_config.api.*` = 全局 fallback
  - `providers.*` = 可选 provider catalog / provider preset，不再和角色运行配置混用

相关文件：

- `src/main/libs/claudeSettings.ts`
- `server/routes/store.ts`
- `server/routes/apiConfig.ts`
- `src/renderer/config.ts`
- `.env.example`

### 巡检项：模型配置

主真相源：

- `kv(app_config).model`
- `kv(app_config).agentRoles.*.modelId`

兼容别名：

- `UCLAW_DEFAULT_MODEL`
- `UCLAW_DEFAULT_MODEL_<ROLE>`

派生视图：

- 前端 `defaultConfig.model`
- 角色只读视图 `roles/<role>/role-settings.json`

当前冲突：

- `model.defaultModelProvider` 同时承担：
  - 全局默认 provider
  - 部分角色默认入口暗示
- `resolveAgentRolesFromConfig(...)` 先用 `defaultModelProvider + providers` 做 seed，再被 `providers.<role>` 和 `agentRoles.<role>` 覆盖
- 这会让“默认模型”和“角色当前模型”看起来像一个概念，实际上不是

建议收口：

- 明确规定：
  - `model.defaultModel + defaultModelProvider` = UI 默认入口 / fallback 选择
  - `agentRoles.<role>.modelId` = 角色当前运行模型

相关文件：

- `src/shared/agentRoleConfig.ts`
- `src/renderer/config.ts`
- `src/main/libs/claudeSettings.ts`

### 巡检项：身份边界

主真相源：

- `agentRoleKey`

兼容别名：

- 无真正兼容别名，但 `all` 在 UI / 绑定层里作为聚合 scope 出现

派生视图：

- `roles/<role>/*`
- session summary / current session / scheduled task badge

当前冲突：

- `modelId` 仍在很多地方和 `agentRoleKey` 同时出现，容易让人误会它也参与身份
- `all` 不是身份，但在技能/MCP/UI 绑定里会出现，容易被误当成另一个角色桶

建议收口：

- 明确规定：
  - `agentRoleKey` = 身份唯一键
  - `modelId` = 运行配置，不得参与身份隔离
  - `all` = scope/display only，不入身份桶

相关文件：

- `src/shared/agentRoleConfig.ts`
- `src/main/coworkStore.ts`
- `server/routes/cowork.ts`
- `server/libs/httpSessionExecutor.ts`
- `server/libs/identityThreadHelper.ts`
