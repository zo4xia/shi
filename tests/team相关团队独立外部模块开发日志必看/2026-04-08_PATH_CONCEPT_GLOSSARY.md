# 路径概念词典（2026-04-08）

记录时间：2026-04-08

标签：

- `路径词典`
- `workspace`
- `workingDirectory`
- `runtimeRoot`
- `userDataPath`

## 这份词典为什么要有

这几个词如果不先定死，
后面任何部署、任务执行、运行态家目录、日志排障都会互相打架：

- `workspace`
- `projectRoot`
- `workingDirectory`
- `runtimeRoot`
- `userDataPath`
- `UCLAW_DATA_PATH`

所以这份词典只做一件事：

```text
以后大家说这些词时，尽量只按这一版理解。
```

---

## 1. `projectRoot` / `workspace`

含义：

- 项目代码根目录
- 也就是当前这份仓库真正的根

当前代码入口：

- `src/shared/runtimeDataPaths.ts`
- `server/src/index.ts`

当前口径：

- `workspace` 在服务端更多表示“当前项目根”
- 不是任务执行目录
- 也不是运行态家目录

一句话：

```text
workspace = 项目根
```

---

## 2. `workingDirectory`

含义：

- 单个会话 / 单个任务真正执行命令时的 cwd

当前代码入口：

- `server/routes/cowork.ts`
- `src/renderer/components/scheduledTasks/TaskForm.tsx`
- `src/main/coworkStore.ts`

当前口径：

- 会话可以在某个 `workingDirectory` 里工作
- 任务也可以指定自己的 `workingDirectory`
- 它不等于项目根
- 更不等于运行态家目录

一句话：

```text
workingDirectory = 某个任务/会话工作的目录
```

---

## 3. `runtimeRoot`

含义：

- 项目内运行态总容器
- 默认是：
  - `<projectRoot>/.uclaw`

当前代码入口：

- `src/shared/runtimeDataPaths.ts`

当前口径：

- 这是“家”的大根
- 用来承接数据库、角色目录、运行时技能、日志等

一句话：

```text
runtimeRoot = 项目内运行态总目录
```

---

## 4. `userDataPath`

含义：

- Web 运行态数据根
- 默认是：
  - `<runtimeRoot>/web`

当前代码入口：

- `src/shared/runtimeDataPaths.ts`
- `server/src/index.ts`

当前口径：

- SQLite 文件在这里
- `roles/`
- `logs/`
- `.uclaw/web/SKILLs/`
  这些都在这里

一句话：

```text
userDataPath = Web 运行态家目录
```

---

## 5. `UCLAW_DATA_PATH`

含义：

- 运行态根目录的 env 入口

当前代码入口：

- `src/shared/envAliases.ts`
- `src/shared/runtimeDataPaths.ts`

当前口径：

- 它不是另一个新概念
- 它只是 `runtimeRoot` 的环境变量入口
- 最终仍然会落回项目根内部

一句话：

```text
UCLAW_DATA_PATH = runtimeRoot 的 env 入口，不是新的独立目录概念
```

---

## 6. 一句话对照表

```text
workspace / projectRoot = 项目根
workingDirectory       = 任务/会话执行目录
runtimeRoot            = 项目内运行态总目录（通常 .uclaw）
userDataPath           = Web 运行态家目录（通常 .uclaw/web）
UCLAW_DATA_PATH        = runtimeRoot 的 env 入口
```

## 7. 以后排查时先问

不要再问：

```text
这个路径是不是项目目录？
```

先问：

```text
我现在说的是项目根、任务执行目录，还是运行态家目录？
```

这一步问清楚，
后面很多误判都会少掉。
