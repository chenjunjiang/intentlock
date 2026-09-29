# IntentLock QA 报告

日期：2026-09-29

## 环境

- Bun 1.3.14
- Vite 7.3.6
- Vitest 3.2.7
- Supabase CLI 2.118.0
- Vercel CLI 60.0.1
- 本地 macOS arm64

## 2026-09-29 生产上线验收：价格反馈与证据链修复

- 生产部署：`dpl_2VMywvvVAonZCMzJKdXRyrVKBmUo`，状态 `READY`；稳定地址 [intentlock-nine.vercel.app](https://intentlock-nine.vercel.app)，本次部署地址 `https://intentlock-pl8fern58-gumu1.vercel.app`。使用 `bunx vercel@60.0.1 --prod --yes`，Vercel 生产构建成功并绑定稳定域名。
- 生产命令：`E2E_BASE_URL=https://intentlock-nine.vercel.app PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`，桌面与 Pixel 7 共 14/14 通过，0 skip、0 xfail。成功路径的事件请求实际经过生产 Edge API 与 Supabase；失败重试场景只模拟首次价格反馈降级，第二次提交仍走真实接口。所有场景均核对事件请求方法、路径、正文与 204/`stored` 响应，Console error 与未捕获异常为 0。
- 系统 Chrome 读取生产首页 HTTP 200；`/api/e?health=1` HTTP 200，返回 `degraded:false`、`storage:supabase`、`ingestFailures:0`。首页响应包含 CSP、HSTS、`nosniff`、`strict-origin-when-cross-origin` 及禁用摄像头/麦克风/定位的 Permissions-Policy。
- E2E 前固定测试 session 为 0 条，之后只读预检为 40 条；执行 `bun run test:e2e:cleanup --execute` 精确删除该 session 的 40 条，复查残留 0 条。没有删除其他会话。
- 上线后只读汇总排除测试 session：2 个会话各有 1 次 `visit`，暂无 `analysis_completed`、`repeat_use` 或 `pricing_interest`。样本过少，且访问未转化为检查，不能据此声称产品需求或付费意愿已验证。

### 生产逐场景视觉结论

以下 16 张生产截图均已实际查看，并复制到不会被下一次 E2E 覆盖的 `docs/evidence/feedback-qa-fix/production/`。仅含合成测试文本，无凭据或真实用户内容。桌面双栏、移动单栏及失败提示均无可见截断、遮挡、横向溢出或重叠。路径相对于本文件。

| 场景 | 浏览器步骤与 DOM/视觉结果 | 生产截图 |
| --- | --- | --- |
| 危险改写 | 检查默认危险改写 → 4 项红色风险与保护项可见 | [桌面](evidence/feedback-qa-fix/production/main-flow-checks-an-unsafe-AI-rewrite-from-the-real-UI-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/production/main-flow-checks-an-unsafe-AI-rewrite-from-the-real-UI-mobile-chromium/final.png) |
| 最小语法修正 | 切换修正模式并执行 → 绿色结果与保护项可见 | [桌面](evidence/feedback-qa-fix/production/main-flow-switches-to-a-safe-minimal-grammar-fix-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/production/main-flow-switches-to-a-safe-minimal-grammar-fix-mobile-chromium/final.png) |
| 重要措辞变化 | 输入 `partially effective → somewhat efficient` → 黄色复核与差异词可见 | [桌面](evidence/feedback-qa-fix/production/main-flow-asks-for-human-r-92f59-n-important-wording-changes-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/production/main-flow-asks-for-human-r-92f59-n-important-wording-changes-mobile-chromium/final.png) |
| 新增数字 | 输入 `I have apples. → I have 10 apples.` → 黄色复核与新增数字可见 | [桌面](evidence/feedback-qa-fix/production/main-flow-asks-for-human-r-4be9b-n-the-rewrite-adds-a-number-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/production/main-flow-asks-for-human-r-4be9b-n-the-rewrite-adds-a-number-mobile-chromium/final.png) |
| 同级谨慎措辞 | 输入 `may → might` → 绿色结果，无误报 | [桌面](evidence/feedback-qa-fix/production/main-flow-accepts-equivalent-cautious-wording-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/production/main-flow-accepts-equivalent-cautious-wording-mobile-chromium/final.png) |
| 价格兴趣成功 | 两次检查后提交回答 → 真实写入后致谢，检查按钮可用 | [桌面](evidence/feedback-qa-fix/production/main-flow-asks-for-pricing-56bd6-ithout-blocking-free-checks-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/production/main-flow-asks-for-pricing-56bd6-ithout-blocking-free-checks-mobile-chromium/final.png) |
| 降级后重试 | 首次模拟降级 → 失败提示；重试真实写入 → 才显示致谢 | [桌面失败](evidence/feedback-qa-fix/production/main-flow-keeps-pricing-in-8ea69-yable-when-storage-degrades-desktop-chromium/failure.png) / [桌面成功](evidence/feedback-qa-fix/production/main-flow-keeps-pricing-in-8ea69-yable-when-storage-degrades-desktop-chromium/final.png) / [移动失败](evidence/feedback-qa-fix/production/main-flow-keeps-pricing-in-8ea69-yable-when-storage-degrades-mobile-chromium/failure.png) / [移动成功](evidence/feedback-qa-fix/production/main-flow-keeps-pricing-in-8ea69-yable-when-storage-degrades-mobile-chromium/final.png) |

生产截图对应的前端/API/E2E 文件 SHA-256 与下节所列 4 个哈希一致；部署后未修改这些文件。该生产版本来自未提交工作树，并非 GitHub 自动部署；仓库与线上尚未对账。后续须先提交、合并并验证主分支，经单独授权推送，再连接 Vercel Git 集成，核对 Git 来源部署；参见 `docs/deployment-workflow.md`。

2026-09-29 Git-first 流程纠偏时对当前源码复验：`git diff --check`、`bun run lint`、`bun run test`（30/30）、`bun run build`、`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`（14/14）全部通过，0 skip、0 xfail；上述四个源码哈希仍与报告一致。这只是功能分支本地复验，不等同于主分支验证或 Git 来源生产部署。

主 checkout 快进合并至 `main@02ac4bb` 后再次执行 `bun run lint`、`bun run test`（30/30）、`bun run build`、`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`（14/14），全部通过，0 skip、0 xfail。主分支前端/API/E2E 文件与上方截图哈希一致；桌面与移动 E2E 仍从真实 UI 操作，逐场景截图与视觉判定见上表。`bun run test:e2e:cleanup` 对固定生产项目和测试 session 只读预检为 0 条，本轮本地 E2E 不写生产。此时远端 `main` 尚未推送，Git 来源生产部署尚未验证。

随后 `main@7277b33` 已推送至 GitHub，Vercel Git 设置页显示连接到 `chenjunjiang/intentlock`。连接前的推送没有触发自动部署；后续需用连接后的新提交验证 Git webhook、生产分支、部署提交哈希、稳定域名和真实入口。上述历史截图仍对应同一源码哈希，但不能证明 Git 自动部署已经生效。

### Git 来源生产部署验收

- 连接后的 `main@1149b2f204268cc3c0ebf3ae1b2b8c49f7866b6c` 推送自动创建部署 `dpl_Cv7rvgxfvje7gdR4zUMEwzo48i1F`。Vercel CLI 的 `githubCommitSha` 过滤返回该生产部署；项目概览显示 Source 为 GitHub `main` 的同一提交、状态 `Ready`，稳定域名 `https://intentlock-nine.vercel.app` 指向该部署。未运行 `vercel --prod`。
- 固定测试 session 发布前为 0 条。`E2E_BASE_URL=https://intentlock-nine.vercel.app PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e` 在桌面与 Pixel 7 共 14/14 项通过，0 skip、0 xfail，事件请求与真实存储响应断言通过。测试后只读预检为 40 条，`bun run test:e2e:cleanup --execute` 精确删除 40 条，复查为 0 条；其他会话未删除。
- 系统 Chrome 禁用 JavaScript 后真实导航首页和 `/api/e?health=1`，均返回 HTTP 200；健康响应为 `degraded:false`、`storage:supabase`、`ingestFailures:0`。首页和健康接口均返回 CSP（含 `frame-ancestors 'none'`）、HSTS、`x-content-type-options:nosniff`、Referrer-Policy 与 Permissions-Policy。终端 `curl` 两次连接超时，只表明该终端网络路径不可用，未计为服务失败或验证通过。
- 新一轮 E2E 的 16 张截图与同源码哈希的已入库生产截图对照：13 张逐字节一致；3 张移动截图逐对实际查看，文案、结果、卡片和布局一致，无可见截断、遮挡、溢出或重叠。逐 Scenario 的步骤、DOM 结果和存档截图链接仍见上表；前端/API/E2E 源码哈希未变。

需求完整性 verify：AC-1 至 AC-6、Git-first 发布目标、真实生产入口、测试数据清理均有对应证据；未发现缺项。独立 code/release review：本轮 Git 设置只连接目标仓库，部署来源与远端提交一致；文档状态提交未改业务源码，安全头和存储健康未回退。未发现 P0/P1。剩余风险：Vercel GitHub App 对新增指定仓库拥有代码、工作流等较宽的读写权限，需定期复核授权；本次验证证明 GitHub `main` 推送自动生产部署，但真实用户需求是否成立仍须用非测试行为数据判断。

## 2026-09-29 部署前候选版本：价格反馈与证据链修复

本节是部署前的本地验收快照，对应工作树 `codex/feedback-qa-fix`、基线提交 `39c0ef7`；当时尚未部署或运行新版生产 E2E。生产结果见上节。历史 2026-09-28 章节的 `test-results/` 截图是被后续运行覆盖的临时路径，现已无法按原路径复核；本次本地证据保存在 `docs/evidence/feedback-qa-fix/`。

### 调试与验证

- 假设：价格回答的“已记录”由本地点击状态触发，与真实写入无关；204 不能区分成功、降级和限流。
- 实验：新增组件/API 回归测试；旧实现出现 6 项失败，原有 24 项通过。修复后 `bun run test` 为 4 文件 30 项通过，0 skip、0 xfail。
- 根因：前端未等待 `fetch` 结果，接口对成功和限流都返回无标识的 204。
- 最小修复：增加 `x-intentlock-storage` 三态响应；价格卡片等待 `stored`，其余状态显示可重试提示；免费检查仍可用。
- `bun run build`：通过。`bun run lint`：通过。`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：本地桌面与 Pixel 7 共 14 项通过，0 skip、0 xfail；每个事件的请求方法、精确路径、正文解析和响应状态均经过浏览器网络断言。本地 Vite 不运行 Edge API，E2E 仅对遥测接口模拟响应；真实写入已在上节的生产 E2E 验证。
- `bun run test:e2e:cleanup`：只读查询目标项目 `dpbicjfthmyeosjdftyn`、固定 session `intentlock-e2e-session`，当时为 0 条；本轮未执行删除。

### 逐场景视觉结论

下表每行桌面与移动最终截图均已实际查看；仅包含合成测试文本，没有账号或密钥。移动端均为单栏，按钮、结果和文案无可见截断、遮挡、横向溢出或重叠。以下路径相对于本文件所在目录。

| 场景 | 视觉与功能判定 | 桌面 / 移动证据 |
| --- | --- | --- |
| 危险改写 | 4 项红色风险与保护项正确呈现 | [桌面](evidence/feedback-qa-fix/main-flow-checks-an-unsafe-AI-rewrite-from-the-real-UI-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/main-flow-checks-an-unsafe-AI-rewrite-from-the-real-UI-mobile-chromium/final.png) |
| 最小语法修正 | 绿色结果与保留保护项说明正确 | [桌面](evidence/feedback-qa-fix/main-flow-switches-to-a-safe-minimal-grammar-fix-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/main-flow-switches-to-a-safe-minimal-grammar-fix-mobile-chromium/final.png) |
| 重要措辞变化 | 黄色复核与删除/新增词可辨认 | [桌面](evidence/feedback-qa-fix/main-flow-asks-for-human-r-92f59-n-important-wording-changes-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/main-flow-asks-for-human-r-92f59-n-important-wording-changes-mobile-chromium/final.png) |
| 新增数字 | 黄色复核与“10”新增提示可见 | [桌面](evidence/feedback-qa-fix/main-flow-asks-for-human-r-4be9b-n-the-rewrite-adds-a-number-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/main-flow-asks-for-human-r-4be9b-n-the-rewrite-adds-a-number-mobile-chromium/final.png) |
| 同级谨慎措辞 | `may → might` 绿色结果，无误报 | [桌面](evidence/feedback-qa-fix/main-flow-accepts-equivalent-cautious-wording-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/main-flow-accepts-equivalent-cautious-wording-mobile-chromium/final.png) |
| 价格兴趣成功 | 显示已记录，免费检查按钮仍可用 | [桌面](evidence/feedback-qa-fix/main-flow-asks-for-pricing-56bd6-ithout-blocking-free-checks-desktop-chromium/final.png) / [移动](evidence/feedback-qa-fix/main-flow-asks-for-pricing-56bd6-ithout-blocking-free-checks-mobile-chromium/final.png) |
| 存储降级后重试 | 失败时显示可重试提示，重试后才致谢 | [桌面失败](evidence/feedback-qa-fix/main-flow-keeps-pricing-in-8ea69-yable-when-storage-degrades-desktop-chromium/failure.png) / [桌面成功](evidence/feedback-qa-fix/main-flow-keeps-pricing-in-8ea69-yable-when-storage-degrades-desktop-chromium/final.png) / [移动失败](evidence/feedback-qa-fix/main-flow-keeps-pricing-in-8ea69-yable-when-storage-degrades-mobile-chromium/failure.png) / [移动成功](evidence/feedback-qa-fix/main-flow-keeps-pricing-in-8ea69-yable-when-storage-degrades-mobile-chromium/final.png) |

截图对应的核心文件 SHA-256：`src/App.tsx` 为 `df46a53a74db4ed3eb5744c1be3489d3ab75e1899bdbf877a0ccd91a1e2c5d18`，`src/App.css` 为 `de74eee642562d4f71252c1141595a089e2b98e3b2804aa1a8d5820f20220fdc`，`api/e.ts` 为 `bf8217e88911b7374a8ae73a9383765c47aae18471dbf4686776be2eb4461425`，`e2e/main-flow.spec.ts` 为 `908cd51d765e49dfa63064b5851f5aba8ba92d898792d44fe9a6ea46cc3fb473`。这些哈希标识截图所对应的代码状态；相关文件后续若修改，需重跑 E2E 并更新证据。

## 2026-09-28 生产版本

本节对应 2026-09-28 当时部署到稳定域名的版本，不对应上方 2026-09-29 待部署候选版本。当时本地与生产证据分开执行，并在部署后完成真实入口验收。

### 调试链

- 假设：普通内容词变化没有进入保护项抽取，导致语义漂移被错误显示为绿色；`may` 与 `might` 的逐字匹配导致同级谨慎语气误报。
- 实验：通过生产真实入口复现 10 组案例，并在本地为 3 组漏报、1 组误报、纯删除和 diff 顺序补回归测试。
- 观察：旧版本漏报 `partially effective → somewhat efficient`、`clear → understood`、`often ... unsure → frequently ... uncertain`，并误报 `may → might`；替换 diff 还存在“新增→删除”紧贴显示问题。
- 根因：规则只校验固定抽取词是否逐字存在，没有未解释内容词变化状态；LCS 平局时优先新增导致替换顺序不自然。
- 最小修复：保留浏览器本地规则，新增黄色人工复核状态；只将 `may/might/could` 归为同级谨慎语气；红色风险优先于黄色复核；diff 改为“删除→新增”并增加视觉间隔。

### 自动化验证

- `bun run lint`：通过。
- `bun run test`：4 个文件、24 个测试通过，0 skip、0 xfail。
- `bun run build`：通过，产物位于 `dist/`。
- `PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：桌面与 Pixel 7 共 12 个场景通过，0 skip。
- `E2E_BASE_URL=https://intentlock-nine.vercel.app PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：生产环境桌面与 Pixel 7 共 12 个场景通过，0 skip。
- 12 个浏览器场景均断言 Console error 和未捕获页面异常为 0；每个匿名事件请求都通过生产 `parseProductEvent` 解析。
- 本地 Vite 不运行 Vercel Edge API，因此本地 UI E2E 把遥测传输响应替换为 204；生产 E2E 不拦截 `/api/e`，已实际验证 Vercel Edge handler、Supabase 写入链路和生产 Console。

### Scenario → 浏览器证据

| Scenario | 浏览器步骤与 DOM 结果 | 截图 |
| --- | --- | --- |
| 保护项风险 | 打开页面 → 检查默认危险改写 → 显示 4 项风险和 `Review before sending` | `test-results/main-flow-checks-an-unsafe-AI-rewrite-from-the-real-UI-*/final.png` |
| 最小语法修正 | 切换 `Minimal grammar fix` → 执行修正 → 显示绿色 `No unexplained meaning changes found` | `test-results/main-flow-switches-to-a-safe-minimal-grammar-fix-*/final.png` |
| 未解释措辞变化 | 输入 `partially effective → somewhat efficient` → 显示黄色 `Wording changes need review`、空保护项说明和删除/新增词 | `test-results/main-flow-asks-for-human-r-92f59-n-important-wording-changes-*/final.png` |
| 改写新增数字 | 输入 `I have apples. → I have 10 apples.` → 显示黄色复核与 `Added: “10”` | `test-results/main-flow-asks-for-human-r-4be9b-n-the-rewrite-adds-a-number-*/final.png` |
| 同级谨慎语气 | 输入 `may → might` → 不产生红色或黄色告警，显示绿色结果 | `test-results/main-flow-accepts-equivalent-cautious-wording-*/final.png` |
| 非阻断价格反馈 | 连续完成两次检查 → 提交兴趣回答 → 检查按钮保持可用 | `test-results/main-flow-asks-for-pricing-56bd6-ithout-blocking-free-checks-*/final.png` |

已实际读取上述生产环境桌面和移动共 12 张最终截图。页面状态、diff、卡片、按钮与移动单栏均无文字截断、遮挡、横向溢出或重叠。截图生成后未再修改前端业务文件。

### Verify 与独立 code review

- Verify：红/黄/绿需求、隐私边界、测试、UI 和文档逐项一致，`git diff --check` 通过。
- 独立 code review：发现“数字只出现在改写中”时会漏过检查，原因是重要 token 仅抽取英文单词；已把数字、金额和百分比纳入黄色差异比较，并补单元测试及桌面/移动真实 UI 场景。
- Console 门控进一步发现本地 Vite 的 `/api/e` 返回 404，并由协议对账发现新增 `reviewCount` 未加入服务端白名单、部署后会返回 400；已收紧本地 E2E 遥测校验并补齐生产解析器与 API handler 测试。
- 修复后边界矩阵确认新增数字、金额、百分比、否定和普通内容词均至少进入黄色复核，同级 `may/might/could` 仍不误报；事件请求不含写作文本并通过严格白名单；未发现剩余 P0/P1。

## 已完成证据

- `bun run lint`：通过，0 warning。
- `bun run test`：4 个文件、24 个测试通过，0 skip。
- `bun run build`：通过，产物位于 `dist/`。
- `PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：桌面与 Pixel 7 共 12 个场景通过，0 skip。
- `E2E_BASE_URL=https://intentlock-nine.vercel.app PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：生产环境 12 个场景通过，0 skip；Console error 与未捕获页面异常为 0。

## 生产部署

- 稳定地址：`https://intentlock-nine.vercel.app`。
- 本次部署地址：`https://intentlock-doewkf0l0-gumu1.vercel.app`。
- 使用 `vercel@60.0.1` 完成生产部署并绑定稳定地址；`vercel@60.1.3` 曾出现登录授权回归，因此部署命令暂时固定版本。
- 通过系统 Chrome 网络路径读取 HTTPS 首页，返回 HTTP 200；当前终端直连 Vercel 的 443 端口超时，因此未把 `curl` 结果作为服务可用性证据。
- 已核对响应头：CSP、HSTS、`X-Content-Type-Options: nosniff`、`Referrer-Policy` 和禁用摄像头、麦克风、地理位置的 `Permissions-Policy` 均已生效。

## UI 与接口检查

- 桌面与移动端首屏、双栏/单栏编辑器、红/黄/绿结果、数字新增提示、4 项风险卡、空保护项和差异区显示正常，无重叠、截断或横向溢出。
- `/api/e?health=1` 通过系统 Chrome 网络路径返回 HTTP 200 和 `{"degraded":false,"storage":"supabase","ingestFailures":0}`。
- 合法的空元数据 `visit` 事件返回 HTTP 204，并在 Supabase 精确回查到 1 行。
- 含顶层 `source`、未知 metadata、嵌套对象或超大请求体的事件返回 HTTP 400。
- 跨域浏览器请求返回 HTTP 403；事件入口限制每 IP/会话每分钟 60 次。
- Supabase publishable key 直接读取事件表返回 HTTP 401；只有服务端 Secret key 可以读写。
- 新 `sb_secret_` 仅通过 `apikey` 头发送；测试明确断言不发送 `Authorization: Bearer`。

## 数据与清理

- 测试不上传用户文本。
- 本地测试只使用浏览器内存/localStorage。
- 独立 Supabase 项目：`dpbicjfthmyeosjdftyn`，区域为新加坡 `ap-southeast-1`，组织套餐为 Free。
- `0001`、`0002`、`0003` 三条 migration 的本地与远端版本一致。
- 生产 E2E 固定使用 `intentlock-e2e-session`，便于精确识别和清理测试事件。
- 2026-09-27 验收确认的 19 条旧测试事件及当时固定 session E2E 事件已删除，清理后事件表为 0 行。
- 2026-09-28 生产 E2E 再次使用固定测试会话写入匿名测试事件；获授权后按 `session_id = 'intentlock-e2e-session'` 精确删除 55 条，复查该 session 剩余 0 条，其他 session 仍保留 1 条。
- 清理后生产 `/api/e?health=1` 返回 HTTP 200 和 `{"degraded":false,"storage":"supabase","ingestFailures":0}`；没有重新运行生产 E2E，避免再次生成测试事件。

## 独立评审结论

- 评审发现原实现只限制 metadata，顶层额外字段仍可能到达服务端；已改为顶层与 metadata 双重严格白名单，并增加 4KB 请求限制、同源校验和回归测试。
- 发现 Supabase 新 Secret key 不能沿用旧 `service_role` JWT 的 Bearer 写法；依据官方文档改为仅使用 `apikey`，并创建专用 `vercel_intentlock` key 完成真实写入验证。
- 修复后重新完成 lint、24 个单元/组件/API 测试、生产构建、本地 12 条 E2E、生产 12 条 E2E、真实事件入口、健康检查和安全响应头验证。
- 未发现阻断上线验证的剩余 P0/P1 问题。

## 已知风险

- 当前规则能确定检查保护项，并将未解释的重要英文内容词变化降级到黄色人工复核，但不能证明完整语义等价，也不能识别仅靠语序、指代或上下文造成的全部变化。
- 当前没有直接调用大模型，复杂的隐含语义漂移仍可能漏检；应先验证真实复用，再决定是否引入“规则 + 大模型”。
- Edge 限流是单实例内存级粗限流，不是全局强配额；验证期足够，放大流量前应增加数据库日上限或托管限流。
- 90 天清理函数目前需要手动调用；正式持续运营前应增加月度定时任务。
