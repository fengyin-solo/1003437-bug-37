<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">森林防火巡护管理系统</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向森林火险监测、巡护任务调度、防火设施维护与应急响应指挥的林区防火管理平台。</span>
        <span class="head-user">
          当前值班：{{ store.operator }} · {{ store.unit }} · {{ store.shiftLabel }}
          <select v-model="profileKey" class="profile-select" aria-label="切换值班身份">
            <option v-for="profile in profiles" :key="profile.key" :value="profile.key">
              {{ profile.label }}
            </option>
          </select>
        </span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import { useSessionStore } from '@/stores/session'

const store = useSessionStore()

// 演示用值班身份：审批机关与各申请单位，切换后可直观看到归属校验的效果。
const profiles = [
  { key: 'approver', label: '切换到：森林防火指挥部 · 王审批（审批机关）', operator: '王审批', unit: '森林防火指挥部' },
  { key: 'dongsheng', label: '切换到：东升林场 · 张申请（申请单位）', operator: '张申请', unit: '东升林场' },
  { key: 'xishan', label: '切换到：西山林场 · 李填报（申请单位）', operator: '李填报', unit: '西山林场' },
  { key: 'nanshan', label: '切换到：南山林场 · 赵报备（申请单位）', operator: '赵报备', unit: '南山林场' },
]

const profileKey = ref('approver')

watch(profileKey, (key) => {
  const profile = profiles.find((item) => item.key === key)
  if (profile) {
    store.setProfile(profile.operator, profile.unit)
  }
})

const navItems = [{ label: "运营概览", path: "/" }, { label: "巡护任务", path: "/patrol" }, { label: "火险监测", path: "/firewatch" }, { label: "瞭望台管理", path: "/lookout" }, { label: "防火隔离带", path: "/firebreak" }, { label: "扑火队伍", path: "/fireteam" }, { label: "消防装备", path: "/equipment" }, { label: "气象观测", path: "/weather" }, { label: "火情报告", path: "/firereport" }, { label: "无人机巡查", path: "/drone" }, { label: "防火宣传", path: "/campaign" }, { label: "防火检查站", path: "/checkpoint" }, { label: "值勤排班", path: "/duty" }, { label: "物资储备", path: "/supply" }, { label: "林区道路", path: "/forestroad" }, { label: "防火林带", path: "/firebelt" }, { label: "应急演练", path: "/drill" }, { label: "焚烧审批", path: "/burnpermit" }, { label: "林木生长", path: "/treegrowth" }]
</script>
