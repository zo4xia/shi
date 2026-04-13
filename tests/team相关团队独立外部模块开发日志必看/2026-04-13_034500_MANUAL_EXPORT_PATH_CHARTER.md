# 2026-04-13 manual / exports 固定分流章程

## 结论

这条必须长期固定：

- input / attachment -> `manual`
- output / export -> `exports`

不能混写。
不能一会儿同目录，一会儿漂移到别的临时目录。
不能因为某次实现方便，就把导出结果继续塞回附件输入区。

## 为什么必须现在定死

如果这条不固定，后面一定会越来越难搞：

- 小 agent 不知道哪里是用户给它看的输入
- 小 agent 不知道哪里是自己产出的结果
- 后续做总结、改写、二次整理、导出、打包时，目录语义会越来越乱
- review 时也会很难判断“这是输入材料还是输出结果”

## 当前固定口径

### 有 conversationFileCache.directory 时

每个角色固定：

- `.../<role>/manual`
- `.../<role>/exports`

### 没有 conversationFileCache.directory 时

退回工作目录固定：

- `.../.cowork-temp/attachments/manual`
- `.../.cowork-temp/attachments/exports`

## 家园语义

### manual

放：

- 用户上传给小 agent 的附件
- 本轮需要阅读、解析、整理的输入材料

不放：

- 最终交付结果
- 导出的 markdown / txt / json / 文档结果

### exports

放：

- 小 agent 产出的最终结果
- 总结稿
- 导出文档
- 后续需要给用户拿走的结果文件

不放：

- 原始输入附件

## 执行要求

以后做附件相关改动，都先问：

1. 这是输入还是输出？
2. 如果是输入，是否进入 `manual`？
3. 如果是输出，是否进入 `exports`？
4. 有没有出现“图省事混写”的行为？

## 当前状态

这条在代码里已经开始收口，但更重要的是：

从今天起，它是 house 的固定边界，不是临时实现细节。
