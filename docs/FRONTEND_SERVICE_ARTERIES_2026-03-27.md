# 前端服务动脉图（2026-03-27）

> 目标：把当前前端从组件调用到底层 HTTP / WS / localStore 的主链收成一张“动脉图”。
> 原则：只认现网代码，不按想象补层。

---

## 1. 总判断

当前前端服务层不是“很多平级服务随便调”。

它的真实结构更像：

1. **总兼容壳**：`window.electron`
2. **底层发包器**：`apiClient` + `webSocketClient`
3. **领域服务**：`coworkService` / `skillService` / `scheduledTaskService` / `mcpService`
4. **少数旁路**：`imService`、部分 `room.ts`

也就是说，真正的主干不是某个页面，而是：

- `src/renderer/services/electronShim.ts`
- `src/renderer/services/apiClient.ts`
- `src/renderer/services/webApiContract.ts`

---

## 2. 前端最粗主干

### 2.1 兼容壳入口

- 文件：`src/renderer/services/electronShim.ts`
- 角色：
  - 把 Web 前端继续伪装成 `window.electron.*`
  - 让旧调用面先不炸

这层不是“多余包装”，而是当前前端的主干稳定器。

结论：
- 现阶段不能局部拆壳
- 一旦局部直接改成 `fetch('/api/...')`，会让调用面裂开

### 2.2 HTTP 发包底座

- 文件：`src/renderer/services/apiClient.ts`
- 固定基座：`/api`

关键事实：
- 前端不会直接拿外部模型地址发请求
- 所有本地服务端请求都被统一拼成 `/api/*`

### 2.3 路径契约层

- 文件：`src/renderer/services/webApiContract.ts`
- 作用：
  - 定义 `cowork / tasks / api-config / store` 的路径规则
  - 定义 `cowork:*` 的 WS 事件名

结论：
- 前端核接口时，先看这份 contract
- 不要直接从页面字符串里猜

---

## 3. 各条业务动脉

### 3.1 Cowork

#### 主链

- 组件/页面
  - `CoworkView` / `App.tsx`
- 服务
  - `src/renderer/services/cowork.ts`
- 兼容壳
  - `window.electron.cowork.*`
- 真实落点
  - `src/renderer/services/electronShim.ts`
  - `server/routes/cowork.ts`

#### 真实调用类型

- HTTP：
  - 会话创建/继续/停止/列表/详情
  - config
  - memory entries/stats
  - permission respond
- WS：
  - `cowork:stream:message`
  - `cowork:stream:messageUpdate`
  - `cowork:stream:permission`
  - `cowork:stream:complete`
  - `cowork:stream:error`
  - `cowork:sessions:changed`

#### 结论

- `coworkService` 是前端最核心业务服务
- 但它自己并不直接发 `/api/*`
- 它主要消费 `window.electron.cowork.*`
- 真正 HTTP/WS 对接落在 `electronShim`

---

### 3.2 ScheduledTasks

#### 主链

- 服务：`src/renderer/services/scheduledTask.ts`
- 兼容壳：`window.electron.scheduledTasks.*`
- 落点：
  - `electronShim.ts`
  - `server/routes/scheduledTasks.ts`

#### 真实行为

- HTTP：
  - list / get / create / update / delete
  - toggle / run / stop
  - list runs / count runs / all runs
- WS：
  - `TASK_STATUS_UPDATE`
  - `TASK_RUN_UPDATE`

#### 结论

- 这条链相对干净
- 前端服务主要负责 Redux 同步，不太掺配置副作用

---

### 3.3 Skills

#### 主链

- 服务：`src/renderer/services/skill.ts`
- 兼容壳：
  - `window.electron.skills.*`
  - `window.electron.skillRoleConfigs.*`
- 落点：
  - `electronShim.ts`
  - `server/routes/skills.ts`
  - `server/routes/skillRoleConfigs.ts`
  - `server/routes/roleRuntime.ts`

#### 真实行为分两层

1. **技能仓库层**
   - list / enable / metadata / delete / download / import / marketplace
2. **角色绑定层**
   - list role configs
   - install / batch install
   - per-role config / secrets / runtime index / runtime snapshot

#### 结论

- 这条链不是单一路由
- 它横跨：
  - skills 仓库
  - role skill binding
  - role runtime view
- 如果后面做埋点，必须拆成这三层，不能只写“技能管理”

---

### 3.4 MCP

- 服务：`src/renderer/services/mcp.ts`
- 兼容壳：`window.electron.mcp.*`
- 落点：
  - `electronShim.ts`
  - `server/routes/mcp.ts`

结论：
- MCP 链本体不复杂
- 但它的副作用会影响 `role capability snapshot`

---

### 3.5 Config / Store

#### 本地配置主链

- `src/renderer/services/config.ts`
- 通过：
  - `localStore`
  - `window.electron.store`
  - 最终到 `/api/store/:key`

#### 真实关键 key

- `app_config`
- `im_config`

#### 结论

- `configService` 看起来像本地配置服务
- 但真正往下已经接到后端 `store` 路由和 SQLite
- 不是纯前端 localStorage

---

### 3.6 IM

这是目前最值得注意的“旁路”。

#### 主链

- 文件：`src/renderer/services/im.ts`

#### 真实行为

- 配置读写：
  - 先走 `localStore`
  - key: `im_config`
- 飞书网关控制：
  - 直接 `fetch('/api/im/feishu/gateway/status')`
  - 直接 `fetch('/api/im/feishu/gateway/start')`
  - 直接 `fetch('/api/im/feishu/gateway/stop')`

#### 结论

- IM 当前**不完全服从 `window.electron` 总兼容壳**
- 它是“localStore + 直 fetch 飞书路由”的混合结构
- 这就是它和 `cowork / skills / tasks` 最大的不一样

这点要特别记住：
- **飞书不要乱动**
- IM 链需要单独看，不能拿 `cowork` 那套去套

---

## 4. 当前前端服务层的真实分层

### 4.1 第一层：契约和发包底座

- `apiClient.ts`
- `webApiContract.ts`
- `webSocketClient.ts`

### 4.2 第二层：兼容壳聚合

- `electronShim.ts`

### 4.3 第三层：业务服务

- `cowork.ts`
- `scheduledTask.ts`
- `skill.ts`
- `mcp.ts`
- `config.ts`
- `im.ts`

### 4.4 第四层：页面消费

- `App.tsx`
- `Settings.tsx`
- `CoworkView.tsx`
- `ScheduledTasksView.tsx`
- `SkillsView.tsx`
- `McpView.tsx`

---

## 5. 当前最关键的认知更新

### 5.1 `window.electron` 不是 Electron 专属残影而已

在这个项目里，它现在是：

- Web 前端统一服务外形
- 兼容旧调用面
- 防止局部改造把前端 API 面撕裂

所以它不是“看到就删”的东西。

### 5.2 `imService` 是旁路

它不完全走 `electronShim`。

所以：
- 不能把 IM 的走法，当成全站统一模式
- 也不能反过来用全站模式去粗暴改 IM

### 5.3 `webApiContract.ts` 是前端侧真地图

如果以后继续埋点和对链，优先级建议：

1. `webApiContract.ts`
2. `electronShim.ts`
3. 对应 `server/routes/*.ts`
4. 页面组件

---

## 6. 下一步该怎么继续走

如果继续顺“动脉”往前推进，建议下一批只做这三件事：

1. 给 `electronShim.ts` 补模块级分叉路标
   - `store / cowork / tasks / skills / mcp / apiConfig`
2. 给 `cowork.ts / skill.ts / scheduledTask.ts / im.ts` 标“调用来源 → shim/API → route”
3. 出一份“页面 → 服务 → shim → route → store/db”对照表

这样就能把：

- 页面层的混乱感
- 服务层的兼容壳
- 后端 route 真相
- SQLite 落盘

真正钉成一条线。
