# 能力快照纯读修复（2026-04-12）

记录时间：2026-04-12

标签：

- `能力单`
- `纯读`
- `角色索引`
- `不扫仓库`
- `第二刀`

## 这刀要解决什么

第一刀已经把默认启动从：

- 技能仓修复
- 角色索引重建
- capability snapshot 重算

里先解开。

但还差一个关键点：

```text
即使 role-capabilities.json 只是“重算一次”，
如果它内部还会顺手扫仓库，
那默认运行态门牌还是会被仓库候选层污染。
```

---

## 1. 改之前的真实问题

文件：

- `server/libs/roleRuntimeViews.ts`

原来 `syncRoleCapabilitySnapshot(...)` 里会先做：

1. `cleanupRoleSkillRuntimeState(...)`
2. `syncRoleSkillIndexes(...)`
3. `skillManager.listSkills()`

这意味着：

```text
能力快照生成并不是“读角色索引”。
它其实还会：
- 清理
- 重建
- 扫仓库
```

也就是把：

- 角色门牌
- 运行态能力单
- 仓库候选技能

重新揉成了一条链。

---

## 2. 这次实际改了什么

文件：

- `server/libs/roleRuntimeViews.ts`

### 改动 1

`syncRoleCapabilitySnapshot(...)` 不再内部调用：

- `cleanupRoleSkillRuntimeState(...)`
- `syncRoleSkillIndexes(...)`

### 改动 2

`syncRoleCapabilitySnapshot(...)` 不再默认调用：

- `skillManager.listSkills()`

### 改动 3

当前默认快照只基于：

- `roles/<role>/skills.json`
- `skill_role_configs`（只做绑定对照）
- `runtimeMcpTools`
- `runtimeNativeCapabilities`

也就是：

```text
能力快照默认只读当前角色已经落地的索引和运行态，
不再顺手把仓库候选层混进来。
```

### 改动 4

`unboundWorkspaceSkills` 默认回空数组。

新口径写进了规则字段：

- 仓库候选只应出现在显式诊断链
- 默认运行态能力快照不把仓库候选混进来

---

## 3. 这刀之后意味着什么

### 对启动链

默认启动不再因为 capability snapshot 重算而去碰：

- `SKILLs/`
- `SKILL.md`
- frontmatter YAML

### 对 role runtime / 房间门牌

以后：

- `role-settings.json`
- `role-capabilities.json`

更接近真正的：

```text
房间门牌 / 当前能力单
```

而不是：

```text
顺手把仓库也一起扫了一遍的混合视图
```

### 对 helper / 诊断工具

如果以后要看仓库候选层，
应该走显式诊断路径，
不该再默认借 capability snapshot 夹带出来。

---

## 4. 当前验证

已验证：

- `npm run build:web`
- 通过

---

## 5. 还没做的

这刀没有继续改：

- `server/routes/store.ts`
- `server/routes/skillRoleConfigs.ts`
- `server/routes/skillsMcpHelper.ts`
- `src/main/skillManager.ts`

也就是说：

```text
显式管理动作仍然可能触发仓库层扫描，
但默认启动链和默认能力快照已经先收住了。
```

---

## 6. 一句话收束

第二刀不是“让系统不再有仓库”。

第二刀只是把这一层重新摆正：

```text
角色能力单 = 角色能力单。
仓库候选 = 仓库候选。
默认情况下，不再混。
```
