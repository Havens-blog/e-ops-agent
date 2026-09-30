// 主布局侧边栏分组菜单配置 + 角色裁剪（task 2.8，ui-design UF-2）。
//
// 三组 8 项（与 UF-2「侧边栏」逐字一致）：
//   概览 —— 工作台
//   身份治理 —— 用户管理 / 组织管理 / 租户管理 / 身份源管理
//   权限管理 —— 角色管理 / 授权管理 / 策略管理
//
// 裁剪口径（Hard Rule：与各 UF Validation Rules 可见口径逐项一致）：
//   - 普通用户：仅工作台
//   - 只读/审计：工作台 / 用户 / 组织 / 身份源 / 角色 / 授权（仅查看，不渲染增删改入口）
//   - 租户管理员：工作台 / 用户 / 角色 / 授权
//   - 平台管理员：全 8 项；**租户管理 / 策略管理仅平台管理员渲染**（Hard Rule 显式钉死）
//
// 角色判定数据源（tech-design Architecture：主布局消费 user store）：
//   - isAdmin → 平台管理员（profile.is_admin，eiam 权威）
//   - tenants.length === 0（零租户受限态）→ 普通用户口径（仅工作台，UF-2 受限态）
//   - 其余非 admin → 默认按「只读/审计」可见集渲染（最宽容非 admin 集，路由守卫
//     requiresAdmin 对租户/策略二次拦截；tenant_admin 与 readonly_audit 的细分
//     待 parity §5 权限词表定稿后由权限码精细化，此处为 provisional 推断）。
//
// provisional 说明：router task 2.6 已留 permissions?: string[] 扩展点，词表待
// parity §5 定稿。本配置的 ROLE_VISIBILITY 已覆盖四档全集，inferRole 返回值
// 一旦词表落地即可按权限码精细化，无需改 visibleMenuItems / SidebarMenu。
import {
  Connection,
  Document,
  HomeFilled,
  Key,
  Lock,
  OfficeBuilding,
  User,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'

/** 菜单组（组标题 uppercase 11px 灰色，UF-2） */
export interface MenuGroup {
  id: string
  title: string
}

/** 菜单项（40px 高，图标 18px + 标题 14px，UF-2） */
export interface MenuItem {
  key: string
  label: string
  path: string
  icon: Component
  group: MenuGroup['id']
  /** 平台管理员独占（Hard Rule：租户管理 / 策略管理） */
  adminOnly?: boolean
}

/** 三组（顺序即渲染顺序） */
export const MENU_GROUPS: MenuGroup[] = [
  { id: 'overview', title: '概览' },
  { id: 'identity', title: '身份治理' },
  { id: 'permission', title: '权限管理' },
]

/** 8 项（顺序即组内渲染顺序，与 UF-2 逐字一致） */
export const MENU_ITEMS: MenuItem[] = [
  {
    key: 'workbench',
    label: '工作台',
    path: '/workbench',
    icon: HomeFilled,
    group: 'overview',
  },
  {
    key: 'users',
    label: '用户管理',
    path: '/users',
    icon: User,
    group: 'identity',
  },
  {
    key: 'organizations',
    label: '组织管理',
    path: '/organizations',
    icon: OfficeBuilding,
    group: 'identity',
  },
  {
    key: 'tenants',
    label: '租户管理',
    path: '/tenants',
    icon: Connection,
    group: 'identity',
    adminOnly: true,
  },
  {
    key: 'identity-sources',
    label: '身份源管理',
    path: '/identity-sources',
    icon: Key,
    group: 'identity',
  },
  {
    key: 'roles',
    label: '角色管理',
    path: '/roles',
    icon: Lock,
    group: 'permission',
  },
  {
    key: 'authorizations',
    label: '授权管理',
    path: '/authorizations',
    icon: Document,
    group: 'permission',
  },
  {
    key: 'policies',
    label: '策略管理',
    path: '/policies',
    icon: Connection,
    group: 'permission',
    adminOnly: true,
  },
]

/** 角色档位（与裁剪口径四档一一对应） */
export type MenuRole =
  'platform_admin' | 'readonly_audit' | 'tenant_admin' | 'normal'

/** 各角色可见菜单 key 全集（与 UF-2 裁剪口径逐项一致） */
const ROLE_VISIBILITY: Record<MenuRole, readonly string[]> = {
  // 全 8 项
  platform_admin: [
    'workbench',
    'users',
    'organizations',
    'tenants',
    'identity-sources',
    'roles',
    'authorizations',
    'policies',
  ],
  // 工作台 / 用户 / 组织 / 身份源 / 角色 / 授权（无租户/策略）
  readonly_audit: [
    'workbench',
    'users',
    'organizations',
    'identity-sources',
    'roles',
    'authorizations',
  ],
  // 工作台 / 用户 / 角色 / 授权
  tenant_admin: ['workbench', 'users', 'roles', 'authorizations'],
  // 仅工作台（普通用户 / 零租户受限态）
  normal: ['workbench'],
}

/** inferRole 的输入信号（从 user store 派生，纯数据便于单测） */
export interface RoleSignals {
  isAdmin: boolean
  /** 所属租户数（零租户 → 受限态，仅工作台） */
  tenantsCount: number
}

/**
 * 由会话信号推断菜单角色档位。
 *
 * - isAdmin → platform_admin（全量）
 * - !isAdmin && tenants.length === 0 → normal（零租户受限态：仅工作台，UF-2 受限视图）
 * - !isAdmin && tenants.length > 0 → readonly_audit（provisional：最宽容非 admin 集；
 *   tenant_admin 细分待 parity §5 权限词表，见模块注释）
 */
export function inferRole(signals: RoleSignals): MenuRole {
  if (signals.isAdmin) return 'platform_admin'
  if (signals.tenantsCount === 0) return 'normal'
  return 'readonly_audit'
}

/**
 * 按角色裁剪后的可见菜单项（保留组内顺序）。
 *
 * adminOnly 项（租户/策略）即便角色可见集含其 key，也仅 platform_admin 渲染——
 * Hard Rule 双保险：角色集 + adminOnly 标记两道闸，任一改错不致越权渲染。
 */
export function visibleMenuItems(role: MenuRole): MenuItem[] {
  const allowed = new Set(ROLE_VISIBILITY[role])
  return MENU_ITEMS.filter((item) => {
    if (!allowed.has(item.key)) return false
    if (item.adminOnly && role !== 'platform_admin') return false
    return true
  })
}

/** 按组归集可见项（供侧边栏分组渲染） */
export function groupedVisibleMenu(
  role: MenuRole,
): { group: MenuGroup; items: MenuItem[] }[] {
  const items = visibleMenuItems(role)
  return MENU_GROUPS.map((group) => ({
    group,
    items: items.filter((i) => i.group === group.id),
  })).filter((entry) => entry.items.length > 0)
}

/** 按 path 找菜单项（面包屑「当前页」取 active 项文案用） */
export function findMenuItemByPath(path: string): MenuItem | undefined {
  // 精确匹配优先；其次前缀匹配（详情页 /users/:id 归属 /users）
  const exact = MENU_ITEMS.find((i) => i.path === path)
  if (exact) return exact
  return MENU_ITEMS.filter(
    (i) => path.startsWith(i.path + '/') || path === i.path,
  ).sort((a, b) => b.path.length - a.path.length)[0]
}
