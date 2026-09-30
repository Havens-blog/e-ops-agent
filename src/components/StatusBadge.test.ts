// @vitest-environment happy-dom
/**
 * StatusBadge 共享组件单测（task 4.1）。
 *
 * 覆盖 AC：
 * - 三态徽章渲染：启用（success tone/accent-green 底）、禁用（neutral tone/tag-bg）、
 *   锁定（warning tone/color-warning 底）；
 * - 状态归一词表：eiam 'active'/'disable'/未知串 → 启用/禁用/禁用（降级），不崩；
 * - icon-only 场景带 aria-label（无可见文字）；
 * - 不硬编码色值：class 由 tone 驱动，色值全部 CSS 变量（不在此断言色值，断 tone class）。
 *
 * StatusBadge 是纯展示组件（无 store/api 依赖），直接 mount 即可，无需 stub。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBadge from './StatusBadge.vue'

const badge = (status: string, props?: { iconOnly?: boolean; size?: 'sm' | 'md' }) =>
  mount(StatusBadge, {
    props: { status, ...(props ?? {}) },
  })

describe('StatusBadge 三态渲染', () => {
  it("eiam 'active' → 启用徽章（success tone + 文字「启用」）", () => {
    const w = badge('active')
    expect(w.find('.status-badge').exists()).toBe(true)
    expect(w.find('.status-badge--success').exists()).toBe(true)
    expect(w.text()).toBe('启用')
  })

  it("eiam 'disable' → 禁用徽章（neutral tone + 文字「禁用」）", () => {
    const w = badge('disable')
    expect(w.find('.status-badge--neutral').exists()).toBe(true)
    expect(w.find('.status-badge--warning').exists()).toBe(false)
    expect(w.text()).toBe('禁用')
  })

  it("显式 'locked' → 锁定徽章（warning tone + 文字「锁定」，G-9 占位态）", () => {
    const w = badge('locked')
    expect(w.find('.status-badge--warning').exists()).toBe(true)
    expect(w.text()).toBe('锁定')
  })
})

describe('StatusBadge 未知串归一不崩（G-9 降级禁用）', () => {
  it('未知字符串 → 禁用徽章（不抛错、降级 neutral 展示）', () => {
    const w = badge('frobnicate')
    expect(w.find('.status-badge--neutral').exists()).toBe(true)
    expect(w.find('.status-badge--success').exists()).toBe(false)
    expect(w.find('.status-badge--warning').exists()).toBe(false)
    expect(w.text()).toBe('禁用')
  })

  it("已归一 'unknown' → 禁用徽章（降级展示）", () => {
    const w = badge('unknown')
    expect(w.find('.status-badge--neutral').exists()).toBe(true)
    expect(w.text()).toBe('禁用')
  })

  it("大小写变体 'ACTIVE' 不被当作 active（防误归一）", () => {
    const w = badge('ACTIVE')
    expect(w.find('.status-badge--neutral').exists()).toBe(true)
    expect(w.text()).toBe('禁用')
  })
})

describe('StatusBadge icon-only 场景', () => {
  it('iconOnly=true：仅渲染圆点 + aria-label（无可见文字）', () => {
    const w = badge('active', { iconOnly: true })
    expect(w.find('.status-badge__dot').exists()).toBe(true)
    expect(w.attributes('aria-label')).toBe('启用')
    expect(w.attributes('role')).toBe('img')
    // 无可见文字
    expect(w.text()).toBe('')
  })

  it('iconOnly 锁定态 aria-label=锁定', () => {
    const w = badge('locked', { iconOnly: true })
    expect(w.attributes('aria-label')).toBe('锁定')
    expect(w.find('.status-badge--warning').exists()).toBe(true)
  })

  it('iconOnly 禁用态 aria-label=禁用', () => {
    const w = badge('disable', { iconOnly: true })
    expect(w.attributes('aria-label')).toBe('禁用')
  })

  it('默认（非 iconOnly）不带 aria-label / role（文字自带语义）', () => {
    const w = badge('active')
    expect(w.attributes('aria-label')).toBeUndefined()
    expect(w.attributes('role')).toBeUndefined()
  })
})

describe('StatusBadge 尺寸 class', () => {
  it('默认 size=md', () => {
    const w = badge('active')
    expect(w.find('.status-badge--md').exists()).toBe(true)
  })

  it('size=sm', () => {
    const w = badge('active', { size: 'sm' })
    expect(w.find('.status-badge--sm').exists()).toBe(true)
    expect(w.find('.status-badge--md').exists()).toBe(false)
  })
})

describe('StatusBadge 不硬编码色值', () => {
  // 色值全部经 CSS 变量（--accent-green / --color-warning / --tag-bg / --text-regular），
  // 组件只输出 tone class，不内联 style。这里断言无内联 style 色值。
  it('三态均无内联 color/background-color style（色值由 CSS 变量驱动）', () => {
    for (const s of ['active', 'disable', 'locked'] as const) {
      const w = badge(s)
      const el = w.find('.status-badge')
      const style = el.attributes('style') ?? ''
      expect(style).not.toMatch(/color/i)
      expect(style).not.toMatch(/background/i)
    }
  })
})
