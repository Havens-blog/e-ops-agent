// menuConfig 单测（task 2.8，UF-2 菜单裁剪口径）。
// 钉死：8 项配置、三组、inferRole 四档、visibleMenuItems 各档可见 key 全集、adminOnly 双保险。
import { describe, expect, it } from 'vitest'
import {
  findMenuItemByPath,
  groupedVisibleMenu,
  inferRole,
  MENU_GROUPS,
  MENU_ITEMS,
  visibleMenuItems,
  type RoleSignals,
} from './menuConfig'

const allKeys = MENU_ITEMS.map((i) => i.key)

describe('menuConfig（2.8 裁剪口径）', () => {
  it('8 项配置逐字一致：key/label/path/group', () => {
    expect(MENU_ITEMS).toHaveLength(8)
    expect(MENU_ITEMS.map((i) => i.key)).toEqual([
      'workbench',
      'users',
      'organizations',
      'tenants',
      'identity-sources',
      'roles',
      'authorizations',
      'policies',
    ])
    expect(MENU_ITEMS.map((i) => i.label)).toEqual([
      '工作台',
      '用户管理',
      '组织管理',
      '租户管理',
      '身份源管理',
      '角色管理',
      '授权管理',
      '策略管理',
    ])
    expect(MENU_ITEMS.map((i) => i.path)).toEqual([
      '/workbench',
      '/users',
      '/organizations',
      '/tenants',
      '/identity-sources',
      '/roles',
      '/authorizations',
      '/policies',
    ])
  })

  it('三组顺序：概览 / 身份治理 / 权限管理', () => {
    expect(MENU_GROUPS.map((g) => g.title)).toEqual([
      '概览',
      '身份治理',
      '权限管理',
    ])
  })

  it('租户管理 / 策略管理 adminOnly 标记（Hard Rule 双保险）', () => {
    const tenants = MENU_ITEMS.find((i) => i.key === 'tenants')
    const policies = MENU_ITEMS.find((i) => i.key === 'policies')
    expect(tenants?.adminOnly).toBe(true)
    expect(policies?.adminOnly).toBe(true)
    // 其余 6 项无 adminOnly 标记
    const nonAdminItems = MENU_ITEMS.filter((i) => !i.adminOnly)
    expect(nonAdminItems.map((i) => i.key)).toEqual([
      'workbench',
      'users',
      'organizations',
      'identity-sources',
      'roles',
      'authorizations',
    ])
  })

  describe('inferRole 四档', () => {
    it('isAdmin → platform_admin（无论有无租户）', () => {
      expect(inferRole({ isAdmin: true, tenantsCount: 0 } as RoleSignals)).toBe(
        'platform_admin',
      )
      expect(inferRole({ isAdmin: true, tenantsCount: 3 } as RoleSignals)).toBe(
        'platform_admin',
      )
    })
    it('!isAdmin && tenants.length===0 → normal（零租户受限态）', () => {
      expect(
        inferRole({ isAdmin: false, tenantsCount: 0 } as RoleSignals),
      ).toBe('normal')
    })
    it('!isAdmin && tenants.length>0 → readonly_audit（provisional，待 parity §5）', () => {
      expect(
        inferRole({ isAdmin: false, tenantsCount: 1 } as RoleSignals),
      ).toBe('readonly_audit')
      expect(
        inferRole({ isAdmin: false, tenantsCount: 5 } as RoleSignals),
      ).toBe('readonly_audit')
    })
  })

  describe('visibleMenuItems 各档可见 key 全集（UF-2 裁剪逐项一致）', () => {
    it('平台管理员：全 8 项', () => {
      expect(visibleMenuItems('platform_admin').map((i) => i.key)).toEqual(
        allKeys,
      )
    })
    it('只读/审计：工作台/用户/组织/身份源/角色/授权（无租户/策略）', () => {
      expect(visibleMenuItems('readonly_audit').map((i) => i.key)).toEqual([
        'workbench',
        'users',
        'organizations',
        'identity-sources',
        'roles',
        'authorizations',
      ])
    })
    it('租户管理员：工作台/用户/角色/授权', () => {
      expect(visibleMenuItems('tenant_admin').map((i) => i.key)).toEqual([
        'workbench',
        'users',
        'roles',
        'authorizations',
      ])
    })
    it('普通用户：仅工作台', () => {
      expect(visibleMenuItems('normal').map((i) => i.key)).toEqual([
        'workbench',
      ])
    })
  })

  it('adminOnly 双保险：即便角色可见集含 tenants/policies，非 platform_admin 也不渲染', () => {
    // tenant_admin 可见集不含 tenants/policies，正常过滤
    const tenantAdmin = visibleMenuItems('tenant_admin')
    expect(tenantAdmin.find((i) => i.key === 'tenants')).toBeUndefined()
    expect(tenantAdmin.find((i) => i.key === 'policies')).toBeUndefined()
    // readonly_audit 同样不含
    const readonly = visibleMenuItems('readonly_audit')
    expect(readonly.find((i) => i.key === 'tenants')).toBeUndefined()
    expect(readonly.find((i) => i.key === 'policies')).toBeUndefined()
  })

  it('groupedVisibleMenu 仅返回含可见项的组，组内顺序保留', () => {
    const groups = groupedVisibleMenu('tenant_admin')
    // tenant_admin 可见：工作台(overview) + 用户(identity) + 角色/授权(permission)
    expect(groups.map((g) => g.group.id)).toEqual([
      'overview',
      'identity',
      'permission',
    ])
    const overview = groups.find((g) => g.group.id === 'overview')!
    expect(overview.items.map((i) => i.key)).toEqual(['workbench'])
    const identity = groups.find((g) => g.group.id === 'identity')!
    expect(identity.items.map((i) => i.key)).toEqual(['users'])
    const permission = groups.find((g) => g.group.id === 'permission')!
    expect(permission.items.map((i) => i.key)).toEqual([
      'roles',
      'authorizations',
    ])
  })

  it('groupedVisibleMenu 普通用户仅概览组（身份治理/权限管理组因无可见项被滤除）', () => {
    const groups = groupedVisibleMenu('normal')
    expect(groups.map((g) => g.group.id)).toEqual(['overview'])
    expect(groups[0]!.items.map((i) => i.key)).toEqual(['workbench'])
  })

  describe('findMenuItemByPath（面包屑当前页文案）', () => {
    it('精确路径匹配', () => {
      expect(findMenuItemByPath('/users')?.label).toBe('用户管理')
      expect(findMenuItemByPath('/workbench')?.label).toBe('工作台')
    })
    it('详情页前缀匹配（/users/:id → users）', () => {
      expect(findMenuItemByPath('/users/123')?.key).toBe('users')
      expect(findMenuItemByPath('/roles/abc')?.key).toBe('roles')
    })
    it('未知路径返回 undefined', () => {
      expect(findMenuItemByPath('/unknown')).toBeUndefined()
    })
  })
})
