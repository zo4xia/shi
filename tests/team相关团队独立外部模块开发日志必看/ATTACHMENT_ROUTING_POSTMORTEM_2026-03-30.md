# 附件分片路由事故复盘 2026-03-30

这份记录只写已经在当前仓库里真实发生、真实定位、真实修过的内容，不写想象中的设计。

## 1. 事故现象

用户上传大文本后，前端会先切成多个分片，例如：

- `xxx.part-01-of-05.txt`
- `xxx.part-02-of-05.txt`
- `...`

用户随后观察到两类异常：

1. agent 只能看到第一片，或看起来只读了前两个源文件
2. 过程信息里出现：
   - `browser_observe_page`
   - 参数里带的是本地分片文件路径
   - 结果是 `小眼睛暂时没有观察到有效结果。`

这说明故障不在“模型读不读”，而在“分片文件被怎么保存、怎么挂载、怎么被路由到工具”。

## 2. 根因拆解

### 2.1 第一层根因：分片文件保存目录链不稳定

真实链路：

- 前端：`src/renderer/components/cowork/CoworkPromptInput.tsx`
- 保存接口：`window.electron.dialog.saveInlineFile(...)`
- 后端路由：`server/routes/dialog.ts`

原先的问题：

- `saveInlineFile` 后端在选目录时，优先只信前端透传的 `cwd`
- 如果前端这次没有稳定传入 `cwd`，后端就会退回：
  - 会话缓存目录
  - 或最终兜底到 `userDataPath`
- 结果是同一类分片，有时落到：
  - `项目根/.cowork-temp/attachments/manual`
  - 有时却落到：
  - `.uclaw/web/attachments`

这会导致后续回合里，分片虽然真实存在，但不一定稳定挂在当前工作目录上下文里。

### 2.2 第二层根因：旧附件内联链有硬上限

文件：`server/libs/httpSessionExecutor.ts`

旧链路里有这些真实硬边界：

- `MAX_PARSED_ATTACHMENT_COUNT = 4`
- `MAX_PARSED_ATTACHMENT_TOTAL_CHARS = 24000`
- `MAX_PARSED_ATTACHMENT_BYTES = 20MB`

如果一个源文件被拆成 2 片，那么 2 个源文件就已经占满 4 个附件槽位。  
这就是“看起来只读前两个”的真实来源之一。

### 2.3 第三层根因：分片路径被误路由到浏览器观察工具

文件：

- `server/libs/httpSessionExecutor.ts`
- `src/shared/nativeCapabilities/browserEyesAddon.ts`

真实问题：

- `browser_observe_page` 允许接受 `file_path`
- organizer + 小眼睛链路会优先鼓励“先看页面/文件”
- 本地文本分片路径与 HTML 文件路径，在模型视角里混成同类目标

结果：

- 分片文件路径虽然是对的
- 但被误交给了 `browser_observe_page`
- 于是出现：
  - 参数是本地分片路径
  - 执行结果却是“小眼睛暂时没有观察到有效结果”

## 3. 真实牵涉的模块

### 前端

- `src/renderer/components/cowork/CoworkPromptInput.tsx`
  - 大文本分片
  - 结构化文档解析后再拆分
  - 附件路径组装进 prompt

- `src/renderer/utils/textFileChunking.ts`
  - 文本分片规则
  - 最大分片数量

- `src/renderer/components/cowork/sessionDetailHelpers.ts`
  - 工具输入摘要显示
  - 读取进度摘要显示

### 后端 / 执行器

- `server/routes/dialog.ts`
  - `saveInlineFile`
  - `parseInlineFile`
  - 对话文件保存目录选择链

- `server/libs/httpSessionExecutor.ts`
  - 附件内联
  - bounded tool loop
  - 工具列表生成
  - Browser Eyes 预读链

- `server/libs/attachmentRuntime.ts`
  - 附件索引
  - `attachment_manifest`
  - `attachment_read`

- `src/shared/nativeCapabilities/browserEyesAddon.ts`
  - `browser_observe_page`
  - 浏览器观察意图判断

### 配置真相源

- `GET /api/cowork/config`
  - `workingDirectory`

- `GET /api/store/app_config`
  - `conversationFileCache.directory`

## 4. 关联影响

这次事故会连带影响以下面：

1. 用户感知
   - 误以为 agent 不阅读
   - 误以为模型装作看过

2. 工具透明度
   - 过程信息虽然可见，但如果工具选错，会让用户更不信任系统

3. 连续性成本
   - 分片没稳定进入当前回合，就会让后续“接着读下一片”变得脆弱

4. 角色可信度
   - 用户会觉得角色工具边界漂了
   - 甚至误判成“广播板/记忆链乱了”

注意：  
这次事故**没有直接改坏**广播板、长期记忆、最近 3 条正文这条连续性主链。  
它主要是“附件保存 + 挂载 + 工具路由”三者交叉产生的执行事故。

## 5. 已做修复

### 5.1 抽出附件运行时与附件工具面

新增：

- `src/shared/attachmentChunkMetadata.ts`
- `server/libs/attachmentRuntime.ts`

作用：

- 统一识别分片文件
- 构造附件 manifest
- 提供 `attachment_read`

### 5.2 分片/多文件不再默认全文内联

文件：`server/libs/httpSessionExecutor.ts`

新边界：

- 普通少量附件：保留小文件直接解析内联
- 分片附件或多文件：优先给 manifest，提示按需读取

### 5.3 保存目录真相源修正

文件：`server/routes/dialog.ts`

现在目录优先级：

1. 前端显式 `cwd`
2. `coworkConfig.workingDirectory`
3. `workspaceRoot`
4. `conversationFileCache.directory`
5. 最后才退回 `userDataPath`

这一步是为了避免分片再掉进 `.uclaw/web/attachments` 这种黑箱兜底目录。

### 5.4 Browser Eyes 对附件任务退让

文件：

- `server/libs/httpSessionExecutor.ts`
- `src/shared/nativeCapabilities/browserEyesAddon.ts`

修复：

- 只要当前消息里带 `输入文件:`
- 就不再触发小眼睛预读
- 也不再把这些附件路径识别成页面观察目标

## 6. 实测结论

### 6.1 保存目录修复后的实测

用户将对话文件目录设为：

- `D:\\Users\\Admin\\Desktop\\3-main\\delivery-mainline-1.0-clean\\uploud`

随后重新上传分片文件，实测看到新分片真实落在：

- `uploud/attachments/manual/...`

说明：

- 保存目录选择链已经开始按用户设置目录工作

### 6.2 成功结论

- 分片文件存在
- 分片文件夹存在
- 路径正确
- 当前真正要守的是：
  - 不让附件任务误走网页观察工具
  - 让附件读取链稳定接管

## 7. 现在必须记住的注意事项

1. 不要再把“看不到附件”简单归因成模型不读
   - 先查：
     - 文件有没有落盘
     - 路径是不是对的
     - 当前回合挂载了哪几片
     - 工具是否选错

2. 附件分片不是网页
   - 本地文本分片路径不能再交给 `browser_observe_page`

3. 对话文件保存目录是动态配置线
   - 不能只信前端参数
   - 后端必须从当前会话配置兜底

4. 如果用户没有显式设置目录
   - 默认应回到**项目根目录相对路径**下的 `uploud`
   - 部署到服务器也必须守这个相对根约束

5. 降本不能靠“捂嘴”
   - 这次问题已经再次证明：
   - 真正要做的是状态透明、工具路由正确、按需读取

## 8. 后续仍需继续做的

1. 把附件读取进度显式展示到前端
   - 当前读到 `x/y`
   - 哪片完成了
   - 是否还在继续

2. 让飞书侧同步看到同样的读取状态

3. 把附件工具是否真正进入当前回合工具列表，做成更容易诊断的日志

4. 最终提交并备份这轮修复
