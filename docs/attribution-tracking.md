# 访问归因与内部流量标记

状态：2026-09-30 已通过 GitHub `main` 自动部署并完成生产真实入口验收；C 端存量项目中等变更。无页面视觉改动，无新服务、依赖或数据库迁移。证据见 `docs/qa-report.md`。

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

生产发布按 `docs/deployment-workflow.md` 完成：提交、主分支验证、单独 push 签退、Git 自动部署、生产真实入口复验和测试数据精确清理。上线只代表技术链路可用，不能据此声称产品需求得到验证。

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

2026-09-30 在归因功能生产上线、固定 E2E 会话清零后再次执行上方旧版只读 SQL：返回 `historical_unknown / unknown` 9 次访问、9 个浏览器标识，其余四项行为窗口均为 0；尚无新归因来源的非测试访问，不能把这 9 次历史访问归类为任何渠道或真人。

## 2026-10-01 新版匿名漏斗（2026-10-02 已发布）

在执行 `supabase/migrations/0004_anonymous_funnel.sql` 并发布新版后，以下只读查询按同一访问窗口聚合。每项计的是“发生过该行为的访问次数”，不是独立人数或事件总数；转化率的分母写在列名中。`inputKind` 和 `resultState` 缺失的旧检查列为 `unknown`，不回填分类。同一次访问可能多次检查并出现不同结果，因此三态访问数不能相加当成总访问数。先前旧版 SQL 仍可查询历史基线。

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
    a.edits, a.checks, a.sample_checks, a.custom_checks, a.unknown_input_checks,
    a.safe_checks, a.review_checks, a.danger_checks, a.unknown_checks,
    a.repeats, a.copies, a.pricing, a.pricing_yes
  FROM visits v
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE e.event_name = 'input_edited') AS edits,
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed') AS checks,
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed' AND e.metadata->>'inputKind' = 'sample') AS sample_checks,
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed' AND e.metadata->>'inputKind' = 'custom') AS custom_checks,
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed' AND e.metadata->>'inputKind' IS NULL) AS unknown_input_checks,
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed' AND e.metadata->>'resultState' = 'safe') AS safe_checks,
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed' AND e.metadata->>'resultState' = 'review') AS review_checks,
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed' AND e.metadata->>'resultState' = 'danger') AS danger_checks,
      COUNT(*) FILTER (WHERE e.event_name = 'analysis_completed' AND e.metadata->>'resultState' IS NULL) AS unknown_checks,
      COUNT(*) FILTER (WHERE e.event_name = 'repeat_use') AS repeats,
      COUNT(*) FILTER (WHERE e.event_name = 'result_copied') AS copies,
      COUNT(*) FILTER (WHERE e.event_name = 'pricing_interest') AS pricing,
      COUNT(*) FILTER (WHERE e.event_name = 'pricing_interest' AND e.metadata->>'answer' = 'yes') AS pricing_yes
    FROM public.intentlock_events e
    WHERE e.session_id = v.session_id
      AND e.id > v.id
      AND (v.next_visit_id IS NULL OR e.id < v.next_visit_id)
  ) a
)
SELECT channel, internal,
       COUNT(*) AS visits,
       COUNT(DISTINCT session_id) AS browser_ids,
       COUNT(*) FILTER (WHERE edits > 0) AS visits_with_edit,
       COUNT(*) FILTER (WHERE checks > 0) AS visits_with_check,
       COUNT(*) FILTER (WHERE sample_checks > 0) AS visits_with_sample_check,
       COUNT(*) FILTER (WHERE custom_checks > 0) AS visits_with_custom_check,
       COUNT(*) FILTER (WHERE unknown_input_checks > 0) AS visits_with_unknown_input,
       COUNT(*) FILTER (WHERE safe_checks > 0) AS visits_with_safe,
       COUNT(*) FILTER (WHERE review_checks > 0) AS visits_with_review,
       COUNT(*) FILTER (WHERE danger_checks > 0) AS visits_with_danger,
       COUNT(*) FILTER (WHERE unknown_checks > 0) AS visits_with_unknown_result,
       COUNT(*) FILTER (WHERE repeats > 0) AS visits_with_repeat,
       COUNT(*) FILTER (WHERE copies > 0) AS visits_with_copy,
       COUNT(*) FILTER (WHERE pricing > 0) AS visits_with_price_interest,
       COUNT(*) FILTER (WHERE pricing_yes > 0) AS visits_with_price_yes,
       ROUND(100.0 * (COUNT(*) FILTER (WHERE edits > 0)) / COUNT(*), 1) AS visit_to_edit_pct,
       ROUND(100.0 * (COUNT(*) FILTER (WHERE checks > 0)) / COUNT(*), 1) AS visit_to_check_pct,
       ROUND(100.0 * (COUNT(*) FILTER (WHERE edits > 0 AND custom_checks > 0))
             / NULLIF(COUNT(*) FILTER (WHERE edits > 0), 0), 1) AS edit_to_custom_check_pct,
       ROUND(100.0 * (COUNT(*) FILTER (WHERE checks > 0 AND copies > 0))
             / NULLIF(COUNT(*) FILTER (WHERE checks > 0), 0), 1) AS check_to_copy_pct
FROM windows
GROUP BY channel, internal
ORDER BY visits DESC, channel, internal;
```

`input_edited` 是一次页面访问内的首次本地编辑，不表示编辑完成。异步写入可能改变事件的服务端 ID 顺序，使紧邻访问边界的行为归错窗口；上报失败或限流也会导致低估。价格回答是非阻断调查，不是付款或付费承诺。2026-10-02 已执行迁移、生产真实入口写入与此只读查询；固定测试会话清理后，非测试数据仍只有 9 次历史未知访问，编辑及后续行为均为 0。不能把本地模拟遥测或生产测试事件当作真实用户指标。
