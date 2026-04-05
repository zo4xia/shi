# baiban 第一批正式并进清单

记录时间：2026-04-05 09:05:00

标签：

- `并进清单`
- `第一批`
- `归仓`
- `最小必需集合`
- `慢慢搬家`

## 这份清单是干什么的

现在边界已经切清楚了，
所以接下来不用整包硬搬，
而是按价值和必要性，
一批一批正式并进。

这份是第一批清单。

原则：

- 先收现役主干
- 先收真正会影响运行的东西
- 不把历史垃圾和运行垃圾一起拖进来

---

## 0. 当前状态

现在已经有一份镜像归仓在：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\local-homes\baiban-runtime`

所以这份清单不是“要不要保”，
而是：

```text
接下来哪些东西应该正式视为仓内第一批核心资产
```

---

## 1. 必须先收

这些是第一批最小必需集合。

没有它们，就谈不上真正掌控这条线。

### 根配置

- `package.json`
- `next.config.ts`
- `tsconfig.json`
- `next-env.d.ts`
- `postcss.config.mjs`
- `tailwind.config.ts`
- `eslint.config.mjs`
- `components.json`

### 前端主干

- `src/app/page.tsx`
  - `3000` 旧版本首页锚点
- `src/app/layout.tsx`
  - 根壳
- `src/app/globals.css`
  - 全局样式
- `src/app/tts-timeline/layout.tsx`
  - 最小试验台子壳
- `src/app/tts-timeline/page.tsx`
  - 现役最干净 TTS 主线
- `src/app/api/tts-audio/route.ts`
  - 音频代理口

### 前端核心 lib

- `src/lib/baiban-demo-config.ts`
- `src/lib/baiban-demo-config.test.ts`
- `src/lib/tts-audio.ts`
- `src/lib/tts-audio.test.ts`
- `src/lib/tts-timeline.ts`

### UI 依赖层

- `src/components/ui/*`

### 微服务主干

- `mini-services/handwriting-service/index.ts`
- `mini-services/handwriting-service/package.json`
- `mini-services/handwriting-service/.env` 的结构口径
  - 不是把密钥公开扩散
  - 而是把变量名和位置纳入收口范围

### 数据地基

- `prisma/*`

---

## 2. 可以后收

这些重要，但不一定非要现在第一批一起并。

### 文档与脚本

- `docs/*`
- `.zscripts/*`
- `worklog.md`
- `README.md`

### 静态资源

- `public/*`

### 其余 lib

- `src/lib/db.ts`
- `src/lib/utils.ts`

### 示例与实验产物

- `examples/*`

---

## 3. 暂时不收

这些现在不应该进入第一批正式并进范围。

### 运行垃圾

- `node_modules`
- `.next`
- `.playwright-cli`
- `*.log`
- `*.tmp`
- `*.tsbuildinfo`

### 临时运行目录

- `download`
- `upload`
- `db`

### 历史回声 / 非现役旧测试

凡是不服务于当前：

- `3000` 首页
- `/tts-timeline`
- `3003 handwriting-service`
- `Team 单页最小例子`

的旧测试、旧探针、旧临时产物，
先不要并进第一批主心骨。

这类东西先归到：

- 历史锚点
- 问题台账
- 旧版本保留区

而不是混进主干。

---

## 4. 第一批为什么这样排

因为现在真正要守住的主心骨是：

```text
前端页面壳
-> TTS 时间轴主线
-> 本地配置记忆
-> 音频代理
-> 3003 微服务
```

只要这一组被收稳，
后面：

- 演示
- 迁机
- U 盘带走
- 继续接力
- 再往 Team 融合

都不会完全失去抓手。

---

## 5. 下一步执行口径

第一批正式并进时，建议按这个顺序：

1. 根配置
2. `src/app`
3. `src/lib`
4. `src/components/ui`
5. `mini-services/handwriting-service`
6. `prisma`

每并一层，就做一次：

- 路标检查
- 启动检查
- 文档更新
- 问题登记

---

## 6. 一句话收束

第一批先收“能跑、能记、能接力”的骨架。  
其他东西以后再慢慢搬。  
先守主心骨，不让仓内资产继续发散。
