# IntentLock

免费验证版：对比原文和任意 AI 改写，检查姓名、数字、日期、否定和承诺强度是否发生漂移，并把无法确认等义的重要措辞变化交给用户复核。

## 当前范围

- 文本在浏览器本地处理，不上传原文或改写。
- 核心检查无限免费，不接支付。
- 匿名记录访问、完成检查、重复使用、复制结果和价格兴趣。
- 未配置 Supabase 时，事件接口静默降级，不阻断核心功能。
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

数据库只允许服务端 `service_role` 读写，浏览器角色无权访问事件表。生产使用独立 Secret key `vercel_intentlock`；新版 `sb_secret_` 只通过 `apikey` 请求头发送，不能作为 JWT 放入 `Authorization: Bearer`。事件保留目标为 90 天，当前通过 `select public.purge_old_intentlock_events();` 手动清理过期数据。

## 部署

```bash
npm_config_cache=/tmp/intentlock-vercel-npm-cache \
  npx --yes --registry=https://registry.npmjs.org vercel@60.0.1 --prod --yes
```

当前固定 `vercel@60.0.1`：该版本已在本项目验证可用；升级 CLI 后必须先重新验证登录和生产部署。

部署后执行：

```bash
E2E_BASE_URL=https://<production-host> bun run test:e2e
curl -fsS https://<production-host>/api/e?health=1
```

正式上线前必须通过 lint、单元/组件测试、build、桌面与移动 E2E，并核对 Vercel 安全响应头。
