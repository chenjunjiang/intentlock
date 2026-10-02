# IntentLock QA 报告

更新：2026-10-02

## 2026-10-02 收尾：错误绿灯与匿名漏斗（10-01 本地验证）

- 代码状态：`main@8047128` 上的未提交工作区；本轮改动尚未推送或部署。截图对应 `src/App.tsx` SHA-256 `c9aea38f67b68c33208e6fe70d630c6cd28312a48440f6eb1080112104c50a89`、`src/lib/intent-lock.ts` `33fe458b07101becff520c60fc6acb34fad0ae4f79aeda41783a730ea9d112bd`、`src/lib/event.ts` `e59b33dfd94a58dce2755bea7bf5ee81c08dc46199a9a3611cfa7d8be7b7c5b7`、`e2e/main-flow.spec.ts` `955f6846fc5ba20865b30889b805f94634b276bf018cfd5034b1dfc1d4b688ca`。
- 调试假设与实验：比较器的无序内容词比较、功能词过滤及保护项子串匹配会造成错误绿灯；内置 `ask → asked` 改变时态；编辑后旧结果未失效。用现有 `compareLocks` 的 `bun -e` 复现角色互换、代词互换与时态问题，再补回归测试。新测试在旧实现上 9 项失败；补充旧结果与大小写边界时，又先见到 2 项失败。
- 观察与根因：`Alice pays Bob → Bob pays Alice`、`He approved it → She approved it` 原先均无风险与复核；`Sam` 可被 `Samantha` 的子串冒充保留；编辑已检查文本后旧绿色标题仍显示。根因是无序词袋、大小写折叠、无边界子串匹配与结果状态未随输入失效。
- 最小修复：保护项改为整值边界匹配；绿色情况要求受控归一化后的有序词及标点序列一致；代词、大小写、词序和标点变化进入黄色复核；移除 `ask → asked`；编辑或切换模式立即清除旧结果。匿名事件只增加空元数据的首次编辑，以及检查完成的 `inputKind`、`resultState` 枚举；迁移文件扩充事件名约束，生产执行尚待发布门控。
- 最终验证：按序运行 `bun run lint`（通过）、`bun run test`（5 文件 50/50，通过，0 skip/xfail）、`bun run build`（通过）、`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`（本地 Vite，桌面与 Pixel 7 共 22/22，通过，0 skip/xfail）；`git diff --check` 通过。E2E 对每个 `/api/e` 请求核对同源、POST、无 `Referer`、生产解析器可接受，以及 204/`stored` 模拟响应；Console error 与页面异常为 0。

| Scenario | 浏览器步骤与 DOM/视觉结论 | 桌面 / 移动证据 |
| --- | --- | --- |
| 危险改写 | 检查默认示例，4 项红色风险仍出现；保护项和差异可见 | [桌面](evidence/false-green-funnel/danger-desktop.png) / [移动](evidence/false-green-funnel/danger-mobile.png) |
| 受控最小修正 | 切换修正模式并执行，绿色结果与保留保护项说明正确 | [桌面](evidence/false-green-funnel/safe-desktop.png) / [移动](evidence/false-green-funnel/safe-mobile.png) |
| 角色互换与匿名漏斗 | 输入 `Alice pays Bob → Bob pays Alice` 后显示黄色复核；网络请求恰有一次空元数据首次编辑，检查事件仅有 `custom/review` 枚举，无写作文本 | [桌面](evidence/false-green-funnel/roles-desktop.png) / [移动](evidence/false-green-funnel/roles-mobile.png) |
| 代词变化 | 输入 `I approved it → We approved it`，显示黄色及删除/新增代词 | [桌面](evidence/false-green-funnel/pronoun-desktop.png) / [移动](evidence/false-green-funnel/pronoun-mobile.png) |
| 标点变化 | 输入 `Please eat, Grandma → Please eat Grandma`，显示黄色；`Grandma` 保护项清晰 | [桌面](evidence/false-green-funnel/punctuation-desktop.png) / [移动](evidence/false-green-funnel/punctuation-mobile.png) |
| 旧绿色失效 | 先完成绿色修正，再编辑原文；旧结果和复制按钮立即消失 | [桌面](evidence/false-green-funnel/after-edit-desktop.png) / [移动](evidence/false-green-funnel/after-edit-mobile.png) |

以上 12 张最终代码状态截图均已实际查看，只有合成示例文本，无凭据或真实用户内容；桌面双栏、移动单栏、结果卡片和按钮未见明显截断、遮挡、横向溢出或重叠。浏览器 E2E 走真实本地 UI，但本地 Vite 对事件接口模拟 204/`stored`；API handler 单测的 Supabase 请求也使用 mock，因此**生产迁移、真实 Edge → Supabase 写入及新版只读 SQL 尚未验证**。本轮没有向共享服务写测试数据，清理不适用。

需求完整性核对（独立 pass）：AC-1 对应边界、顺序、代词、大小写、标点与结果失效的单元/组件/E2E；AC-2 对应最小修正、`may → might` 与时态单测；AC-3 对应事件白名单、handler、组件及浏览器请求体；AC-4 对应漏斗 SQL 与历史未知口径；AC-5 对应已有遥测失败不阻断检查及新增迁移顺序。未发现本地验收缺项；AC-4 的真实数据库执行与 AC-5 的生产存储仍待发布后验证，完整生产 QA 门控未通过。

独立代码审查：检查了结果状态失效、保护项边界、枚举白名单、原文不出网、旧事件兼容、迁移约束和漏斗分母；本地 diff 未见 P0/P1。剩余风险：异步事件可能在服务端以不同顺序写入，紧邻访问边界的漏斗窗口会归错或漏计；上报失败/限流使指标低估；绿色仍是规则判断而非完整语义证明；迁移 SQL 和只读查询尚未在真实 PostgreSQL/生产库执行。发布前必须先执行迁移，再经单独授权推送、Git 自动部署和真实入口复验。

## 2026-09-30 本地候选：访问归因与内部流量标记

- 范围：只扩充 `visit` 的严格元数据；无数据库迁移、无新依赖、无可见 UI 变更。生产基线只读查询为 9 个浏览器标识、9 次访问，完成检查等后续事件为 0；旧访问均无来源信息。
- TDD：新测试先在旧实现上失败；复查发现 `utm_source=constructor` 命中普通对象原型，回归测试先红后改为 `Map` 通过。验收追溯还发现默认同源请求附带 `Referer`；桌面/移动真实浏览器测试先各自失败，设置 `referrerPolicy: 'no-referrer'` 后通过。旧 API/UI 主流程用例未放宽。
- 当前工作树 `codex/attribution-tracking`：最后一次源码修改后 `bun run lint` 通过；`bun run test` 5 文件 38/38 通过，0 skip/xfail；`bun run build` 通过；`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e` 在本地 Vite 的桌面与 Pixel 7 共 16/16 通过，0 skip/xfail；最终文档修改后 `git diff --check` 通过。
- AC-1/2：服务端解析器只接受渠道枚举与内部布尔值；单测覆盖已知 UTM、Referrer 主机名、伪造子域、未知值及原型属性。API 测试确认原始活动字段被拒绝。
- AC-3：组件和真实浏览器 E2E 核对 `/api/e` 请求仅含 `{channel, internal}`，且请求头没有 `Referer`；内部参数从地址栏删除，标记可持续且可清除。浏览器 E2E 亦断言 Console 与页面异常为 0。
- AC-4/5：空元数据旧 `visit` 仍被接受；访问上报失败时本地检查仍可用；现有危险改写、最小修正、价格反馈和存储降级重试等桌面/移动主链路全通过。只读漏斗 SQL 已对当前生产库执行，返回“历史未知”9 次访问、9 个浏览器标识，其他行为窗口均为 0；查询和口径见 `docs/attribution-tracking.md`。
- 最后一次前端源码修改后的新场景截图已实际查看，并与归档图逐字节哈希一致：[桌面](evidence/attribution-tracking/desktop.png) / [移动](evidence/attribution-tracking/mobile.png)。仅含合成示例文本，无凭据或真实用户内容；双栏/单栏、按钮、编辑器、页脚均无遮挡、截断或横向溢出。
- 本轮 E2E 仅连本地 Vite，遥测响应被模拟；没有向生产事件表写入，因此生产测试数据清理不适用。**生产 Edge → Supabase 的新元数据写入尚未验证，功能尚未发布。** 发布需单独 push 授权，Git 自动部署后从生产 UI 复验并精确清理固定 E2E 会话。

需求完整性 verify（独立 pass）：AC-1 的事件 JSON、白名单及无 `Referer` 请求头；AC-2 的来源优先级和未知值；AC-3 的标记开关与 URL 清除；AC-4 的旧事件兼容和生产只读 SQL；AC-5 的上报失败不阻断与原有主链路，均有语义对应的测试和上述证据。**本地覆盖通过；生产集成门控未通过，因为尚未发布。**

代码审查（独立 pass）：检查了 UTM 原型链属性、Referrer 主机边界、事件解析白名单、内部标记持久化、异步上报、旧事件兼容、E2E 测试隔离及归档截图。未发现 P0/P1。剩余风险：内部标记是浏览器本机自报，不是身份认证；浏览器标识不是独立真人；页面首次请求仍向托管服务暴露普通 URL/IP；生产新版本及真实 Supabase 写入仍待发布复验。

### 2026-09-30 主分支发布前签退

- 功能分支 `23783f5ca3f16bf06d3a2541a55606ae5f1ed226` 已在主 checkout 快进合并为 `main@23783f5`；远端 `origin/main` 在合并前没有新增提交。主分支索引与工作区干净。
- 主分支按序执行 `bun run lint`、`bun run test`（38/38，0 skip/xfail）、`bun run build`、`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`（桌面/移动 16/16，0 skip/xfail），均通过；核心危险改写、最小修正、价格反馈及来源标记真实 UI/网络链路均覆盖。
- 主分支本轮归因场景桌面/移动截图与上方已实际查看的归档截图 SHA-256 逐字节一致；无新增视觉问题，浏览器 Console 与页面异常仍为 0。生产固定测试 session `intentlock-e2e-session` 在发布前只读预检为 0 条，本轮本地 E2E 未写入生产。
- 仍待验证：GitHub `main` 推送是否自动生成对应提交的 Vercel 生产部署、稳定域名是否指向它、生产 Edge → Supabase 对新元数据的真实写入、生产桌面/移动 16/16 E2E 与测试数据清理。未完成前不称本功能已上线。

### 2026-09-30 Git 自动部署与首次生产验收调试

- `main@f70176e0e26240054c5177d33793828b32d42b21` 推送后，Vercel 自动生成生产部署 `dpl_8bagSYwuPAZZrvg4cLgEqnWd1HGL`，状态 `READY`，Git 元数据对应 `chenjunjiang/intentlock`、`main` 和该提交；稳定域名 `https://intentlock-nine.vercel.app` 指向它。没有执行直接部署命令。
- 首次生产完整 E2E 为 14/16：桌面/移动归因场景在 `afterEach` 中观测到 3 次请求却只观测到 1 次响应，其他场景通过。假设是连续 `page.goto()` 太快，测试在请求发出后就离开页面；只读查库发现预期访问事件实际存储，故不是 Edge→Supabase 丢写。根因是测试仅等待请求、没有等待存储响应，随后页面导航与响应监听竞态。
- 最小修复仅在 `e2e/main-flow.spec.ts`：每次导航等待与预期 `{channel, internal}` 匹配的 `visit` 响应，确认 204/`stored`，并等遥测请求/响应计数相等；没有修改业务实现或放松断言。首次修复在本地 Vite 的 StrictMode 重复访问中错配旧响应，故又加入元数据匹配。最终按序 `bun run lint`、`bun run test`（38/38）、`bun run build`、`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`（16/16）通过，0 skip/xfail；对当前生产版本定向复验桌面/移动 2/2 通过。
- 固定生产测试会话 `intentlock-e2e-session` 只读预检为 58 条，来自首次完整 E2E 与两次定向复验。核对清理脚本仅删除该精确 session 后，运行 `bun run test:e2e:cleanup --execute`：删除 58 条，复查剩余 0 条；其他会话未删除。终端 `curl` 首页和健康接口均超时，只说明该终端网络路径不可用，不能据此判定网站失败；待用真实浏览器网络路径复查。
- 此时完整生产 E2E 尚未用最终测试文件重新执行，QA/verify/review/ship 门控仍未完成。

### 2026-09-30 访问归因生产验收与独立核对

- `main@da241067105282e4c318201a4b6dbae52879c5a9` 经 GitHub 推送自动生成生产部署 `dpl_9y5oY9Per8uHj92LC8hPNeY6Verb`，状态 `READY`；Vercel 显示仓库 `chenjunjiang/intentlock`、分支 `main` 和该 SHA，稳定域名 `intentlock-nine.vercel.app` 的部署检查指向同一版本。未使用 CLI 直接发布。
- 在该稳定域名运行 `E2E_BASE_URL=https://intentlock-nine.vercel.app PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：桌面与 Pixel 7 共 16/16 通过，0 skip/xfail。真实 `/api/e` 的每个归因访问返回 204/`stored`；原有主流程、失败重试、Console/pageerror 与无 `Referer` 请求头断言均通过。
- 本轮生产归因场景桌面/移动截图已实际查看，与 [已归档桌面图](evidence/attribution-tracking/desktop.png) 和 [移动图](evidence/attribution-tracking/mobile.png) 的 SHA-256 分别逐字节一致。桌面双栏、移动单栏无明显遮挡、截断或横向溢出；归档图仅含合成示例。
- E2E 后只读预检固定 `intentlock-e2e-session` 为 46 条；运行 `bun run test:e2e:cleanup --execute` 精确删除 46 条、复查 0 条。另一次调试清理为 58 条、复查 0 条，合计清理 104 条合成测试事件；其他会话未删除。删除的测试事件无法从该表恢复。
- 系统 Chrome 关闭 JavaScript 后访问生产首页和 `/api/e?health=1`，均为 HTTP 200；健康响应 `degraded:false`、`storage:supabase`、`ingestFailures:0`。首页和健康接口均返回 CSP（禁止嵌入）、HSTS、`nosniff`、Referrer-Policy 和禁用摄像头/麦克风/定位的 Permissions-Policy。该检查在最终代码部署 `da24106` 后重新执行。
- 固定测试会话清零后，按 `docs/attribution-tracking.md` 的只读窗口 SQL 排除 E2E：仍只有 `historical_unknown / unknown` 9 次访问、9 个浏览器标识，带检查/复用/复制/价格兴趣的访问均为 0。没有新归因来源的非测试行为可供分析；这些浏览器标识也不能等同真人。

需求完整性 verify（与 code review 分开执行）：AC-1 的事件白名单、请求无 `Referer` 与生产存储响应；AC-2 的来源优先级；AC-3 的内部标记设置、清除和地址栏移除；AC-4 的旧事件兼容与排除固定测试会话的只读 SQL；AC-5 的核心流程不受上报失败影响，均对应单测/API/组件/真实 UI 证据。未发现验收缺口。独立 code/release review：复查测试修复只增加与预期事件匹配的存储响应等待，不删除原断言；Git 提交、生产部署 SHA、域名别名、健康和测试数据清理相符；未发现 P0/P1。剩余风险：当前 9 次历史访问没有归因和完成行为，不能证明需求、留存或付费意愿；内部标记由本机自报，未标记不代表真实外部用户。

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
