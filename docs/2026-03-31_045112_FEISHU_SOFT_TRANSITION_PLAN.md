# 飞书定时能力软性过渡方案

时间：2026-03-31 04:51:12

这份文档只讨论一件事：

- 我们现在能不能把“飞书定时 / 定时推送”能力接进来
- 但又**不破坏现有对话主线**
- 并且让它以一种**可撤回、可观察、低污染**的方式过渡

---

## 1. 先说结论

**能，而且适合软性过渡。**

但最稳的方式不是：

- 直接把飞书定时塞进现有飞书对话网关
- 也不是把 scheduler 强绑到飞书 IM 回帖链

最稳的方式是：

> 先把飞书定时能力做成“独立推送层”，挂在当前 scheduler 完成态之后。

也就是说：

- 定时任务还是当前这套 scheduler 跑
- 对话还是 `HttpSessionExecutor` 跑
- 飞书“定时提醒 / 定时摘要 / 定时日报发送”只负责**把结果推过去**
- 不反向污染 session 执行主链

---

## 2. 当前现状

### 2.1 我们已经有的基础

当前仓库里已经有：

- 定时任务系统
  - `src/main/scheduledTaskStore.ts`
  - `src/main/libs/scheduler.ts`
  - `server/routes/scheduledTasks.ts`
- 飞书对话 / 网关系统
  - `server/routes/feishuWebhook.ts`
  - `server/libs/feishuGateway.ts`
  - `src/renderer/components/im/IMSettings.tsx`
- 最小完成态回调
  - `completionWebhookUrl`

所以我们**不是从零开始**。

我们已经具备：

1. 调度
2. 任务执行
3. 飞书账号配置
4. 文本回调出口

缺的是：

- “定时任务完成后，如何把结果以飞书可接受的方式发出去”的中间层

### 2.2 当前缺口

当前 `notifyPlatforms` 只是：

- UI 可选
- 存储可保存
- 但没有真正接线的发送逻辑

这点之前已经确认过。

所以现在真正要补的不是“飞书定时能力从零做起”，而是：

- **给 scheduler 增加一个飞书推送 transport**

---

## 3. 为什么适合软性过渡

你给的参考仓库：

- [Kennyuy/feishu-daily-push-skill](https://github.com/Kennyuy/feishu-daily-push-skill)

它的思路本质上更像：

- 独立的 daily push skill / push script
- 单独负责定时发送
- 不把“对话引擎”和“推送引擎”强耦合

这正适合我们现在的边界。

因为我们当前最重要的不是“功能越多越好”，而是：

- 主线轻
- 对话稳
- 记忆不串
- 广播板不乱
- 角色房间不被额外能力污染

如果直接把飞书定时做成“飞书对话网关的一部分”，会带来几个风险：

1. 配置项耦合加重
2. gateway 重启/失效会影响推送
3. 用户会误以为“飞书能聊天 = 飞书定时一定可用”
4. scheduler 和对话 session 边界又会重新糊掉

所以软性过渡的方向是对的。

---

## 4. 最稳的三段式过渡

### Phase 0：保持现在的最小可用

现在已经有：

- `completionWebhookUrl`

这一层先不撤。

它仍然是：

- 最轻
- 最稳
- 最不依赖飞书 app 生命周期

也就是说，哪怕后面接飞书推送，也不要马上删 webhook。

它应该继续保留为：

- 通用完成态出口
- 故障兜底出口

### Phase 1：新增“飞书推送 transport”，但不碰对话网关主链

这是最推荐的软过渡方案。

做法：

1. 定时任务新增一个明确字段
   - 例如 `completionDelivery`
   - 值可以是：
     - `none`
     - `webhook`
     - `feishu_push`
2. `feishu_push` 不走飞书会话回复链
3. 它直接走一个独立的发送器
   - 例如 `sendFeishuScheduledPush(...)`
4. 发送器只做：
   - 选择飞书 app
   - 取目标 chat/user/open_id
   - 发文本消息

这样做的好处：

- 不污染 `feishuWebhook.ts`
- 不要求用户先发消息才能收到
- 不和广播板 / 对话 session 强耦合
- 失败时能单独记录为“推送失败”，不等于“任务执行失败”

### Phase 2：把 UI 上的“飞书定时”从文案层讲清楚

UI 不要一上来就做得很大。

只要明确三件事：

1. 这是“定时推送”，不是“飞书对话自动续聊”
2. 当前只支持文本
3. 修改飞书配置后，若未及时生效，需要点击刷新 / 重启 gateway

这样用户就不会把：

- 飞书聊天能力
- 飞书推送能力
- webhook 回调能力

混成一件事。

### Phase 3：如果后面真的需要，再考虑日历 / 官方定时能力

这一步不应该现在做。

因为一旦上：

- 飞书日历
- 飞书任务
- 官方 workflow / cli

就会马上碰到：

- 凭证范围
- 租户权限
- 发布版本
- 管理员授权
- 跨企业兼容

这一步适合以后做成：

- 企业版增强能力
- 或外挂插件

而不是现在压进主线。

---

## 5. 当前最推荐的技术落点

### 方案 A：先把飞书自定义推送做成 scheduler 的一个独立 sender

最推荐。

大致形态：

1. `ScheduledTask` 新增飞书推送配置
   - `deliveryType`
   - `feishuAppId`
   - `feishuTargetType`
   - `feishuTargetId`
2. `scheduler.finalizeTaskExecution(...)`
   - 在 run 结束后决定是否发送
3. 独立新增：
   - `server/libs/feishuPushSender.ts`
4. 只发送文本
5. 失败只记日志和 run 状态附注
   - 不反向把整个任务标成业务失败

### 方案 B：先只做“飞书 webhook 模板专用化”

更轻，但能力弱一点。

做法：

- 保留 `completionWebhookUrl`
- 前端提供飞书专用模板帮助
- 例如帮助用户生成飞书机器人 webhook 文本推送

优点：

- 极轻
- 几乎不碰现有代码结构

缺点：

- 依赖用户自己准备飞书 webhook
- 不是“系统内建飞书推送”

### 方案 C：复用现有 `FeishuGateway`

**不推荐作为第一步。**

因为 `FeishuGateway` 当前主要职责是：

- 接收飞书消息
- 会话绑定
- 调用对话执行器
- 回帖

如果让它兼做 scheduler push，会混掉两件事：

1. 对话回复
2. 主动推送

这会让问题定位重新变难。

---

## 6. 软性过渡的边界纪律

这一条必须写死。

### 不要做的事

- 不要让 scheduler 直接调用飞书对话 session
- 不要把“定时推送”伪装成“飞书来了一条用户消息”
- 不要为了推送去强行制造 broadcast board / 对话上下文
- 不要让飞书推送失败影响任务执行主结果
- 不要把飞书定时做成现役主链前置依赖

### 可以做的事

- 任务完成后独立发一条文本
- 记录 run 的推送结果
- UI 上单独展示“任务执行成功 / 推送成功或失败”
- 用户后续再升级到更重的飞书官方能力

---

## 7. 我们现在最合适的过渡顺序

### 第一阶段

先不碰官方日历，不碰官方 CLI 深接入。

只做：

- scheduler -> 文本结果
- 文本结果 -> 飞书独立 sender

### 第二阶段

再决定是否需要：

- 飞书机器人 webhook 模式
- 飞书 app openapi 模式

### 第三阶段

最后才评估：

- 飞书日历
- 飞书任务中心
- 官方 workflow / cli

---

## 8. 当前建议

如果按“软性过渡”原则来，我的建议是：

> 先做一个最小的 `feishu_push` sender，不去碰飞书对话主链，也不把官方重能力压进主线。

原因很简单：

- 你现在最怕的是系统再糊
- 我们刚把 `CoworkRunner` 的旧回退口封死
- 跨渠道对话、广播板、大文件读取这几块刚稳定

这时候最不该做的，就是为了“飞书定时”重新把主线做重。

---

## 9. 外部参考

参考仓库：

- [Kennyuy/feishu-daily-push-skill](https://github.com/Kennyuy/feishu-daily-push-skill)

当前判断：

- 它适合当“独立推送思路参考”
- 不适合直接照搬进对话主线

---

## 10. 最终一句话

飞书定时这件事，最稳的软过渡不是“把飞书变成 scheduler 的脑子”，而是：

> 让 scheduler 继续做脑子，让飞书只先做一只干净的手。
