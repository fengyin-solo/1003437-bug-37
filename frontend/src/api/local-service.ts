import { MODULE_BY_KEY } from '@/data/modules'
import {
  allRows,
  commitRow,
  freshRows,
  listRows,
  resetRows,
  saveRows,
} from '@/data/local-store'
import {
  applyBurnpermitAction,
  formatTime,
  validateBurnpermitAction,
} from '@/api/burnpermit-workflow'
import type {
  ActionContext,
  ActionResult,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 模块级审批规则挂接点：校验与结论写回都顺着 runAction 这条既有调用链走，页面不另开通道。
const WORKFLOW_GUARDS: Record<
  string,
  {
    validate: (row: EntryRow, action: string, ctx: ActionContext) => string | null
    apply: (row: EntryRow, action: string, target: string, ctx: ActionContext, now: string) => EntryRow
  }
> = {
  burnpermit: { validate: validateBurnpermitAction, apply: applyBurnpermitAction },
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

/** 是否还挂在待审工作台上：声明了终审态的模块按终审态算，其余模块沿用数据里的标记。 */
function effectivePending(meta: ModuleMeta, row: EntryRow): boolean {
  if (meta.finalStatuses) {
    return !meta.finalStatuses.includes(String(row.status))
  }
  return Boolean(row.pending)
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
  const meta = moduleMeta(key)
  const matched = filterRows(listRows(key), filters).map((row) => ({
    ...row,
    pending: effectivePending(meta, row),
  }))
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(
  key: string,
  id: number,
  action: string,
  ctx: ActionContext = {},
): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  // 基于最新快照做校验，别拿页面打开时的旧数据判断。
  const rows = freshRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const row = rows[index]
  const current = String(row.status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const allowedFrom = meta.transitions?.[action]
  if (allowedFrom && !allowedFrom.includes(current)) {
    return { ok: false, message: `当前状态「${current}」不允许${action}，操作未生效` }
  }
  const guard = WORKFLOW_GUARDS[key]
  if (guard) {
    const rejected = guard.validate(row, action, ctx)
    if (rejected) {
      return { ok: false, message: rejected }
    }
  }
  const now = formatTime()
  let updated: EntryRow = {
    ...row,
    status: target,
    pending: meta.finalStatuses ? !meta.finalStatuses.includes(target) : target !== meta.statuses[meta.statuses.length - 1],
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
    revision: (Number(row.revision) || 0) + 1,
  }
  if (guard) {
    updated = guard.apply(updated, action, target, ctx, now)
  }
  // 版本校验 + 单次落盘：并发提交只放行先到的结果，失败时一行都不写。
  if (!commitRow(key, id, Number(row.revision) || 0, updated)) {
    return {
      ok: false,
      message: `该${meta.entity}刚被他人先行处理，冲突时以审批时间先后为准，本次${action}未生效，请刷新查看最新结论`,
    }
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function createEntry(key: string, fields: Record<string, string>): ActionResult & { id?: number } {
  const meta = moduleMeta(key)
  const rows = freshRows(key)
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const entry: EntryRow = {
    id,
    status: meta.statuses[0],
    pending: true,
    abnormal: false,
    revision: 1,
    approvals: [],
  }
  for (const field of meta.fields) {
    const value = fields[field]
    if (value !== undefined && value !== '') {
      entry[field] = value
    }
  }
  // 编号字段没填就按 id 自动生成，和 id 同一次写入，不会产生只有半张的单子。
  const codeField = meta.fields[0]
  if (codeField && codeField.endsWith('编号') && !entry[codeField]) {
    entry[codeField] = `${key.slice(0, 4).toUpperCase()}-${String(id).padStart(4, '0')}`
  }
  saveRows(key, [...rows, entry])
  return { ok: true, message: `${meta.entity}已登记，当前状态「${entry.status}」`, id }
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
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
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
      pending: entries.filter((row) => effectivePending(meta, row)).length,
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
