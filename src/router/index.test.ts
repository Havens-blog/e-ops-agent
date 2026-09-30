// @vitest-environment happy-dom
// 骨架基建冒烟（非业务）：createWebHistory 依赖 DOM location，
// 故本文件以 pragma 切换 happy-dom（tech-design §Testing 的环境口径）。
import { describe, expect, it } from 'vitest'
import { routes, router } from './index'

describe('router 懒加载基建（2.1 骨架契约）', () => {
  it('history base 由 vite base（import.meta.env.BASE_URL）派生，与 nginx 同域反代形态一致', () => {
    // vite base=/console/ → BASE_URL='/console/'；vitest 环境 BASE_URL='/'，
    // vue-router 会把根路径 base 规范化为 ''。断言的是「base 由 BASE_URL 派生」
    // 的接线契约，而非硬编码某个环境的值；/console/ 本身由 dist/index.html 产物核验。
    const expectedBase = import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL
    expect(router.options.history.base).toBe(expectedBase)
  })

  it('业务路由清单为空——懒加载基建就绪、不含业务实现（业务路由自 2.6 起登记）', () => {
    expect(routes).toEqual([])
    expect(router.getRoutes()).toHaveLength(0)
  })
})
