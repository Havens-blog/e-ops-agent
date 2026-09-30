// @vitest-environment happy-dom
// 主题 store 契约测试（2.2）：需真实 DOM（html 根节点 class）+ localStorage（persist 水合），
// 故以文件级 pragma 切换 happy-dom（tech-design §Testing 的环境口径）。
import { createPinia, setActivePinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createApp } from 'vue'
import { useThemeStore } from './theme'

// 与 main.ts 同款装配：persist 插件全局挂载，但仅 theme store 声明 persist。
// 注意 pinia.use() 在 app.use(pinia)（install）之前仅入 toBeInstalled 队列、
// 不进 _p —— 测试无真实宿主，须以 createApp().use(pinia) 触发 install 完成注册。
const freshPinia = () => {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  createApp({ render: () => null }).use(pinia)
  setActivePinia(pinia)
  return pinia
}

describe('theme store（2.2 契约）', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    freshPinia()
  })

  it('默认深色：无持久化选择时 theme 为 dark，html 根节点无 light class', () => {
    const store = useThemeStore()

    expect(store.theme).toBe('dark')
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('setTheme("light") 在 html 根节点挂 light class，切回 dark 移除', () => {
    const store = useThemeStore()

    store.setTheme('light')
    expect(store.theme).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)

    store.setTheme('dark')
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('toggleTheme 在 light/dark 间往返并同步 html 根节点', () => {
    const store = useThemeStore()

    store.toggleTheme()
    expect(store.theme).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)

    store.toggleTheme()
    expect(store.theme).toBe('dark')
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('持久化 key 为 hc_theme：setTheme 后以 {"theme":"light"} 落 localStorage', async () => {
    const store = useThemeStore()

    store.setTheme('light')
    // persist 订阅为异步 flush（pinia $subscribe），落盘在微任务内完成
    await nextTick()

    const raw = localStorage.getItem('hc_theme')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual({ theme: 'light' })
  })

  it('持久化恢复：新 pinia 实例（模拟刷新）从 hc_theme 恢复 light 并应用 html.light', async () => {
    useThemeStore().setTheme('light')
    await nextTick() // 等待 persist 写入

    // 模拟页面刷新：全新 pinia 容器，persist 插件重新水合（$patch 同步改 state）
    freshPinia()
    const restored = useThemeStore()

    expect(restored.theme).toBe('light')
    await nextTick() // 水合改写不经 action，经 watch（pre-flush）落 DOM
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('不跟随系统主题：store 全生命周期不触碰 matchMedia（无 prefers-color-scheme 逻辑）', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia')
    const store = useThemeStore()

    store.toggleTheme()
    store.setTheme('dark')

    expect(matchMediaSpy).not.toHaveBeenCalled()
    expect(store.theme).toBe('dark')
  })
})
