# IntentLock

免费验证版：对比原文和任意 AI 改写，检查姓名、数字、日期、否定和承诺强度是否发生漂移，并把无法确认等义的重要措辞变化交给用户复核。

## 当前范围

- 文本在浏览器本地处理，不上传原文或改写。
- 核心检查无限免费，不接支付。
- 匿名记录访问、首次编辑、完成检查、重复使用、复制结果和价格兴趣。新访问事件的 JSON 只附加归一化渠道和内部测试标记；首次编辑事件不带元数据，检查完成事件仅增加示例/自定义及红/黄/绿枚举，不含完整 URL、Referrer、UTM 原值或写作内容；事件请求不发送 `Referer` 头。
- 未配置 Supabase 时，事件接口降级，不阻断核心检查；价格调查只在服务器确认写入后显示“已记录”，失败可重试。
- 当前不直接调用大模型；验证复用后再加入“规则 + 大模型”的深层语义检查。
- 检查结果分为三态：红色表示检测到保护项风险，黄色表示无法确认等义的措辞、词序、大小写或标点变化，绿色表示只发现受控的等义编辑或未发现变化；编辑文本或切换模式会立即清除旧结果。绿色仍不代表完整语义等价保证。
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

1. 在独立 Supabase 项目按顺序执行 `supabase/migrations/0001_intentlock_events.sql` 至 `0004_anonymous_funnel.sql`；升级现有生产库时，先执行 `0004` 再部署发送新事件的前端。
2. 将 `.env.example` 复制为 `.env` 并填写 IntentLock 专属变量。
3. 在 Vercel 生产环境设置同名变量。
4. 访问 `/api/e?health=1`，确认 `degraded` 为 `false`。

事件协议按事件类型使用严格顶层与元数据白名单，并只接受标量值；未知字段、嵌套对象以及任何原文或改写字段都会被拒绝。事件入口还限制 4KB 请求体、同源访问以及每 IP/会话每分钟 60 次，避免意外上传用户写作内容和低成本滥用。

访问来源优先读取白名单内的 `utm_source`，其次只根据 Referrer 主机名归类；无来源为 `direct`，无法识别为 `other`。推广链接可使用 `?utm_source=reddit`、`?utm_source=x` 等白名单值，不要在链接参数放个人或敏感信息：首次页面请求仍会让托管服务收到 URL 与网络层 IP。站点所有者在自己的浏览器访问 `?il_internal=1` 可标记内部流量，访问 `?il_internal=0` 可清除；此参数会从地址栏移除，标记仅留在本机。`internal=false` 不证明访问者是真人或独立用户。旧访问事件没有来源元数据，应列为“历史未知”，不可回填或算作外部流量；详细口径见 [归因方案](docs/attribution-tracking.md)。

匿名漏斗按访问窗口统计首次编辑、检查、自定义检查、结果三态、重复使用、复制与价格回答；旧检查事件缺少新增枚举时列为 `unknown`。口径、SQL 与本轮验收见 [错误绿灯与匿名漏斗](docs/false-green-funnel.md) 和 [归因方案](docs/attribution-tracking.md)。

`POST /api/e` 用 HTTP 204 和 `x-intentlock-storage` 响应头表示事件处理结果：`stored` 为实际写入，`degraded` 为存储不可用，`rate-limited` 为限流丢弃。浏览器中的价格调查只有收到 `stored` 才会致谢；其他匿名事件失败不影响本地检查。

数据库只允许服务端 `service_role` 读写，浏览器角色无权访问事件表。生产使用独立 Secret key `vercel_intentlock`；新版 `sb_secret_` 只通过 `apikey` 请求头发送，不能作为 JWT 放入 `Authorization: Bearer`。事件保留目标为 90 天，当前通过 `select public.purge_old_intentlock_events();` 手动清理过期数据。

## 部署

当前生产地址：[intentlock-nine.vercel.app](https://intentlock-nine.vercel.app)。

目标发布链路是 GitHub 仓库 `chenjunjiang/intentlock` 的 `main` 分支连接 Vercel 项目 `gumu1/intentlock`：代码先提交、通过验证并推送到 `main`，再由 Vercel Git 集成自动构建和部署生产。其他分支仅用于预览。不要把本地 Git hook 或 `vercel --prod` 当作日常发布入口；本地 hook 不能保证远端部署，也无法作为团队共享的发布门控。生产推送必须单独获得授权。

**当前状态：**GitHub `main` 已连接 Vercel；2026-09-30 的访问归因版本 `main@da24106` 自动创建生产部署，桌面/移动完整 E2E、健康、安全头与测试数据精确清理均通过。此前从未提交工作树直接执行的 CLI 部署是历史流程缺陷，不作为日常发布方式。发布与回滚核对见 [部署工作流](docs/deployment-workflow.md)。CLI 直接部署仅用于明确授权的应急恢复，并须补齐对应提交及事后对账。当前非测试行为样本不足，不能据此判断产品有效性。

部署后执行：

```bash
E2E_BASE_URL=https://<production-host> bun run test:e2e
curl -fsS https://<production-host>/api/e?health=1
```

若当前终端无法直连 Vercel，应改用浏览器检查健康接口与安全响应头，不能把 `curl` 超时当成服务故障或验证通过。生产 E2E 会写入仅含测试元数据的事件；先用 `bun run test:e2e:cleanup` 只读预检，再在确认目标项目和数量后运行 `bun run test:e2e:cleanup --execute` 精确删除固定 session 的测试事件并复查残留。此命令不会清理其他用户会话。

正式上线前必须通过 lint、单元/组件测试、build、桌面与移动 E2E，并核对 Vercel 安全响应头。

生产上线只证明链路可用，不证明用户需求已经成立；应排除 E2E 测试会话，观察真实用户的完成检查、复用和价格兴趣行为。
