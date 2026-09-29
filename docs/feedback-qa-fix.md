# 价格反馈与 QA 证据修复

变更 ID：`feedback-qa-fix`。产品形态：C 端存量项目。基线提交：`39c0ef7`。

## 范围与验收

- AC-1：价格兴趣只在事件服务确认实际写入后显示“已记录”。请求进行中显示保存状态；网络失败、存储降级或限流时显示可重试提示，免费检查始终可用。
- AC-2：`POST /api/e` 对已写入、限流丢弃和存储降级给出可区分的响应头。仍使用现有事件白名单，不发送原文、改写或文本片段。
- AC-3：桌面与移动 E2E 从真实 UI 操作，核对事件请求的方法、路径、正文和响应；覆盖价格兴趣成功、失败及重试。
- AC-4：提供固定项目与固定测试 session 的清理命令，显示清理前、删除数和清理后数量，清理后残留不为零时失败。
- AC-5：逐 Scenario 保存已实际查看、无敏感信息的截图与判定，记录命令、环境、时间和代码状态；历史生产证据无法恢复时如实标记。
- AC-6：README、项目 AGENTS 与 QA 报告中的命令和状态与实际验证一致。

## 设计与边界

- 已写入返回 HTTP 204 与 `x-intentlock-storage: stored`；限流丢弃返回 HTTP 204 与 `x-intentlock-storage: rate-limited`；缺配置或写入失败沿用 HTTP 204 与 `x-intentlock-storage: degraded`。
- 价格兴趣仅在收到 `stored` 后进入已记录状态。失败后保留原有两个答案按钮，用户可以重试；保存中禁用两个按钮。现有卡片布局不变，仅补状态文本，因此没有新增页面或实质布局改版。
- 匿名访问等非关键事件仍不阻断本地检查。此修复不增加支付、身份认证、模型调用或新数据库字段。
- 清理仅针对 Supabase 项目 `dpbicjfthmyeosjdftyn` 中 `session_id = 'intentlock-e2e-session'` 的记录；不执行无条件删除。

## 任务与验证

1. 在 `tests/App.test.tsx`、`tests/api-event.test.ts` 添加成功、降级、限流、失败后重试的回归测试；先确认旧实现无法满足验收。
2. 修改 `api/e.ts`、`src/App.tsx`，按 AC-1/2 实现；运行 `bun run test`。
3. 修改 `e2e/main-flow.spec.ts` 并补清理命令；运行 `bun run lint`、`bun run test`、`bun run build`、本地桌面与移动 E2E。
4. 逐张读取最终截图，确认合成测试内容和视觉状态后保存到 `docs/evidence/feedback-qa-fix/`；更新 `README.md`、`AGENTS.md`、`docs/qa-report.md`。
5. 先做需求完整性 verify，再独立做缺陷/安全 code review；记录未执行的生产验收。部署、生产数据操作、提交与推送各按授权门控执行。

## 对照

| 验收 | 实现 | 测试/证据 |
| --- | --- | --- |
| AC-1 | `src/App.tsx` | `tests/App.test.tsx`、价格反馈 E2E |
| AC-2 | `api/e.ts` | `tests/api-event.test.ts`、E2E 网络断言 |
| AC-3 | `e2e/main-flow.spec.ts` | 桌面/移动浏览器结果与截图 |
| AC-4 | `scripts/cleanup-e2e-events.ts`、`package.json` | 固定项目只读预检、命令输出 |
| AC-5 | `docs/evidence/feedback-qa-fix/`、`docs/qa-report.md` | 逐 Scenario 视觉判定与代码状态 |
| AC-6 | `README.md`、`AGENTS.md` | 命令核对与 `git diff --check` |

## 2026-09-29 完整性 verify

本地候选版本的 Completeness、Correctness、Coherence 对照如下；生产部署及新版生产 E2E 是独立交付门控，未计为已通过。

| 验收 | 完整性结论 | 当前证据与剩余边界 |
| --- | --- | --- |
| AC-1 | 通过 | 组件测试先等待写入确认，再覆盖降级、限流、断网重试；免费检查不受阻断。 |
| AC-2 | 通过 | API 测试覆盖 `stored`、`rate-limited`、`degraded`，保持 204 与原有事件白名单。 |
| AC-3 | 本地通过 | 桌面/移动 14 项真实 UI E2E 均通过；事件请求与响应断言通过。新版生产真实写入未验收。 |
| AC-4 | 实现完成，执行门控待定 | 只读预检准确返回固定项目与 session 的 0 条；`--execute` 删除分支未操作生产数据。 |
| AC-5 | 通过 | 16 张已查看的本地截图与逐场景判定保存在 `docs/evidence/feedback-qa-fix/`；历史临时截图已标明不可复核。 |
| AC-6 | 通过 | README 的 CLI、事件协议、清理说明及项目 AGENTS 已更新；`git diff --check` 通过。 |

验证命令：`bun run lint`、`bun run test`、`bun run build`、`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`、`bun run test:e2e:cleanup`、`git diff --check`。结果分别为通过、30/30、通过、14/14、只读 0 条、通过，均对应当前源码；没有跳过测试。未发现规范与实现冲突或 CRITICAL 需求缺口。

## 独立 code review

此 pass 与上面的需求完整性 verify 分开进行，检查了 `api/e.ts`、`src/App.tsx`、`e2e/main-flow.spec.ts`、清理脚本、配置与新增文件清单。结论：未发现 P0/P1；响应头仅反映服务端已确认的结果，失败不会阻断本地检查；事件仍经白名单解析，不包含写作文本；清理脚本固定项目与 session，默认只读，且不输出 CLI 错误细节或凭据。未发现新增凭据、无关源码改动或被跳过的测试。

以上是部署前 review 结论；当时新版生产部署、真实生产浏览器 E2E、健康检查及安全头复验、固定测试 session 清理尚未执行。不能从本地 mock E2E 推断生产 Supabase 写入通过。

## 2026-09-29 生产交付

- 用户授权后从 `codex/feedback-qa-fix` 工作树部署到 Vercel 项目 `gumu1/intentlock`，部署 ID `dpl_2VMywvvVAonZCMzJKdXRyrVKBmUo`，状态 `READY`，稳定域名 `https://intentlock-nine.vercel.app`。
- 生产桌面与 Pixel 7 的 14/14 项 E2E 通过，0 skip、0 xfail；成功价格反馈获得真实存储确认。首页与健康接口均 HTTP 200，存储健康；安全响应头通过。
- 固定测试 session 从 0 条变为 40 条；按精确过滤删除 40 条，清理后 0 条。生产 16 张截图逐张核验并留存在 `docs/evidence/feedback-qa-fix/production/`。完整逐场景结论见 `docs/qa-report.md`。
- 技术上线与验收完成，但真实用户有效性尚未证实：排除测试 session 后仅有 2 个访问会话、0 次完成检查。后续须取得足够真实用户的检查、复用和价格兴趣行为，再判断产品机会。
- 工作树变更仍未提交、合并或推送；这些属于独立 Git 门控，不能因生产部署成功而默认执行。

## 2026-09-29 发布流程纠偏

本次生产部署使用了未提交工作树，是流程缺陷；生产 E2E 通过不等于仓库与生产一致。后续以 GitHub `main` 为发布真源，使用 Vercel Git 集成自动部署，不再将本地 `vercel --prod` 作为常规发布命令。首次对账必须先把已验收代码提交并安全合并/推送至远端 `main`，再连接生产项目的 Git 集成并核对部署来源、提交哈希和稳定域名。合并与推送分别遵守授权门控。详细步骤见 `docs/deployment-workflow.md`。

## 2026-09-29 Git 自动发布验收

已将修复以 `02ac4bb` 提交到功能分支，在主 checkout 快进合并，并将主分支验证记录提交为 `7277b33`。主分支 lint、30/30 单元/组件测试、build、桌面/移动 14/14 本地 E2E 全部通过，固定生产测试 session 在发布前为 0 条。远端 `main` 更新后，用户在 GitHub 将 Vercel App 的仓库范围仅增加 `chenjunjiang/intentlock`，Vercel 项目随后连接该仓库。

连接后的文档状态提交 `1149b2f` 推送到 `main`，自动触发 Vercel 生产部署 `dpl_Cv7rvgxfvje7gdR4zUMEwzo48i1F`，未使用 CLI 直接发布。部署来源、分支、完整提交哈希、`Ready` 状态和稳定域名均已核对；生产真实 UI E2E 14/14 通过。首页和健康接口经系统 Chrome 返回 200，健康为 `degraded:false`、`ingestFailures:0`，关键安全头存在；固定测试 session 40 条已精确清理至 0 条。具体证据与终端 `curl` 网络限制见 `docs/qa-report.md`。
