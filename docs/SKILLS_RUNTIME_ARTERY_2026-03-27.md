# Skills + RoleRuntime 动脉图（2026-03-27）

> 目标：把当前项目里最容易混乱的一条链拆开：`skills 仓库层 → role binding 层 → role runtime 真相层`。
> 结论先行：这三层都和技能有关，但不是同一件事。

---

## 1. 一句话总图

当前 Skills 主链分三层：

1. **技能仓库层**
   - 管“系统里有哪些技能”
2. **角色绑定层**
   - 管“某个角色装了哪些技能”
3. **角色运行态真相层**
   - 管“这个角色当前真实可见、可用、运行中的能力快照是什么”

很多混乱都来自把这三层混写成一句“技能管理”。

---

## 2. 前端入口

### 2.1 服务总入口

- 文件：`src/renderer/services/skill.ts`

这一个服务里其实包了三类调用：

#### A. 技能仓库层

- `loadSkills()`
- `setSkillEnabled()`
- `updateSkillMetadata()`
- `deleteSkill()`
- `downloadSkill()`
- `importUploadedSkill()`
- `getSkillsRoot()`
- `fetchMarketplaceSkills()`
- `getSkillConfig()`
- `setSkillConfig()`

#### B. 角色绑定层

- `listRoleConfigs()`
- `listAllRoleConfigs()`
- `installSkillForRole()`
- `batchInstallSkillForRoles()`
- `removeRoleConfig()`
- `updateRoleConfig()`
- `getRoleSkillIndex()`
- `getRoleSkillConfig()`
- `setRoleSkillConfig()`
- `getRoleSkillSecretsMeta()`
- `setRoleSkillSecrets()`

#### C. 角色运行态真相层

- `getRoleRuntime()`

---

## 3. 中间层：兼容壳与直连

### 3.1 技能仓库层

经由：

- `window.electron.skills.*`
- 落到 `src/renderer/services/electronShim.ts`

### 3.2 角色绑定层

经由：

- `window.electron.skillRoleConfigs.*`
- 落到 `src/renderer/services/electronShim.ts`

### 3.3 角色运行态层

不走 `window.electron.skillRoleConfigs.*`

而是直接：

- `fetch('/api/role-runtime/:roleKey')`

这点很关键：
- `role runtime` 是一条独立真相视图链
- 不只是 `skillRoleConfigs` 的附属 API

---

## 4. 后端三层对应

### 4.1 技能仓库层

- 文件：`server/routes/skills.ts`
- 挂载点：`/api/skills`

负责：
- 技能列表
- 启停
- metadata
- 下载 / 上传导入
- skill config
- 市场

### 4.2 角色绑定层

- 文件：`server/routes/skillRoleConfigs.ts`
- 挂载点：`/api/skill-role-configs`

负责：
- 某角色绑定了哪些技能
- 角色技能配置文件
- 角色技能 secrets 文件
- 角色技能 index 文件

### 4.3 角色运行态真相层

- 文件：`server/routes/roleRuntime.ts`
- 挂载点：`/api/role-runtime`

负责：
- 汇总 `app_config`
- 汇总 `roles/<role>` 目录
- 汇总 capability snapshot
- 汇总 notes / pitfalls
- 汇总 DB 统计（会话、任务、记忆）

结论：
- 它是“角色真相观测面”
- 不只是“角色配置表”

---

## 5. 这三层之间如何联动

### 5.1 仓库层改动后

在 `server/routes/skills.ts` 中：

- skills 仓库层改动后会触发：
  - `syncRoleSkillIndexes(...)`
  - `syncRoleCapabilitySnapshots(...)`

也就是说：
- 改的是仓库
- 但角色运行态文件会被重建

### 5.2 角色绑定层改动后

在 `server/routes/skillRoleConfigs.ts` 中：

- role binding 改动后也会触发：
  - `syncRoleSkillIndexes(...)`
  - `syncRoleCapabilitySnapshots(...)`

也就是说：
- 改的是绑定关系
- 但最后会回写角色运行态文件

### 5.3 role runtime 层本身

在 `server/routes/roleRuntime.ts`：

- 它不直接代表写入源
- 它更像“把所有真相拼起来再读出来”

所以：
- 仓库层 / 绑定层是“写”
- runtime 层是“汇总后的读”

---

## 6. 真实数据源分布

### 6.1 SQLite

表：
- `skill_role_configs`

这里保存：
- 角色绑定关系主数据

### 6.2 运行态文件

目录：
- `roles/<role>/skills.json`
- `roles/<role>/skill-configs/*`
- `roles/<role>/skill-secrets/*`
- `roles/<role>/role-capabilities.json`

这里保存：
- 面向角色消费的可见技能索引
- per-role config / secrets
- capability snapshot

### 6.3 app_config

来源：
- `kv('app_config')`

这里保存：
- 角色 API 配置
- 角色基础设置

---

## 7. 为什么这条链很值钱

因为它回答了三个不同问题：

### 问题 1
“系统里有没有这个技能？”

看：
- `/api/skills`

### 问题 2
“这个角色有没有装这个技能？”

看：
- `/api/skill-role-configs`
- `skill_role_configs`

### 问题 3
“这个角色现在真实能不能用到这个技能？”

看：
- `/api/role-runtime/:roleKey`
- `roles/<role>/skills.json`
- `role-capabilities.json`

如果这三个问题不分开，后面所有 review 都会漂。

---

## 8. 当前最重要的判断

### 8.1 `roleRuntime` 不是装饰接口

它现在已经是：
- 角色能力真相汇总面
- 排障入口
- 前端技能视图的重要依据

### 8.2 `skillRoleConfigs` 才是角色绑定核心

它是：
- 绑定关系写入口
- per-role config/secrets 写入口

### 8.3 `skills.ts` 只是仓库层，不是全部

只看 `/api/skills`，会误以为技能系统很简单。
实际上不简单，真正复杂的是：
- 技能仓库
- 角色绑定
- 角色运行态文件
- capability snapshot

---

## 9. 下一步建议

如果继续顺着这条动脉深挖，最值得做的是：

1. 再补一份 `skills 页面级埋点稿`
2. 把 `SkillsManager.tsx` 的主要操作逐条对到：
   - service
   - shim
   - route
   - runtime file
3. 单独梳一份：
   - `role-capabilities.json`
   - `roles/<role>/skills.json`
   - `skill_role_configs`
   三者的真相关系表

这样这条链就会从“能看懂”升级到“能稳定改”。
