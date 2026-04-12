# 当前阶段小结与新仓准备清单

记录时间：2026-04-06 05:25:00

标签：

- `阶段小结`
- `存储`
- `新仓准备`
- `现在该推什么`
- `上下文保护`

## 1. 当前阶段小结

这一步我们已经不再是“探索期”，
而是到了一个很明确的阶段成果点：

### 已经做成的

- `baiban-sandbox` 已经从文档仓，推进成可收编的工作区
- 真运行家当已镜像归仓
- 第一批主心骨已正式并进
- `3000` 页旧版本首页已被收纳，不再只是散落旧现场
- `3003` 微服务能单独起来
- `3010` sandbox 首页主按钮链已经打通一轮
- Team 单页已能接入快线手写图
- 快线 `imageUrl + reveal` 链已经跑起来
- `AgentB` 负责 reveal 分段的思路已经写定
- “素材轴 / Timeline Asset” 的统一原理已经立住

### 当前最重要的主线

```text
我们在把 AI 从“会出内容”，推进成“会控时间轴”。
```

## 2. 为什么现在适合先存储

因为这一步已经有很多“不能再只靠聊天记”的东西：

- 关键判断
- 可运行链
- 小窍门
- 画布规格
- 快线 / 深线策略
- 问题台账
- 归仓脚本
- 第一批并进清单

如果不先收住，
后面继续冲的时候很容易把这些阶段性成果冲散。

## 3. 新仓准备清单

### 满足方向

- 已经是独立外挂项目雏形
- 已有自己的入口、边界、文档、素材链、运行链

### 仍需收口

- `baiban-sandbox` 根还混有运行垃圾
- `.next`
- `.playwright-cli`
- 各种 `*.log`
- 旧 `postcss.config.js`
- 旧 `tailwind.config.js`

### 开新 GitHub 仓库前最小条件

1. 清掉运行垃圾
2. 补好 `.gitignore`
3. 明确保留：
   - 文档
   - 第一批核心代码
   - `text-to-handwriting-master`
   - `public/team-assets`
4. 明确不推：
   - `.next`
   - `.playwright-cli`
   - `node_modules`
   - `*.log`
   - 本机密钥 / 真 `.env`
5. 写一份最小 README

## 4. 现在该怎么存

### `baiban-sandbox`

建议现在存这些：

- `docs/*`
- `scripts/sync-baiban-runtime-into-worktree.ps1`
- `src/app/*`
- `src/lib/*`
- `src/hooks/*`
- `src/components/ui/*`
- `mini-services/handwriting-service/*`
  - 但不包含真实密钥
- `prisma/*`
- `text-to-handwriting-master/*`

### `team-single-page-sandbox`

建议现在存这些：

- `src/renderer/components/team/*`
- `src/renderer/lib/handwriteAdapter.ts`
- `src/renderer/mock/teamTask.example.json`
- `src/renderer/types/teamRuntime.ts`
- `tests/web/teamRuntime.test.ts`
- `public/team-assets/*`
- `team.html`
- `src/renderer/team-main.tsx`

## 5. 暂时不要存

### `baiban-sandbox`

- `.next`
- `.playwright-cli`
- `baiban-sandbox-next*.log`
- `sandbox-handwriting-service*.log`
- `node_modules`
- 真 `.env`

### `team-single-page-sandbox`

- `team-single-5178*.log`
- `node_modules`

## 6. 一句话收束

现在最适合做的不是再多冲一轮，
而是：

**先把这一步的成果收住，再继续长。**
