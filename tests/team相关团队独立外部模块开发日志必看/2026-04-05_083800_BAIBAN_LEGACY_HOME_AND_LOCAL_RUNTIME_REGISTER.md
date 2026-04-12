# baiban 旧版首页收纳与本地运行门牌总表

记录时间：2026-04-05 08:38:00

标签：

- `baiban`
- `旧版本保留`
- `3000首页`
- `本地门牌号`
- `目录树`
- `运行档案`

## 这份文档是干什么的

这份是给我们自己用的“门牌号总表”。

目的有两件：

1. 明确保留 `http://127.0.0.1:3000/` 这个旧版本首页  
2. 把本地运行需要的目录、依赖、环境、启动口径写清楚

以后找入口、起服务、接力，不再靠猜。

---

## 0. 先定一个判断

### `3000` 首页要保留

保留原因不是怀旧，而是它现在确实有价值：

- 简单
- 乖巧
- 有“讲解文本输入”
- 有“板书块输入”
- 有“大白板舞台”
- 有“板书块时间轴”
- 有“阿里云时间轴原始 JSON”

所以这页当前定位是：

```text
旧版本首页 / 白板验证台 / 可输入可观察的锚点页
```

它先不删，不并坏，不随便重写。

后面如果要融合能力，
优先做：

- 保留它
- 收纳它
- 把它的优势迁进 Team

而不是直接抹掉它。

---

## 1. 现役本地入口总表

### baiban 真运行项目根目录

- `C:\Users\Administrator\Desktop\baiban`

### 旧版本首页

- 地址：`http://127.0.0.1:3000/`
- 文件：`C:\Users\Administrator\Desktop\baiban\src\app\page.tsx`

### 最小 TTS 试验台

- 地址：`http://127.0.0.1:3000/tts-timeline`
- 文件：`C:\Users\Administrator\Desktop\baiban\src\app\tts-timeline\page.tsx`

### 音频代理接口

- 地址：`http://127.0.0.1:3000/api/tts-audio?source=...`
- 文件：`C:\Users\Administrator\Desktop\baiban\src\app\api\tts-audio\route.ts`

### 手写 / TTS Socket 微服务

- 地址：`http://127.0.0.1:3003`
- 文件：`C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service\index.ts`

### Team 单页外挂（独立 worktree）

- 地址：`http://127.0.0.1:5178/team.html`
- 文件：`D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\team\SingleTaskRunnerPage.tsx`

---

## 2. 目录结构树（收纳口径）

### baiban 根目录

```text
C:\Users\Administrator\Desktop\baiban
├─ src
│  ├─ app
│  │  ├─ page.tsx
│  │  ├─ tts-timeline
│  │  │  ├─ layout.tsx
│  │  │  └─ page.tsx
│  │  ├─ api
│  │  │  ├─ route.ts
│  │  │  └─ tts-audio
│  │  │     └─ route.ts
│  │  ├─ globals.css
│  │  └─ layout.tsx
│  ├─ components
│  │  └─ ui
│  └─ lib
│     ├─ baiban-demo-config.ts
│     ├─ baiban-demo-config.test.ts
│     ├─ tts-audio.ts
│     ├─ tts-audio.test.ts
│     └─ tts-timeline.ts
├─ mini-services
│  └─ handwriting-service
│     ├─ .env
│     ├─ package.json
│     ├─ index.ts
│     ├─ handwriting-service.log
│     └─ handwriting-service.err.log
├─ prisma
├─ public
├─ docs
├─ .zscripts
├─ next-dev.out.log
├─ next-dev.err.log
├─ package.json
└─ next.config.ts
```

### 文档接力仓

```text
D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\docs
├─ 2026-04-05_003500_BAIBAN_XRAY_CONSTRUCTION_BLUEPRINT.md
├─ 2026-04-05_021500_HANDWRITECRAFT_PARAMETER_ATLAS.md
├─ 2026-04-05_022500_BOARD_INSERT_POINT_SCHEMA_V1.md
├─ 2026-04-05_073500_BAIBAN_HANDWRITE_DEMO_RELAY.md
├─ 2026-04-05_081500_BAIBAN_TEAM_4LAYER_XRAY_AND_TAG_MAP.md
├─ 2026-04-05_082800_BAIBAN_TEAM_ISSUE_LEDGER.md
└─ DOCS_INDEX.md
```

---

## 3. 依赖口径

### baiban 前端主项目依赖特点

根 `package.json`：

- 前端框架：`next`
- UI：`radix + shadcn/ui + tailwind`
- 图标：`lucide-react`
- 实时：`socket.io-client`
- 数据层地基：`prisma`
- AI SDK：`z-ai-web-dev-sdk`

重点结论：

- 这是一个 `Next.js 16 + React 19` 前端皮套
- 当前业务主线不是 Prisma，不是 REST
- 现役主线是页面 + Socket 微服务

### handwriting-service 微服务依赖

`C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service\package.json`

核心依赖：

- `socket.io`
- `socket.io-client`
- `z-ai-web-dev-sdk`

脚本：

- `dev`: `bun --hot index.ts`

重点结论：

- 3003 服务是现役业务机房
- 它负责脚本生成 / 阿里云 TTS 时间轴 / Socket 回推

---

## 4. 环境变量口径

### 微服务现役依赖

最重要环境变量：

- `DASHSCOPE_API_KEY`
  - 给阿里云 TTS 时间轴链
- `ZAI_API_KEY`
  - 给旧 `generate-script`
- `ZAI_BASE_URL`
  - 给旧 `generate-script`

位置：

- `C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service\.env`

### 前端页本地记忆

浏览器本地会记住：

- 手写服务地址
- 语音阿里云 key
- 调整 agent 接口 / key / 模型
- 控制 agent 接口 / key / 模型
- 讲解文本
- 板书块

位置：

- 浏览器 `localStorage`
- key：`baiban-demo-config-v1`

代码：

- `C:\Users\Administrator\Desktop\baiban\src\lib\baiban-demo-config.ts`

---

## 5. 启动路口

### 启动前端

工作目录：

- `C:\Users\Administrator\Desktop\baiban`

命令：

```powershell
npm run dev
```

现役日志：

- `C:\Users\Administrator\Desktop\baiban\next-dev.out.log`
- `C:\Users\Administrator\Desktop\baiban\next-dev.err.log`

页面地址：

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/tts-timeline`

### 启动 3003 微服务

工作目录：

- `C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service`

命令：

```powershell
bun --hot index.ts
```

或：

```powershell
npm run dev
```

现役日志：

- `C:\Users\Administrator\Desktop\baiban\handwriting-service.log`
- `C:\Users\Administrator\Desktop\baiban\handwriting-service.err.log`
- `C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service\handwriting-service.out.log`
- `C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service\handwriting-service.err.log`

服务地址：

- `http://127.0.0.1:3003`

---

## 6. 详细门牌号

### 旧版本首页锚点

- 页面文件：`C:\Users\Administrator\Desktop\baiban\src\app\page.tsx`
- 定位：旧版本首页 / 白板验证台 / 简单但真能用

### 最小 TTS 验证锚点

- 页面文件：`C:\Users\Administrator\Desktop\baiban\src\app\tts-timeline\page.tsx`
- 定位：最干净的小闭环

### 本地预设锚点

- 文件：`C:\Users\Administrator\Desktop\baiban\src\lib\baiban-demo-config.ts`
- 定位：本地配置记忆总表

### 音频代理锚点

- 文件：`C:\Users\Administrator\Desktop\baiban\src\app\api\tts-audio\route.ts`
- 定位：远程音频转本地稳播放

### 3003 微服务锚点

- 文件：`C:\Users\Administrator\Desktop\baiban\mini-services\handwriting-service\index.ts`
- 定位：现役业务中继器

### Team 外挂锚点

- 文件：`D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\team\SingleTaskRunnerPage.tsx`
- 定位：客户业务外挂单页，不回主家园主壳

---

## 7. 当前我们怎么收纳它

### 3000 页

当前收纳口径：

- 保留
- 不删
- 不急着重写
- 视为旧版本首页
- 继续作为输入 / 观察 / 验证锚点

### Team 页

当前收纳口径：

- 作为外挂单页继续长
- 慢慢吸收 `3000` 页里最好用的能力
- 不反向拉主家园

### 文档仓

当前收纳口径：

- 这里是记忆和门牌图
- 不是主运行代码仓
- 但以后找回路，先看这里

---

## 8. 一句话收束

`3000` 首页先作为旧版本锚点收好。  
`baiban` 真运行项目的门牌、依赖、环境、启动口径已经写清。  
以后我们不是删历史，而是把历史收纳成可找回的入口。
