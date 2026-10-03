/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

/** 用火审批单的一次审批结论：只追加、不改写，历史审批意见原样保留。 */
export type ApprovalRecord = {
  结论: string
  审批人: string
  审批时间: string
  意见: string
}

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  审批记录?: ApprovalRecord[]
  [field: string]: string | number | boolean | ApprovalRecord[] | undefined
}

/** 审批操作的身份：归属校验和「申请人不能批准自己的申请」都按它判定。 */
export type ApprovalActor = {
  operator: string
  unit: string
  role: string
}

/** 登记用火审批单时由申请面板填写的字段。 */
export type BurnpermitDraft = {
  用火类型: string
  用火地点: string
  计划时段: string
  风险等级: string
  安全措施: string
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
