/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

/** 一条审批记录：追加式保存，历史审批意见只增不改，原记录永久保留。 */
export type ApprovalRecord = {
  time: string
  operator: string
  unit: string
  action: string
  from: string
  to: string
  opinion: string
}

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  /** 乐观锁版本号：每次落盘 +1，并发提交时只放行先到的那个结果。 */
  revision?: number
  /** 审批历史：只追加，不覆盖。 */
  approvals?: ApprovalRecord[]
  [field: string]: string | number | boolean | ApprovalRecord[] | undefined
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
  /** 终审态：进入这些状态即有了结论，不再计入待审工作台。缺省按原规则（仅末态）。 */
  finalStatuses?: string[]
  /** 状态机约束：动作 -> 允许执行的源状态。缺省不约束（保持其他模块原行为）。 */
  transitions?: Record<string, string[]>
}

/** 执行动作时的操作上下文：当前值班人与其所属单位，归属校验全靠它。 */
export type ActionContext = {
  operator?: string
  unit?: string
  opinion?: string
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
