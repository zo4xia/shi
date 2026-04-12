# 2026-04-12 SiYuan MCP 使用参数备忘

记录时间：2026-04-12

标签：

- `siyuan`
- `mcp`
- `notebook`
- `document`
- `参数契约`
- `阿圆`

---

## 1. 为什么要记这份

这次已经不是“知不知道有思源笔记本”。

而是：

- 已经拿到了 SiYuan MCP 的真实参数契约
- 以后不能再凭印象乱猜工具名和字段
- 要把“怎么进门找会话笔记本”固定下来

这份备忘只记：

- `notebook` 工具支持什么 action
- `document` 工具支持什么 action
- 每个关键字段是什么意思
- 哪些动作危险、必须确认
- 如果要找“阿圆的会话笔记本”，顺序该怎么走

---

## 2. notebook 工具契约

### 2.1 action

支持：

- `list`
- `create`
- `open`
- `close`
- `remove`
- `rename`
- `get_conf`
- `set_conf`
- `set_icon`
- `get_permissions`
- `set_permission`
- `get_child_docs`
- `help`

其中必须确认：

- `remove`
- `set_permission`

### 2.2 常用字段

- `action`
  - 要执行的动作
- `name`
  - 笔记本名 / 新笔记本名
- `icon`
  - 建议填 Unicode hex，如 `1f4d4`
- `notebook`
  - 笔记本 ID
  - `all` 可返回所有笔记本权限项
- `conf`
  - 笔记本配置对象
- `permission`
  - 权限级别：
    - `none`
    - `r`
    - `rw`
    - `rwd`

### 2.3 conf 结构

- `name`
- `closed`
- `refCreateSavePath`
- `createDocNameTemplate`
- `dailyNoteSavePath`
- `dailyNoteTemplatePath`

---

## 3. document 工具契约

### 3.1 action

支持：

- `create`
- `rename`
- `remove`
- `move`
- `get_path`
- `get_hpath`
- `get_ids`
- `get_child_blocks`
- `get_child_docs`
- `set_icon`
- `set_cover`
- `clear_cover`
- `list_tree`
- `search_docs`
- `get_doc`
- `create_daily_note`
- `help`

其中必须确认：

- `remove`
- `move`

### 3.2 常用字段

- `action`
  - 要执行的动作
- `notebook`
  - 笔记本 ID，也用于权限作用域
- `path`
  - `create` 时填人类可读路径，如 `/Inbox/Weekly Note`
  - 其它动作里，如果用 `notebook + path`，应填 `document(action="get_path")` 返回的 storage path
- `markdown`
  - 文档内容
- `icon`
  - 建议 Unicode hex
- `id`
  - 文档 ID
- `title`
  - 新文档标题
- `fromPaths`
  - 来源 storage path 数组
- `toNotebook`
  - 目标笔记本 ID
- `toPath`
  - 目标 storage path，应该来自现存目标文档的 `get_path`
- `fromIDs`
  - 来源文档 ID 数组
- `toID`
  - 目标文档 ID 或笔记本 ID
- `source`
  - 封面图来源，可是 URL 或 `/assets/foo.png`
- `maxDepth`
  - 树深度，默认 3
- `query`
  - 搜索标题关键词
- `mode`
  - `markdown` / `html`
- `size`
  - 可选最大内容大小 hint
- `page`
  - markdown 分页页码，1-based
- `pageSize`
  - markdown 每页字符数，默认 8000
- `app`
  - 可选 app 标识，透传给 SiYuan

---

## 4. 找“阿圆会话笔记本”的最稳顺序

不要一上来就猜 storage path。

先走：

1. `notebook(action="list")`
   - 先看所有笔记本 ID 和名字

2. `document(action="search_docs", query="阿圆")`
   - 先按名字搜

3. `document(action="search_docs", query="会话")`
   - 再按主题词搜

4. `document(action="search_docs", query="Claude Code Sessions")`
   - 已知思源数据目录里出现过这个标题

5. 对命中的文档：
   - `document(action="get_hpath", id="...")`
   - `document(action="get_path", id="...")`
   - `document(action="get_doc", id="...", mode="markdown")`

如果是先锁定某个笔记本，再往下找：

6. `notebook(action="get_child_docs", notebook="...")`
   或
   `document(action="get_child_docs", notebook="...", path="...")`

---

## 5. 这次已经确认的本地线索

从思源本地数据目录里，已经看到了这些线索：

- `Claude Code Sessions`
- `.siyuan/conf.json` 里出现：
  - `name: claude 会话`

这说明：

- “阿圆的会话笔记本”不是空猜
- 思源数据里确实已经有相关会话笔记本/文档痕迹

---

## 6. 注意事项

1. 不要把 `6806` 当 MCP 端口
   - 它是 SiYuan API 端口
   - `mcp-server.cjs` 才是 MCP client 要起的桥

2. 不要乱用危险动作
   - `remove`
   - `move`
   - `set_permission`
   这些都必须确认

3. 不要猜 path
   - 先 `get_path`
   - 再把返回的 storage path 用到后续动作里

4. 查资料优先只读链
   - `list`
   - `search_docs`
   - `get_hpath`
   - `get_path`
   - `get_doc`

---

## 7. 已记录的连接方式

### 7.1 HTTP 直连

```json
{
  "mcpServers": {
    "siyuan": {
      "type": "http",
      "url": "http://127.0.0.1:36806/mcp",
      "headers": {
        "Authorization": "Bearer <local-siyuan-mcp-token>"
      }
    }
  }
}
```

适用：

- MCP client 原生支持 HTTP MCP
- 本机当前已验证：如果缺少 `Authorization`，容易在后续调用阶段卡住

### 7.2 mcp-remote 桥接

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://127.0.0.1:36806/mcp",
        "--header",
        "Authorization: Bearer <local-siyuan-mcp-token>"
      ]
    }
  }
}
```

适用：

- 当前 client 只吃 stdio
- 但本地已经有思源 HTTP MCP 服务

说明：

- 这条配置本质上是把 HTTP MCP 包成 stdio 给 client 用
- 如果后面要补鉴权 header，就继续在 `mcp-remote` 这层加
- 下次优先先试 `mcp-remote`，因为它更接近当前会话工具体系

### 7.3 本次实测结果

已确认：

- 带 `Authorization` 的 `initialize` 可以返回 `200`
- 会返回：
  - `serverInfo.name = siyuan-mcp`
  - `version = 2.0.0`
  - `mcp-session-id`

但同时也确认：

- 用裸 `Invoke-WebRequest` 直接手打后续 `tools/list`
- 仍然可能得到：
  - `Bad Request: Server not initialized`

这说明：

```text
这条 HTTP 线是活的，
但后续消息初始化语义不要再靠裸 HTTP 手工硬打。
```

以后最稳优先级：

1. 真正支持 MCP session 的 HTTP client
2. `mcp-remote` 桥成 stdio
3. 最后才是裸 HTTP 调试

---

## 8. 一句话收束

```text
这次不是“知道思源里可能有会话笔记本”就够了，
而是已经拿到了进门找它的真实 MCP 参数契约。
以后不要再空讲，按 contract 走。
```
