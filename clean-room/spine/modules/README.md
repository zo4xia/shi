# Modules

这里放已经从旧系统里切出来、可以单独复用的最小模块。

当前包含：
- `contracts.ts`：最小接口约定
- `requestTrace.ts`：请求追踪，方便定位“是谁触发的”
- `channelSessionBinding.ts`：频道到会话的绑定层
- `identityThreadHelper`：24h 白板现役真相 helper 以 `server/libs/identityThreadHelper.ts` 为准（clean-room 旧 helper 已退役）
- `feishuSessionSpine.ts`：飞书会话复用/创建主干
- `feishuRuntime.ts`：飞书 bot 运行时绑定与多应用合并
- `feishuText.ts`：飞书文本拆包、mention 清洗、回复提取
- `feishuDedup.ts`：飞书消息幂等去重
- `yesterdayFallback.ts`：白板为空时的昨日数据库回查
- `sessionIngress.ts`：统一的新建/续接入口准备层
- `sessionOrchestrator.ts`：把入口准备、连续性补偿、执行器调用收成一层
- `dailyMemorySpine.ts`：每日抽取“先写库、后清白板”的闭环骨架
- `dailyMemoryDbAdapter`：旧的每日抽取 DB 适配层已退役；现役主链以 `SKILLs/daily-memory-extraction` + `server/libs/identityThreadHelper.ts` 为准
- `dailyExtractorRole.ts`：从 `app_config.agentRoles` 选择每日摘要模型
- `time.ts`：兼容历史混合时间戳格式
- `dailySummaryPipeline.ts`：每日总结“先写持久层，再清白板”的门闩
- `feishuIngressAdapter.ts`：飞书 challenge/签名/tenant token/文本回复薄层

原则：
- 只保留主线必须逻辑
- 不把整个 `CoworkRunner` 一起拖进来
- 每个文件都要能说明自己的输入、输出、落库点

当前建议：
- 每日总结闭环优先用 `dailySummaryPipeline.ts` 做真实门闩；
- `dailyMemorySpine.ts` 保留为更轻的日志顺序骨架，后续可并入前者或删除其一。
