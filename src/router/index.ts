import type { RouteLocation, RouteLocationRaw, RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'
import { hasSessionCookie } from '@/api/request/eiam'
import { useUserStore } from '@/stores/user'

/**
 * 路由表 + 全局守卫链（task 2.6）。
 *
 * 守卫链为唯一权限裁剪入口（Hard Rule），与 ui-design UF-2 菜单可见性口径逐项一致：
 *   ① cookie 缺失 / profile 拉取失败 → /console/login（带 redirect 回跳）
 *   ② mustSelectTenant（F-1：tenants.length>1）且 currentTenantId===0 → /tenant-select
 *   ③ permissions 裁剪不通过 → /forbidden（与菜单裁剪同口径，文案契约 forbidden）
 *   ④ 放行 → 记录 currentTenantId 入模块级单值快照（Integration 6 写前守卫取值）
 *
 * 路由全部 `import()` 懒加载（性能预算：11 页路由级代码分割）。
 * 快照非持久化、非第二份租户真相存储（Hard Rule）——仅页面进入时刻的观测值，
 * 真值唯一在服务端共享 session + tenant store currentTenantId。
 */

// ---- route meta 契约 ----

declare module 'vue-router' {
  interface RouteMeta {
    /** 公开路由，跳过全部守卫（登录页 / 403 页） */
    public?: boolean
    /** 租户选择页：经 ① cookie/profile 守卫，但跳过 ② mustSelectTenant 与 ③ 权限裁剪 */
    skipTenantGuard?: boolean
    /** 仅平台管理员可访问（ui-design：租户/策略管理仅平台管理员） */
    requiresAdmin?: boolean
    /** 所需 eiam 权限码（用户须具备全部；词表待 parity §5 定稿后由 2.8 落地，当前留扩展点） */
    permissions?: string[]
  }
}

// ---- 路由表（11 页 + 2 子页 + 403 页）----

export const routes: RouteRecordRaw[] = [
  {
    // 默认落地：登录态直接进根路径 `/` 时无页面组件，须重定向到工作台，否则空白页；
    // 未登录态由守卫 ① 先拦到 /login（redirect 于守卫前解析，落点最终由守卫再判）。
    path: '/',
    redirect: '/workbench',
  },
  {
    path: '/login',
    component: () => import('@/views/login/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/workbench',
    component: () => import('@/views/workbench/Workbench.vue'),
  },
  {
    path: '/users',
    component: () => import('@/views/users/UserList.vue'),
  },
  {
    path: '/users/:id',
    component: () => import('@/views/users/UserDetail.vue'),
  },
  {
    path: '/organizations',
    component: () => import('@/views/organizations/OrgList.vue'),
  },
  {
    path: '/tenants',
    component: () => import('@/views/tenants/TenantList.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/identity-sources',
    component: () => import('@/views/identity-sources/IdpList.vue'),
  },
  {
    path: '/roles',
    component: () => import('@/views/roles/RoleList.vue'),
  },
  {
    path: '/roles/:id',
    component: () => import('@/views/roles/RoleDetail.vue'),
  },
  {
    path: '/authorizations',
    component: () => import('@/views/authorizations/AuthorizationList.vue'),
  },
  {
    path: '/policies',
    component: () => import('@/views/policies/PolicyList.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/tenant-select',
    component: () => import('@/views/tenant-select/TenantSelect.vue'),
    meta: { skipTenantGuard: true },
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('@/views/error/Forbidden.vue'),
    meta: { public: true },
  },
]

export const router = createRouter({
  // BASE_URL 来自 vite base '/console/'，与 nginx 同域反代形态一致
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// ---- 模块级租户快照（Integration 6 写前守卫取值，task 3.1 消费）----

/**
 * 进入当前页面时观测到的租户 id（守卫 ④ 在每次放行后写入）。
 * 非持久化、非第二份租户真相存储——仅页进入时刻的观测值，真值在服务端共享 session
 * + tenant store currentTenantId。写前守卫（3.1）比对 create/update/remove 提交前的快照
 * 与 currentTenantId，不一致先刷新再提交，阻断「标签 B 呈现 X 租户数据、发出 Y 租户请求」。
 */
let pageEnterTenantSnapshot = 0

/** 读取进入页面时的租户快照（写前守卫 3.1 取值） */
export function getPageEnterTenantSnapshot(): number {
  return pageEnterTenantSnapshot
}

/** 测试复位用：清空快照（生产路径不经此） */
export function __resetPageEnterTenantSnapshot(): void {
  pageEnterTenantSnapshot = 0
}

// ---- 401 收敛：中断在途状态 + list store 复位 loading/error ----

/**
 * 401 收敛时复位在途 store 状态（tech-design §Error Handling：401 后中断在途路由请求、
 * list store 复位 loading/error；403 原地不跳转，二者区分）。
 *
 * 当前复位 user store（fetchProfile 在途 AbortController + 派生会话字段）与 tenant store
 * （switch 在途 + 上下文）。7 个 list store（4.x/5.x 落地后）经 registerUnauthorizedReset
 * 自助注册复位回调，避免守卫模块反向依赖未实现的 store——单点扩展、零硬编码清单。
 */
type UnauthorizedReset = () => void
const unauthorizedResets: UnauthorizedReset[] = []

/** list store 自助注册 401 复位回调（4.x/5.x list store 落地时调用） */
export function registerUnauthorizedReset(fn: UnauthorizedReset): void {
  unauthorizedResets.push(fn)
}

function resetStoresOnUnauthorized(): void {
  // user.resetState 复位 user 派生字段 + 调用 tenant.resetState（租户上下文唯一归属）
  useUserStore().resetState()
  for (const fn of unauthorizedResets) {
    try {
      fn()
    } catch {
      // 单个 store 复位失败不阻断其余复位（韧性：401 收敛路径不可因复位抛错而中断跳转）
    }
  }
}

// ---- 全局守卫链（beforeEach 四步）----

/**
 * 登录跳转目标构造（带 redirect 回跳，与 eiam.ts redirectToLogin 同款语义但走 SPA 导航）。
 * 守卫的 ① 路径（cookie 缺失 / profile 失败）用此做 SPA 跳转，避免硬 window.location 跳转
 * 丢失 SPA 状态；请求层 401（list fetch 等非守卫路径）仍由 eiam.ts redirectToLogin 硬跳。
 */
function redirectToLogin(to: RouteLocation): RouteLocationRaw {
  resetStoresOnUnauthorized()
  return { path: '/login', query: { redirect: to.fullPath } }
}

/** 403 跳转目标（守卫 ③ 裁剪不通过 → 403 页，文案契约 forbidden） */
function redirectToForbidden(): RouteLocationRaw {
  return { name: 'forbidden' }
}

/**
 * 权限裁剪（守卫 ③，与菜单裁剪同口径）。
 * - requiresAdmin：!isAdmin → 403（ui-design：租户/策略管理仅平台管理员）
 * - permissions：用户须具备全部所需权限码（hasPermission 逐项；词表待 parity §5 定稿）
 */
function passesPermissionCheck(to: RouteLocation): boolean {
  const userStore = useUserStore()
  if (to.meta.requiresAdmin && !userStore.isAdmin) return false
  const required = to.meta.permissions
  if (required && required.length > 0) {
    if (!required.every((code) => userStore.hasPermission(code))) return false
  }
  return true
}

router.beforeEach(async (to) => {
  // 公开路由（登录页 / 403 页）跳过全部守卫
  if (to.meta.public) return true

  // ① cookie 缺失 → 跳登录（同步判定，避免明知无凭据仍发 profile 请求触发 401 硬跳）
  if (!hasSessionCookie()) {
    return redirectToLogin(to)
  }

  const userStore = useUserStore()

  // ① profile 拉取：未加载则拉取，失败（含 401）→ 跳登录
  //    仅在 profile 为空且非在途时触发，避免每次导航重复拉取。
  if (!userStore.profile && !userStore.loading) {
    const ok = await userStore.fetchProfile()
    if (!ok) {
      // profile 拉取失败（含 401 在内）：守卫 SPA 跳登录 + 复位在途状态。
      // 注：若失败源于 401，eiam.ts 响应拦截器已置 isRedirectingToLogin 并触发硬跳；
      //    此处 SPA 跳转与硬跳同向 /console/login，不冲突（硬跳胜出亦无碍）。
      return redirectToLogin(to)
    }
  }

  // ② mustSelectTenant（F-1：tenants.length>1）且 currentTenantId===0 → 跳租户选择页
  //    currentTenantId===0 防止选中租户后（switch+reload → profile.current_tenant_id>0）循环。
  //    租户选择页自身 skipTenantGuard，不被此步拦回。
  if (!to.meta.skipTenantGuard) {
    if (userStore.mustSelectTenant && userStore.currentTenantId === 0) {
      return { path: '/tenant-select' }
    }
  }

  // ③ permissions 裁剪不通过 → 403 页（与菜单裁剪同口径）
  if (!passesPermissionCheck(to)) {
    return redirectToForbidden()
  }

  // ④ 放行 → 记录 currentTenantId 入模块级单值快照（写前守卫 3.1 取值）
  pageEnterTenantSnapshot = userStore.currentTenantId

  return true
})
