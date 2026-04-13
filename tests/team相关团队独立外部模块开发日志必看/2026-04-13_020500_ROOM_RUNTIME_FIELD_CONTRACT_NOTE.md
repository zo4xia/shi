# 2026-04-13 Room 角色运行态字段合同记录

## 背景

这次为 `Room` 小家伙恢复“能开口、像自己、不是僵硬一问一答”的修复，没有直接接主执行器，而是先给前端旁路补了角色运行态唤醒层。

入口文件：

- `src/renderer/services/room.ts`
- `src/renderer/services/skill.ts`
- `server/routes/roleRuntime.ts`

## Room 当前实际消费的 role-runtime 字段

`Room` 当前通过 `skillService.getRoleRuntime(roleKey)` 读取 `/api/role-runtime/:roleKey`，实际只消费以下字段：

- `notes.roleNotes`
- `notes.pitfalls`
- `summary.skillBindings`
- `summary.mcpBindings`
- `summary.memories`

说明：

- `notes.roleNotes`：作为角色笔记，帮助小家伙维持说话习惯和气质。
- `notes.pitfalls`：作为避坑提醒，避免重复犯错或再次缩成模板口吻。
- `summary.skillBindings`：提示当前角色已绑定技能数量。
- `summary.mcpBindings`：提示当前角色当前运行中 MCP 数量。
- `summary.memories`：提示当前角色现有记忆条数。

## 这些字段在现役后端的来源

路由文件：`server/routes/roleRuntime.ts`

### notes

- `notes.roleNotes`
- `notes.pitfalls`

来源：

- `readRoleRuntimeNotes(userDataPath, roleKey)`

本质上来自角色运行态笔记文件，不直接来自数据库表。

### summary.skillBindings

来源：

- `capabilitySnapshot.summary.availableSkillCount`

本质上来自：

- `syncRoleCapabilitySnapshot(...)`
- 运行态角色技能快照

不是数据库直接字段，而是运行态聚合结果。

### summary.mcpBindings

来源：

- `capabilitySnapshot.summary.runtimeMcpCount`

本质上来自：

- `syncRoleCapabilitySnapshot(...)`
- 运行态 MCP 聚合结果

也不是数据库直接字段，而是运行态聚合结果。

### summary.memories

来源 SQL：

```sql
SELECT COUNT(*) FROM user_memories WHERE agent_role_key = ? AND status = 'created'
```

当前直接依赖数据库表字段：

- `user_memories.agent_role_key`
- `user_memories.status`

## 后续核对清单

以后如果要查 “数据库字段和现役是否对得上”，优先核对这一组：

### Room 前端合同

- `roleRuntime.notes.roleNotes`
- `roleRuntime.notes.pitfalls`
- `roleRuntime.summary.skillBindings`
- `roleRuntime.summary.mcpBindings`
- `roleRuntime.summary.memories`

### role-runtime 路由输出合同

- `notes.roleNotes`
- `notes.pitfalls`
- `summary.skillBindings`
- `summary.mcpBindings`
- `summary.memories`

### 直接数据库依赖

- `user_memories.agent_role_key`
- `user_memories.status`

### 非数据库、但属于现役真相链的聚合来源

- `capabilitySnapshot.summary.availableSkillCount`
- `capabilitySnapshot.summary.runtimeMcpCount`
- `readRoleRuntimeNotes(...)`

## 当前结论

这次 Room 修复不是“全量接回主执行器”，而是先建立一个小字段合同。

只要后续这五个字段不漂移，`Room` 里的小家伙就能维持基本连续性和说话气质。

如果后面字段名、层级、统计口径有变化，必须同步修改：

- `src/renderer/services/room.ts`
- `src/renderer/services/skill.ts` 里的 `RoleRuntimePayload`
- `server/routes/roleRuntime.ts`
