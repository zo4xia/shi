---
name: daily-memory-extraction
description: "Daily memory extraction and file archiving task. Automatically extracts and condenses today's conversations into long-term memory (Identity Memory) and archives conversation files to designated backup paths."
license: MIT
official: true
---

# Daily Memory Extraction & File Archiving

## Overview

This skill performs two automated tasks every day:
1. **Memory Extraction**: Extracts and condenses today's conversations into long-term memory (Identity Memory)
2. **File Archiving**: Archives conversation files to designated backup paths and deletes original files

## Architecture

### Three-Layer Memory System

| Layer | Storage | Responsibility | Lifecycle |
|-------|---------|---------------|-----------|
| **Layer 1** | `user_memories` | Real-time fine-grained rule extraction | During session |
| **Layer 2** | `identity_thread_24h` | 24-hour broadcast baton cache | 24-hour expiration |
| **Layer 3** | `Identity Memory` | Condensed long-term knowledge | Permanent |

### Data Flow

```
Today's Conversations (Feishu/DingTalk/Desktop)
         ↓
identity_thread_24h (24-hour broadcast baton cache)
         ↓
Scheduled Task (daily fixed time)
         ↓
  ├─→ LLM Intelligent Extraction
  │    ↓
  │  Identity Memory (Markdown long-term memory)
  │
  └─→ File Archiving
       ↓
  Backup Path/{agentRoleKey}_{modelId}/{YYYY-MM-DD}/{filename}
```

Note:

- The archive path may still include `${agentRoleKey}_${modelId}` for compatibility naming.
- That archive folder name is not the identity boundary.
- Identity continuity is still bucketed by `agentRoleKey`.

## Task Execution Flow

### Step 1: Scan Active Identities

```typescript
// ROUTE: Daily Memory Extraction - Scan Identities - No authentication
// API: SELECT DISTINCT agent_role_key FROM identity_thread_24h
// FLOW: Daily Memory Extraction - Step 1: Scan all active identities
const identities = await getAllIdentities();
```

## Boundary Notes

- `identity_thread_24h` is not a full transcript store. It is a relay board for cross-channel continuity.
- The relay board must be read before longer history, then paired with the most recent raw messages.
- The canonical baton shape is:
  - `agentRoleKey`
  - `channel`
  - `timestamp`
  - `content summary`
  - `channel sequence`
- `modelId` is runtime configuration only, not an identity boundary.
- Summary/condensation may assist, but must not replace the agent's own relay intent.
- Real runtime read order is:
  1. `identity_thread_24h`
  2. fallback `user_memories`
  3. if durable memory was used, seed a bootstrap baton back into `identity_thread_24h`
  4. pair the baton with only the latest `3` raw messages
- `turn_cache` is request-reply cache only. It expires automatically and is not the continuity source.
- `identity_thread_24h` is cleared only after a successful long-term memory merge. If nothing new was written, keep the board for later catch-up.
- Daily journal semantics currently land in structured long-term memory fields:
  - `projectContext`
  - `decisions`
  - `notes`
- Pitfalls, tool errors, and fixes should be written as retrievable notes for future selves, not left as one-off execution noise.

### Step 2: Extract Memory for Each Identity

```typescript
// ROUTE: Daily Memory Extraction - Extract Memory - No authentication
// API: extractWithLLM - Extract key information using LLM
// FLOW: Daily Memory Extraction - Step 2: Extract memory for each identity
for (const identity of identities) {
  // CHECKPOINT: Validate identity has conversations today
  const todayContext = await getTodayContext(identity);

  if (!todayContext || todayContext.length === 0) {
    continue;
  }

  // CHECKPOINT: LLM extraction completed successfully
  const extracted = await extractWithLLM(todayContext);

  // CHECKPOINT: Identity Memory updated successfully
  await identityMemoryManager.updateIdentityMemory(identity, extracted);
}
```

### Step 3: Archive Files for Each Identity

```typescript
// ROUTE: Daily Memory Extraction - Archive Files - No authentication
// API: archiveDailyFiles - Archive conversation files
// FLOW: Daily Memory Extraction - Step 3: Archive files for each identity
for (const identity of identities) {
  // CHECKPOINT: Scan conversation files
  const filesToArchive = await scanConversationFiles(identity);

  if (filesToArchive.length === 0) {
    continue;
  }

  // CHECKPOINT: Archive directory created successfully
  const archiveDir = path.join(
    backupPath,
    `${identity.agentRoleKey}_${identity.modelId}`,
    dateFolder
  );

  // CHECKPOINT: Each file archived successfully
  for (const file of filesToArchive) {
    await fs.promises.copyFile(sourcePath, targetPath);
    await fs.promises.unlink(sourcePath);
  }
}
```

## File Archiving Structure

### Archive Path Format

```
{backupPath}/
  ├── coding-assistant_claude-3-7-sonnet/
  │   └── 2026-03-14/
  │       ├── file1.txt
  │       ├── file2.pdf
  │       └── file3.jpg
  └── organizer_gpt-4-turbo/
      └── 2026-03-14/
          └── file4.docx
```

### File Detection

Files are detected from:
1. `cowork_messages.metadata.file_path`
2. `cowork_messages.metadata.attachments[].path`
3. Conversation content regex patterns:
   - `(?:文件|file)[:：]\s*([^\s]+\.[a-zA-Z0-9]+)`
   - `(?:附件|attachment)[:：]\s*([^\s]+\.[a-zA-Z0-9]+)`
   - `(?:上传|upload)[:：]\s*([^\s]+\.[a-zA-Z0-9]+)`

## LLM Prompt Template

### Extraction Requirements

```markdown
你是一个智能记忆提取助手。请从今天的对话中提取关键信息，更新到长期记忆中。

## 今天的对话

{today_conversations}

## 提取要求

### 1. 用户信息
- 姓名、职位、技术栈
- 工作内容、当前项目
- 沟通风格、偏好

### 2. 项目上下文
- 项目名称、技术栈
- 当前阶段、主要任务
- 关键依赖、已知问题

### 3. 重要决策
- 架构决策 (技术选型、设计方案)
- 业务决策 (功能规划、优先级)
- 结论和建议

### 4. 行动项
- 待办事项
- 改进点
- 后续计划

## 输出格式

请以 JSON 格式输出：

```json
{
  "userInfo": {
    "name": "...",
    "role": "...",
    "techStack": ["..."],
    "currentProject": "..."
  },
  "projectContext": {
    "projectName": "...",
    "techStack": ["..."],
    "currentStage": "...",
    "keyTasks": ["..."],
    "knownIssues": ["..."]
  },
  "decisions": [
    {
      "topic": "...",
      "decision": "...",
      "reason": "...",
      "timestamp": "..."
    }
  ],
  "actionItems": [
    {
      "task": "...",
      "priority": "high|medium|low",
      "status": "pending|in_progress|done"
    }
  ],
  "notes": [
    {
      "content": "...",
      "tags": ["..."]
    }
  ]
}
```
```

## Configuration

### File Archive Path

```json
{
  "key": "file_archive_path",
  "value": "/backup/lobsterai"
}
```

### Scheduled Task

```json
{
  "name": "每日记忆抽取与文件归档",
  "schedule": {
    "type": "cron",
    "expression": "0 59 23 * * *"
  },
  "prompt": "开始每日记忆抽取与文件归档任务",
  "workingDirectory": "/workspace",
  "executionMode": "auto",
  "skillIds": ["daily-memory-extraction"]
}
```

## API Reference

### Frontend API

```typescript
// ROUTE: Daily Memory Extraction - API Endpoints - No authentication

// API: POST /api/memory/daily-extract - Trigger daily memory extraction manually
// Request: { backupPath?: string }
// Response: { success: boolean, extractedCount: number, archivedFiles: number, errors: string[] }

// API: GET /api/memory/extract-status - Get last extraction status
// Response: { success: boolean, lastRunAt: string, nextRunAt: string, status: 'idle' | 'running' | 'error' }

// API: PUT /api/store/file_archive_path - Configure file archive path
// Request: { value: string }
// Response: { success: boolean }
```

### Backend Functions

```typescript
// ROUTE: Daily Memory Extraction - Internal Functions - No authentication

// API: extractDailyMemory() - Main extraction function
// Returns: { extractedCount: number, archivedFiles: number, errors: string[] }

// API: archiveDailyFiles(backupPath: string) - Archive conversation files
// Returns: { archivedFiles: number, archivedSize: number, errors: string[] }

// API: getTodayContext(identity: IdentityKey) - Get today's conversations
// Returns: any[]

// API: extractWithLLM(context: any[]) - Extract using LLM
// Returns: any
```

## Monitoring & Logging

### Log Format

```log
[DailyMemoryExtraction] 开始执行每日任务
[DailyMemoryExtraction] 发现 3 个激活的身份
[DailyMemoryExtraction] 处理身份: coding-assistant_claude-3-7-sonnet
[DailyMemoryExtraction] 读取到 15 条今天对话
[DailyMemoryExtraction] LLM 提取完成 (耗时 3.2s, tokens: 1234)
[DailyMemoryExtraction] 更新 Identity Memory: 新增 2 个决策, 3 个行动项
[FileArchiver] 发现 5 个文件需要归档
[FileArchiver] 归档文件: /workspace/file1.txt -> /backup/coding-assistant_claude-3-7-sonnet/2026-03-14/file1.txt
[FileArchiver] 删除原文件: /workspace/file1.txt
[DailyMemoryExtraction] 任务完成 (总耗时 25.5s)
[DailyMemoryExtraction] 记忆抽取: 3 个身份, 文件归档: 15 个文件 (总计 2.3 MB)
```

### Progress Tracking

```typescript
// PROGRESS: 每日记忆抽取 0% - 开始执行
// PROGRESS: 每日记忆抽取 10% - 处理身份: ${identity.agentRoleKey} (摘要模型: ${identity.modelId})
// PROGRESS: 每日记忆抽取 50% - 记忆抽取完成
// PROGRESS: 文件归档 0% - 开始执行
// PROGRESS: 文件归档 10% - 处理归档目录: ${identity.agentRoleKey}_${identity.modelId}
// PROGRESS: 文件归档 100% - 完成
```

## Acceptance Criteria

### Functional
- ✅ Executes daily at fixed time
- ✅ Correctly identifies each identity's today's conversations
- ✅ LLM extraction accuracy > 80%
- ✅ Identity Memory correctly updated
- ✅ Old data cleaned (24-hour expiration)
- ✅ Files correctly archived to designated path
- ✅ Original files deleted after archiving
- ✅ Archive path format correct

### Performance
- ✅ Memory extraction < 5 minutes (assume 10 identities)
- ✅ File archiving < 10 minutes (assume 100 files)
- ✅ LLM call cost controlled (< 500 tokens per identity)

### Reliability
- ✅ Task auto-retry on failure (max 3 times)
- ✅ Failure logs recorded
- ✅ Manual trigger successful
- ✅ File archiving failure doesn't affect memory extraction

## Implementation Plan

### Phase 1: Basic Framework (1 day)
- [ ] Create `daily-memory-extraction` Skill
- [ ] Implement `extractDailyMemory` function
- [ ] Implement `archiveDailyFiles` function
- [ ] Create LLM prompt template

### Phase 2: File Archiving (0.5 day)
- [ ] Implement file scanning logic
- [ ] Implement file archiving logic
- [ ] Implement file deletion logic
- [ ] Add archiving logs

### Phase 3: Integration Testing (0.5 day)
- [ ] Write unit tests
- [ ] Manual trigger test
- [ ] Verify extraction results
- [ ] Verify file archiving

### Phase 4: Scheduled Task (0.5 day)
- [ ] Create ScheduledTask
- [ ] Configure cron expression
- [ ] Configure file backup path
- [ ] Test scheduled trigger

### Phase 5: Optimization (0.5 day)
- [ ] Add execution logs
- [ ] Performance optimization
- [ ] Error handling
- [ ] Add monitoring metrics

**Total**: 3 days
