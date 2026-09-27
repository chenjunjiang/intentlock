-- 仅服务端密钥可清理测试或过期事件；浏览器角色仍无任何表权限。
grant delete on table public.intentlock_events to service_role;
