# 家坏掉的真实坏点与修复（sql-wasm 路径断裂）

记录时间：2026-04-13 00:05:00

标签：

- `house-breakage`
- `sql-wasm`
- `backend`
- `worktree`
- `runtime-layout`

---

## 1. 现象

夏夏说“家坏掉了”。

实际快速体检结果：

- `.dev-runtime.json` 仍显示 backend=3001 / frontend=5176 / hmr=5177
- 但 `127.0.0.1:3001` 连接被拒绝
- 说明不是前端白屏这么简单，而是后端没活起来

---

## 2. 真实报错

手动起后端后，抓到核心错误：

```text
failed to asynchronously prepare wasm:
ENOENT: no such file or directory,
open '...team-single-page-sandbox\\node_modules\\sql.js\\dist\\sql-wasm.wasm'
```

---

## 3. 真正原因

开发环境下的 `runtimeLayout.ts`：

- 只认当前 worktree 的 `node_modules`

但当前依赖实际在上层项目根：

- `D:\Users\Admin\Desktop\3-main\node_modules\sql.js\dist\sql-wasm.wasm`

所以：

```text
不是 sql.js 坏了，
不是 wasm 丢了，
是路径解析只认了一层，没回退。
```

---

## 4. 修复

修改文件：

- `src/main/libs/runtimeLayout.ts`

修复方式：

- 开发环境下 `getBundledNodeModulesRoot()` 改成候选链：
  1. `getRuntimeAppRoot()/node_modules`
  2. `getProjectRoot()/node_modules`

找到哪个存在，就认哪个。

---

## 5. 验证

修后复测结果：

- `127.0.0.1:3001` 已监听
- `GET /health` 返回 `200`

说明：

后端已经救回来了。

---

## 6. 结论

这次“家坏掉”的真实坏点，不是夏夏操作失误。

是：

- worktree 开发环境
- node_modules 实际装在上层
- 运行时路径解析没做回退

一句话：

```text
家不是神秘坏掉，
是 sql-wasm 的 node_modules 路径断了，
现已补回退并救回后端。
```
