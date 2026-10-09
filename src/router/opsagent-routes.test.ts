import { describe, expect, it } from 'vitest'
import { opsagentRoutes } from './opsagent-routes'

/**
 * 运维 Agent 子模块路由表（opsagent 自云管迁入本仓，records/6.1-console-relocation）。
 * 口径：登录态即可进入（无 eiam 能力码 / requiresAdmin），路由全量懒加载；
 * 诊断详情为详情子页（不进菜单）；租户边界由后端 EiamAuth 承接。
 */
describe('运维 Agent 子模块路由表', () => {
  it('6 条路由全注册：核心页 + 诊断详情 + 管理页', () => {
    const paths = opsagentRoutes.map((r) => r.path)
    expect(paths).toEqual([
      '/opsagent/chat',
      '/opsagent/risk-center',
      '/opsagent/diagnosis/:id',
      '/opsagent/history',
      '/opsagent/settings',
      '/opsagent/agents',
    ])
  })

  it('全部路由组件为动态 import()（懒加载，与路由表口径一致）', () => {
    for (const r of opsagentRoutes) {
      expect(typeof r.component).toBe('function')
    }
  })

  it('不声明 meta.permissions / requiresAdmin：登录态即可（租户边界由后端 EiamAuth 承接）', () => {
    for (const r of opsagentRoutes) {
      expect(r.meta?.permissions).toBeUndefined()
      expect(r.meta?.requiresAdmin).toBeUndefined()
      expect(r.meta?.public).toBeUndefined()
    }
  })

  it('route name 唯一（控制台路由表合并后不冲突）', () => {
    const names = opsagentRoutes.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
  })
})