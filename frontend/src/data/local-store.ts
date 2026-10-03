import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'forest-fire-patrol:entries'

// 用火审批单的派生标志只由状态决定：待申请/待审批才算待处理，驳回算异常。
// 老数据缺新字段（风险等级、审批记录等）时读出时补齐；审批记录只追加，原记录不动。
const BURNPERMIT_KEY = 'burnpermit'
const BURNPERMIT_OPEN_STATUSES = ['待申请', '待审批']

function normalizeRows(key: string, rows: EntryRow[]): EntryRow[] {
  if (key !== BURNPERMIT_KEY) {
    return rows
  }
  return rows.map((row) => ({
    风险等级: '中',
    安全措施: '',
    提交时间: '',
    审批人: '',
    审批时间: '',
    审批意见: '',
    ...row,
    pending: BURNPERMIT_OPEN_STATUSES.includes(String(row.status)),
    abnormal: String(row.status) === '已驳回',
    审批记录: Array.isArray(row.审批记录) ? row.审批记录 : [],
  }))
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function persist(rows: Record<string, EntryRow[]>): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    persist(fallback)
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...fallback, ...parsed }
    for (const key of Object.keys(merged)) {
      merged[key] = normalizeRows(key, merged[key])
    }
    return merged
  } catch {
    persist(fallback)
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(next)
}

// 读-改-写合成一步：绕开内存缓存拿最新落盘状态，校验通过后一次性整体写回；
// 校验不通过什么都不写，失败时不会只写一半。
export type MutateOutcome<T> =
  | { ok: true; rows: EntryRow[]; value: T }
  | { ok: false; value: T }

export function mutateRows<T>(key: string, mutator: (rows: EntryRow[]) => MutateOutcome<T>): T {
  const fresh = readStorage()
  const outcome = mutator(clone(fresh[key] ?? []))
  if (outcome.ok) {
    const next = { ...fresh, [key]: outcome.rows }
    cache = next
    persist(next)
  } else {
    cache = fresh
  }
  return outcome.value
}

// 其它标签页改了数据时丢掉内存缓存，下次读取直接看落盘状态。
export function refreshFromStorage(): void {
  cache = null
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
