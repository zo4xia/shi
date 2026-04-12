# IM / 飞书 / IMA 运行态词典（2026-04-08）

记录时间：2026-04-08

标签：

- `IM`
- `飞书`
- `IMA`
- `im_config`
- `环境变量`
- `运行态词典`

## 这份词典为什么要有

这组东西很容易被说乱：

- `im_config`
- `UCLAW_FEISHU_*`
- `IMA_OPENAPI_*`
- `UCLAW_IMA_OPENAPI_*`
- 角色 secret
- 运行时桥接状态

如果不先定口径，
后面就会出现：

- 明明改了 env，但运行态没变
- 明明 UI 里有值，桥接还在读旧 secret
- IMA 到底该填哪组名字，说来说明天又变

---

## 1. `im_config`

### 它是什么

- IM 运行态主配置

### 主真相源

- SQLite `kv(im_config)`

### 影响范围

- 飞书
- 微信 bot bridge
- IMA
- `.env` 同步
- 部分角色 secret/runtime 文件

### 一句话

```text
im_config = IM 主真相源，不是普通轻量配置项
```

---

## 2. 飞书环境变量

### 这组名字包括

- `UCLAW_FEISHU_APP_ID`
- `UCLAW_FEISHU_APP_SECRET`
- `UCLAW_FEISHU_AGENT_ROLE_KEY`
- 以及带后缀的：
  - `_1`
  - `_2`
  - ...

### 当前口径

- 飞书多应用仍然以 `im_config.feishu.apps` 为运行态主源
- `.env` 里的飞书变量是同步镜像 / 部署兜底
- 第 0 个 app 用无后缀变量
- 后续 app 用 `_1 / _2 / ...`

### 当前已落地动作

- `.env` 同步逻辑已开始收紧：
  - 先清理旧的主名/兼容名/多应用后缀残留
  - 再只写主名 `UCLAW_FEISHU_*`
- 兼容名仍然保留读取能力，
  但不再继续主动回写到 `.env`

### 一句话

```text
飞书 app 的主源在 im_config.feishu.apps，env 只是同步镜像
```

---

## 3. IMA 名字口径

### 当前主名

- `IMA_OPENAPI_CLIENTID`
- `IMA_OPENAPI_APIKEY`

### 当前兼容名

- `UCLAW_IMA_OPENAPI_CLIENTID`
- `UCLAW_IMA_OPENAPI_APIKEY`

### 现在怎么理解

- 主名继续认 `IMA_OPENAPI_*`
- `UCLAW_IMA_*` 只保留为兼容读取
- 不再把两套都当成“推荐主写”的名字

### 当前已落地动作

- `.env` 同步逻辑已收紧为只回写：
  - `IMA_OPENAPI_CLIENTID`
  - `IMA_OPENAPI_APIKEY`
- `UCLAW_IMA_*` 继续兼容读取，
  但不再作为写回 `.env` 的主名

### 一句话

```text
IMA 主写 IMA_OPENAPI_*，UCLAW_IMA_* 只做兼容
```

---

## 4. 角色 secret / 运行时视图

### 它们是什么

- 角色级技能 secret
- 渠道运行态桥接文件
- 派生状态

### 它们不是什么

- 它们不是 IM 主真相源

### 一句话

```text
角色 secret 和运行时桥接文件是派生运行态，不是 im_config 的替代品
```

---

## 5. 当前统一判断

```text
im_config
  > 飞书/IMA env 镜像
  > 角色 secret / 运行时桥接派生层
```

如果后面遇到问题，先问：

1. 这是 `im_config` 本身错了？
2. 还是 `.env` 没同步？
3. 还是派生 secret / runtime 文件还在读旧值？

不要再一上来就混着改。
