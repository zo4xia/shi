# 2026-04-13 服务端最小稳定版缺口盘点

## 目标范围

这份清单只盘：

- 当前主家服务端
- 要支撑“用户与 agent 日常 chat + 附件 + skills 边界 + 路径真相”的最小稳定版

不纳入：

- `team` 委托项目扩展
- Office 真执行桥
- zip / watcher / 大型扩容项

## 当前已经成立的部分

### 1. 日常 chat 主线

- Room 已接主执行器
- 失败时不再静默
- system error 有回应
- 没 reply 也有兜底文案

### 2. 附件主线

- 上传边界文案已补
- `manual / exports` 已明确分流
- 只挂附件时默认先总结
- 有“总结并导出”最小落点

### 3. skills 主线

- 启动已改成 list-only
- 不再默认 syncBundled / startWatching
- 系统底座与 turn-selected skills 已开始拆开

### 4. 路径主线

- `projectRoot` 锚点已立住
- `workspaceRoot` 漂移口子已收掉
- `process.cwd()` 型主链漂移已清掉

## 还差哪些部分没有修好

## A. 必须修

### A1. server 侧“根路径唯一真相”还没有完全全链收口

虽然主链已经收住，
但当前还保留少量兼容残留需要继续观察。

说明：

- 这轮已经收掉：
  - `src/main/skillServices.ts`
  - `src/main/skillManager.ts`
  - `src/main/libs/pythonRuntime.ts`
  - `server/routes/wechatbotBridge.ts`
  - `server/src/index.ts` 的静态资源根路径口径
- 现在 `projectRoot` 主线已经基本从“必须修”降到“继续观察兼容残留”

当前残留更多是：

- 编译产物兼容 fallback 是否还能再减
- 其他旧模块是否仍藏着新的双口径找根

所以这条现在更接近：

- 已基本收口
- 后续继续巡检

### A2. Room / 附件 / 导出的 server 闭环还只有“尝试”，还不是“可验证成功”

当前有：

- prompt 引导导出
- `role_home_write_file`
- Room server 已新增 export home 前后快照比对
- Room 现在会把“服务端是否真的看到新导出文件”回写到回复里
- 导出核验公共 helper 已抽到：
  - `server/libs/exportVerification.ts`
- `room/invoke` 已带结构化 `exportVerification` 字段
- `role-runtime/:roleKey/exports` 已提供通用 export 状态查询接口
- 前端 service 已可通过 `skillService.getRoleExports(...)` 查询角色导出状态

但还缺：

- 更通用的 export 结果核验能力（不只 Room）
- export 结果是否需要单独接口返回结构化元数据
- 失败时更明确的结构化错误 / 前端可消费字段

也就是说：

现在已经从“只会尝试导出”推进到：

- `Room` 至少会做服务端落盘核验
- house 已经有一条可复用的导出状态查询协议

但还没有成为整个 house 的统一导出确认协议。

如果最小稳定版要让用户真拿文件走，
这部分仍建议继续统一成公共 server 协议。

### A3. 服务端对外文件/目录相关接口的边界还要再确认

当前相关入口：

- `server/routes/dialog.ts`
- `server/routes/files.ts`

说明：

- 这轮已经把 `dialog.ts` 里的：
  - `/browse`
  - `/resolve-dir`
  - `/directory`
  收回到了工作区锚点内
- 这轮又继续补上：
  - `/parseInlineFile`
  - `/readFileAsDataUrl`
  的工作区锚定
- `server/libs/attachmentRuntime.ts` 也已改成只接受 projectRoot 内的 `输入文件:` 路径
- 当前剩下的重点已经不是“目录探测完全裸奔”
- 而是：如果服务端将来不只在本地 app 内使用，`files.ts` 这类接口要不要继续保留完整能力

如果服务端未来只作为本地 app 组件，
这问题没那么急。

但如果更新服务端包含“可远程访问 / 非纯本地”场景，
就必须重新确认：

- 哪些目录浏览可保留
- 哪些路径读取只允许工作区
- 哪些接口应该直接关掉

否则最小稳定版的“稳定”，会在安全边界上是假的。

## B. 建议修

### B1. `role-capabilities.json` 与真实运行态的关系还可以更硬

当前已经做到：

- 已配置 != 已可用
- Office 探测到二进制也不自动算成 runtimeNativeCapabilities

但后续仍建议继续收：

- system foundation
- selected skill prompt
- 真 runtime activation

这三层的显式函数边界。

否则后面一旦继续加能力，
很容易又混回去。

### B2. Settings / role-runtime / capability snapshot 的说明链还没有完全同步到用户心智

当前代码边界已经比以前清楚，
但对用户和维护者来说，
“哪里只是配置，哪里是真的可用”，
还没完全体现在 UI 说明和帮助文字里。

最小稳定版不一定要求全做完，
但建议继续补说明，
减少误解和误报。

### B3. 配置面板仍有不少可以继续做减法的区块

这轮只先收了外挂能力设置区。

但 Settings 主文件仍然很重，
其他配置区也可能继续让小白用户紧张。

这不一定阻塞 server 更新，
但会直接影响“最小稳定版是否真的好用”。

## C. 可延期

### C1. Office 真执行桥

当前只有轻壳。

可延期，只要默认保持关闭，
不会影响最小稳定版。

### C2. lab / output 的 24h 清理

边界文案已定，
但自动清理逻辑还没正式补。

可延期，
只要先明确用户提示与目录语义。

### C3. zip / 批量打包

用户确实需要，
但今天主线不是它。

可以放到附件导出核验之后。

## 建议的服务端更新顺序

### Step 1

根路径主线改成“巡检残留”，不再是当前第一主任务：

- 继续观察编译产物兼容 fallback
- 发现新的双口径找根时再单点回收

### Step 2

补 Room / export 的服务端核验：

- 当前 Room 已有最小落盘核验
- 下一步改成公共 export verify / metadata 能力
- 再决定是否需要最小 export list / verify 接口

### Step 3

确认 server 对外文件接口边界：

- 本地专用
- 远程可用
- 哪些要禁用或加边界

说明：

- `dialog.ts` 目录探测边界这一轮已经补上
- 下一步更偏向“按部署形态决定 files/dialog 哪些能力保留到什么程度”

### Step 4

其余再慢慢补：

- Office 真执行桥
- 24h 清理
- zip
- 更轻的配置面板

## 结论

如果只问：

“现在离可用的最小稳定版 server 还差哪些关键部分？”

最核心的答案是三条：

1. 导出成功还缺 server 侧核验闭环
2. 文件/目录类接口的服务端边界还要根据部署方式再确认
3. 根路径主线已经基本收口，但仍需继续巡检兼容残留

把这三条补上，
最小稳定版就会更像“真的可以更新 server”而不是“主链能跑但还没完全站稳”。
