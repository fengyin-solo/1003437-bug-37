import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, mutateRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  ApprovalActor,
  ApprovalRecord,
  BurnpermitDraft,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// —— 用火审批单审批链：归属校验、自审拦截、结论落库都集中在这里，页面只做渲染 ——

const BURNPERMIT_KEY = 'burnpermit'
const BURNPERMIT_OPEN_STATUSES = ['待申请', '待审批']
const SUBMIT_ACTION = '提交申请'
const REJECT_ACTION = '驳回答复'
const APPROVER_ROLE = '审批人'

// 待审队列排序：风险等级高的排前面，同级按提交时间先后，先报先审。
export const BURNPERMIT_RISK_LEVELS = ['高', '中', '低']
const RISK_RANK: Record<string, number> = { 高: 0, 中: 1, 低: 2 }

function riskRank(row: EntryRow): number {
  return RISK_RANK[String(row.风险等级)] ?? RISK_RANK['中']
}

function timestamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

// 同一审批单的并发提交只落一个结果：用 Web Locks 把读-改-写串起来，
// 不支持的环境里退化为直接执行（单标签页内本来就是串行的）。
async function withModuleLock<T>(key: string, task: () => T): Promise<T> {
  const nav = navigator as Navigator & {
    locks?: { request: (name: string, callback: () => unknown) => Promise<unknown> }
  }
  if (!nav.locks) {
    return task()
  }
  return nav.locks.request(`forest-fire-patrol:${key}`, task) as Promise<T>
}

/** 待审工作台：只看「待审批」，按风险等级高→低、同级按提交时间先后排列。 */
export function listBurnpermitQueue(): EntryRow[] {
  return listRows(BURNPERMIT_KEY)
    .filter((row) => String(row.status) === '待审批')
    .sort((a, b) => {
      const byRisk = riskRank(a) - riskRank(b)
      if (byRisk !== 0) {
        return byRisk
      }
      return String(a.提交时间 ?? '').localeCompare(String(b.提交时间 ?? ''))
    })
}

/**
 * 审批链唯一入口：提交申请 / 批准申请 / 驳回答复。
 * 先校验再落库，任何一步不通过都不写；通过时行数据和审批记录在同一次写里落库。
 */
export async function runApprovalAction(
  id: number,
  action: string,
  actor: ApprovalActor,
  comment = '',
): Promise<ActionResult> {
  const meta = moduleMeta(BURNPERMIT_KEY)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const opinion = comment.trim()
  if (action === REJECT_ACTION && opinion === '') {
    return { ok: false, message: '驳回必须填写审批意见，说明整改要求' }
  }
  return withModuleLock(BURNPERMIT_KEY, () =>
    mutateRows<ActionResult>(BURNPERMIT_KEY, (rows) => {
      const fail = (message: string) => ({ ok: false as const, value: { ok: false, message } })
      const index = rows.findIndex((row) => Number(row.id) === id)
      if (index < 0) {
        return fail(`没有找到编号为 ${id} 的${meta.entity}`)
      }
      const row = rows[index]
      const status = String(row.status)
      const owner = String(row.申请单位 ?? '')
      if (action === SUBMIT_ACTION) {
        // 归属校验：只有申请单位自己能提交，其它单位只能查看、不能改动
        if (actor.unit !== owner) {
          return fail(`归属校验未通过：该单属于「${owner}」，当前单位「${actor.unit}」只能查看、不能改动`)
        }
        if (status !== '待申请' && status !== '已驳回') {
          return fail(`当前状态「${status}」不能重复提交`)
        }
        // 重新提交进入新一轮：清掉挂在单上的旧结论，历史审批意见留在审批记录里
        rows[index] = {
          ...row,
          status: target,
          pending: BURNPERMIT_OPEN_STATUSES.includes(target),
          abnormal: false,
          提交时间: timestamp(),
          审批人: '',
          审批时间: '',
          审批意见: '',
        }
        return { ok: true, rows, value: { ok: true, message: `${meta.entity}已提交，当前状态「${target}」` } }
      }
      // 批准 / 驳回：只有审批角色能下结论，且申请人不能批准自己的申请
      if (actor.role !== APPROVER_ROLE) {
        return fail(`当前身份是申请人，不能对${meta.entity}下结论`)
      }
      if (actor.unit === owner) {
        return fail('申请人不能批准自己的申请，请换其它单位的审批人处理')
      }
      if (status !== '待审批') {
        // 冲突时以审批时间先后为准：已有结论不再覆盖，本次不落库
        const decided = row.审批时间
          ? `已由「${String(row.审批人)}」于 ${String(row.审批时间)} 处理为「${status}」`
          : `当前状态已是「${status}」`
        return fail(`该${meta.entity}${decided}，冲突时以审批时间先后为准，本次结论未落库`)
      }
      const decidedAt = timestamp()
      const record: ApprovalRecord = {
        结论: target,
        审批人: `${actor.unit}·${actor.operator}`,
        审批时间: decidedAt,
        意见: opinion,
      }
      rows[index] = {
        ...row,
        status: target,
        pending: BURNPERMIT_OPEN_STATUSES.includes(target),
        abnormal: action === REJECT_ACTION,
        审批人: record.审批人,
        审批时间: decidedAt,
        审批意见: opinion,
        审批记录: [...(Array.isArray(row.审批记录) ? row.审批记录 : []), record],
      }
      return { ok: true, rows, value: { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` } }
    }),
  )
}

/** 登记用火审批单：归属取当前会话单位，先把整张单校验完再落库。 */
export async function createBurnpermitEntry(
  actor: ApprovalActor,
  draft: BurnpermitDraft,
): Promise<ActionResult> {
  const meta = moduleMeta(BURNPERMIT_KEY)
  const required: [string, string][] = [
    ['用火类型', draft.用火类型],
    ['用火地点', draft.用火地点],
    ['计划时段', draft.计划时段],
    ['安全措施', draft.安全措施],
  ]
  const missing = required.filter(([, value]) => value.trim() === '').map(([field]) => field)
  if (missing.length > 0) {
    return { ok: false, message: `请先填全：${missing.join('、')}` }
  }
  if (!BURNPERMIT_RISK_LEVELS.includes(draft.风险等级)) {
    return { ok: false, message: `风险等级只能是：${BURNPERMIT_RISK_LEVELS.join('、')}` }
  }
  return withModuleLock(BURNPERMIT_KEY, () =>
    mutateRows<ActionResult>(BURNPERMIT_KEY, (rows) => {
      const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
      const code = `BURN-${String(id).padStart(4, '0')}`
      const row: EntryRow = {
        id,
        status: '待申请',
        pending: true,
        abnormal: false,
        审批编号: code,
        申请单位: actor.unit,
        用火类型: draft.用火类型.trim(),
        用火地点: draft.用火地点.trim(),
        计划时段: draft.计划时段.trim(),
        风险等级: draft.风险等级,
        安全措施: draft.安全措施.trim(),
        提交时间: '',
        审批人: '',
        审批时间: '',
        审批意见: '',
        审批记录: [],
      }
      return {
        ok: true,
        rows: [...rows, row],
        value: { ok: true, message: `${meta.entity}${code}已登记，归属「${actor.unit}」，待提交申请` },
      }
    }),
  )
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// 页面只和本模块打交道，缓存刷新与存储键也从这里转发。
export { refreshFromStorage, storageKey } from '@/data/local-store'
