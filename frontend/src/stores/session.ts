import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '森林防火巡护管理系统',
    // 用火审批的归属校验按「当前单位 + 角色」判定：申请人只能动本单位的单，审批人才能下结论
    unit: '森林防火指挥部',
    role: '审批人' as '申请人' | '审批人',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setUnit(unit: string) {
      this.unit = unit
    },
    setRole(role: '申请人' | '审批人') {
      this.role = role
    },
  },
})
