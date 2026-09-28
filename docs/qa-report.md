# IntentLock QA 报告

日期：2026-09-28

## 环境

- Bun 1.3.14
- Vite 7.3.6
- Vitest 3.2.7
- Supabase CLI 2.118.0
- Vercel CLI 60.0.1
- 本地 macOS arm64

## 2026-09-28 生产版本

本节对应已部署到稳定域名的当前工作区版本。本地与生产证据分开执行，并在部署后重新完成真实入口验收。

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
- 2026-09-28 生产 E2E 再次使用固定测试会话写入匿名测试事件；本轮未获生产数据删除授权，因此没有执行清理。测试事件不含原文或改写正文，可按固定 session 精确识别。

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
