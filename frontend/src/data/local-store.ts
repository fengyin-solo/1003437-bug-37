import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'forest-fire-patrol:entries'
// 数据变更广播：同页组件和其它标签页都靠它刷新，待审工作台才能跟着结论变化。
export const ENTRIES_CHANGED_EVENT = 'forest-fire-patrol:entries-changed'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    // 老版本用火审批单没有风险等级/审批历史，结构对不上就按新种子重播这一个模块，其它模块数据不动。
    if (Array.isArray(parsed.burnpermit) && parsed.burnpermit.some((row) => !('风险等级' in row))) {
      parsed.burnpermit = clone(SEED_ROWS.burnpermit ?? [])
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...fallback, ...parsed }))
    }
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

function notifyChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ENTRIES_CHANGED_EVENT))
  }
}

let cache: Record<string, EntryRow[]> | null = null

// 其它标签页一旦写入，就丢掉本地缓存，下次读取直接拿最新快照。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      cache = null
      notifyChanged()
    }
  })
}

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

/** 绕过缓存重新读存储：校验和提交都必须基于最新快照，避免用过期数据做判断。 */
export function freshRows(key: string): EntryRow[] {
  cache = readStorage()
  return cache[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  notifyChanged()
}

/**
 * 带版本校验的单行提交（乐观锁）：
 * 重新读最新快照，确认目标行 revision 没变才一次性写入；
 * 行数据、审批历史、版本号同在一条记录里，一次 setItem 落盘，失败时不会只写一半。
 * 返回 false 表示期间已被别人抢先提交——冲突时以审批时间先后为准，后到者不落盘。
 */
export function commitRow(key: string, id: number, expectedRevision: number, updated: EntryRow): boolean {
  const snapshot = readStorage()
  const rows = snapshot[key] ?? []
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return false
  }
  if ((Number(rows[index].revision) || 0) !== expectedRevision) {
    return false
  }
  const nextRows = [...rows]
  nextRows[index] = updated
  const next = { ...snapshot, [key]: nextRows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  notifyChanged()
  return true
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
