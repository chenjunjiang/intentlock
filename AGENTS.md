# 概述

产品形态: C端

IntentLock 是面向普通 AI 写作用户的语义安全检查器。当前阶段为免费生产验证版。核心文本处理必须留在浏览器，禁止向服务端上传原文或改写。

# 快速命令

- `bun install`：安装依赖，勿混用 npm/pnpm。
- `bun run dev`：启动 Vite。
- `bun run lint`：Oxlint。
- `bun run test`：Vitest 单元和组件测试。
- `bun run build`：TypeScript + Vite 生产构建。
- `bun run test:e2e`：Playwright 桌面与移动 E2E。
- `bun run test:e2e:cleanup`：只读预检固定测试会话；显式加 `--execute` 才删除并复查。

# 后端

- `api/e.ts` 是 Vercel Edge 事件入口。
- 事件解析真源在 `src/lib/event.ts`。
- Supabase schema 在 `supabase/migrations/`。
- 未配置数据库时允许匿名统计降级，但健康检查必须如实返回 `degraded: true`。
- `POST /api/e` 以 `x-intentlock-storage: stored|degraded|rate-limited` 区分写入结果；价格反馈仅在 `stored` 后致谢。

# 前端

- `src/App.tsx` 管主流程，`src/lib/intent-lock.ts` 管确定性规则。
- 首屏必须直接可操作，不增加大型宣传 Hero。
- 桌面双栏、移动单栏；所有行为变更需同步组件测试和 E2E。

# 关键约定

- 不上传用户原文、改写或任何文本片段。
- 访问归因仅发送白名单渠道和内部布尔标记；旧事件来源未知，未标记内部不等于真实外部用户。
- 不声称使用了大模型；接入模型后才可更新文案。
- 免费 beta 不接支付、不限制次数。
- 价格问题只做非阻断调查，不代表收费承诺。
- 发布以 GitHub `main` → Vercel Git 集成自动部署为准；先提交并验证，再经单独授权推送。禁止把未提交工作树通过 CLI 直接部署作为常规流程。
- 代码注释、docstring 和 TODO 使用中文。

# 本地验证

按顺序运行 `bun run lint && bun run test && bun run build && bun run test:e2e`。测试必须 0 skip、0 xfail。

# 质量检查

- 真实 UI 覆盖危险改写和最小修正两条主链路。
- 每次前端修改后重跑桌面与移动 E2E。
- 部署后检查 `/api/e?health=1`、安全头和浏览器 console。

# 参考项目

环境与交付习惯参考 `/Users/chenjunjiang/workspace_python/snapdiff`，不得读取、复制或复用其 `.env` 密钥和生产数据。

# 文档导航

- `README.md`：使用、部署和数据边界。
- `docs/qa-report.md`：当前验证证据。
- `docs/deployment-workflow.md`：Git-first 发布、首次对账与生产复验。
- `docs/evidence/feedback-qa-fix/`：2026-09-29 本地截图；`production/` 为同版本生产桌面/移动截图。
- `supabase/migrations/`：事件数据结构。
- 设计真源：本项目 `src/App.tsx` + `src/App.css`，目标视口桌面 1280×900、移动 Pixel 7；最后本地与生产核验日期均为 2026-09-29，读取方式为浏览器预览与 Playwright E2E。
