// @vitest-environment happy-dom
// 应用装配冒烟（2.2）：main.ts 须以「persistedstate 插件 + theme store 恢复」接线，
// 并引入两份主题样式（拷贝自 e-cam-web）。动态 import 执行装配副作用，
// sass 编译失败 / persist 装配缺失会在此暴露。
import { describe, expect, it } from 'vitest'

describe('main 装配（2.2 主题接线）', () => {
  it('装配完成：默认深色（html 无 light class），无持久化选择时不写入 hc_theme', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    localStorage.clear()
    document.documentElement.className = ''

    await import('./main')

    expect(document.querySelector('#app')).not.toBeNull()
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(localStorage.getItem('hc_theme')).toBeNull()
  })
})
