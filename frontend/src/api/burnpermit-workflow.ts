import type { ActionContext, ApprovalRecord, EntryRow } from '@/data/types'

// 用火审批单的审批机关：只有它可以批准/驳回；申请单位只能提交本单位的单子，其它单位只能查看。
export const BURNPERMIT_APPROVER_UNIT = '森林防火指挥部'

// 风险等级参与待审队列排序：高 → 中 → 低优先；同级按申请时间升序，先申请先审；再按审批编号兜底。
const RISK_RANK: Record<string, number> = { 高: 0, 中: 1, 低: 2 }

function riskRank(row: EntryRow): number {
  return RISK_RANK[String(row['风险等级'] ?? '')] ?? RISK_RANK['低']
}

export function compareBurnpermitQueue(a: EntryRow, b: EntryRow): number {
  const byRisk = riskRank(a) - riskRank(b)
  if (byRisk !== 0) {
    return byRisk
  }
  const byTime = String(a['申请时间'] ?? '').localeCompare(String(b['申请时间'] ?? ''))
  if (byTime !== 0) {
    return byTime
  }
  return String(a['审批编号'] ?? '').localeCompare(String(b['审批编号'] ?? ''))
}

export function formatTime(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 归属与自审校验：返回错误文案，null 表示放行。只校验、不写数据。 */
export function validateBurnpermitAction(row: EntryRow, action: string, ctx: ActionContext): string | null {
  const unit = ctx.unit ?? ''
  const operator = ctx.operator ?? ''
  const applicantUnit = String(row['申请单位'] ?? '')
  const applicant = String(row['申请人'] ?? '')
  if (action === '提交申请') {
    if (unit !== applicantUnit) {
      return `归属校验未通过：只有申请单位「${applicantUnit}」本单位才能提交这张审批单，其它单位只能查看`
    }
    return null
  }
  if (action === '批准申请' || action === '驳回答复') {
    if (unit !== BURNPERMIT_APPROVER_UNIT) {
      return `归属校验未通过：只有审批机关「${BURNPERMIT_APPROVER_UNIT}」才能${action}，其它单位只能查看`
    }
    if (applicant && operator === applicant) {
      return `申请人不能批准或驳回自己提交的申请（申请人：${applicant}）`
    }
    return null
  }
  return null
}

/** 写入结论：状态、审批人/时间/意见与审批历史一起更新，历史意见只追加、原记录保留。 */
export function applyBurnpermitAction(
  row: EntryRow,
  action: string,
  target: string,
  ctx: ActionContext,
  now: string,
): EntryRow {
  const record: ApprovalRecord = {
    time: now,
    operator: ctx.operator ?? '未登记值班员',
    unit: ctx.unit ?? '未登记单位',
    action,
    from: String(row.status),
    to: target,
    opinion: ctx.opinion?.trim() ?? '',
  }
  const history = [...(row.approvals ?? []), record]
  const next: EntryRow = { ...row, approvals: history }
  if (action === '提交申请') {
    next['申请人'] = record.operator
    next['申请时间'] = now
    // 重新提交进入新一轮审批：清空上一轮的结论展示，旧结论留在审批历史里。
    next['审批人'] = ''
    next['审批时间'] = ''
    next['审批意见'] = ''
  } else {
    next['审批人'] = record.operator
    next['审批时间'] = now
    next['审批意见'] = record.opinion
  }
  return next
}
