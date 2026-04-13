# 2026-04-13 skills 启动改为 list-only 记录

## 背景

夏夏明确提出一个更安全的方向：

- 启动时除了必要能力（小眼睛 / IMA / memory）之外
- 其他 skills 不要进入实际运行态
- 默认只保留“列表 / 门牌 / 索引可见”
- 真正用到某个 skill 的那一轮，再按需加载

这是为了：

- 降低 skills 抢跑风险
- 防止一个 skill 把整个 house 启动拖乱
- 让系统更和谐、更解耦

## 本次改动

### 1. getSkillManager 不再自动进入技能运行态

文件：

- `server/src/index.ts`

变化：

- 去掉 `initializeSkillManager(...)`
- 不再在 `getSkillManager()` 构造时自动：
  - `syncBundledSkillsToUserData()`
  - `startWatching()`

现在 `getSkillManager()` 只代表：

- 可以拿技能列表
- 可以拿索引
- 可以按需构建 selected skills prompt

但默认不代表：

- 已经同步 bundled runtime
- 已经启动 watcher
- 已经进入技能运行态

### 2. 飞书 / 微信桥接去掉对 skillManager 实体的直绑

文件：

- `server/libs/feishuGateway.ts`
- `server/libs/wechatbotGateway.ts`
- `server/src/index.ts`

变化：

- 桥接层不再接受 `skillManager` 实体依赖
- 只接受懒 `buildSelectedSkillsPrompt` 回调

结果：

- IM auto-start 不再因为传入 `skillManager` 实体而提前把技能运行态带起来
- 只在真要构建某轮 selected skill prompt 时，才会去碰技能列表

## 当前状态理解

现在更接近：

- 启动：skills = list-only
- 对话时：如果这轮用户真的选了某个 skill，再按需构建 prompt
- 需要安装 / 下载 / 监听 / 修复 runtime 时，再由明确技能入口触发

## 还没完全结束的地方

这次并不是把所有 skill 相关成本都彻底清零，只是收掉了最危险的“默认启动就进运行态”。

后面还要继续看：

- 哪些 route 会在普通请求里不必要地拿 skill 列表
- 哪些写操作才应该真正触发 watcher / runtime repair
- 是否需要把 runtime 激活单独做成显式函数，而不是散在 skillManager 内部方法里

## 当前判断

这一步已经把 skills 从“默认开机礼物”往“按需能力”推进了一大步。

对于 house 的止损意义很大：

- 不用 skill，也能稳启动
- IM / 小 agent 对话不会因为 skills 抢跑被拖慢
- 多 agent 场景下，一个 skill 出问题更不容易把整条主线一起带崩
