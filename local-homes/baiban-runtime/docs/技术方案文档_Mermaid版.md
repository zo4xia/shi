# 智能手写教学白板系统 - 技术方案文档 (Mermaid版)

> 本文档使用 Mermaid 图表语法，适合在 GitHub、GitLab、Typora 等支持 Mermaid 的平台查看

## 一、项目概述

### 1.1 项目背景
传统教学视频制作需要教师手动录制板书讲解，存在以下痛点：
- 录制成本高：需要专业设备和后期剪辑
- 内容固化：已录制视频难以修改
- 个性化不足：无法根据学生需求调整讲解方式
- 效率低下：一道题需要反复录制多遍

### 1.2 解决方案
开发一套**智能手写教学白板系统**，通过AI自动生成解题步骤和讲解语音，Canvas实现逐笔手写动画，语音和板书实时同步播放。

---

## 二、系统架构

### 2.1 整体架构图

```mermaid
flowchart TB
    subgraph UI["用户界面层 (Next.js 16)"]
        A1[题目输入]
        A2[播放控制]
        A3[Canvas手写画布]
        A4[API配置]
        A5[时间轴面板]
        A6[Agent状态面板]
    end
    
    subgraph Service["业务服务层 (Bun.js :3003)"]
        B1[剧本生成器]
        B2[语音合成器]
        B3[WebSocket服务]
        
        B1 --> |生成剧本| B2
        B2 --> |返回音频| B3
    end
    
    subgraph AI["AI能力层"]
        C1[LLM 大语言模型]
        C2[TTS 语音合成]
    end
    
    A1 -->|提交题目| B3
    A4 -->|配置API| B3
    B3 -->|WebSocket| UI
    B3 -->|请求| C1
    B3 -->|请求| C2
    C1 -->|剧本内容| B1
    C2 -->|音频数据| B2
```

### 2.2 技术栈选型

| 层级 | 技术选型 | 选型理由 |
|------|----------|----------|
| 前端框架 | Next.js 16 + React 19 | 企业级框架，支持SSR，生态完善 |
| UI组件库 | shadcn/ui + Tailwind CSS | 高度可定制，现代化设计 |
| 后端运行时 | Bun.js | 高性能，原生支持TypeScript |
| 实时通信 | Socket.io | 成熟的WebSocket方案，自动重连 |
| AI SDK | z-ai-web-dev-sdk | 统一的AI能力接入，支持LLM+TTS |
| 绘图引擎 | Canvas 2D API | 原生支持，性能优秀，可控性强 |

---

## 三、核心设计

### 3.1 三Agent协作模型

本系统的核心创新点在于**三Agent协作模型**，模拟真实教学场景中的三个角色：

```mermaid
flowchart LR
    subgraph AgentC["Agent C - 导演"]
        C1[时间轴监控]
        C2[打点触发]
        C3[节奏控制]
    end
    
    subgraph AgentA["Agent A - 板书员"]
        A1[文字书写]
        A2[图形绘制]
        A3[手绘风格]
    end
    
    subgraph AgentB["Agent B - 播音员"]
        B1[音频播放]
        B2[进度回调]
        B3[状态管理]
    end
    
    AgentB -->|同步进度| AgentC
    AgentC -->|触发事件| AgentA
    
    style AgentC fill:#f3e5f5
    style AgentA fill:#e3f2fd
    style AgentB fill:#e8f5e9
```

**Agent职责说明：**

```mermaid
mindmap
  root((三Agent协作))
    Agent C 导演
      监听音频播放进度
      根据时间轴触发事件
      协调A和B配合
      状态: 监控中/已完成
    Agent A 板书员
      文字逐笔书写
      手绘坐标系
      函数曲线绘制
      状态: 书写中/绑图中
    Agent B 播音员
      音频播放控制
      进度回调通知
      播放状态管理
      状态: 播放中/已暂停
```

**设计理由：**
1. **关注点分离**：每个Agent只负责一件事，便于维护和扩展
2. **状态可观测**：各Agent状态独立，便于调试和展示
3. **灵活协作**：通过事件驱动，可实现复杂的协作逻辑

### 3.2 时间轴同步方案

**核心挑战**：如何让板书和语音同步？

```mermaid
flowchart TD
    subgraph 方案A["方案A ❌ 不可行"]
        A1[板书写完] --> A2[计算时长]
        A2 --> A3[生成语音]
    end
    
    subgraph 方案B["方案B ❌ 不可行"]
        B1[生成语音] --> B2[强制板书速度匹配]
        B2 --> B3[书写不自然]
    end
    
    subgraph 方案C["方案C ✅ 采用"]
        C1[生成语音] --> C2[获取精确时长]
        C2 --> C3[计算打点时间]
        C3 --> C4[触发板书事件]
    end
    
    方案A -.->|问题:时长不可预测| 方案B
    方案B -.->|问题:体验差| 方案C
```

**实现原理**：

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant B as 后端
    participant LLM as LLM
    participant TTS as TTS
    
    U->>F: 输入题目
    F->>B: WebSocket请求
    B->>LLM: 分析题目生成剧本
    LLM-->>B: 返回JSON剧本
    B->>TTS: 合成讲解语音
    TTS-->>B: 返回音频+时长
    B->>B: 计算打点时间
    B-->>F: 返回完整剧本
    
    Note over F: 用户点击播放
    F->>F: AgentB播放音频
    F->>F: AgentC监控进度
    loop 每100ms
        F->>F: 检查是否到达打点时间
        F->>F: AgentA执行板书
    end
```

**同步原则**：
> **"大差不差，内容对应即可"** —— 不强求精确对齐，保证内容逻辑正确即可

### 3.3 分题型处理策略

系统自动识别题目类型，采用不同的渲染策略：

```mermaid
flowchart TD
    A[输入题目] --> B{LLM判断类型}
    B -->|计算题/方程| C[纯文本型]
    B -->|函数/几何| D[画图型]
    
    subgraph 纯文本型
        C --> C1[全屏文字板书]
        C1 --> C2[逐行书写]
    end
    
    subgraph 画图型
        D --> D1[左侧文字区]
        D --> D2[右侧图形区]
        D1 --> D3[步骤说明]
        D2 --> D4[坐标系+函数]
    end
```

**布局示意**：

```mermaid
flowchart LR
    subgraph 纯文本型["纯文本型布局"]
        T1["┌─────────────────┐"]
        T2["│ 解：设x为未知数  │"]
        T3["│ 2x + 3 = 7      │"]
        T4["│ x = 2           │"]
        T5["└─────────────────┘"]
    end
    
    subgraph 画图型["画图型布局"]
        G1["文字区域"] --- G2["图形区域 (坐标系)"]
    end
```

### 3.4 手绘风格实现

**设计目标**：让板书看起来像真人手写，而非机械打印。

```mermaid
flowchart LR
    A[原始线条] --> B[添加随机抖动]
    B --> C[贝塞尔曲线插值]
    C --> D[模拟压感变化]
    D --> E[随机重复描边]
    E --> F[手绘效果]
    
    style A fill:#fff
    style F fill:#e8f5e9
```

**实现技术**：
1. **线条抖动**：随机偏移使线条不完美
2. **重复描边**：模拟手写时的重复描画
3. **压感模拟**：笔画粗细随位置变化
4. **自然曲线**：使用贝塞尔曲线插值

---

## 四、核心功能模块

### 4.1 剧本生成模块

```mermaid
flowchart TD
    A[输入题目] --> B[LLM分析]
    B --> C{判断题型}
    C -->|计算题| D1[生成文字板书剧本]
    C -->|画图题| D2[生成图文混合剧本]
    D1 --> E[拼接讲解文本]
    D2 --> E
    E --> F[TTS语音合成]
    F --> G[计算打点时间]
    G --> H[返回完整剧本]
    
    style A fill:#e3f2fd
    style H fill:#e8f5e9
```

### 4.2 实时同步播放模块

```mermaid
stateDiagram-v2
    [*] --> 待命
    待命 --> 播放中: 点击播放
    播放中 --> 已暂停: 点击暂停
    已暂停 --> 播放中: 继续播放
    播放中 --> 已完成: 播放结束
    已完成 --> 待命: 重置
    播放中 --> 待命: 停止
```

### 4.3 Agent状态流转

```mermaid
stateDiagram-v2
    state AgentC {
        [*] --> C_idle: 初始化
        C_idle --> C_monitoring: 开始播放
        C_monitoring --> C_completed: 播放结束
        C_completed --> C_idle: 重置
    }
    
    state AgentA {
        [*] --> A_idle: 初始化
        A_idle --> A_writing: 触发书写
        A_idle --> A_drawing: 触发绑图
        A_writing --> A_idle: 完成
        A_drawing --> A_idle: 完成
    }
    
    state AgentB {
        [*] --> B_idle: 初始化
        B_idle --> B_playing: 开始播放
        B_playing --> B_paused: 暂停
        B_paused --> B_playing: 继续
        B_playing --> B_idle: 停止
    }
```

### 4.4 视频录制模块

```mermaid
flowchart TD
    A[点击播放] --> B[启动MediaRecorder]
    B --> C[Canvas.captureStream 30fps]
    C --> D[音频流混合]
    D --> E[开始录制]
    
    E --> F{播放状态?}
    F -->|播放中| G[收集数据块]
    G --> F
    F -->|结束| H[停止录制]
    H --> I[生成WebM文件]
    I --> J[提供下载]
```

---

## 五、API配置方案

### 5.1 配置流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as 设置界面
    participant WS as WebSocket服务
    participant AI as AI服务
    
    U->>UI: 输入API Key
    U->>UI: 输入Base URL(可选)
    UI->>WS: 发送配置请求
    WS->>WS: 存储配置到Session
    WS-->>UI: 返回配置成功
    UI-->>U: 显示已配置状态
    
    Note over U,AI: 后续请求使用该配置
    U->>UI: 提交题目
    UI->>WS: 生成剧本请求
    WS->>AI: 使用配置调用API
    AI-->>WS: 返回结果
    WS-->>UI: 返回剧本
```

### 5.2 支持的配置项

| 配置项 | 必填 | 说明 |
|--------|------|------|
| API Key | 是 | AI服务认证密钥 |
| Base URL | 否 | 自定义API地址，默认使用官方地址 |

---

## 六、数据流架构

### 6.1 完整数据流

```mermaid
flowchart TD
    subgraph 输入
        A[题目文本]
        B[API配置]
    end
    
    subgraph 处理
        C[WebSocket服务]
        D[LLM分析]
        E[TTS合成]
        F[打点计算]
    end
    
    subgraph 输出
        G[剧本JSON]
        H[音频Base64]
        I[时间轴Cues]
    end
    
    subgraph 渲染
        J[AgentA 板书]
        K[AgentB 语音]
        L[AgentC 控制]
    end
    
    A --> C
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    E --> H
    F --> I
    G --> J
    H --> K
    I --> L
    L --> J
    L --> K
```

---

## 七、性能优化策略

### 7.1 前端优化

| 优化点 | 方案 | 效果 |
|--------|------|------|
| Canvas渲染 | 使用requestAnimationFrame | 流畅60fps |
| 状态管理 | useRef避免重渲染 | 减少不必要的更新 |
| 音频处理 | 预加载 + 缓存 | 即时播放响应 |
| 录制优化 | 分片收集(100ms) | 内存可控 |

### 7.2 网络优化

| 优化点 | 方案 | 效果 |
|--------|------|------|
| WebSocket | 自动重连机制 | 断线自动恢复 |
| 数据传输 | Base64编码 | 兼容性好 |
| 音频格式 | WAV格式 | 无需转码 |

---

## 八、扩展性设计

### 8.1 题型扩展

```mermaid
mindmap
  root((支持题型))
    纯文本
      计算题
      方程求解
      代数运算
    图形
      函数图像
      几何图形
      坐标系
    扩展中
      公式推导
      表格数据
      统计图表
```

### 8.2 多学科支持

```mermaid
flowchart LR
    A[题目输入] --> B{学科识别}
    B -->|数学| C[数学Prompt模板]
    B -->|物理| D[物理Prompt模板]
    B -->|化学| E[化学Prompt模板]
    
    C --> F[生成学科专属剧本]
    D --> F
    E --> F
```

---

## 九、部署架构

### 9.1 推荐部署方案

```mermaid
flowchart TB
    subgraph 负载均衡
        LB[Nginx]
    end
    
    subgraph 应用集群
        App1[Next.js Instance 1]
        App2[Next.js Instance 2]
        App3[Next.js Instance 3]
    end
    
    subgraph 服务层
        WS[WebSocket服务 :3003]
    end
    
    subgraph 外部服务
        AI[AI API服务]
    end
    
    LB --> App1
    LB --> App2
    LB --> App3
    
    App1 --> WS
    App2 --> WS
    App3 --> WS
    
    WS --> AI
```

### 9.2 环境要求

| 组件 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2核 | 4核+ |
| 内存 | 4GB | 8GB+ |
| 存储 | 20GB | 50GB+ |
| Node.js | 18+ | 20+ |

---

## 十、项目交付物

### 10.1 代码仓库结构

```
project/
├── src/
│   ├── app/
│   │   └── page.tsx          # 主页面组件
│   └── components/
│       └── ui/               # UI组件库
├── mini-services/
│   └── handwriting-service/  # WebSocket服务
│       └── index.ts
├── docs/
│   ├── 技术方案文档.md         # 纯文本版
│   └── 技术方案文档_Mermaid版.md
└── package.json
```

### 10.2 已实现功能清单

| 功能模块 | 状态 | 说明 |
|----------|:----:|------|
| 题目输入 | ✅ | 支持文本输入 |
| AI剧本生成 | ✅ | LLM分析+TTS合成 |
| 手写板书动画 | ✅ | 逐笔书写+手绘风格 |
| 图形绘制 | ✅ | 坐标系+函数曲线 |
| 语音同步播放 | ✅ | 三Agent协作 |
| 视频录制 | ✅ | 自动录制+下载 |
| Agent状态展示 | ✅ | 实时状态面板 |
| API配置 | ✅ | 动态配置界面 |

---

## 十一、总结

### 11.1 核心创新点

```mermaid
mindmap
  root((核心创新))
    架构创新
      三Agent协作模型
      导演-板书员-播音员
    技术创新
      时间轴同步方案
      语音驱动板书
    体验创新
      手绘风格渲染
      自然笔迹效果
    功能创新
      自动录制导出
      一键生成视频
```

### 11.2 技术亮点

- ✅ 纯前端Canvas绘制，无需插件
- ✅ WebSocket实时通信，低延迟
- ✅ 模块化设计，易于扩展
- ✅ 响应式UI，支持多设备

### 11.3 后续规划

| 阶段 | 功能 | 优先级 |
|------|------|:------:|
| V1.1 | 更多题型支持（表格、公式） | 高 |
| V1.2 | 多语言支持 | 中 |
| V2.0 | 用户系统、历史记录 | 中 |
| V2.1 | 批量生成、模板管理 | 低 |

---

**文档版本**: v1.0  
**编写日期**: 2024年
