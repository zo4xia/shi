# baiban 运行家当归仓记录

记录时间：2026-04-05 08:48:00

标签：

- `归仓`
- `本地家当`
- `镜像`
- `防散落`
- `可带走`

## 这份记录是干什么的

为了解决一个真实风险：

```text
真正运行的 baiban 项目在外部目录
如果整包带走当前工程，而外部目录没一起走，
就会只剩文档和空壳。
```

所以现在定下来的处理方式是：

- 不直接搬动原目录
- 不破坏当前运行环境
- 在当前 worktree 内保留一份可重复同步的镜像家当

## 真源与归仓位置

### 真正运行的项目

- `C:\Users\Administrator\Desktop\baiban`

### 当前归仓镜像位置

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\local-homes\baiban-runtime`

## 同步脚本

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\scripts\sync-baiban-runtime-into-worktree.ps1`

### 脚本做的事

- 同步根配置文件
- 同步 `src`
- 同步 `public`
- 同步 `docs`
- 同步 `.zscripts`
- 同步 `mini-services/handwriting-service`
- 同步 `prisma`

### 明确排除

- `node_modules`
- `.next`
- `.git`
- `.playwright-cli`
- `download`
- `upload`
- `db`
- `*.log`
- `*.tmp`
- `*.tsbuildinfo`

也就是说：

- 保代码
- 保配置
- 保文档
- 保微服务
- 不把运行垃圾一起搬进来

## 为什么这样做

因为现在最怕的不是“多一份”，
而是：

```text
真项目在外面散着，
接力文档在里面，
一旦挪机器 / 拷 U 盘 / 换地方，
运行家当没跟上。
```

所以先做镜像归仓，
后面再决定是否彻底并回统一仓。

## 使用方法

在 PowerShell 里执行：

```powershell
& 'D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\scripts\sync-baiban-runtime-into-worktree.ps1'
```

同步完成后，镜像目录下会生成：

- `SYNC_MANIFEST.json`

用于记录：

- 真源路径
- 归仓路径
- 同步时间
- 同步了哪些目录和文件

## 当前判断

这不是最终迁仓方案，
但这是非常值钱的第一步：

- 先把家当拢进来
- 先保证“带走当前工程时，不会丢主运行家底”
- 再慢慢做更深的结构收口

## 一句话收束

`baiban` 真运行项目不再只散在外部目录。  
从现在开始，它至少有一份可重复同步进当前 worktree 的归仓入口。
