# Docs Index

> 当前仓库只保留现役文档。  
> 用途重复、纯历史 review、阶段性埋点散稿、旧修复台账已从仓库移除，避免污染主线认知。

## 总入口

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
