/**
 * 用火审批单审批链验证脚本：不依赖浏览器，用内存 localStorage 跑通服务层。
 * 运行：npm run verify
 */

// —— 最小浏览器环境：localStorage + 无 Web Locks 的 navigator ——
const backing = new Map<string, string>()
const localStorageShim = {
  getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
  setItem: (key: string, value: string) => void backing.set(key, String(value)),
  removeItem: (key: string) => void backing.delete(key),
  clear: () => backing.clear(),
}
;(globalThis as Record<string, unknown>).window = { localStorage: localStorageShim }
;(globalThis as Record<string, unknown>).navigator = {}

const {
  createBurnpermitEntry,
  listBurnpermitQueue,
  listEntries,
  loadOverview,
  resetModule,
  runApprovalAction,
  storageKey,
} = await import('../src/api/local-service')

const 指挥部 = { operator: '王岩', unit: '森林防火指挥部', role: '审批人' }
const 青山申请 = { operator: '李青', unit: '青山林场', role: '申请人' }
const 云杉审批 = { operator: '赵云', unit: '云杉林场', role: '审批人' }

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.error(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}

function snapshot(): string {
  return backing.get(storageKey()) ?? ''
}

function row(id: number) {
  return listEntries('burnpermit').items.find((item) => Number(item.id) === id)
}

// 每次从种子数据重来，互不污染
resetModule('burnpermit')

console.log('一、归属校验：其它单位只能查看、不能改动')
{
  const before = snapshot()
  const result = await runApprovalAction(1, '提交申请', 云杉审批)
  check('外单位提交被拦截', !result.ok && result.message.includes('归属校验'))
  check('拦截后不落半个字', snapshot() === before)
}

console.log('二、申请人不能批准自己的申请')
{
  const before = snapshot()
  const selfApprove = await runApprovalAction(2, '批准申请', { operator: '刘柳', unit: '柳树林场', role: '审批人' })
  check('本单位审批人批本单位的单被拦截', !selfApprove.ok && selfApprove.message.includes('自己的申请'))
  const applicantRole = await runApprovalAction(2, '批准申请', 青山申请)
  check('申请人角色下结论被拦截', !applicantRole.ok)
  check('拦截后不落半个字', snapshot() === before)
}

console.log('三、待审队列排序：风险等级高→中→低，同级按提交时间先后')
{
  await runApprovalAction(1, '提交申请', 青山申请) // 高风险，提交时间更晚
  const queue = listBurnpermitQueue()
  check('高风险排在前面', String(queue[0].审批编号) === 'BURN-0001' && String(queue[1].审批编号) === 'BURN-0002')
  const created = await createBurnpermitEntry(青山申请, {
    用火类型: '计划烧除',
    用火地点: '西坡灌丛',
    计划时段: '2026-10-15 08:00-10:00',
    风险等级: '中',
    安全措施: '隔离带20米',
  })
  check('登记新单成功', created.ok)
  const newId = listEntries('burnpermit').items.length
  await runApprovalAction(newId, '提交申请', 青山申请) // 中风险，提交时间最晚
  const ordered = listBurnpermitQueue().map((item) => String(item.审批编号))
  check(
    '同级按提交时间先后',
    ordered.join(',') === 'BURN-0001,BURN-0002,BURN-0005',
    ordered.join(','),
  )
}

console.log('四、同一审批单并发提交只落一个结果')
{
  const [first, second] = await Promise.all([
    runApprovalAction(2, '批准申请', 指挥部, '同意'),
    runApprovalAction(2, '驳回答复', 云杉审批, '材料不全'),
  ])
  const results = [first, second]
  check('只有一个结论落库', results.filter((item) => item.ok).length === 1)
  check('败者收到冲突提示', results.some((item) => !item.ok && item.message.includes('审批时间先后')))
  const decided = row(2)
  check('审批记录只有一条', Array.isArray(decided?.审批记录) && decided!.审批记录!.length === 1)
  check('单上结论与记录一致', String(decided?.status) === String(decided?.审批记录?.[0]?.结论))
}

console.log('五、驳回后重新提交：清掉旧结论，历史审批意见保留原记录')
{
  const reject = await runApprovalAction(5, '驳回答复', 指挥部, '隔离带宽度不足')
  check('驳回成功', reject.ok)
  check('驳回必填意见', !(await runApprovalAction(1, '驳回答复', 云杉审批)).ok)
  const resubmit = await runApprovalAction(5, '提交申请', 青山申请)
  check('驳回后可重新提交', resubmit.ok)
  const current = row(5)
  check('旧结论从单上清掉', String(current?.审批人) === '' && String(current?.审批时间) === '')
  const history = current?.审批记录 ?? []
  check('历史意见原样保留', history.length === 1 && String(history[0].意见) === '隔离带宽度不足')
  const again = await runApprovalAction(5, '批准申请', 指挥部, '整改到位')
  check('新一轮结论落库', again.ok)
  check('历史追加不改写', (row(5)?.审批记录 ?? []).length === 2)
}

console.log('六、待审工作台跟着结论变化')
{
  const overview = loadOverview()
  const burn = overview.modules.find((item) => item.name === '焚烧审批')
  const openCount = listEntries('burnpermit').items.filter((item) =>
    ['待申请', '待审批'].includes(String(item.status)),
  ).length
  check('运营概览待处理与队列一致', burn?.pending === openCount, `overview=${burn?.pending} queue=${openCount}`)
  const queueIds = listBurnpermitQueue().map((item) => Number(item.id))
  const pendingIds = listEntries('burnpermit')
    .items.filter((item) => String(item.status) === '待审批')
    .map((item) => Number(item.id))
  check('待审工作台只装待审批', queueIds.slice().sort().join(',') === pendingIds.slice().sort().join(','))
}

console.log('七、登记校验：缺字段不写入')
{
  const before = snapshot()
  const bad = await createBurnpermitEntry(青山申请, {
    用火类型: '',
    用火地点: '东坡',
    计划时段: '',
    风险等级: '高',
    安全措施: '',
  })
  check('缺字段登记被拒', !bad.ok)
  check('拒后不写一半', snapshot() === before)
}

console.log(`\n结果：${passed} 通过，${failed} 失败`)
if (failed > 0) {
  process.exit(1)
}
