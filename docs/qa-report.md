# IntentLock QA 报告

日期：2026-09-27

## 环境

- Bun 1.3.14
- Vite 7.3.6
- Vitest 3.2.7
- Supabase CLI 2.118.0
- Vercel CLI 60.0.1
- 本地 macOS arm64

## 已完成证据

- `bun run lint`：通过，0 warning。
- `bun run test`：4 个文件、15 个测试通过，0 skip。
- `bun run build`：通过，产物位于 `dist/`。
- `PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：桌面与 Pixel 7 共 6 个场景通过，0 skip。
- `E2E_BASE_URL=https://intentlock-nine.vercel.app PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：生产环境 6 个场景通过，0 skip。

## 生产部署

- 稳定地址：`https://intentlock-nine.vercel.app`。
- 本次部署地址：`https://intentlock-bgamv8fhy-gumu1.vercel.app`。
- 使用 `vercel@60.0.1` 完成生产部署并绑定稳定地址；`vercel@60.1.3` 曾出现登录授权回归，因此部署命令暂时固定版本。
- HTTPS 首页返回 HTTP 200。
- 已核对响应头：CSP、HSTS、`X-Content-Type-Options: nosniff`、`Referrer-Policy` 和禁用摄像头、麦克风、地理位置的 `Permissions-Policy` 均已生效。

## UI 与接口检查

- 桌面与移动端首屏、双栏/单栏编辑器、危险改写结果、4 项风险卡和差异区显示正常，无重叠、截断或横向溢出。
- `/api/e?health=1` 在真实写入前后均返回 `{"degraded":false,"storage":"supabase","ingestFailures":0}`。
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
- 本轮确认的 19 条旧测试事件及最终固定 session E2E 事件均已删除；清理后事件表为 0 行。

## 独立评审结论

- 评审发现原实现只限制 metadata，顶层额外字段仍可能到达服务端；已改为顶层与 metadata 双重严格白名单，并增加 4KB 请求限制、同源校验和回归测试。
- 发现 Supabase 新 Secret key 不能沿用旧 `service_role` JWT 的 Bearer 写法；依据官方文档改为仅使用 `apikey`，并创建专用 `vercel_intentlock` key 完成真实写入验证。
- 修复后重新完成 lint、15 个单元/组件/API 测试、生产构建、本地 6 条 E2E、生产 6 条 E2E、真实数据库写入回查和权限负向验证。
- 未发现阻断上线验证的剩余 P0/P1 问题。

## 已知风险

- 当前规则只覆盖可确定抽取的字段，不能证明完整语义等价。
- 当前没有直接调用大模型，复杂的隐含语义漂移仍可能漏检；应先验证真实复用，再决定是否引入“规则 + 大模型”。
- Edge 限流是单实例内存级粗限流，不是全局强配额；验证期足够，放大流量前应增加数据库日上限或托管限流。
- 90 天清理函数目前需要手动调用；正式持续运营前应增加月度定时任务。
