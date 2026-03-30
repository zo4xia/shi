# 定时任务通知与广播板可见性检查 2026-03-30

这份记录只写当前仓库里已经核到的事实，不写推测中的理想状态。

## 1. 定时任务执行成功但 IM 通知不可用

### 当前真实情况

前端和存储层都存在 `notifyPlatforms`：

- 前端类型：`src/renderer/types/scheduledTask.ts`
- 表单：`src/renderer/components/scheduledTasks/TaskForm.tsx`
- 存储：`src/main/scheduledTaskStore.ts`
- 数据表：`scheduled_tasks.notify_platforms_json`

也就是说：

- 用户可以选择通知平台
- 任务也会把通知平台写入数据库

### 真实断点

当前调度执行主链在：

- `src/main/libs/scheduler.ts`

核对结果：

- 调度器会：
  - 创建 run 记录
  - 启动任务
  - 更新 task state
  - 通过 WebSocket / Electron event 向前端广播 `scheduledTask:statusUpdate` / `scheduledTask:runUpdate`
- 但**没有看到任何真正消费 `notifyPlatforms` 的发送逻辑**
- 也没有看到“任务完成后按平台回调 IM”的实现

### 结论

`notifyPlatforms` 当前更像“已暴露但未接线的 UI/存储字段”。

这意味着：

- 用户能选
- 数据能存
- 但任务执行完成后不会真的走 IM 通知

### 稳定性建议

当前最稳的做法有两个：

1. **短期止血**
   - 把前端里的 IM 通知选项隐藏或标成未接线
   - 不让用户误以为“选了就会发”

2. **替代方案**
   - 改成任务完成后走 webhook push
   - 明确要求用户填写 webhook
   - 先只支持文本 payload

目前从稳定性角度看，**“前端隐藏 IM 通知入口 + 另起 webhook 完成回调能力”** 是更稳的路线。

### 当前已补的最小修复

- 表单页不再提供 IM 通知渠道选择
- 详情页明确提示 IM 通知未接线
- 新增 `completionWebhookUrl`
- 调度器任务完成后会发**文本版 webhook**
- 当前占位符支持：
  - `{{这里面是回调的文字内容}}`
  - `{{时间-日期}}`
  - `{{平台-成功或失败}}`
  - `{{任务名}}`
  - `{{状态}}`
  - `{{耗时毫秒}}`
  - `{{会话ID}}`
  - `{{错误}}`
- 企业微信机器人地址可直接填写，系统会按 `text` 消息协议 POST

### 已做止血

前端定时任务 UI 已改成：

- 表单页不再提供 IM 通知渠道下拉选择
- 详情页不再把 `notifyPlatforms` 展示成“会发送”的能力
- 改为明确提示：
  - 当前未接线
  - 已保存的平台配置暂时保留
  - 但当前版本不会实际发送

## 2. agent 对广播板可见性不一致

### 当前真实情况

运行时角色说明已经写明广播板规则：

- `.uclaw/web/roles/writer/notes/role-notes.md`
- `.uclaw/web/roles/organizer/notes/role-notes.md`
- 其他角色同理

其中明确写了：

- 先看广播板
- 再看最近 3 条正文
- 广播板为空时再回长期记忆

### 当前广播板真实数据

接口：

- `GET /api/cowork/memory/broadcast-boards`

当前可见结果：

- `organizer` 广播板有内容
- `writer` 广播板也有内容

说明：

- 广播板表 `identity_thread_24h` 不是空的
- 至少这两个角色的 24 小时板是有真实条目的

### 初步判断

“有的 agent 说看得到，有的说看不到”目前不能简单归因为广播板没写进去。

更可能是以下几类问题之一：

1. **运行路径不一致**
   - `HttpSessionExecutor` 会拼接 `resolveContinuityBootstrap(...)`
   - 但定时任务当前还保留 `CoworkRunner` 旧执行链
   - 不同执行器的提示装配可能不完全一致

2. **角色/渠道上下文不同**
   - 广播板按 `agentRoleKey` 分桶
   - 角色不同，本来就会看到不同板

3. **模型口径漂移**
   - 即使系统提示里给了广播板，模型仍可能口头说“看不到”
   - 这属于口径问题，不一定是数据没注入

### 当前结论

- 广播板数据本身并没有整体消失
- 运行时规则文档也并没有整体缺失
- 这个问题更像“不同执行链/不同口径”的一致性问题

## 3. 当前优先级建议

1. 先处理定时任务通知误导
   - 隐藏前端 IM 通知选项，或明确标注未接线

2. 再补 webhook 完成回调
   - 先做文本版

3. 再继续检查 `CoworkRunner` 与 `HttpSessionExecutor` 的广播板注入一致性
