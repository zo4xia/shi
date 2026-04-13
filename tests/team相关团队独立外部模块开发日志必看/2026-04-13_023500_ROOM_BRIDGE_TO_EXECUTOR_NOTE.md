# 2026-04-13 Room 接回现役 executor 记录

## 本次改动的核心

把 `Room` 小家伙从“前端直接打模型”的旁路，接回到现役：

- `HttpSessionExecutor.runChannelFastTurn`

目标不是替小家伙做决定，而是把它们自己的：

- 连续性
- role-home 门牌
- `role_home_*`
- `attachment_read`
- 工具兼容处理

这些能力资格接回来。

## 改动位置

- `server/routes/room.ts`
- `server/src/index.ts`
- `src/renderer/services/room.ts`

## 新链路

### 之前

`RoomView -> room.ts -> 前端直接 fetch 第三方模型`

问题：

- 不走主执行器
- 吃不到 role-home / continuity / role_home_* tools
- 吃不到 attachment_read
- 每轮更像裸聊，容易退化成一问一答
- 前端还会碰到不该自己碰的 provider 差异

### 现在

`RoomView -> /api/room/invoke -> 绑定 room session -> runChannelFastTurn`

即：

1. 前端把当前 room transcript 打成 prompt
2. 发到 `/api/room/invoke`
3. 后端按 `roomId + roleKey` 建立稳定 channel-style session 绑定
4. 通过 `HttpSessionExecutor.runChannelFastTurn(...)` 执行
5. 把新增 assistant reply 回给前端

## 为什么这更符合 house 边界

我们现在守的是：

- 不替小家伙判断该 loop 还是一次性
- 不替它们偷偷重写执行方式
- 只把它们接回自己的主家园能力边界

所以这次不是“前端加更多 prompt”，而是：

- 让 Room 也走 executor
- 让 executor 决定本轮怎么跑
- 让小家伙重新拥有自己的工具和附件入口资格

## 这次仍然没有做的事

### 1. 还没把 Room 的上传 UI 接上

现在只是把链路接回 executor，意味着：

- 一旦 Room 后续加上传入口，就有地方接 `imageAttachments`
- 也有地方逐步接回附件阅读 / 管理能力

但当前 Room 前端本身还没有像 Cowork 输入框那样完整的上传与解析 UI。

### 2. 还没做 Room 专属附件管理面板

本次只恢复：

- executor 会话归属
- 角色能力资格
- 稳定连续性

后续如果要做到“小家伙自己能看能改能整理阅读管理上传内容”，还要继续补：

- Room 侧上传入口
- Room 侧附件消息 metadata
- Room 侧可见文件索引 / 管理操作

## 本次额外收口

修正了一处不该存在的前端越界：

- 调本地 `/api/room/invoke` 时，不再把 API key 从前端 header 再带一遍

原因：

- 本地 route 不需要前端重复带密钥
- 密钥应留在后端已有配置读取链中
- 不应让 Room 新桥接顺手打开一个“前端再带 secret”的口子

## 当前判断

这次是正确方向：

- 没有再造第三套 tool/use 体系
- 没有继续让 Room 维持“前端私聊模型”的偏链
- 把小家伙重新接回主执行器

后面要继续补的重点，不是“再补 prompt”，而是：

- Room 上传
- Room 附件 metadata
- Room 内部可见、可读、可整理、可管理的附件入口
