# 启动期技能仓解耦急救记录（2026-04-12）

记录时间：2026-04-12

标签：

- `急救`
- `启动链`
- `能力单`
- `技能仓`
- `按需加载`
- `第一刀`

## 这份记录为什么要写

这不是长期理想方案。

这是先止血：

```text
默认启动不再顺手碰技能仓候选层，
先把主家园从 frontmatter / 仓库扫描里解开。
```

---

## 1. 这次要切断的真实链

之前默认启动链里，存在这条线：

```text
server/src/index.ts
-> scheduleDeferredStartupWarmup()
-> repairSkillBindingsForRuntime()
-> syncRoleSkillIndexesForRuntime()
-> syncRoleSettingsViewsForRuntime()
-> syncRoleCapabilitySnapshots()
-> roleRuntimeViews.ts
-> skillManager.listSkills()
-> parseSkillDir()
-> parseFrontmatter()
```

而 `listSkills()` 的真实职责只是：

```text
回答“仓库里有哪些技能候选”
```

不是：

```text
默认运行时能力单
```

所以这条链一旦挂在默认启动期，就会让用户 skill 的 YAML/frontmatter 污染系统主链。

---

## 2. 这次实际改了什么

文件：

- `server/src/index.ts`

### 改动 1

`syncRoleSettingsViewsForRuntime()` 现在只同步：

- `role-settings.json`

不再默认顺手同步：

- `role-capabilities.json`

### 改动 2

`scheduleDeferredStartupWarmup()` 不再默认执行：

- `repairSkillBindingsForRuntime()`
- `syncRoleSkillIndexesForRuntime()`

### 改动 3

保留：

- `syncRoleSettingsViewsForRuntime()`
- `logRoleRuntimeHealthCheck()`
- `ensureRuntimeViewSyncSubscriptions()`

也就是：

```text
启动后仍有轻量房间门牌与健康检查，
但不再默认重建技能绑定 / 角色技能索引 / 能力快照。
```

---

## 3. 这刀的真实目的

不是“把 skills 全部废掉”。

而是把角色默认运行态和仓库候选层先分开：

- 默认启动：只保留轻量门牌、健康检查、订阅
- 显式管理动作（绑定 / 安装 / 管理页）：仍可继续触发重建

这符合已经写死过很多次的边界：

```text
启动只加载基础。
默认运行只认当前 agent 的能力单。
用户可添加内容全部后置、异步、按需。
```

---

## 4. 这刀没有动什么

这次没有直接改：

- `server/libs/roleRuntimeViews.ts`
- `src/main/skillManager.ts`
- `server/routes/store.ts`
- `server/routes/skillRoleConfigs.ts`
- `server/routes/skillsMcpHelper.ts`

也就是说：

```text
这只是启动链急救，
不是全仓最终收口。
```

管理页、绑定页、排查 helper 仍然可能碰仓库候选层。

---

## 5. 当前验证

已验证：

- `npm run build:web`
- 通过

这代表：

```text
这刀没有把前端现役壳打断。
```

---

## 6. 还剩的下一步

后续如果继续收，优先顺序应是：

1. `roleRuntimeViews.ts`
   - 让 `role-capabilities.json` 默认不再靠 `listSkills()` 混入仓库候选

2. `skillManager.ts`
   - 明确 `listSkills()` 只属于仓库 API / 管理动作
   - 不再让它贴着运行态默认链

3. `store.ts`
   - `app_config / im_config` 写入的副作用继续减重

4. `skillsMcpHelper.ts`
   - 不再把 `availableSkills` 和 `warehouseOnlySkills` 混成一个候选池

---

## 7. 一句话收束

这次不是“修好了一切”。

这次只是先把最危险的一件事做了：

```text
默认启动不再顺手把仓库候选层拉进主家园。
```
