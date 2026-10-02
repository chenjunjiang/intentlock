# 错误绿灯与匿名漏斗

状态：2026-10-02 本地候选；C 端存量项目中等变更。lint、50 项单元/组件测试、build 与 22 项桌面/移动 E2E 已通过；生产迁移、真实存储复验、推送与部署尚未执行。证据见 `docs/qa-report.md`。

## 验收口径

- AC-1：姓名或数字不能通过更长字符串的子串匹配冒充保留；角色互换、代词、大小写、关键标点或词序变化不能显示绿色。已识别的高风险保护项仍显示红色，其余无法判定等义的变化显示黄色。编辑已检查的文本或切换模式时立即移除旧结果和复制按钮。
- AC-2：`may`、`might`、`could` 的同级谨慎措辞仍可绿色；受控的最小语法修正仍可绿色；不自动把 `ask` 改成过去时 `asked`。
- AC-3：每次页面访问首次编辑原文或改写时，最多发送一次空元数据 `input_edited`。完成检查只增加 `inputKind=sample|custom` 与 `resultState=safe|review|danger`，不发送原文、改写、片段或完整 URL。旧版缺少这些字段的事件继续可接收，查询列为 `unknown`。
- AC-4：漏斗以一次 `visit` 到下一次同浏览器标识的 `visit` 为窗口，分别统计访问、编辑、检查、自定义检查、结果三态、再次使用、复制和价格回答。固定 E2E 会话排除；内部标记与渠道分组保留。“未标记内部”不等于真实外部用户，浏览器标识不等于独立真人。
- AC-5：事件失败不阻断本地检查；新事件上线前先执行 `0004_anonymous_funnel.sql`，否则数据库约束会拒绝写入。

## 文件与验证

1. `tests/intent-lock.test.ts`、`tests/App.test.tsx`、`tests/event.test.ts`、`e2e/main-flow.spec.ts` 先复现漏判并限定匿名请求体。
2. `src/lib/intent-lock.ts`、`src/App.tsx`、`src/lib/event.ts` 修复判定与上报；`tests/api-event.test.ts` 检查真实 handler 的存储请求体。
3. `supabase/migrations/0004_anonymous_funnel.sql` 扩充现有事件名约束；`README.md` 与 `docs/attribution-tracking.md` 同步协议和只读漏斗 SQL。
4. 依次执行 `bun run lint`、`bun run test`、`bun run build`、`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`，逐场景查看桌面与移动截图，再分别做需求完整性核对和代码审查。

生产部署及迁移需另行授权；本地 Vite 的 E2E 遥测响应是模拟值，不能当作 Edge → Supabase 集成通过。
