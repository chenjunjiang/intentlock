const PROJECT_REF = 'dpbicjfthmyeosjdftyn'
const SESSION_ID = 'intentlock-e2e-session'
const COUNT_SQL = `select count(*)::integer as count from public.intentlock_events where session_id = '${SESSION_ID}';`
const DELETE_SQL = `with deleted as (delete from public.intentlock_events where session_id = '${SESSION_ID}' returning id) select count(*)::integer as count from deleted;`

async function queryCount(sql: string): Promise<number> {
  const process = Bun.spawn([
    'bunx', 'supabase@2.118.0', 'db', 'query', '--linked', '--project-ref', PROJECT_REF,
    '--output-format', 'json', sql,
  ], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text()])
  if (await process.exited !== 0) throw new Error('Supabase 查询失败；请检查登录状态和项目权限。')

  const result: unknown = JSON.parse(stdout)
  if (!result || typeof result !== 'object' || !('rows' in result) || !Array.isArray(result.rows)) {
    throw new Error('Supabase 返回格式不符合预期，已停止清理。')
  }
  const count: unknown = result.rows[0]?.count
  if (!Number.isSafeInteger(count) || Number(count) < 0) {
    throw new Error('Supabase 计数不符合预期，已停止清理。')
  }
  return Number(count)
}

const execute = process.argv.includes('--execute')
if (process.argv.some((arg) => arg.startsWith('--') && arg !== '--execute')) {
  throw new Error('仅支持 --execute；不带参数时只做只读预检。')
}

console.log(`项目：${PROJECT_REF}；测试会话：${SESSION_ID}`)
const before = await queryCount(COUNT_SQL)
console.log(`清理前：${before} 条`)

if (!execute) {
  console.log('只读预检完成；需要删除时运行 bun run test:e2e:cleanup --execute。')
} else {
  const deleted = await queryCount(DELETE_SQL)
  const after = await queryCount(COUNT_SQL)
  console.log(`本次删除：${deleted} 条；清理后：${after} 条`)
  if (after !== 0 || before - deleted !== 0) {
    throw new Error('清理数量不一致或仍有残留，请人工核查。')
  }
}
