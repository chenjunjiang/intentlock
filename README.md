# IntentLock

免费验证版：对比原文和任意 AI 改写，检查姓名、数字、日期、否定和承诺强度是否发生漂移。

## 当前范围

- 文本在浏览器本地处理，不上传原文或改写。
- 核心检查无限免费，不接支付。
- 匿名记录访问、完成检查、重复使用、复制结果和价格兴趣。
- 未配置 Supabase 时，事件接口静默降级，不阻断核心功能。
- 当前不直接调用大模型；验证复用后再加入“规则 + 大模型”的深层语义检查。

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

事件协议按事件类型使用严格元数据白名单，并只接受标量值；未知字段、嵌套对象以及任何原文或改写字段都会被拒绝，避免意外上传用户写作内容。

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
