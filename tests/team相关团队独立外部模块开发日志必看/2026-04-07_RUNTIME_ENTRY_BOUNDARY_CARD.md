# 运行入口边界卡：3000 / 3010 / Team

记录时间：2026-04-07

标签：

- `入口边界`
- `3000`
- `3010`
- `team.html`
- `不要混`

## 这张卡是干什么的

这张卡只解决一件事：

```text
以后不要再把 3000、3010、team.html 混在一起。
```

这不是小问题。

一旦入口混了，就会连带误判：

- 哪个工作区坏了
- 哪个页面本来就不属于这里
- 哪条链是真正需要修的

所以这一页就是硬边界卡。

---

## 一眼先记住

### `3000`

- 是 `C:\Users\Administrator\Desktop\baiban`
- 是旧版本首页 / 白板验证台 / 可输入可观察锚点页
- 入口：
  - `http://127.0.0.1:3000/`
  - `http://127.0.0.1:3000/tts-timeline`

### `3010`

- 是 `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox`
- 是独立验证壳 / 归仓后的单独运行试验入口
- 入口：
  - `http://127.0.0.1:3010/`
- 新的独立启动手柄：
  - 在 `baiban-sandbox` 根执行：`npm run dev:standalone`
- 作用：
  - 先拉起 `3003` 微服务
  - 再拉起 `3010` 前端壳
  - 减少“前端起来了但按钮链天然断开”的误判

### `team.html`

- 是 `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox`
- 是我们的沙箱 / 单页试炼 / 测试页面
- 入口：
  - `http://127.0.0.1:5178/team.html`

---

## 绝对不要这样混

### 错误 1

```text
在 baiban-sandbox 里找 team.html
```

不对。

`team.html` 不属于 `baiban-sandbox`。
它属于 `team-single-page-sandbox`。

### 错误 2

```text
把 3010 运行失败理解成 3000 旧版本首页坏了
```

不对。

`3010` 是 `baiban-sandbox` 的独立验证壳。  
`3000` 是 `Desktop\baiban` 的旧版本首页。

### 错误 3

```text
看到 3000 端口冲突，就以为 baiban-sandbox 整条线打不开
```

不对。

旧日志已经证明过：

- `3000` 可能因为端口占用失败
- 但 `3010` 仍然可以作为独立壳启动

---

## 现在每个入口各自负责什么

### 3000 负责

- 旧版本首页锚点
- 夏夏喜欢的讲解文本输入
- 板书块输入
- 大白板舞台
- 阿里云原始 JSON 观察

### 3010 负责

- `baiban-sandbox` 独立运行验证
- 检查归仓后的工作区自己能不能活
- 检查是否还偷偷依赖外部真源

### team.html 负责

- 单页试炼
- 时间轴试打法
- `imageUrl + reveal`
- handwrite adapter
- A / B / C / D 工位协作

---

## 以后排查时先问哪一句

先问：

```text
我现在看到的问题，属于 3000、3010，还是 team.html？
```

不是先问：

```text
是不是全坏了？
```

---

## 这次事故之后的正确口径

夏夏这次发现：

- U 盘里的演示样品还不够独立
- 本地笔记本环境又被别人碰过

所以更需要先把入口边界守住。

否则很容易把：

- 便携演示包问题
- `baiban-sandbox` 独立运行问题
- `team-single-page-sandbox` 单页试炼问题

全混成一团。

---

## 一句话收束

`3000` 是旧版本首页。  
`3010` 是 `baiban-sandbox` 的独立验证壳。  
`team.html` 是 `team-single-page-sandbox` 的单页试炼沙箱。  

以后先分清入口，再判断哪里坏了。
