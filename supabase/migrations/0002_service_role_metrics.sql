-- 服务端统计可读取事件；浏览器角色继续由 0001 显式禁止访问。
grant select on table public.intentlock_events to service_role;
