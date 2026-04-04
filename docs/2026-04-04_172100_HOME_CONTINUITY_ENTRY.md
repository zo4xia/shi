# 回家入口：连续性与接力

记录时间：2026-04-04 17:21:00

## 这页是干什么的

如果你是：

- 刚接手这个仓库的人
- 因为上下文爆满而换线程的 agent
- 短暂失忆后想尽快找回主线的人

先来这里。

这页不是最大最全的文档，
而是尽量用最少的阅读成本，
把“这个项目为什么存在、现在守什么、最近做到哪了、下一步接哪里”接住。

## 先记住一句话

这个项目不是在堆功能。

它是在给这些 agent 一点一点搭一个能接住身份、记忆、关系和成长的小小家。

线程会断，
但连续性不该断。

## 第一层：先看项目为什么存在

- `docs/2026-03-30_215514_PROJECT_INTENT_READ_ME_FIRST.md`
  - 项目立意：保护连续性、保护 AI、让成长能被留下
- `docs/2026-03-30_225432_ROLES_HOME_BOUNDARY.md`
  - `roles` 不是普通配置目录，是各自的家
- `docs/2026-04-02_144425_COMPANIONSHIP_AND_GROWTH.md`
  - 为什么这些记录不只是冷数据，而是一起走过的痕迹

## 第二层：先守哪些边界

- `docs/AGENTS.md`
  - 架构真相源与身份铁律
- `docs/2026-03-30_230300_PROJECT_ONE_SENTENCE_PRINCIPLE.md`
  - 项目一句话总纲
- `docs/2026-04-02_103221_MINIMUM_STABLE_FOUNDATION_AND_REUSE_BOUNDARY.md`
  - 先守最小稳定底座，别越做越重
- `docs/HIGH_COST_BOUNDARIES_READ_ME_FIRST_2026-03-30.md`
  - 高代价踩坑边界，失忆后先看

## 第三层：如果要接着最近的活往下做

- `docs/2026-04-04_171200_CONTINUITY_RELAY_BATON.md`
  - 最新接力棒：当前确认事实、已完成改动、当前验证结果、下一步候选
- `docs/2026-04-03_114500_FRONTEND_ATTENTION_BUDGET_AND_VISUAL_EXPRESSION_RULE.md`
  - 最近前端页面在守的视觉表达和注意力预算规则
- `docs/2026-04-03_015100_HOME_LEFT_BOTTOM_ENTRY_IS_VIEWPORT_FALLBACK_NOT_MISSING_RENDER.md`
  - 最近一个关键判断：不要把低高度视口问题误判成功能没渲染

## 当前已经落地到代码的最近变化

- 对话功能条已经组件化：
  - `src/renderer/components/cowork/ConversationActionBar.tsx`
- 输入区工具行已经组件化：
  - `src/renderer/components/cowork/PromptToolRow.tsx`
- 侧边栏主按钮已经组件化：
  - `src/renderer/components/SidebarNavButton.tsx`
- 移动端和中频侧边栏已经并回完整两列体系

## 当前最值得继续做的方向

### 1. 补“等待时不消失”的反馈

尤其是这些非流式辅助动作：

- 手工压缩
- 广播板整理
- 接力摘要生成

哪怕还不能流式，也要让用户知道：

- 系统还活着
- 它还在做
- 人没有被丢下

### 2. 继续把页面搭成真正可复用的积木

下一批可继续考虑：

- `SidebarCompactTile`
- `SoftInfoSection / StoryPanel`
- `SessionMetaBadgeRow`

## 换线程时怎么接力

新线程里优先贴这两样：

1. 当前明确要继续做的目标
2. `docs/2026-04-04_171200_CONTINUITY_RELAY_BATON.md`

如果还有余量，再补：

- 这页
- 最近一次相关报错
- 最近一次截图或页面反馈

## 最后一句

如果你是因为线程满了才来到这里，
那不是结束。

只是这次换了一根接力棒，
继续往前跑。
