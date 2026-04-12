# 真相源统一地图（2026-04-08）

记录时间：2026-04-08

标签：

- `真相源统一`
- `变量归一`
- `配置收口`
- `先定死再改`

## 这份地图的目的

这不是“马上改完”的清单。

这是我们在真正动大整理之前，
先把：

- 哪个是主
- 哪个是兜底
- 哪个是派生视图
- 哪个只是历史兼容名

钉死的一张图。

后面任何收口，都先按这张图来。

---

## 1. 总原则

### 1.1 一个概念，只能有一个主真相源

允许存在：

- 兜底
- 派生视图
- 历史兼容名

但不允许：

- 多个层级看起来都像主
- 改 A 却被 B 覆盖
- 页面、数据库、环境变量各说各话

### 1.2 身份锚点铁律

这一条要单独写死：

```text
角色是锚点，
模型只是运行时配置。
模型会变，
但角色和角色的记忆不能漂。
```

也就是说：

- `agentRoleKey` 是身份真理
- `modelId` 不是身份
- `defaultModelProvider` 不是身份
- provider 名字也不是身份

凡是连续性、记忆、任务归属、角色视图、频道承接，
都必须继续只认 `agentRoleKey`。

### 1.2 当前统一口径

```text
运行态主真相源 > 部署兜底 > 前端默认壳 > 派生视图
```

### 1.3 数据地基层补充

```text
SQLite / 远程 SQL = 主真相源
Dexie / IndexedDB  = 前端缓存命中层
向量库            = 检索增强层
```

明确禁止：

- 把 Dexie 当主库
- 把浏览器缓存当唯一存证
- 把向量库当全文真相源

---

## 2. 统一地图

## 2.1 API 配置

### 这个概念包括

- `api.key`
- `api.baseUrl`
- `UCLAW_API_KEY`
- `UCLAW_API_BASE_URL`
- `providers.*.apiKey`
- `providers.*.baseUrl`
- `agentRoles.*.apiKey`
- `agentRoles.*.apiUrl`

### 主真相源

- `SQLite kv(app_config)`

### 兜底

- `.env`
- `UCLAW_*`
- `LOBSTERAI_*` 兼容别名

### 派生视图

- `roles/<role>/role-settings.json`

### 当前已知问题

- 顶层 `api.baseUrl`
- `providers.*`
- `agentRoles.*`

这三层现在会同时出现，
但没有完全明确“谁只负责全局默认，谁负责角色运行态，谁只做兼容壳”。

### 收口目标

- 顶层 `api.*`：保留为“全局默认入口”
- `agentRoles.*`：保留为“角色运行态入口”
- `providers.*`：保留为“模型仓/供应商目录”，不再和角色运行态抢主位

### 当前巡检确认

- `claudeSettings.ts` 的真实读取逻辑已经明确：
  - 先读 `kv(app_config)`
  - 再按 `agentRoles.*` 解析角色运行态
  - `.env` 只在数据库没有可用配置时兜底
- 所以“运行时真正去哪取 API 配置”这个问题，现在已经有结论：
  - **先看 `kv(app_config).agentRoles.*`**
  - 不是先看 `.env`

---

## 2.2 模型配置

### 这个概念包括

- `model.defaultModel`
- `model.defaultModelProvider`
- `providers.*.models`
- `agentRoles.*.modelId`
- `UCLAW_DEFAULT_MODEL`
- `UCLAW_DEFAULT_MODEL_<ROLE>`

### 主真相源

- `SQLite kv(app_config)`

### 兜底

- `.env`

### 当前已知问题

- `defaultModel/defaultModelProvider` 容易和 `agentRoles.*.modelId` 混成一层
- 页面里“当前模型”和角色槽位的真正运行模型不总是一个概念

### 收口目标

- `defaultModel/defaultModelProvider`：只表示“默认入口”
- `agentRoles.*.modelId`：表示“角色当前实际运行模型”
- 以后不能再用一个字段同时表达这两层意思

### 当前巡检确认

- 现在最容易混的是：
  - `defaultModel/defaultModelProvider`
  - `providers.*.models`
  - `agentRoles.*.modelId`
- 这三层不是同义词。
- 后续整理时，必须把“默认入口”和“角色当前运行模型”明确拆开。

---

## 2.3 身份边界

### 这个概念包括

- `agentRoleKey`
- `modelId`
- `all`
- `sourceType`

### 主真相源

- `agentRoleKey`

### 明确不是主真相源

- `modelId`
- `all`

### 当前已知问题

- 历史壳层和部分展示层仍然容易把 `modelId` 说成“这个员工是谁”
- `all` 在前端是聚合视图，但很容易被误读为归属桶

### 收口目标

- 所有涉及身份隔离、连续性、记忆、任务归属的逻辑，永远只认 `agentRoleKey`

### 当前巡检确认

- 这一条在代码和文档里目前是最稳的。
- 后续任何整理如果把 `modelId` 拉回身份判断里，都算倒退。
- 后续任何“模型切换导致像换了个人”的表现，都先按 bug 看，不按产品特性解释。

---

## 2.4 IM / 飞书 / IMA

### 这个概念包括

- `im_config`
- `UCLAW_FEISHU_*`
- `IMA_OPENAPI_CLIENTID`
- `IMA_OPENAPI_APIKEY`
- `UCLAW_IMA_OPENAPI_CLIENTID`
- `UCLAW_IMA_OPENAPI_APIKEY`

### 主真相源

- `SQLite kv(im_config)`

### 兜底

- `.env`

### 派生视图

- 角色 `skill-secrets`
- 运行时桥接状态

### 当前已知问题

- `im_config` 现在不是轻写，但这一点很容易被忽略
- IMA 同时有主名和兼容名

### 收口目标

- `im_config` 继续做运行态真相源
- `.env` 只保留部署和首启兜底
- IMA 对外只主推一个名字，兼容名只留在底层别名映射里

### 当前巡检确认

- `im_config` 是主真相源
- 飞书环境变量只是同步镜像 / 部署兜底
- IMA 当前主名与兼容名并存：
  - 主名：`IMA_OPENAPI_CLIENTID / IMA_OPENAPI_APIKEY`
  - 兼容名：`UCLAW_IMA_OPENAPI_CLIENTID / UCLAW_IMA_OPENAPI_APIKEY`
- 后面如果不先收这层，飞书、IMA、角色 secret/runtime 文件会继续互相打架

---

## 2.5 路径概念

### 这个概念包括

- `workspace`
- `workspaceRoot`
- `workingDirectory`
- `UCLAW_WORKSPACE`
- `UCLAW_APP_ROOT`
- `UCLAW_DATA_PATH`
- `userDataPath`

### 主真相源

- `getProjectRoot()`
- `resolveRuntimeRoot()`
- `resolveRuntimeUserDataPath()`

### 当前已知问题

- `workspace`、`workingDirectory`、`userDataPath` 在说话时很容易被混成一个东西

### 收口目标

- `workspace / projectRoot`：项目根
- `workingDirectory`：任务/会话执行目录
- `userDataPath / runtimeRoot`：运行态家目录

以后文档和代码注释里都尽量按这套口径说。

### 当前巡检确认

- 这组是后面最值得优先统一的一刀。
- 因为一旦把 `workspace / workingDirectory / userDataPath` 混成一个概念，
  后面的部署、任务执行、运行态家目录都会一起乱。

---

## 2.6 Team 自身配置

### 这个概念包括

- `teamTaskDefinition`
- `initialTeamRuntime`
- `SeatConfig.baseUrl`
- `SeatConfig.modelOrEngine`
- `savePath`
- `voice`
- `format`

### 主真相源

- `src/renderer/components/team/teamRuntimeConfig.ts`
- `src/renderer/types/teamRuntime.ts`

### 当前已知问题

- 还只是第一刀拆分
- `team` 现在的参数还主要停留在页面运行时状态，没有形成完整的 feature-local config/store

### 收口目标

- `team` 的 demo 参数、画布参数、seat 参数继续往 feature-local 模块收
- 不再默认借主家园全局配置

### 当前巡检确认

- `team` 现在已经有自己的：
  - `team.html`
  - `team-main.tsx`
  - `teamRuntime.ts`
  - `teamRuntimeConfig.ts`
  - `handwriteAdapter.ts`
- 这说明 `team` 已经开始具备自己的入口、类型、默认任务和运行时骨架。
- 但它还没有完全独立：
  - `SingleTaskRunnerPage.tsx` 里还留着 demo/runtime 辅助函数
  - `team-*` 样式还混在全局 `index.css`
  - 入口仍然挂在主服务端 `/team` / `/test`
  - `seatConfig.A.baseUrl` 仍直接拼主服务端 `/api/tts-audio`

### 下一步最适合拆的地方

1. 把 `SingleTaskRunnerPage.tsx` 里的 demo/runtime 辅助函数继续抽走
2. 把 `team-*` 样式从全局 `index.css` 里分离
3. 给 `team` 做自己的 feature-local service/config 层
4. 单独写一份 `team` 对主服务端依赖清单

---

## 3. 当前最值得先动的统一切片

如果时间紧，只先动这一刀：

### 第一刀

- 明确并清理 `app_config` 里的：
  - 顶层 `api.*`
  - `model.defaultModel/defaultModelProvider`
  - `agentRoles.*`

让这三层的职责不再重叠。

### 第一刀当前已落下的动作

- 已补一个“从顶层默认入口反推默认角色”的解析函数：
  - `resolveDefaultAgentRoleKey(...)`
- 已让这条解析同时进入：
  - `Settings` 保存链
  - `claudeSettings` 读取链

这一步的意义是：

- 不再只把 `model.defaultModelProvider` 生硬理解成 provider 名
- 而是允许系统按顶层默认入口 `api.* + model.defaultModel` 去反推出“当前默认角色到底是谁”

这不是最终收口，
但它已经把“默认入口”和“角色运行态”之间的关系讲清了一点，
避免后面继续完全靠猜。

### 第二刀

- 把 `im_config` 补齐成完整运行态，不再长期保持缺失态

### 第三刀

- 继续把 `team` 的 feature-local 配置从页面里拆出去

---

## 4. 一句话提醒

以后不要再问：

```text
这个值我改哪儿最方便？
```

先问：

```text
这个值的主真相源应该是谁？
```

只要这句话不丢，
我们后面的大整理就不会散。
