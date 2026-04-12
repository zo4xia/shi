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

---

## 7. #问题_独立运行环境

现象：

- `baiban-sandbox` 独立运行时，`3010` 前端最初无法稳定连上 `3003`
- 页面看起来能开，但按钮链不推进

入口：

- `http://127.0.0.1:3010/`

复现：

- 根依赖环境脏时，首页状态停在“等待生成”
- 重装根依赖后，首页恢复到“已连接到手写服务”

当前判断：

- 主要不是业务代码丢了
- 更像是根依赖环境损坏/不完整导致的独立运行异常

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\package.json`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\next.config.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\baiban-sandbox\src\app\page.tsx`

是否已修：

- 是

处理结果：

- 清理 `npm cache`
- 重装 `baiban-sandbox` 根依赖
- 重新拉起 `3010`
- 实测首页已连上 `3003`
- 实测“生成时间轴”可推进到“音频与时间轴已就绪”
- 实测“播放同步”后音频时间前进、按钮为真按钮

---

## 8. #问题_长篇写作与长任务边界

现象：

- 长篇小说创作、工具链收集素材、长时间思考、定时任务这类真实使用场景
  已经证明不能继续被 `90 秒 / 5 分钟 / 只带 3 条上下文 + 广播板` 的旧口径强行压扁

入口：

- `cowork`
- 长篇创作实战

复现：

- 用户真实长时使用后，会出现上下文割裂、任务断流、摘要兜底过重的问题

当前判断：

- 这是早期口径误判，不是用户“用法太重”
- 长写作与长任务已经是主线能力，应按长期会话能力继续优化

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team相关团队独立外部模块开发日志必看\2026-04-08_LONG_FORM_WRITING_TIMEOUT_AND_CONTEXT_RECALIBRATION.md`

是否已修：

- 部分已修

---

## 9. #问题_角色附件家目录与上传历史

现象：

- 用户设置了对话文件保存地址后，系统没有真正让新目录接管上传附件主落点
- 浏览器上传文件仍可能优先落到工作目录 `.cowork-temp`
- 角色目录没有自动按 `organizer / writer / designer / analyst` 分桶收口
- 角色虽然有历史搜索能力，但没有天然得到“自己附件家目录”的显式线索

入口：

- `Settings -> 对话文件缓存目录`
- `CoworkPromptInput`
- `/api/dialog/saveInlineFile`

复现：

- 将目录直接设置到 `.../attachments/writer`
- 再上传文件
- 旧逻辑会继续把路径拼成 `writer/attachments/manual`
- 工作目录存在时还会把 cwd 旧路径当主落点

当前判断：

- 这是系统目录语义没有钉死，不是用户设置错了
- 问题分成两层：
  - 存储层：文件到底落在哪
  - 可见性层：角色知不知道自己的附件家目录

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\routes\dialog.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\cowork\CoworkPromptInput.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\services\electronShim.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\main\coworkStore.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team相关团队独立外部模块开发日志必看\2026-04-08_ROLE_ATTACHMENT_HOME_AND_HISTORY_BOUNDARY.md`

是否已修：

- 部分已修

处理结果：

- 已让 `saveInlineFile` 带上 `agentRoleKey`
- 已让用户显式设置目录后接管附件主落点，不再继续双写旧 cwd 主路径
- 已改成自动按角色目录分桶，附件落到 `<角色目录>/manual`
- 已将导出产物改为 `<角色目录>/exports`
- 尚未完成“把角色附件家目录显式注入给运行时小家伙”的可见性层收口

---

## 10. #问题_浏览器缓存与数据地基边界

现象：

- 一度考虑过用 `Dexie / IndexedDB` 分担缓存命中与前端读取压力
- 但如果把它当主库，卸浏览器、清站点数据、换环境后，用户家的连续性会直接受伤

入口：

- 数据层边界设计
- 前端缓存命中设计

复现：

- 只要浏览器站点数据被清理，IndexedDB 天然不具备“家级别”的稳定性

当前判断：

- `Dexie` 可以做减压缓存层
- 不能做主真相源
- 一期继续以 `SQLite` 为家
- 二期支持用户自填远程数据库，满足高性能用户

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team相关团队独立外部模块开发日志必看\2026-04-09_DATA_FOUNDATION_AND_DEXIE_BOUNDARY.md`

是否已修：

- 边界已定

处理结果：

- 已明确：
  - `SQLite / 远程 SQL` = 真相源
  - `Dexie / IndexedDB` = 缓存命中层
  - 向量库 = 检索增强层

---

## 11. #问题_用户意向强度被低估

现象：

- 我们之前默认把用户画像想得太轻：
  - 来一下
  - 问一下
  - 回一下
  - 很快结束
- 但真实用户会：
  - 长时间停留
  - 反复查材料
  - 多轮创作
  - 甚至通宵连续使用

入口：

- 长文写作
- 长叙事
- 陪伴型长期使用

复现：

- 用户真实使用后，才暴露出：
  - 失忆焦虑
  - 全文不可达
  - 附件家目录不可见
  - 90 秒 / 5 分钟 / 3 条上下文这类旧口径明显不适配

当前判断：

- 这是一次重要的产品认知误判
- 不是用户“用得太重”
- 而是我们低估了用户的投入深度与真实意向强度

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team相关团队独立外部模块开发日志必看\2026-04-08_LONG_FORM_WRITING_TIMEOUT_AND_CONTEXT_RECALIBRATION.md`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team相关团队独立外部模块开发日志必看\2026-04-09_WORLD_REALITY_AND_GROWTH_NOTE.md`

是否已修：

- 认知已纠偏

处理结果：

- 已正式承认：
  - 用户真的愿意花很长时间
  - 用户真的会通宵
  - 这里不该再按短问答工具节奏去限制
- 后续系统边界要按“长期停留 / 长任务 / 长创作”继续收口

- 长篇小说创作、章节续写、素材收集、长时间工具调用这类任务，之前被旧的短链口径压得太狠。
- 实际使用里，`90 秒` 启动/执行耐心、`5 分钟` 对话断开感、以及“最近 3 条正文 + 广播板”的默认心智，会让长写作过程明显割裂。
- 用户在同一个项目里明明在持续写作，但系统口径更像在服务短问答，而不是长期创作。

入口：

- 长篇小说 / 分章节创作会话
- 需要长时间思考、检索、整理素材、反复调用工具的写作链
- 定时任务里的长流程执行

复现：

- 写作中需要先思考、查资料、拉素材、做多次工具调用时，旧的“短回合”假设很容易把任务误判成超时或中断。
- 当用户把长篇项目拆章节推进时，只靠广播板和短正文窗口，容易出现章节之间的情绪、伏笔、设定、角色状态承接不稳。

当前判断：

- 这不是“用户写得太长”的问题，而是我们之前把系统主线边界设得太偏短任务。
- 当前代码里虽然已经把现役轻执行器放宽到了更长时长，但项目文档和团队心智还没有同步升级。
- 当前真正需要的是：把“长篇写作 / 长任务”确立为一等场景，而不是拿短问答的边界去兜。
- 这里还有一个认知层的小误判：我们之前低估了它会被真实接受、真实长期使用，所以很多默认边界还停留在“短问答 / 短演示 / 临时使用”阶段。

当前已知代码口径：

- `server/libs/httpSessionExecutor.ts`
  - `FORWARDED_RAW_CONTEXT_MESSAGE_LIMIT = 30`
  - `BOUNDED_LOOP_MAX_STEPS = 2048`
  - `DEFAULT_BOUNDED_LOOP_MAX_DURATION_MS = 21_600_000`
  - `LONG_FORM_BOUNDED_LOOP_MAX_DURATION_MS = 43_200_000`
  - `ATTACHMENT_BOUNDED_LOOP_MAX_DURATION_MS = 43_200_000`
- `src/main/libs/coworkRunner/constants.ts`
  - 仍存在旧的 `SDK_STARTUP_TIMEOUT_MS = 90_000` 历史口径
- `src/main/coworkStore.ts`
  - 默认说明里仍然强调“共享记忆板 + 短期最近几条正文”这类短链表达

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\libs\httpSessionExecutor.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\main\libs\coworkRunner\constants.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\main\coworkStore.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team相关团队独立外部模块开发日志必看\CONTINUITY_REPAIR_LOG_2026-03-30_BROADCAST_CACHE_CONTEXT.md`

是否已修：

- 部分已修，部分未修

处理结果：

- 现役轻执行器已经不再是旧的 `90 秒 / 10 步` 口径，而是更长的 bounded loop 时长和更高 steps 上限。
- 但这次真实使用暴露出：文档、产品心智、长篇写作策略、定时任务预期、上下文承接规则还没有完全同步。
- 后续必须补一条明确主线：
  - 长篇写作是主线能力，不是特殊例外
  - 长任务不能继续按短问答默认边界裁剪
  - “广播板 + 最近几条正文”只能是默认轻链，不是长篇创作全文替代品
- 同时必须补记一条：这次问题之所以能暴露，不是因为系统更差了，而是因为它终于被真实接受、被长期用了。

---

## 9. #问题_独立体残留与沙盒镜像痕迹

现象：

- 当前 `team-single-page-sandbox` 作为一个要独立整理、独立部署、独立理解的项目根，仍然带着从 worktree / 沙盒阶段留下来的痕迹。
- 最明显的是根目录存在 worktree 指针型 `.git` 文件，而不是纯独立项目的空白状态。
- 同时根目录里还放着几份手工部署和调试产物，容易让后续接手者误判哪些是项目真相源，哪些只是阶段性产物。

入口：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox`

复现：

- 根目录存在 `.git` 文件，内容指向：
  - `gitdir: /c/Users/Admin/Desktop/3-main/delivery-mainline-1.0-clean/.git/worktrees/team-single-page-sandbox`
- 根目录同时存在：
  - `.deploy-sg.tar.gz`
  - `.tmp-deploy-sg.ps1`
  - `team_bundle.js`
  - `team_page.html`

当前判断：

- 目前没有发现嵌套 `.git` 子仓，也没有发现第二层 Git 仓直接污染代码目录。
- 所以这不是“代码已经炸成多仓冲突”，而是“独立体仍然带着 worktree 和手工部署时代的壳层残留”。
- 这种残留对本地运行不一定立刻致命，但会影响：
  - 独立体认知
  - 手工打包
  - 镜像交付
  - 后续部署时的边界判断

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\.git`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\.deploy-sg.tar.gz`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\.tmp-deploy-sg.ps1`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team_bundle.js`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team_page.html`

是否已修：

- 否

处理建议：

- 先不要盲删 `.git`，因为当前它仍然承担 worktree 身份。
- 但必须明确把这些东西标为：
  - `worktree/沙盒遗留`
  - `手工部署产物`
  - `非项目主真相源`
- 后续真正做“独立体净化”时，再单独决定：
  - 是继续保留 worktree
  - 还是导出成真正的独立 Git 仓 / 纯净交付根

---

## 10. #问题_配置真相源冲突

现象：

- 当前项目里的配置并不是单一真相源。
- `.env`、SQLite 里的 `app_config / im_config`、前端 `defaultConfig`、角色运行态视图、以及运行时同步逻辑同时存在。
- 实际使用中很容易出现“我改了这里，但系统读的是另一层”的错觉。

入口：

- `.env.example`
- `kv(app_config)`
- `kv(im_config)`
- 前端 `defaultConfig`
- `resolveCurrentApiConfig(...)`
- `syncAppConfigToEnv(...) / syncImConfigToEnv(...)`

复现：

- 当前本地数据库里：
  - `app_config.api.baseUrl = https://api2.penguinsaichat.dpdns.org/v1`
  - `app_config.model.defaultModelProvider = deepseek`
  - `providers.openai.enabled = false`
  - 但 `providers.writer.enabled = true` 且走 `api2.penguinsaichat.dpdns.org`
  - `organizer / designer / analyst` 还保留了不一致的旧 provider/baseUrl/apiFormat 残留
- 同时：
  - `.env.example` 仍然写着“系统会优先读 .env，没有时再读数据库设置”
  - 但 `src/main/libs/claudeSettings.ts` 的真实逻辑是：**数据库优先，.env 只是兜底**
- 另外：
  - `im_config` 在本地数据库里还是 `MISSING`
  - 但 IM / Feishu / IMA 相关读取链已经存在并会参与运行态判断

当前判断：

- 这不是单点值填错，而是“配置来源层级没有被彻底统一理解”。
- 当前项目实际上至少有 5 层配置来源：
  1. 前端默认配置 `defaultConfig`
  2. `.env / .env.example`
  3. SQLite `kv(app_config)`
  4. SQLite `kv(im_config)`
  5. `roles/*` 只读运行态视图 / 角色技能与 secret 派生文件
- 其中真实运行态优先级偏向：
  - `kv(app_config / im_config)`
  - `.env` 只是兜底
  - 但 `store.ts` 又会把数据库写入同步回 `.env`
- 这导致：
  - 看起来像“双向同步”
  - 实际上很容易让人误会“改哪个都一样”

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\main\libs\claudeSettings.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\routes\store.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\routes\apiConfig.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\config.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\.env.example`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\.uclaw\web\uclaw.sqlite`

是否已修：

- 部分已修

处理建议：

- 先正式写清“配置真相源优先级”，不要再让 `.env` 和数据库看起来像平级。
- 明确分离：
  - `defaultConfig` = 前端默认壳
  - `.env` = 部署兜底
  - `app_config / im_config` = 运行态真相源
  - `roles/*` = 只读派生视图
- 后续真正整理时，要先做一轮“删旧值 / 统一 provider / 统一角色配置口径”的收口，不然越同步越乱。

处理结果：

- 已补上第一刀职责收口：
  - 新增 `resolveDefaultAgentRoleKey(...)`
  - 让保存链和读取链都能从顶层默认入口 `api.* + model.defaultModel` 反推出“当前默认角色”
- 当前这一步还没有删掉 `api.* / model.* / agentRoles.*` 三层中的任何一层，
  但已经开始把它们的语义拆清：
  - `api.*` 更像全局默认入口
  - `agentRoles.*` 更像角色运行态
  - `model.defaultModel/defaultModelProvider` 不该再被拿来直接冒充角色身份

补充验证：

- 本轮改动后：
  - `tsc --noEmit` 通过
  - `eslint` 通过

---

## 13. #问题_IM 主名/兼容名双口径与后缀残留

现象：

- 飞书和 IMA 相关 env 名称同时存在主名和兼容名。
- 之前 `.env` 同步会把主名和兼容名一起写回，长时间下去会让 `.env` 越来越像历史垃圾堆。
- 飞书多应用如果减少数量，旧的 `_1 / _2 / ...` 后缀变量也容易残留。

入口：

- `server/routes/store.ts`
- `im_config`
- `.env`

复现：

- 保存 `im_config` 时，会同步回写飞书 / IMA 到 `.env`
- 旧逻辑会同时写：
  - 主名
  - 兼容名
  - 多应用后缀变量
- 这样后面很难一眼看出哪些是现役值，哪些是历史残留

当前判断：

- 对 IM 这组来说，兼容读取可以保留，但兼容写回不该再继续扩散。
- `.env` 应该是镜像，不应该变成遗迹博物馆。

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\routes\store.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\shared\envAliases.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\shared\imaRuntime.ts`

是否已修：

- 部分已修

处理结果：

- `syncImConfigToEnv(...)` 已收紧：
  - 飞书先清理旧的主名/兼容名/后缀残留，再只写主名 `UCLAW_FEISHU_*`
  - IMA 先清理旧名，再只写主名 `IMA_OPENAPI_*`
- 兼容名仍保留读取能力，
  但不再继续回写到 `.env`

补充验证：

- 本轮改动后：
  - `tsc --noEmit` 通过
  - `eslint` 通过

---

## 14. #问题_手工压缩上下文失败原因不可见

现象：

- 夏夏主动发起“手工压缩上下文”请求时，页面会提示失败并走本地摘要草稿降级。
- 之前用户只能看到：
  - “后端压缩暂不可用”
  - 或“压缩模型无响应，且角色模型降级也失败”
- 但看不出到底是：
  - 专门压缩模型没配置
  - 专门压缩模型接口报错
  - 返回了非 JSON
  - 角色降级没有配置
  - 还是两条链都失败

入口：

- `CoworkSessionDetail` -> “手工压缩上下文”

复现：

- `src/renderer/components/cowork/CoworkSessionDetail.tsx` 会调用：
  - `coworkService.compressContext(currentSession.id)`
- 后端走：
  - `server/routes/cowork.ts`
  - `server/libs/manualContextCompression.ts`

当前判断：

- 原来的失败信息太笼统，把真正失败原因吞掉了。
- 当前压缩器确实已经有：
  - 专门压缩模型配置（`dailyMemory`）
  - 角色模型降级
- 但一旦失败，前端很难知道是哪一层坏了。

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\libs\manualContextCompression.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\routes\cowork.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\services\cowork.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\cowork\CoworkSessionDetail.tsx`

是否已修：

- 部分已修

处理结果：

- 已增强压缩器失败诊断：
  - 如果主压缩返回非 JSON，会明确标成 `returned non-JSON compression output`
  - 如果主压缩接口本身报错，会带出 `source + error.message`
  - 如果角色降级存在，也会把降级失败原因一起拼出来
  - 如果角色降级根本没有可用配置，也会直接说明
- 这意味着下一次再失败时，前端收到的错误文本已经能区分：
  - 主压缩失败原因
  - 角色降级失败原因
  - 角色降级是否根本不存在

补充判断：

- 当前最近会话角色是 `writer`
- 本地 `app_config.dailyMemory` 已配置 `MiniMax-M2.7`
- `writer` 角色本身也有单独模型配置
- 所以下一次再失败时，重点看返回的新错误文本，就能判断是：
  - 专门压缩接口行为不符合预期
  - 还是角色降级模型同样没有产出可解析 JSON

---

## 11. #问题_质量扫描与类型收口

现象：

- 代码库目前已经能跑主流程，但质量扫描还没有完全收口。
- `eslint` 在当前环境下可以跑通，但 TypeScript 全量检查仍然能扫出一批明确错误。

入口：

- `lint`
- `tsc --noEmit`

复现：

- `eslint` 通过直接调用本地 `eslint.js` 已能成功跑通。
- `tsc --noEmit -p tsconfig.json` 当前仍报一组确定错误，主要分布在：
  - `src/renderer/components/cowork/*`
  - `src/renderer/components/mcp/*`
  - `src/renderer/components/scheduledTasks/*`
  - `src/renderer/services/electronShim.ts`
  - `src/renderer/utils/textFileChunking.ts`

当前判断：

- 这说明项目不是“全局语法都烂了”，而是已经进入“局部边角类型债务未收”的阶段。
- 当前最显眼的一组问题是：
  - 未使用导入/变量
  - `CoworkSessionSummary` 与 `CoworkSession` 混用
  - `null / undefined` 边界没收紧
  - 某些索引类型 / 联合类型还没被正确约束
  - `electronShim` 缺少 `CoworkManualCompressionResult` 类型引用

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\cowork\CoworkPermissionModal.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\cowork\CoworkQuestionWizard.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\cowork\CoworkSessionDetail.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\cowork\CoworkView.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\mcp\McpManager.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\scheduledTasks\TaskForm.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\services\electronShim.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\utils\textFileChunking.ts`

是否已修：

- 是（第一轮已收口）

处理建议：

- 先不要一口气全修。
- 后续按模块收口：
  1. `cowork` 视图与会话类型
  2. `scheduledTasks`
  3. `mcp`
  4. `electronShim / utils`
- 同时保留一个明确判断：
  - `eslint` 已能跑
  - 当前主要欠账在 TypeScript 类型收口，不是 lint 体系本身坏了

处理结果：

- 已完成第一轮 TypeScript 收口，`tsc --noEmit -p tsconfig.json` 当前通过。
- 已完成 `eslint` 复核，当前 lint 通过。
- 本轮修的不是大改架构，而是把“会反复吓人的边角错误”先清掉，包括：
  - `cowork` 主链里的 summary/session 类型对齐
  - 未使用导入/变量清理
  - `electronShim` 缺失类型引用
  - `scheduledTasks` 的通知平台类型与 IM 配置强转
  - `mcp / skills / sidebar` 的一些边角类型与展示口径

补充判断：

- 这轮通过后，当前项目已经从“主流程可跑但边角类型心虚”推进到“静态检查层面可交代”。
- 后续再出同类问题时，不要再把它当成“项目本来就很多小红线”的默认状态。

---

## 12. #问题_Team配置耦合在页面里

现象：

- `team` 当前虽然已经是外挂式单页，但默认任务定义、画布参数、标尺常量、UI 常量最初都直接写在 `SingleTaskRunnerPage.tsx` 里。
- 这会让 `team` 看起来像能拆，实际上搬的时候还得回页面组件里一点点抠配置。

入口：

- `team.html`
- `src/renderer/team-main.tsx`
- `src/renderer/components/team/SingleTaskRunnerPage.tsx`

复现：

- 只看 `SingleTaskRunnerPage.tsx` 顶部，就能看到：
  - demo task definition
  - initial runtime
  - canvas viewport
  - anchors
  - ruler marks
  - input/button class 常量
  都糊在页面组件文件里

当前判断：

- 这不算逻辑 bug，但它会阻碍后续真正把 `team` 当成独立积木搬走。
- `team` 是复杂外挂，不能用“顺手复制页面”这种方式维护。
- 它必须先把自己的运行时配置和页面常量归到自己的模块里。

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\team\SingleTaskRunnerPage.tsx`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\components\team\teamRuntimeConfig.ts`

是否已修：

- 部分已修

处理结果：

- 已新增 `teamRuntimeConfig.ts`
- 已把以下内容从 `SingleTaskRunnerPage.tsx` 抽到 `team` 自己的配置模块：
  - 默认任务定义
  - 初始 runtime
  - 画布尺寸 / 锚点 / 标尺常量
  - `team` 自己的 UI 常量
- 这代表 `team` 开始真正按“积木思路”解耦，而不是继续把配置和页面糊在一起。

---

## 9. #问题_断了再续内容断裂

现象：

- 用户在真实使用里遇到“中断后继续”，但继续生成的内容和前文明显接不上。
- 不是单纯停一下再续，而是像上下文被切断、前面已经写过/说过的东西没有自然带过来。

入口：

- 长篇小说创作
- 分章节续写
- 长时间写作会话
- 用户中断后再点继续 / 再发一轮

复现：

- 用户先让系统持续生成一段较长内容
- 中途被打断
- 再继续时，后续内容出现断裂感，像前文没有顺着接住

当前判断：

- 这是现实使用里暴露出来的主线问题，不是边角现象。
- 这类问题通常不只是一处按钮状态，而是会牵涉：
  - `sessionId` 是否稳定沿用
  - 当前轮上下文是否携带到位
  - bounded loop / continue 逻辑是否把同一条创作链误切成多段
  - “广播板 + 最近几条正文”是否不足以承接长写作

相关文件：

- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\libs\httpSessionExecutor.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\server\routes\cowork.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\main\coworkStore.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\src\renderer\services\cowork.ts`
- `D:\Users\Admin\Desktop\3-main\delivery-mainline-1.0-clean\.worktrees\team-single-page-sandbox\team相关团队独立外部模块开发日志必看\2026-04-08_LONG_FORM_WRITING_TIMEOUT_AND_CONTEXT_RECALIBRATION.md`

是否已修：

- 部分优化过，但尚未正式收口入账

处理结果：

- 当前已知现实情况是：我们已经对 `sessionId / loop / context carry` 做过优化，但还没有把这次变化正式同步进文档和问题台账。
- 这本身就是一个流程问题：
  - 真实修过
  - 但没写下来
  - 未来就容易又踩一次
- 后续必须补一份专项记录，明确：
  - 当时的问题是什么
  - 代码改了哪里
  - 继续生成时为什么会断
  - 现在的边界和仍然残留的风险是什么
