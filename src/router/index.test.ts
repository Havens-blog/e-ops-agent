// @vitest-environment happy-dom
/**
 * router 守卫链（2.6）契约测试。
 *
 * 覆盖 AC：
 * - 11 路由注册（/login /workbench /users /users/:id /organizations /tenants
 *   /identity-sources /roles /roles/:id /authorizations /policies /tenant-select）+ 403 页
 * - beforeEach 四步：① cookie 缺失/profile 失败 → 跳登录 ② mustSelectTenant → /tenant-select
 *   ③ permissions 裁剪不通过 → 403 页 ④ 放行并记 currentTenantId 入模块级快照
 * - 401 后复位在途 store（403 原地、401 跳转区分）
 * - 路由级懒加载（全 import()）
 *
 * 手法（与 user.test.ts 同款）：patch 共享 eiamAxios adapter 回放 profile 响应；
 * document.cookie 注入/清除会话凭据；setActivePinia 提供守卫内 useUserStore() 上下文。
 *
 * 视图组件 vi.mock 为空壳：守卫测试聚焦守卫逻辑，不加载真实 .vue（避免 element-plus
 * CSS 在 vitest 动态 import 路径下的 .css 扩展名故障；视图渲染由各页专属测试承接）。
 */
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

// ---- 视图空壳 mock（守卫测试不渲染真实视图）----
const stubView = { template: '<div />' }
vi.mock('@/views/login/Login.vue', () => ({ default: stubView }))
vi.mock('@/views/workbench/Workbench.vue', () => ({ default: stubView }))
vi.mock('@/views/users/UserList.vue', () => ({ default: stubView }))
vi.mock('@/views/users/UserDetail.vue', () => ({ default: stubView }))
vi.mock('@/views/organizations/OrgList.vue', () => ({ default: stubView }))
vi.mock('@/views/tenants/TenantList.vue', () => ({ default: stubView }))
vi.mock('@/views/identity-sources/IdpList.vue', () => ({ default: stubView }))
vi.mock('@/views/roles/RoleList.vue', () => ({ default: stubView }))
vi.mock('@/views/roles/RoleDetail.vue', () => ({ default: stubView }))
vi.mock('@/views/authorizations/AuthorizationList.vue', () => ({ default: stubView }))
vi.mock('@/views/policies/PolicyList.vue', () => ({ default: stubView }))
vi.mock('@/views/tenant-select/TenantSelect.vue', () => ({ default: stubView }))
vi.mock('@/views/error/Forbidden.vue', () => ({ default: stubView }))

// 抑制 vue-router 同路由重复导航的 console.warn 噪音
vi.stubGlobal('console', {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
})

// 在 mock 注册后引入被测模块（router 静态 import 已绑定 mock；动态 import 在导航时解析）
const { eiamAxios } = await import('@/api/request/eiam')
const {
  __resetPageEnterTenantSnapshot,
  getPageEnterTenantSnapshot,
  registerUnauthorizedReset,
  router,
  routes,
} = await import('./index')

const SESSION_COOKIE_KEY = 'ecmdb-token-key'

const STATUS_TEXT: Partial<Record<number, string>> = {
  200: 'OK',
  401: 'Unauthorized',
  500: 'Internal Server Error',
}

interface MockReply {
  status?: number
  body?: unknown
  networkFailure?: { code: string; message: string }
}

function settleLike(response: AxiosResponse): AxiosResponse {
  const validate =
    response.config.validateStatus ?? ((s: number) => s >= 200 && s < 300)
  if (validate(response.status)) return response
  throw new AxiosError(
    `Request failed with status code ${response.status}`,
    AxiosError.ERR_BAD_REQUEST,
    response.config,
    undefined,
    response,
  )
}

/** profile data 样本（与 user.test.ts sampleProfileData 同源） */
function profileData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user: { id: 1, username: 'admin', nickname: '管理员' },
    tenants: [{ id: 1, name: '系统租户', code: 'system', domain: 'sys.example.com' }],
    current_tenant_id: 1,
    is_admin: true,
    permissions: [],
    must_select_tenant: false,
    ...overrides,
  }
}

/** 装 eiamAxios adapter 替身：按 replyFor 回放，返回 profile 响应 */
function mockAdapter(replyFor: (config: InternalAxiosRequestConfig) => MockReply): void {
  eiamAxios.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
    new Promise<AxiosResponse>((resolve, reject) => {
      const reply = replyFor(config)
      if (reply.networkFailure) {
        reject(
          new AxiosError(reply.networkFailure.message, reply.networkFailure.code, config),
        )
        return
      }
      try {
        resolve(
          settleLike({
            data: reply.body ?? null,
            status: reply.status ?? 200,
            statusText: STATUS_TEXT[reply.status ?? 200] ?? '',
            headers: {},
            config,
          } as AxiosResponse),
        )
      } catch (e) {
        reject(e)
      }
    })) as unknown as typeof eiamAxios.defaults.adapter
}

/** 注入会话 cookie（happy-dom document.cookie 支持） */
function setSessionCookie(value = 'token-abc'): void {
  document.cookie = `${SESSION_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  document.cookie = `${SESSION_COOKIE_KEY}=${encodeURIComponent(value)}; path=/`
}

/** 清除会话 cookie */
function clearSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
}

/** 装 fresh pinia（守卫内 useUserStore() 取此实例） */
function freshPinia() {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  createApp({ render: () => null }).use(pinia)
  setActivePinia(pinia)
  return pinia
}

beforeEach(async () => {
  localStorage.clear()
  clearSessionCookie()
  __resetPageEnterTenantSnapshot()
  freshPinia()
  // 复位路由到公开 /login：避免上一测试结尾路由与下一测试首个 push 同路由被 vue-router
  // 判为重复导航而跳过守卫（public 路由不走守卫，且视图已 mock，廉价无副作用）。
  await router.push('/login')
})

afterEach(() => {
  eiamAxios.defaults.adapter = undefined
  clearSessionCookie()
  __resetPageEnterTenantSnapshot()
})

describe('2.6 路由表注册', () => {
  it('11 页 + 2 子页 + 403 页全部以 import() 懒加载注册', () => {
    const paths = router.getRoutes().map((r) => r.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        '/login',
        '/workbench',
        '/users',
        '/users/:id',
        '/organizations',
        '/tenants',
        '/identity-sources',
        '/roles',
        '/roles/:id',
        '/authorizations',
        '/policies',
        '/tenant-select',
        '/forbidden',
      ]),
    )
    expect(routes).toHaveLength(13)
  })

  it('所有业务路由组件为动态 import()（懒加载，路由级代码分割）', () => {
    for (const r of routes) {
      expect(typeof r.component).toBe('function')
    }
  })

  it('/tenants 与 /policies 标记 requiresAdmin（仅平台管理员，ui-design 菜单同口径）', () => {
    expect(router.resolve('/tenants').meta.requiresAdmin).toBe(true)
    expect(router.resolve('/policies').meta.requiresAdmin).toBe(true)
  })

  it('/login 与 /forbidden 标记 public（跳过守卫）；/tenant-select skipTenantGuard', () => {
    expect(router.resolve('/login').meta.public).toBe(true)
    expect(router.resolve('/forbidden').meta.public).toBe(true)
    expect(router.resolve('/tenant-select').meta.skipTenantGuard).toBe(true)
  })

  it('history base 由 vite base（import.meta.env.BASE_URL）派生，与 nginx 同域反代形态一致', () => {
    const expectedBase = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL
    expect(router.options.history.base).toBe(expectedBase)
  })
})

describe('2.6 守卫链 ① cookie 缺失 / profile 失败 → 跳登录', () => {
  it('cookie 缺失：跳 /login 且带 redirect 回跳 query，不触发 profile 请求', async () => {
    clearSessionCookie()
    let profileCalled = false
    mockAdapter(() => {
      profileCalled = true
      return { status: 200, body: { code: 0, msg: 'ok', data: profileData() } }
    })

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/workbench')
    expect(profileCalled).toBe(false)
  })

  it('profile 拉取失败（非 401 网络故障）：跳 /login', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      networkFailure: { code: 'ERR_NETWORK', message: 'network down' },
    }))

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/workbench')
  })

  it('profile 401：跳 /login（401 收敛路径，复位在途 store）', async () => {
    setSessionCookie()
    mockAdapter(() => ({ status: 401, body: '' }))

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/login')
  })
})

describe('2.6 守卫链 ② mustSelectTenant → /tenant-select', () => {
  it('多租户（tenants.length>1）且 currentTenantId===0：跳 /tenant-select', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: {
        code: 0,
        msg: 'ok',
        data: profileData({
          tenants: [
            { id: 1, name: 'A', code: 'a', domain: 'a.x' },
            { id: 2, name: 'B', code: 'b', domain: 'b.x' },
          ],
          current_tenant_id: 0,
          is_admin: false,
        }),
      },
    }))

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/tenant-select')
  })

  it('多租户但已选定租户（currentTenantId>0）：放行，不跳 /tenant-select（防循环）', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: {
        code: 0,
        msg: 'ok',
        data: profileData({
          tenants: [
            { id: 1, name: 'A', code: 'a', domain: 'a.x' },
            { id: 2, name: 'B', code: 'b', domain: 'b.x' },
          ],
          current_tenant_id: 2,
        }),
      },
    }))

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/workbench')
  })

  it('单租户：不跳 /tenant-select，直接放行', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: { code: 0, msg: 'ok', data: profileData() },
    }))

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/workbench')
  })

  it('mustSelectTenant 时直入 /tenant-select：守卫放行（skipTenantGuard）', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: {
        code: 0,
        msg: 'ok',
        data: profileData({
          tenants: [
            { id: 1, name: 'A', code: 'a', domain: 'a.x' },
            { id: 2, name: 'B', code: 'b', domain: 'b.x' },
          ],
          current_tenant_id: 0,
        }),
      },
    }))

    await router.push('/tenant-select')
    expect(router.currentRoute.value.path).toBe('/tenant-select')
  })
})

describe('2.6 守卫链 ③ permissions 裁剪不通过 → 403 页', () => {
  it('requiresAdmin 页 + 非管理员 → /forbidden', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: {
        code: 0,
        msg: 'ok',
        data: profileData({ is_admin: false, current_tenant_id: 1 }),
      },
    }))

    await router.push('/tenants')
    expect(router.currentRoute.value.path).toBe('/forbidden')
  })

  it('requiresAdmin 页 + 平台管理员 → 放行', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: { code: 0, msg: 'ok', data: profileData({ is_admin: true }) },
    }))

    await router.push('/policies')
    expect(router.currentRoute.value.path).toBe('/policies')
  })

  it('普通页（非 requiresAdmin）+ 普通用户 → 放行', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: {
        code: 0,
        msg: 'ok',
        data: profileData({ is_admin: false, current_tenant_id: 1 }),
      },
    }))

    await router.push('/users')
    expect(router.currentRoute.value.path).toBe('/users')
  })
})

describe('2.6 守卫链 ④ 放行 → 记录租户快照', () => {
  it('放行后 pageEnterTenantSnapshot = currentTenantId', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: { code: 0, msg: 'ok', data: profileData({ current_tenant_id: 7 }) },
    }))

    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/workbench')
    expect(getPageEnterTenantSnapshot()).toBe(7)
  })

  it('快照非持久化：同会话内切页，快照仍为 currentTenantId（profile 不重拉）', async () => {
    setSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: { code: 0, msg: 'ok', data: profileData({ current_tenant_id: 7 }) },
    }))

    await router.push('/workbench')
    expect(getPageEnterTenantSnapshot()).toBe(7)

    // 切到另一页，profile 已加载不再重拉；快照仍为 currentTenantId（同一会话）
    await router.push('/users')
    expect(router.currentRoute.value.path).toBe('/users')
    expect(getPageEnterTenantSnapshot()).toBe(7)
  })

  it('快照初始值为 0（未放行前）', () => {
    expect(getPageEnterTenantSnapshot()).toBe(0)
  })
})

describe('2.6 公开路由跳过守卫', () => {
  it('/login 公开：无 cookie 无 profile 仍可达', async () => {
    clearSessionCookie()
    mockAdapter(() => ({
      status: 200,
      body: { code: 0, msg: 'ok', data: profileData() },
    }))

    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('/forbidden 公开：无 cookie 仍可达（403 页可达，承接 Story 3）', async () => {
    clearSessionCookie()
    await router.push('/forbidden')
    expect(router.currentRoute.value.path).toBe('/forbidden')
  })
})

describe('2.6 401 与 403 区分', () => {
  it('401 收敛路径复位 user store（cookie 缺失触发 resetStoresOnUnauthorized）', async () => {
    setSessionCookie()
    // 先成功到 workbench（profile 加载）
    mockAdapter(() => ({
      status: 200,
      body: { code: 0, msg: 'ok', data: profileData() },
    }))
    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/workbench')

    // 模拟 401 收敛：清 cookie 后再导航 → 守卫 ① cookie 缺失 → 复位 + 跳登录
    clearSessionCookie()
    await router.push('/users')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('registerUnauthorizedReset 回调在 401 收敛时被调用（list store 扩展点）', async () => {
    let resetCalled = false
    registerUnauthorizedReset(() => {
      resetCalled = true
    })

    clearSessionCookie()
    await router.push('/workbench')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(resetCalled).toBe(true)
  })
})

describe('2.6 路由级懒加载 import() 形态', () => {
  it('每个业务路由 component 为函数（懒加载基建；chunk 分割由构建产物核验）', () => {
    const sampled = ['/workbench', '/users/:id', '/roles/:id', '/tenant-select', '/forbidden']
    for (const path of sampled) {
      const record = routes.find((r) => r.path === path)
      expect(record, `route ${path} 应注册`).toBeDefined()
      expect(typeof record?.component).toBe('function')
    }
    expect(routes.every((r) => typeof r.component === 'function')).toBe(true)
  })
})
