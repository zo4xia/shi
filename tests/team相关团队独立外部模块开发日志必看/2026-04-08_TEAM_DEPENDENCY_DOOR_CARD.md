# Team 依赖门口清单（2026-04-08）

记录时间：2026-04-08

标签：

- `Team`
- `门口清单`
- `依赖清单`
- `先看这个`

## 这份清单是挂在门口的

以后谁要：

- 跑 `team`
- 拆 `team`
- 单独部署 `team`
- 给客户演示 `team`

先看这页。

它只回答一件事：

```text
当前 team 还依赖主服务端什么。
```

---

## 1. 当前 `team` 的入口

### 前端入口

- `team.html`
- `src/renderer/team-main.tsx`

### 服务端入口映射

文件：

- `server/src/index.ts`

当前路由：

- `/team`
- `/test`

这两个现在都会直接回：

- `team.html`

所以当前口径是：

```text
team 还挂在主服务端壳上，不是完全独立站点。
```

---

## 2. 当前 `team` 真实依赖的主服务端能力

### 2.1 音频代理接口

文件：

- `src/renderer/components/team/SingleTaskRunnerPage.tsx`

当前直接依赖：

- `/api/tts-audio?source=team-demo`

来源：

- `seatConfig.A.baseUrl` 被拼成：
  - `${seatConfig.A.baseUrl}/api/tts-audio?source=team-demo`

说明：

- 这代表 `team` 当前不是完全自管音频链
- 它仍然借主服务端的音频代理接口

### 2.2 静态资源目录

文件：

- `public/team-assets/*`

当前资源：

- `board-288-combined.png`
- `board-300-170.png`
- `board-418-118-170.png`
- `board-418-170-118.png`
- `fastline-demo.png`

说明：

- 这些资源虽然属于 `team`
- 但目前还是放在主应用 `public/` 下面

### 2.3 全局样式底座

文件：

- `src/renderer/index.css`
- `src/renderer/components/team/team.css`

说明：

- `team` 自己的画布和板书样式已经收进 `team.css`
- 但仍然共享主应用的 `index.css` 基础壳层样式

这不是问题，
但要记住：

```text
team 样式已部分独立，尚未完全脱离全局底座。
```

---

## 3. 当前 `team` 已经独立出来的部分

- 入口壳：`team.html`
- 挂载入口：`team-main.tsx`
- 默认配置：`teamRuntimeConfig.ts`
- demo/runtime 辅助：`teamDemoRuntime.ts`
- 类型层：`teamRuntime.ts`
- 运行时转换层：`handwriteAdapter.ts`
- 自己的画布样式层：`team.css`

所以当前判断是：

```text
team 已经开始独立，
但还没有完全摆脱主服务端和公共资源层。
```

---

## 4. 当前不要误判的地方

### 不要误判 1

`team` 不是纯静态页。

原因：

- 它还会拼 `/api/tts-audio`

### 不要误判 2

`team` 不是已经完全独立部署的站。

原因：

- `/team` 和 `/test` 还是主服务端映射出来的

### 不要误判 3

`team` 也不是完全糊在主家园里的散页。

原因：

- 它已经有自己的入口、配置、类型、runtime 辅助、样式层

---

## 5. 后面如果继续拆，优先顺序

1. 写清 `team` 依赖哪些主服务端 API
2. 再决定这些 API 要不要继续借主壳，还是做 `team` 自己的 service 层
3. 再看 `public/team-assets` 是否要继续留在公共资源层
4. 最后才考虑完全独立部署

---

## 6. 一句话收束

当前 `team` 的状态最准确的说法是：

```text
入口、配置、类型、runtime、样式已经开始独立，
但服务端接口和资源层还部分借主壳。
```
