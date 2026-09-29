# IntentLock

免费验证版：对比原文和任意 AI 改写，检查姓名、数字、日期、否定和承诺强度是否发生漂移，并把无法确认等义的重要措辞变化交给用户复核。

## 当前范围

- 文本在浏览器本地处理，不上传原文或改写。
- 核心检查无限免费，不接支付。
- 匿名记录访问、完成检查、重复使用、复制结果和价格兴趣。
- 未配置 Supabase 时，事件接口降级，不阻断核心检查；价格调查只在服务器确认写入后显示“已记录”，失败可重试。
- 当前不直接调用大模型；验证复用后再加入“规则 + 大模型”的深层语义检查。
- 检查结果分为三态：红色表示确定的保护项风险，黄色表示无法确认等义的措辞变化，绿色表示没有发现无法解释的重要变化；绿色仍不代表完整语义等价保证。
- 生产 Supabase 位于新加坡 `ap-southeast-1`，面向中国及亚洲首批验证用户。

## 技术栈

与 `snapdiff` 对齐：Bun 1.3+、Vite 7、React 19、TypeScript、Vercel Edge Functions、Supabase、Vitest、Playwright。

## 本地运行

```bash
bun install
bun run dev
bun run lint
bun run test
bun run build
bun run test:e2e
```

## 匿名事件存储

1. 在独立 Supabase 项目执行 `supabase/migrations/0001_intentlock_events.sql`。
2. 将 `.env.example` 复制为 `.env` 并填写 IntentLock 专属变量。
3. 在 Vercel 生产环境设置同名变量。
4. 访问 `/api/e?health=1`，确认 `degraded` 为 `false`。

事件协议按事件类型使用严格顶层与元数据白名单，并只接受标量值；未知字段、嵌套对象以及任何原文或改写字段都会被拒绝。事件入口还限制 4KB 请求体、同源访问以及每 IP/会话每分钟 60 次，避免意外上传用户写作内容和低成本滥用。

`POST /api/e` 用 HTTP 204 和 `x-intentlock-storage` 响应头表示事件处理结果：`stored` 为实际写入，`degraded` 为存储不可用，`rate-limited` 为限流丢弃。浏览器中的价格调查只有收到 `stored` 才会致谢；其他匿名事件失败不影响本地检查。

数据库只允许服务端 `service_role` 读写，浏览器角色无权访问事件表。生产使用独立 Secret key `vercel_intentlock`；新版 `sb_secret_` 只通过 `apikey` 请求头发送，不能作为 JWT 放入 `Authorization: Bearer`。事件保留目标为 90 天，当前通过 `select public.purge_old_intentlock_events();` 手动清理过期数据。

## 部署

当前生产地址：[intentlock-nine.vercel.app](https://intentlock-nine.vercel.app)。

目标发布链路是 GitHub 仓库 `chenjunjiang/intentlock` 的 `main` 分支连接 Vercel 项目 `gumu1/intentlock`：代码先提交、通过验证并推送到 `main`，再由 Vercel Git 集成自动构建和部署生产。其他分支仅用于预览。不要把本地 Git hook 或 `vercel --prod` 当作日常发布入口；本地 hook 不能保证远端部署，也无法作为团队共享的发布门控。生产推送必须单独获得授权。

**当前状态：**GitHub `main` 已连接 Vercel，2026-09-29 的 `main@1149b2f` 推送自动创建生产部署，并通过真实入口验收。此前从未提交工作树直接执行的 CLI 部署是历史流程缺陷，不作为日常发布方式。发布与回滚核对见 [部署工作流](docs/deployment-workflow.md)。CLI 直接部署仅用于明确授权的应急恢复，并须补齐对应提交及事后对账。

部署后执行：

```bash
E2E_BASE_URL=https://<production-host> bun run test:e2e
curl -fsS https://<production-host>/api/e?health=1
```

若当前终端无法直连 Vercel，应改用浏览器检查健康接口与安全响应头，不能把 `curl` 超时当成服务故障或验证通过。生产 E2E 会写入仅含测试元数据的事件；先用 `bun run test:e2e:cleanup` 只读预检，再在确认目标项目和数量后运行 `bun run test:e2e:cleanup --execute` 精确删除固定 session 的测试事件并复查残留。此命令不会清理其他用户会话。

正式上线前必须通过 lint、单元/组件测试、build、桌面与移动 E2E，并核对 Vercel 安全响应头。

生产上线只证明链路可用，不证明用户需求已经成立；应排除 E2E 测试会话，观察真实用户的完成检查、复用和价格兴趣行为。
