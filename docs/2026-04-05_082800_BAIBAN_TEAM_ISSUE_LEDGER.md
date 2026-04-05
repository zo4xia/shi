# baiban / team 问题台账

记录时间：2026-04-05 08:28:00

标签：

- `问题台账`
- `复盘`
- `待收口`
- `主线风险`

## 用法

以后发现问题先记，不急着当场全修。

统一用：

```text
#问题_分类
现象：
入口：
复现：
当前判断：
相关文件：
是否已修：
```

---

## 1. #问题_路由

现象：

- `baiban` 根 `layout.tsx` 仍然保留 `Z.ai Code Scaffold` 的 metadata

入口：

- `http://127.0.0.1:3000/`

复现：

- 打开首页时浏览器标题仍不是业务名

当前判断：

- 页面已能用，但最外层品牌壳还没收口

相关文件：

- `C:\Users\Administrator\Desktop\baiban\src\app\layout.tsx`

是否已修：

- 否

---

## 2. #问题_业务流

现象：

- `3000` 首页里的 `adjustAgent* / controlAgent*` 已显示并记忆，但还没有接进真实执行主链

入口：

- `http://127.0.0.1:3000/`

复现：

- 页面可编辑这两组 agent 配置
- 但触发 `generate-tts-timeline` 时，现役请求只发送 `text / apiKey / voice / format / sampleRate`

当前判断：

- 这两组配置目前属于“预留壳层”，不是现役业务控制点

相关文件：

- `C:\Users\Administrator\Desktop\baiban\src\app\page.tsx`

是否已修：

- 否

---

## 3. #问题_接口

现象：

- `/api/tts-audio` 现在只做协议级 URL 校验，没有 host allowlist

入口：

- `http://127.0.0.1:3000/api/tts-audio?source=...`

复现：

- 只要是合法 `http/https` 地址，当前代理就会尝试转发

当前判断：

- 本地演示阶段可用，但后续如果继续外放，需要补上游域名白名单

相关文件：

- `C:\Users\Administrator\Desktop\baiban\src\app\api\tts-audio\route.ts`
- `C:\Users\Administrator\Desktop\baiban\src\lib\tts-audio.ts`

是否已修：

- 否

---

## 4. #问题_播放

现象：

- `3000` 首页主页面播放链仍直接吃 `timelineResult.audio.url`
- `/tts-timeline` 已经切到“本地代理 -> blob URL”

入口：

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/tts-timeline`

复现：

- 对比两个页面的音频装载逻辑即可看出双口径

当前判断：

- 最小试验台更稳
- 首页主页面后续要不要统一到代理播放，需要决策

相关文件：

- `C:\Users\Administrator\Desktop\baiban\src\app\page.tsx`
- `C:\Users\Administrator\Desktop\baiban\src\app\tts-timeline\page.tsx`

是否已修：

- 否

---

## 5. #问题_Team外挂

现象：

- `team` 单页目前已有 A/B/C/D、时间轴和最小例子
- 但 `3000` 页里夏夏喜欢的“讲解文本输入 / 板书块输入 / 阿里云原始 JSON 可见”还没有并进来

入口：

- `team-single-page-sandbox`

复现：

- 打开 Team 单页，对比 `3000` 首页即可看出输入观察能力缺口

当前判断：

- 下一步最适合做“3000 页优点并进 Team”

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\team\SingleTaskRunnerPage.tsx`
- `C:\Users\Administrator\Desktop\baiban\src\app\page.tsx`

是否已修：

- 否

---

## 6. #问题_主家园边界

现象：

- 主家园侧边栏曾经直接挂出 `Team 单页` 快捷入口
- 主家园 `App` 里也直接包含外开 `team.html` 的逻辑

入口：

- 主家园侧边栏

复现：

- 之前打开主家园时，可在侧边栏快捷入口里看到 `Team 单页`

当前判断：

- 这是轻度边界触碰
- 还没把主家园真正拖进业务执行流
- 但已经足够让边界变模糊

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\src\renderer\App.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\src\renderer\components\Sidebar.tsx`

是否已修：

- 是

处理结果：

- 已从主家园侧边栏移除 `Team 单页` 快捷入口
- 已从主家园 `App` 中移除 `team.html` 的外开逻辑
