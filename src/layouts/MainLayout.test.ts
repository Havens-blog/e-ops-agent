// @vitest-environment happy-dom
// MainLayout 集成单测（task 2.8，UF-2）：
// - 角色裁剪渲染（platform_admin 全 8 / normal 仅工作台 / readonly_audit 6 项）
// - header 元素（折叠按钮 + 面包屑 + 主题切换 + 用户头像 + 登出下拉）
// - 折叠态切换触发 collapse 事件
// - 登出调 logout API + resetState + 跳 /login
// - 零租户受限态：租户选择器禁用占位 + 应用切换器隐藏
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { defineComponent } from 'vue'
import MainLayout from './MainLayout.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import SidebarMenu from '@/components/layout/SidebarMenu.vue'
import { useUserStore } from '@/stores/user'

// logout API mock（避免真实 HTTP）
vi.mock('@/api/auth', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
}))

// 与 theme store 同款装配
const freshPinia = () => {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  createApp({ render: () => null }).use(pinia)
  setActivePinia(pinia)
  return pinia
}

const stubPage = (label: string) =>
  defineComponent({
    name: label,
    render: () => null,
  })

async function makeRouter(path = '/workbench'): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/workbench', component: stubPage('Workbench') },
      { path: '/users', component: stubPage('Users') },
      { path: '/tenants', component: stubPage('Tenants') },
      { path: '/policies', component: stubPage('Policies') },
      { path: '/login', component: stubPage('Login'), meta: { public: true } },
    ],
  })
  await router.push(path)
  await router.isReady()
  return router
}

async function mountLayout(
  opts: {
    isAdmin?: boolean
    tenantsCount?: number
    username?: string
    path?: string
  } = {},
) {
  freshPinia()
  const userStore = useUserStore()
  userStore.isAdmin = opts.isAdmin ?? false
  const tenants = Array.from({ length: opts.tenantsCount ?? 0 }, (_, i) => ({
    id: i + 1,
    name: `t${i + 1}`,
    code: '',
    domain: '',
  }))
  ;(userStore as unknown as { tenants: typeof tenants }).tenants = tenants
  if (opts.username) {
    ;(
      userStore as unknown as {
        profile: { username: string; displayName: string }
      }
    ).profile = {
      username: opts.username,
      displayName: opts.username,
    }
  }

  const router = await makeRouter(opts.path ?? '/workbench')
  const wrapper = mount(MainLayout, {
    global: {
      plugins: [router],
    },
  })
  await nextTick()
  return { wrapper, userStore, router }
}

describe('MainLayout（2.8 壳层）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.className = ''
  })

  describe('侧边栏角色裁剪渲染', () => {
    it('平台管理员：8 项全渲染（含租户/策略管理）', async () => {
      const { wrapper } = await mountLayout({ isAdmin: true, tenantsCount: 2 })
      const sidebar = wrapper.findComponent(SidebarMenu)
      const items = sidebar.findAll('.sidebar-item')
      // 8 菜单项（折叠态不展开 tooltip 包裹也算 a.sidebar-item）
      expect(items).toHaveLength(8)
      const labels = items.map((n) => n.attributes('aria-label'))
      expect(labels).toContain('租户管理')
      expect(labels).toContain('策略管理')
    })

    it('零租户受限态（普通用户）：仅工作台', async () => {
      const { wrapper } = await mountLayout({
        isAdmin: false,
        tenantsCount: 0,
      })
      const sidebar = wrapper.findComponent(SidebarMenu)
      const items = sidebar.findAll('.sidebar-item')
      expect(items).toHaveLength(1)
      expect(items[0]!.attributes('aria-label')).toBe('工作台')
      // 组标题「身份治理」「权限管理」不渲染
      expect(sidebar.text()).not.toContain('身份治理')
      expect(sidebar.text()).not.toContain('权限管理')
    })

    it('非 admin 有租户（provisional readonly_audit）：6 项，无租户/策略', async () => {
      const { wrapper } = await mountLayout({
        isAdmin: false,
        tenantsCount: 1,
      })
      const sidebar = wrapper.findComponent(SidebarMenu)
      const items = sidebar.findAll('.sidebar-item')
      expect(items).toHaveLength(6)
      const labels = items.map((n) => n.attributes('aria-label'))
      expect(labels).not.toContain('租户管理')
      expect(labels).not.toContain('策略管理')
      expect(labels).toContain('工作台')
      expect(labels).toContain('用户管理')
      expect(labels).toContain('组织管理')
      expect(labels).toContain('身份源管理')
      expect(labels).toContain('角色管理')
      expect(labels).toContain('授权管理')
    })
  })

  describe('header 元素', () => {
    it('折叠按钮 + 面包屑（首页 / 当前页）+ 主题切换 + 用户头像 + 用户名', async () => {
      const { wrapper } = await mountLayout({
        isAdmin: true,
        tenantsCount: 2,
        username: 'alice',
      })
      const header = wrapper.findComponent(AppHeader)
      expect(header.find('.header-collapse-btn').exists()).toBe(true)
      expect(header.find('.header-breadcrumb').exists()).toBe(true)
      // 面包屑含「首页」与当前页文案
      const crumbText = header.find('.header-breadcrumb').text()
      expect(crumbText).toContain('首页')
      expect(header.find('.header-icon-btn').exists()).toBe(true) // 主题切换
      expect(header.find('.header-avatar').exists()).toBe(true)
      expect(header.find('.header-username').text()).toBe('alice')
    })

    it('折叠按钮点击触发 toggle-collapse（collapsed 翻转）', async () => {
      const { wrapper } = await mountLayout({ isAdmin: true, tenantsCount: 2 })
      const header = wrapper.findComponent(AppHeader)
      const btn = header.find('.header-collapse-btn')
      await btn.trigger('click')
      // collapsed 翻转后 sidebar is-collapsed class 出现
      const sidebar = wrapper.findComponent(SidebarMenu)
      expect(sidebar.classes()).toContain('is-collapsed')
    })

    it('主题切换按钮点击调 themeStore.toggleTheme', async () => {
      const { wrapper } = await mountLayout({ isAdmin: true, tenantsCount: 2 })
      const header = wrapper.findComponent(AppHeader)
      const btn = header.findAll('.header-icon-btn')[0]
      expect(btn).toBeDefined()
      const before = document.documentElement.classList.contains('light')
      await btn!.trigger('click')
      const after = document.documentElement.classList.contains('light')
      expect(before).not.toBe(after)
    })
  })

  describe('零租户受限态 header', () => {
    it('租户选择器禁用占位 + 应用切换器隐藏', async () => {
      const { wrapper } = await mountLayout({
        isAdmin: false,
        tenantsCount: 0,
      })
      const header = wrapper.findComponent(AppHeader)
      expect(header.find('.header-tenant-slot.is-disabled').exists()).toBe(true)
      expect(header.find('.header-tenant-slot').text()).toContain('无所属租户')
      expect(header.find('.header-app-slot').exists()).toBe(false)
    })

    it('平台管理员零租户豁免：应用切换器可见（非受限态）', async () => {
      const { wrapper } = await mountLayout({ isAdmin: true, tenantsCount: 0 })
      const header = wrapper.findComponent(AppHeader)
      expect(header.find('.header-tenant-slot.is-disabled').exists()).toBe(
        false,
      )
      expect(header.find('.header-app-slot').exists()).toBe(true)
    })
  })

  describe('登出', () => {
    it('登出下拉 command=logout → 调 logout + resetState + 跳 /login', async () => {
      const { wrapper, userStore, router } = await mountLayout({
        isAdmin: true,
        tenantsCount: 2,
        username: 'bob',
      })
      const header = wrapper.findComponent(AppHeader)
      // 经 el-dropdown 的 command 事件触发 onLogout（用户点「登出」项的等价路径）
      const dropdown = header.findComponent({ name: 'ElDropdown' })
      expect(dropdown.exists()).toBe(true)
      dropdown.vm.$emit('command', 'logout')
      await flushPromises()
      await nextTick()
      const { logout } = await import('@/api/auth')
      expect(logout).toHaveBeenCalled()
      expect(userStore.profile).toBeNull()
      expect(router.currentRoute.value.path).toBe('/login')
    })
  })
})
