# 访问归因与内部流量标记

状态：2026-09-30，C 端存量项目中等变更；用户确认继续处理真实行为数据的口径问题。无页面视觉改动，无新服务、依赖或数据库迁移。

## 目标与边界

- AC-1：新产生的 `visit` 事件 JSON 只记录归一化的 `channel` 枚举和 `internal` 布尔值，不含完整 URL、Referrer、UTM 原值、IP、原文或改写文本；事件请求不携带 `Referer` 头。首次页面请求的 URL 与网络层 IP 仍由托管服务接收，不把这一事实误述为“从未传输”。事件服务端继续严格拒绝未知字段和值。
- AC-2：`utm_source` 在已知来源白名单内时优先归类，否则只根据 Referrer 的主机名归类；两者都没有时为 `direct`，有但无法识别时为 `other`。渠道只表明可观察入口，不能证明是独立真人或广告转化。
- AC-3：站点所有者可用 `?il_internal=1` 将当前浏览器标记为内部；`?il_internal=0` 清除标记。标记保存在本机，参数从地址栏移除，避免转发时连同标记一起分享。`internal=false` 仅表示“未被标记为内部”，不能等同真实外部用户。
- AC-4：旧版本 `visit` 的空 metadata 仍可被接收，但统计中列为历史来源未知，不回填；已知 E2E 固定会话和 `internal=true` 分开剔除。
- AC-5：现有写作检查、价格调查与免费使用行为不变；来源统计失败不能阻断核心检查。

## 当前生产基线

2026-09-30 只读查询：排除固定 E2E 会话后，9 个浏览器标识对应 9 次 `visit`，完成检查、复用、复制结果及价格兴趣均为 0。旧事件没有来源字段，且浏览器标识不是独立真人，因此不能判断真实用户转化率。

## 实施计划与测试映射

1. `src/lib/attribution.ts`：纯函数归类 UTM/Referrer 和内部标记；`tests/attribution.test.ts` 覆盖来源白名单、未知值、主机名边界与标记持久化决策。
2. `src/lib/event.ts`：只为 `visit` 加入 `channel`、`internal` 的严格值校验；`tests/event.test.ts`、`tests/api-event.test.ts` 覆盖合法与非法元数据。
3. `src/App.tsx`：访问时读取归因、更新本机标记、移除内部参数，再以 `no-referrer` 发送事件；`tests/App.test.tsx` 和 `e2e/main-flow.spec.ts` 验证真实浏览器请求、地址栏、来源头、上报失败不阻断及主流程。
4. 同步 `README.md` 和本文件的统计口径；运行 `bun run lint`、`bun run test`、`bun run build`、`PLAYWRIGHT_USE_SYSTEM_CHROME=1 bun run test:e2e`，然后分别执行需求核对与独立代码审查。

生产发布仍按 `docs/deployment-workflow.md`：提交、主分支验证、单独 push 签退、Git 自动部署、生产真实入口复验和测试数据精确清理。未获独立 push 授权前，不声称该归因功能已经上线。

## 上线后的只读漏斗查询

以下按每次访问到下一次访问之间的事件窗口计数；固定 E2E 会话被排除，但 `internal=false` 仍只能称为“未标记内部”。浏览器标识可能对应同一人多台设备、多人共用设备或自动化流量。异步事件若晚于下一次访问写入，可能被归入后一窗口。

```sql
WITH visits AS (
  SELECT id, session_id, metadata,
         LEAD(id) OVER (PARTITION BY session_id ORDER BY id) AS next_visit_id
  FROM public.intentlock_events
  WHERE event_name = 'visit'
    AND session_id <> 'intentlock-e2e-session'
), windows AS (
  SELECT
    COALESCE(v.metadata->>'channel', 'historical_unknown') AS channel,
    COALESCE(v.metadata->>'internal', 'unknown') AS internal,
    v.session_id,
    a.checks, a.repeats, a.copies, a.pricing
  FROM visits v
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed') AS checks,
      COUNT(*) FILTER (WHERE e.event_name = 'repeat_use') AS repeats,
      COUNT(*) FILTER (WHERE e.event_name = 'result_copied') AS copies,
      COUNT(*) FILTER (WHERE e.event_name = 'pricing_interest') AS pricing
    FROM public.intentlock_events e
    WHERE e.session_id = v.session_id
      AND e.id > v.id
      AND (v.next_visit_id IS NULL OR e.id < v.next_visit_id)
  ) a
)
SELECT channel, internal,
       COUNT(*) AS visits,
       COUNT(DISTINCT session_id) AS browser_ids,
       COUNT(*) FILTER (WHERE checks > 0) AS visits_with_check,
       COUNT(*) FILTER (WHERE repeats > 0) AS visits_with_repeat,
       COUNT(*) FILTER (WHERE copies > 0) AS visits_with_copy,
       COUNT(*) FILTER (WHERE pricing > 0) AS visits_with_price_interest
FROM windows
GROUP BY channel, internal
ORDER BY visits DESC, channel, internal;
```

推广时仅分享带白名单 UTM 的链接，例如 `https://intentlock-nine.vercel.app/?utm_source=reddit`；历史未加标签的 Reddit/X 链接无法可靠反推来源。不能用本查询的低样本结果宣称市场需求或付费意愿成立。

2026-09-30 已在当前生产库执行这条只读 SQL：返回 `historical_unknown / unknown` 9 次访问、9 个浏览器标识，其余四项行为窗口均为 0；新归因代码尚未发布，不能把这 9 次访问归类为任何渠道或真人。
