<template>
  <section class="page" data-module="burnpermit">
    <header class="page-head">
      <div>
        <h2>焚烧审批管理</h2>
        <p class="page-desc">
          维护用火审批单，登记、提交、审批一条链。待审队列按风险等级（高→中→低）排列，同级按提交时间先后；冲突时以审批时间先后为准。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="toggleCreate">登记用火审批单</button>
        <button class="btn" type="button" @click="exportRows">导出焚烧审批清单</button>
      </div>
    </header>

    <div class="session-bar">
      <label>
        当前单位
        <select v-model="session.unit">
          <option v-for="unit in unitOptions" :key="unit" :value="unit">{{ unit }}</option>
        </select>
      </label>
      <label>
        当前角色
        <select :value="session.role" @change="onRoleChange">
          <option value="申请人">申请人</option>
          <option value="审批人">审批人</option>
        </select>
      </label>
      <span class="session-hint">{{ roleHint }}</span>
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <div v-if="createOpen" class="create-panel">
      <div class="create-grid">
        <label>
          <span>申请单位</span>
          <input :value="session.unit" disabled />
        </label>
        <label>
          <span>用火类型</span>
          <input v-model="draft.用火类型" placeholder="如：计划烧除" />
        </label>
        <label>
          <span>用火地点</span>
          <input v-model="draft.用火地点" placeholder="如：北坡落叶松林地" />
        </label>
        <label>
          <span>计划时段</span>
          <input v-model="draft.计划时段" placeholder="如：2026-10-10 08:00-12:00" />
        </label>
        <label>
          <span>风险等级</span>
          <select v-model="draft.风险等级">
            <option v-for="level in riskLevels" :key="level" :value="level">{{ level }}</option>
          </select>
        </label>
        <label>
          <span>安全措施</span>
          <input v-model="draft.安全措施" placeholder="隔离带、看守人员、灭火装备等" />
        </label>
      </div>
      <div class="create-actions">
        <button class="btn primary" type="button" :disabled="busy" @click="createEntry">提交登记</button>
        <button class="btn ghost" type="button" @click="toggleCreate">收起</button>
        <span class="session-hint">登记后归属「{{ session.unit }}」，其它单位只能查看、不能改动</span>
      </div>
    </div>

    <nav class="tab-bar">
      <button type="button" class="tab-item" :class="{ active: tab === 'queue' }" @click="tab = 'queue'">
        待审工作台（{{ queue.length }}）
      </button>
      <button type="button" class="tab-item" :class="{ active: tab === 'all' }" @click="tab = 'all'">
        全部审批单
      </button>
    </nav>

    <template v-if="tab === 'queue'">
      <table class="data-table">
        <thead>
          <tr>
            <th>审批编号</th>
            <th>申请单位</th>
            <th>用火类型</th>
            <th>用火地点</th>
            <th>风险等级</th>
            <th>提交时间</th>
            <th>审批意见</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in queue" :key="String(row.id)">
            <td>{{ row.审批编号 }}</td>
            <td>{{ row.申请单位 }}</td>
            <td>{{ row.用火类型 }}</td>
            <td>{{ row.用火地点 }}</td>
            <td><span class="risk-tag" :class="riskClass(row)">{{ row.风险等级 }}</span></td>
            <td>{{ row.提交时间 || '—' }}</td>
            <td>
              <input
                class="opinion-input"
                v-model="opinions[Number(row.id)]"
                placeholder="批准可填，驳回必填"
              />
            </td>
            <td class="row-actions">
              <template v-if="canDecide(row)">
                <button class="link" type="button" :disabled="busy" @click="decide('批准申请', row)">批准申请</button>
                <button class="link" type="button" :disabled="busy" @click="decide('驳回答复', row)">驳回答复</button>
              </template>
              <span v-else class="session-hint">{{ decideHint(row) }}</span>
            </td>
          </tr>
          <tr v-if="!queue.length">
            <td colspan="8" class="empty-state">待审队列已清空，结论会同步反映到统计与运营概览</td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-else>
      <form class="filter-bar" @submit.prevent>
        <label v-for="field in filterFields" :key="field" class="filter-item">
          <span>{{ field }}</span>
          <input v-model="filters[field]" :placeholder="`按${field}检索`" />
        </label>
        <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>审批记录</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="String(row.id)">
            <tr>
              <td v-for="column in columns" :key="column">{{ cellText(row, column) }}</td>
              <td>{{ row.status }}</td>
              <td>
                <button v-if="historyOf(row).length" class="link" type="button" @click="toggleHistory(row)">
                  {{ expanded.has(Number(row.id)) ? '收起' : `查看（${historyOf(row).length}）` }}
                </button>
                <span v-else>—</span>
              </td>
              <td class="row-actions">
                <button v-if="canSubmit(row)" class="link" type="button" :disabled="busy" @click="submitRow(row)">
                  提交申请
                </button>
                <span v-else class="session-hint">{{ rowHint(row) }}</span>
              </td>
            </tr>
            <tr v-if="expanded.has(Number(row.id))">
              <td :colspan="columns.length + 3">
                <ol class="history-list">
                  <li v-for="(record, index) in historyOf(row)" :key="index">
                    {{ record.审批时间 }} · {{ record.审批人 }} · {{ record.结论
                    }}<template v-if="record.意见">：{{ record.意见 }}</template>
                  </li>
                </ol>
              </td>
            </tr>
          </template>
          <tr v-if="!rows.length">
            <td :colspan="columns.length + 3" class="empty-state">暂无焚烧审批数据，可先登记用火审批单</td>
          </tr>
        </tbody>
      </table>
    </template>

    <footer class="page-foot">
      <span>共 {{ total }} 条焚烧审批记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="notice" class="ok-text">{{ notice }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import {
  BURNPERMIT_RISK_LEVELS,
  createBurnpermitEntry,
  downloadEntries,
  filterRows,
  listBurnpermitQueue,
  listEntries,
  moduleMeta,
  refreshFromStorage,
  runApprovalAction,
  storageKey,
} from '@/api/local-service'
import type { ApprovalRecord, BurnpermitDraft, EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('burnpermit')
const columns = meta.fields
const statuses = meta.statuses
const riskLevels = BURNPERMIT_RISK_LEVELS
const filterFields = columns.slice(0, 3)

const session = useSessionStore()

const all = ref<EntryRow[]>([])
const queue = ref<EntryRow[]>([])
const filters = ref<Record<string, string>>({})
const tab = ref<'queue' | 'all'>('queue')
const createOpen = ref(false)
const busy = ref(false)
const errorMessage = ref('')
const notice = ref('')
const opinions = ref<Record<number, string>>({})
const expanded = reactive(new Set<number>())
const draft = reactive<BurnpermitDraft>({ 用火类型: '', 用火地点: '', 计划时段: '', 风险等级: '中', 安全措施: '' })

const rows = computed(() => filterRows(all.value, filters.value))
const total = computed(() => rows.value.length)
const stats = computed(() => [
  { label: '待审批申请', value: countStatus('待审批') },
  { label: '已批准用火', value: countStatus('已批准') },
  { label: '驳回申请', value: countStatus('已驳回') },
])
const statusSummary = computed(() =>
  statuses.map((status: string) => ({ status, count: countStatus(status) })),
)
const unitOptions = computed(() => {
  const units = new Set<string>(['森林防火指挥部', session.unit])
  for (const row of all.value) {
    const unit = String(row.申请单位 ?? '')
    if (unit !== '') {
      units.add(unit)
    }
  }
  return [...units]
})
const roleHint = computed(() =>
  session.role === '审批人'
    ? '审批人可对其它单位的待审单下结论；本单位的申请不能自己批'
    : `申请人只能提交「${session.unit}」的单，其它单位仅可查看`,
)

function countStatus(status: string): number {
  return all.value.filter((row) => String(row.status) === status).length
}

function actor() {
  return { operator: session.operator, unit: session.unit, role: session.role }
}

function historyOf(row: EntryRow): ApprovalRecord[] {
  return Array.isArray(row.审批记录) ? row.审批记录 : []
}

function cellText(row: EntryRow, column: string): string {
  const value = row[column]
  return value === undefined || value === '' ? '—' : String(value)
}

function riskClass(row: EntryRow): string {
  const level = String(row.风险等级 ?? '中')
  return level === '高' ? 'high' : level === '低' ? 'low' : 'mid'
}

function canSubmit(row: EntryRow): boolean {
  const status = String(row.status)
  return (status === '待申请' || status === '已驳回') && String(row.申请单位 ?? '') === session.unit
}

function canDecide(row: EntryRow): boolean {
  return session.role === '审批人' && String(row.申请单位 ?? '') !== session.unit
}

function decideHint(row: EntryRow): string {
  if (session.role !== '审批人') {
    return '当前是申请人角色，只能查看'
  }
  return String(row.申请单位 ?? '') === session.unit ? '申请人不能批准自己的申请' : ''
}

function rowHint(row: EntryRow): string {
  const status = String(row.status)
  const mine = String(row.申请单位 ?? '') === session.unit
  if (status === '待审批') {
    return mine ? '待审批，由其它单位审批人处理' : '待审批，请到待审工作台处理'
  }
  if ((status === '待申请' || status === '已驳回') && !mine) {
    return '其它单位的单，只能查看'
  }
  return '—'
}

function toggleCreate() {
  createOpen.value = !createOpen.value
}

function toggleHistory(row: EntryRow) {
  const id = Number(row.id)
  if (expanded.has(id)) {
    expanded.delete(id)
  } else {
    expanded.add(id)
  }
}

function resetFilters() {
  filters.value = {}
}

function exportRows() {
  downloadEntries(meta.key)
}

function onRoleChange(event: Event) {
  session.setRole((event.target as HTMLSelectElement).value === '审批人' ? '审批人' : '申请人')
}

// 动作统一走这里：失败也刷新一次，把其它标签页已落库的结论同步进来
async function guard(task: () => Promise<{ ok: boolean; message: string }>) {
  if (busy.value) {
    return
  }
  busy.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const result = await task()
    if (result.ok) {
      notice.value = result.message
    } else {
      errorMessage.value = result.message
    }
  } finally {
    busy.value = false
    reload()
  }
}

function decide(action: string, row: EntryRow) {
  const id = Number(row.id)
  void guard(async () => {
    const result = await runApprovalAction(id, action, actor(), opinions.value[id] ?? '')
    if (result.ok) {
      delete opinions.value[id]
    }
    return result
  })
}

function submitRow(row: EntryRow) {
  void guard(() => runApprovalAction(Number(row.id), '提交申请', actor()))
}

function createEntry() {
  void guard(async () => {
    const result = await createBurnpermitEntry(actor(), { ...draft })
    if (result.ok) {
      draft.用火类型 = ''
      draft.用火地点 = ''
      draft.计划时段 = ''
      draft.风险等级 = '中'
      draft.安全措施 = ''
      createOpen.value = false
    }
    return result
  })
}

function reload() {
  try {
    all.value = listEntries(meta.key).items
    queue.value = listBurnpermitQueue()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '焚烧审批列表读取失败'
  }
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== storageKey()) {
    return
  }
  refreshFromStorage()
  reload()
}

onMounted(() => {
  reload()
  window.addEventListener('storage', onStorage)
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage)
})
</script>
