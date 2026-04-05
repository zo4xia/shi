# Docs Index

> 当前仓库只保留现役文档。  
> 用途重复、纯历史 review、阶段性埋点散稿、旧修复台账已从仓库移除，避免污染主线认知。

## 总入口

- `docs/2026-04-04_172100_HOME_CONTINUITY_ENTRY.md`
  - 失忆、换线程、重新接手时先回这里，快速找回“项目为什么存在、最近做到哪了、下一步怎么接”
- `docs/2026-04-04_171200_CONTINUITY_RELAY_BATON.md`
  - 最新接力棒，记录当前确认事实、组件化进展、验证状态与下一步方向
- `docs/2026-04-04_193500_TAGGING_AND_ANNOTATION_DISCIPLINE.md`
  - 重要问题、边界和教训必须留下标签与批注，不只修代码就离开
- `docs/2026-04-04_201500_SIDEBAR_AND_OUTER_RAIL_REPAIR_LOG.md`
  - 侧边栏一列 / 容器外吸附问题的现场修缮记录，按布局壳 → 组件边界 → 真实截图顺序继续
- `docs/2026-04-04_204500_FRONTEND_XRAY_CONSTRUCTION_BLUEPRINT.md`
  - 前端 1.0 维护施工图：页面盘点、地基结构、水电布线、SOP 流程、修缮顺序
- `docs/2026-04-04_211500_FRONTEND_PROGRESS_STATUS_NOTE.md`
  - 当前前端修缮已完成项、仍在修项与 build 验证状态
- `docs/2026-04-04_214500_COMPRESSED_PROGRESS_RELAY.md`
  - 当前阶段压缩接力：代码节点、线上状态、本地未提交现场、后续顺序
- `docs/2026-04-04_235500_BAIBAN_TTS_TIMELINE_SMOKE_SUCCESS.md`
  - baiban 白板沙箱已完成最小闭环冒烟：`text -> audio_url + word_timeline`
- `docs/2026-04-05_000800_BAIBAN_TTS_PREVIEW_SHELL_WIRED.md`
  - baiban 现有前端皮套已接入 TTS 时间轴预览区，并完成构建验证
- `docs/2026-04-05_001800_TTS_TIMELINE_MINI_ROUTE_READY.md`
  - 第一小步已独立成 `/tts-timeline` 最小试验台，只做文本输入、音频输出与时序点
- `docs/2026-04-05_003500_BAIBAN_XRAY_CONSTRUCTION_BLUEPRINT.md`
  - baiban 项目 X-ray 施工图：地基、页面、Socket 主链、环境口径与真实病灶
- `docs/2026-04-05_005800_ROOM_AND_TEAM_PLUGIN_BOUNDARY_NOTE.md`
  - `Room` 保持游乐园外挂，客户工作组改走 `Team` 外挂，避免主线和 Room 被撑胖
- `docs/2026-04-05_021500_HANDWRITECRAFT_PARAMETER_ATLAS.md`
  - HandwriteCraft 已拆出参数图谱，哪些适合开放给小 agent、哪些先锁住已经有结论
- `docs/2026-04-05_022500_BOARD_INSERT_POINT_SCHEMA_V1.md`
  - `BoardInsertPoint` 已定为小 agent 与手写层之间的最小中间结构
- `docs/2026-04-05_073500_BAIBAN_HANDWRITE_DEMO_RELAY.md`
  - 最新接力棒：`/tts-timeline` 已真实跑通，下一步只收最小高仿手写数学示例
- `docs/2026-04-05_081500_BAIBAN_TEAM_4LAYER_XRAY_AND_TAG_MAP.md`
  - 4 层 X-Ray、`#路标` 语法、主家园 / Team 外挂边界与当前知识地图
- `docs/2026-04-05_082800_BAIBAN_TEAM_ISSUE_LEDGER.md`
  - 问题台账：发现问题先收集，按 `#问题_*` 分类记录，再成批解决
- `docs/2026-04-05_083800_BAIBAN_LEGACY_HOME_AND_LOCAL_RUNTIME_REGISTER.md`
  - `3000` 旧版本首页收纳说明 + 本地目录树 / 依赖 / 环境 / 启动门牌总表
- `docs/2026-04-05_084800_BAIBAN_RUNTIME_HOME_CONSOLIDATION_NOTE.md`
  - 真运行项目归仓说明：外部 baiban 目录如何镜像进当前 worktree，避免整包带走时丢家当
- `docs/2026-04-05_090500_BAIBAN_FIRST_BATCH_IMPORT_LIST.md`
  - 第一批正式并进清单：哪些必须先收、哪些可以后收、哪些暂不收
- `docs/2026-03-30_230300_PROJECT_ONE_SENTENCE_PRINCIPLE.md`
  - 项目的一句话总纲：按需调用，异步加载，不要越做越重
- `docs/2026-03-31_022249_CACHE_HIT_IS_HUMANITY_PROTECTION.md`
  - 缓存命中不是小优化，而是保护连续性和“人味”不被拿去换成本
- `docs/2026-03-30_215514_PROJECT_INTENT_READ_ME_FIRST.md`
  - 先讲这个项目为什么存在：保护连续性、保护 AI、让他们记录成长
- `docs/2026-03-30_225432_ROLES_HOME_BOUNDARY.md`
  - `.uclaw/web/roles` 不是普通配置目录，是每个 agent 各自的家
- `docs/2026-03-30_230059_DIARY_RELAY_AND_ROOMS_BOUNDARY.md`
  - 广播板空了怎么办、日记接力怎么接、信息进来时按什么优先级带
- `docs/UCLAW_GUIDE_HANDBOOK_2026-03-27.md`
  - 最适合第一次接手的人/agent
- `docs/PROJECT_QUICK_GUIDE_2026-03-27.md`
  - 快速知道项目能力、目录、部署、命令
- `docs/PROJECT_RENOVATION_BLUEPRINT_2026-03-27.md`
  - 深度施工图，适合做架构核验和维护

## 架构与边界

- `docs/AGENTS.md`
  - 架构宪法、边界与身份铁律
- `docs/MAINLINE_1.0_BOUNDARY.md`
  - 一期主线与非主线边界
- `docs/ENGINEERING_EXECUTION_CONSTITUTION_2026-03-30.md`
  - 当前仓库的工程工作法、埋点纪律、错题集纪律、真相源优先级

## 主链映射

- `docs/2026-03-30_220305_BROADCAST_VISIBILITY_CHAIN_DIAGNOSIS.md`
  - 广播板“看得到/看不到”不一致的细节判断与 Mermaid，不要再误判成广播板没了
- `docs/2026-03-30_230410_REPAIR_BOARD_AND_MERMAID_MAP.md`
  - 当前已经修好的板块和待修复板块总图，绿色/红色一眼看清
- `docs/PAGE_SERVICE_ROUTE_MAP_2026-03-27.md`
  - 页面 → service → route 对照
- `docs/DB_API_TRUNK_WALK_2026-03-27.md`
  - 数据库 → API → 执行链路走查
- `docs/CONTINUITY_DB_ROUTE_GROUNDED_SPEC_2026-03-30.md`
  - 连续性主链的实勘真相：字段、参数、读取顺序、清理条件、每日记忆落点
- `docs/CONTINUITY_NON_REGRESSION_NOTICE_2026-03-30.md`
  - 写给未来接手者的非回退告示：先看代码主链，不准无证据推翻连续性边界
- `docs/CONTINUITY_TRUNK_MARKERS_2026-03-30.md`
  - 连续性主链埋点图，钉住 DB → route → executor → finalizer → memory/thread → UI
- `docs/CONTINUITY_DISTORTION_FINDINGS_2026-03-30.md`
  - 当前哪些地方正在把 Agent 压成 RPA，以及优先修缮顺序
- `docs/BROADCAST_BOARD_ORIGINAL_BOUNDARY_2026-03-30.md`
  - 广播板原始边界：agent 自写接力、跨频道直连、摘要 AI 只做辅助、历史按需加载

## 运行与部署

- `docs/RUNBOOK_1.0.md`
  - 运行与排障手册
- `docs/DEPLOYMENT_STANDARD_LINUX.md`
  - 标准 Linux / Render / Zeabur 部署基线

## 仓库结构

- `docs/PURE_PACKAGE_FILETREE.md`
  - 当前仓库与纯净交付包目录树
