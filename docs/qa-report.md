# IntentLock QA 报告

日期：2026-09-27

## 环境

- Bun 1.3.14
- Vite 7.3.6
- Vitest 3.2.7
- 本地 macOS arm64

## 已完成证据

- `bun run lint`：通过，0 warning。
- `bun run test`：3 个文件、10 个测试通过，0 skip。
- `bun run build`：通过，产物位于 `dist/`。
- `PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：桌面与 Pixel 7 共 6 个场景通过，0 skip。
- `E2E_BASE_URL=https://intentlock-nine.vercel.app PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`：生产环境 6 个场景通过，0 skip。

## 生产部署

- 稳定地址：`https://intentlock-nine.vercel.app`。
- 本次部署地址：`https://intentlock-jtktqmdpd-gumu1.vercel.app`。
- 使用 `vercel@60.0.1` 完成生产部署并绑定稳定地址；`vercel@60.1.3` 曾出现登录授权回归，因此部署命令暂时固定版本。
- HTTPS 首页返回 HTTP 200。
- 已核对响应头：CSP、HSTS、`X-Content-Type-Options: nosniff`、`Referrer-Policy` 和禁用摄像头、麦克风、地理位置的 `Permissions-Policy` 均已生效。

## UI 与接口检查

- 桌面与移动端首屏、双栏/单栏编辑器、危险改写结果、4 项风险卡和差异区显示正常，无重叠、截断或横向溢出。
- `/api/e?health=1` 如实返回 `{"degraded":true,"storage":"disabled"}`。
- 合法的空元数据 `visit` 事件返回 HTTP 204，不阻断核心流程。
- 含未知 `campaign` 字段的事件返回 HTTP 400。
- 含嵌套 `payload.text` 的事件返回 HTTP 400；服务端只接受事件对应的标量元数据白名单。

## 数据与清理

- 测试不上传用户文本。
- 本地测试只使用浏览器内存/localStorage。
- 生产环境尚未连接专属 Supabase，暂无共享测试数据需要清理。

## 独立评审结论

- 评审发现原实现仅过滤顶层敏感字段，嵌套对象可能绕过文本边界；已改为事件级严格白名单并增加回归测试。
- 修复后重新完成 lint、10 个单元/组件测试、生产构建、本地 6 条 E2E、生产 6 条 E2E 和接口负向验证。
- 未发现阻断上线验证的剩余 P0/P1 问题。

## 已知风险

- 当前规则只覆盖可确定抽取的字段，不能证明完整语义等价。
- 未配置专属 Supabase 前，匿名指标不会持久化，暂时无法汇总访问到复用的转化漏斗；核心检查功能不受影响。
- 当前没有直接调用大模型，复杂的隐含语义漂移仍可能漏检；应先验证真实复用，再决定是否引入“规则 + 大模型”。
