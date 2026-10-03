<template>
  <section class="page" data-module="burnpermit">
    <header class="page-head">
      <div>
        <h2>焚烧审批管理</h2>
        <p class="page-desc">
          待审队列按风险等级（高→低）再按申请时间（先申先审）排序；申请单位只能提交本单位的单子，批准/驳回只能由审批机关「{{ approverUnit }}」执行，其它单位仅可查看。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="toggleCreate">登记用火审批单</button>
        <button class="btn" type="button" @click="exportRows">导出焚烧审批清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <nav class="status-nav">
      <button
        v-for="tab in statusTabs"
        :key="tab.status"
        class="legend-item tab-item"
        :class="{ active: activeTab === tab.status }"
        type="button"
        @click="activeTab = tab.status"
      >
        {{ tab.status }}：{{ tab.count }}
      </button>
    </nav>

    <form class="filter-bar" @submit.prevent>
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div v-if="showCreate" class="panel">
      <h3 class="panel-title">登记用火审批单（申请单位：{{ store.unit }} · 申请人：{{ store.operator }}）</h3>
      <form class="create-form" @submit.prevent="submitCreate">
        <label class="filter-item">
          <span>用火类型 *</span>
          <input v-model="createForm['用火类型']" placeholder="如：计划烧除 / 炼山造林" />
        </label>
        <label class="filter-item">
          <span>用火地点 *</span>
          <input v-model="createForm['用火地点']" placeholder="如：东升林场3林班" />
        </label>
        <label class="filter-item">
          <span>计划时段</span>
          <input v-model="createForm['计划时段']" placeholder="如：2026-10-10 06:00-12:00" />
        </label>
        <label class="filter-item">
          <span>安全措施</span>
          <input v-model="createForm['安全措施']" placeholder="隔离带、看守与扑火力量安排" />
        </label>
        <label class="filter-item">
          <span>风险等级</span>
          <select v-model="createForm['风险等级']">
            <option v-for="level in riskLevels" :key="level" :value="level">{{ level }}</option>
          </select>
        </label>
        <div class="panel-actions">
          <button class="btn primary" type="submit">确认登记</button>
          <button class="btn ghost" type="button" @click="toggleCreate">取消</button>
        </div>
      </form>
    </div>

    <div v-if="armedAction" class="panel">
      <h3 class="panel-title">
        {{ armedAction.action }} · {{ armedAction.row['审批编号'] }}（{{ armedAction.row['申请单位'] }}）
      </h3>
      <label class="filter-item opinion-item">
        <span>审批意见{{ armedAction.action === '驳回答复' ? '（驳回必填）' : '（选填）' }}</span>
        <textarea v-model="opinion" rows="2" placeholder="意见会写入审批历史并长期保留"></textarea>
      </label>
      <div class="panel-actions">
        <button class="btn primary" type="button" @click="confirmAction">确认{{ armedAction.action }}</button>
        <button class="btn ghost" type="button" @click="armedAction = null">取消</button>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in displayRows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <span v-if="column === '风险等级'" class="risk-badge" :class="riskClass(row)">
              {{ row[column] || '—' }}
            </span>
            <template v-else>{{ row[column] || '—' }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in availableActions(row)"
              :key="action"
              class="link"
              type="button"
              @click="armAction(action, row)"
            >
              {{ action }}
            </button>
            <button class="link" type="button" @click="toggleDetail(row)">审批记录</button>
            <span v-if="!availableActions(row).length" class="muted-text">{{ readonlyHint(row) }}</span>
          </td>
        </tr>
        <tr v-if="!displayRows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无符合条件的用火审批单</td>
        </tr>
      </tbody>
    </table>

    <div v-if="detailRow" class="panel">
      <h3 class="panel-title">
        {{ detailRow['审批编号'] }} · 审批记录
        <span class="muted-text">当前状态「{{ detailRow.status }}」</span>
      </h3>
      <p v-if="detailRow['审批人']" class="conclusion-line">
        当前结论：{{ detailRow['审批人'] }} 于 {{ detailRow['审批时间'] }} 给出 —— {{ detailRow['审批意见'] || '（未填写意见）' }}
      </p>
      <ol v-if="detailRow.approvals?.length" class="timeline">
        <li v-for="(record, index) in detailRow.approvals" :key="index">
          <span class="timeline-time">{{ record.time }}</span>
          <span>{{ record.unit }} · {{ record.operator }} 执行「{{ record.action }}」：{{ record.from }} → {{ record.to }}</span>
          <span v-if="record.opinion" class="muted-text">意见：{{ record.opinion }}</span>
        </li>
      </ol>
      <p v-else class="muted-text">暂无审批记录</p>
      <div class="panel-actions">
        <button class="btn ghost" type="button" @click="detailRow = null">收起</button>
      </div>
    </div>

    <footer class="page-foot">
      <span>共 {{ displayRows.length }} 条用火审批单（全部 {{ allRows.length }} 条）</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import {
  createEntry,
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { BURNPERMIT_APPROVER_UNIT, compareBurnpermitQueue } from '@/api/burnpermit-workflow'
import { ENTRIES_CHANGED_EVENT } from '@/data/local-store'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('burnpermit')
const store = useSessionStore()
const approverUnit = BURNPERMIT_APPROVER_UNIT

const columns = ['审批编号', '申请单位', '用火类型', '用火地点', '计划时段', '风险等级', '申请人']
const filterFields = columns.slice(0, 3)
const riskLevels = ['高', '中', '低']
// 队列分区：待审批最前，待申请其次，已有结论的沉底。
const STATUS_RANK: Record<string, number> = { 待审批: 0, 待申请: 1, 已批准: 2, 已驳回: 2, 已执行: 3 }

const allRows = ref<EntryRow[]>([])
const filters = reactive<Record<string, string>>({})
const activeTab = ref('全部')
const errorMessage = ref('')
const noticeMessage = ref('')
const showCreate = ref(false)
const createForm = reactive<Record<string, string>>({ 风险等级: '中' })
const armedAction = ref<{ action: string; row: EntryRow } | null>(null)
const opinion = ref('')
const detailRow = ref<EntryRow | null>(null)

const statusTabs = computed(() => [
  { status: '全部', count: allRows.value.length },
  ...meta.statuses.map((status) => ({
    status,
    count: allRows.value.filter((row) => String(row.status) === status).length,
  })),
])

const stats = computed(() => [
  { label: '待审批申请', value: countStatus('待审批') },
  { label: '已批准用火', value: countStatus('已批准') },
  { label: '驳回申请', value: countStatus('已驳回') },
  {
    label: '高风险待审',
    value: allRows.value.filter((row) => String(row.status) === '待审批' && row['风险等级'] === '高').length,
  },
])

// 统计、导航、队列都从同一份快照推导，三处结果天然一致。
const displayRows = computed(() => {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  let list = allRows.value.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
  if (activeTab.value !== '全部') {
    list = list.filter((row) => String(row.status) === activeTab.value)
  }
  return [...list].sort(compareRows)
})

function countStatus(status: string): number {
  return allRows.value.filter((row) => String(row.status) === status).length
}

function compareRows(a: EntryRow, b: EntryRow): number {
  const rankA = STATUS_RANK[String(a.status)] ?? 2
  const rankB = STATUS_RANK[String(b.status)] ?? 2
  if (rankA !== rankB) {
    return rankA - rankB
  }
  if (rankA === 0) {
    return compareBurnpermitQueue(a, b)
  }
  if (rankA === 2) {
    const byConclusion = String(b['审批时间'] ?? '').localeCompare(String(a['审批时间'] ?? ''))
    if (byConclusion !== 0) {
      return byConclusion
    }
  }
  return Number(a.id) - Number(b.id)
}

function riskClass(row: EntryRow): string {
  const level = String(row['风险等级'] ?? '')
  if (level === '高') return 'risk-high'
  if (level === '中') return 'risk-mid'
  return 'risk-low'
}

function availableActions(row: EntryRow): string[] {
  const status = String(row.status)
  const result: string[] = []
  if ((status === '待申请' || status === '已驳回') && store.unit === String(row['申请单位'])) {
    result.push('提交申请')
  }
  if (
    status === '待审批' &&
    store.unit === approverUnit &&
    store.operator !== String(row['申请人'] ?? '')
  ) {
    result.push('批准申请', '驳回答复')
  }
  return result
}

function readonlyHint(row: EntryRow): string {
  if (
    String(row.status) === '待审批' &&
    store.unit === approverUnit &&
    store.operator === String(row['申请人'] ?? '')
  ) {
    return '申请人不能审批本单'
  }
  return '仅可查看'
}

function armAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  opinion.value = ''
  armedAction.value = { action, row }
}

function confirmAction() {
  if (!armedAction.value) {
    return
  }
  const { action, row } = armedAction.value
  if (action === '驳回答复' && !opinion.value.trim()) {
    errorMessage.value = '驳回必须填写审批意见，说明驳回原因'
    return
  }
  const result = applyAction(meta.key, Number(row.id), action, {
    operator: store.operator,
    unit: store.unit,
    opinion: opinion.value,
  })
  if (!result.ok) {
    errorMessage.value = result.message
    reload()
    return
  }
  noticeMessage.value = result.message
  armedAction.value = null
  reload()
}

function toggleCreate() {
  showCreate.value = !showCreate.value
  errorMessage.value = ''
}

function submitCreate() {
  if (!createForm['用火类型']?.trim() || !createForm['用火地点']?.trim()) {
    errorMessage.value = '用火类型和用火地点不能为空'
    return
  }
  const result = createEntry(meta.key, {
    ...createForm,
    申请单位: store.unit,
    申请人: store.operator,
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  showCreate.value = false
  Object.keys(createForm).forEach((field) => {
    if (field !== '风险等级') {
      createForm[field] = ''
    }
  })
  reload()
}

function toggleDetail(row: EntryRow) {
  detailRow.value = detailRow.value && Number(detailRow.value.id) === Number(row.id) ? null : row
}

function resetFilters() {
  Object.keys(filters).forEach((field) => {
    filters[field] = ''
  })
}

function exportRows() {
  downloadEntries(meta.key)
}

function reload() {
  try {
    const payload = listEntries(meta.key)
    allRows.value = payload.items
    // 详情面板跟着最新数据走，结论一变内容立即更新。
    if (detailRow.value) {
      detailRow.value = payload.items.find((row) => Number(row.id) === Number(detailRow.value?.id)) ?? null
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '用火审批单读取失败'
  }
}

onMounted(() => {
  reload()
  window.addEventListener(ENTRIES_CHANGED_EVENT, reload)
})

onBeforeUnmount(() => {
  window.removeEventListener(ENTRIES_CHANGED_EVENT, reload)
})
</script>
