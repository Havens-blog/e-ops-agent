// @vitest-environment happy-dom
/**
 * 状态归一词表单测（task 4.1）。
 *
 * 覆盖 AC：
 * - eiam 原值（'active'/'disable'/未知串）→ 展示态（启用/禁用/锁定）归一；
 * - 未知串归一处理不崩（降级禁用态展示）；
 * - 词表三态完整 + 标签/tone 映射钉死；
 * - Parity G-9：eiam 锁定态无数据源，归一路径不产出 locked，缺数据降级禁用。
 */
import { describe, expect, it } from 'vitest'
import {
  STATUS_VOCAB,
  DISPLAY_STATUSES,
  normalizeStatus,
  toDisplayStatus,
  rawToDisplayStatus,
  type DisplayStatus,
} from './statusMap'

describe('STATUS_VOCAB 词表完整性', () => {
  it('三态全集：active / disabled / locked（与 ui-design §状态徽章映射 三行一一对应）', () => {
    expect(DISPLAY_STATUSES).toHaveLength(3)
    expect(DISPLAY_STATUSES.sort()).toEqual(
      ['active', 'disabled', 'locked'].sort(),
    )
  })

  it('启用：label=启用, tone=success（accent-green 语义色）', () => {
    expect(STATUS_VOCAB.active).toEqual({ label: '启用', tone: 'success' })
  })

  it('禁用：label=禁用, tone=neutral（tag-bg/text-regular，不用 danger）', () => {
    expect(STATUS_VOCAB.disabled).toEqual({ label: '禁用', tone: 'neutral' })
  })

  it('锁定：label=锁定, tone=warning（color-warning 语义色）', () => {
    expect(STATUS_VOCAB.locked).toEqual({ label: '锁定', tone: 'warning' })
  })
})

describe('normalizeStatus — eiam 原值归一', () => {
  it("'active' → 'active'（原值直通）", () => {
    expect(normalizeStatus('active')).toBe('active')
  })

  it("'disable' → 'disable'（原值直通；eiam 用 disable 非 disabled）", () => {
    expect(normalizeStatus('disable')).toBe('disable')
  })

  it('未知串 → unknown（不抛错）', () => {
    expect(normalizeStatus('frobnicate')).toBe('unknown')
    expect(normalizeStatus('locked')).toBe('unknown') // eiam 无锁定数据源，locked 非归一值
    expect(normalizeStatus('ACTIVE')).toBe('unknown') // 大小写敏感
    expect(normalizeStatus('enabled')).toBe('unknown')
  })

  it('null / undefined / 空串 / 非字符串 → unknown（不崩）', () => {
    expect(normalizeStatus(null)).toBe('unknown')
    expect(normalizeStatus(undefined)).toBe('unknown')
    expect(normalizeStatus('')).toBe('unknown')
    expect(normalizeStatus(0)).toBe('unknown')
    expect(normalizeStatus({ foo: 'bar' })).toBe('unknown')
    expect(normalizeStatus([])).toBe('unknown')
  })
})

describe('toDisplayStatus — 归一 status → 展示态', () => {
  it("'active' → active（启用）", () => {
    expect(toDisplayStatus('active')).toBe('active')
  })

  it("'disable' → disabled（禁用）", () => {
    expect(toDisplayStatus('disable')).toBe('disabled')
  })

  it("'unknown' → disabled（G-9 降级：缺数据/未知串降级禁用态展示）", () => {
    expect(toDisplayStatus('unknown')).toBe('disabled')
  })

  it('归一路径不产出 locked（G-9：eiam 锁定态无数据源，占位态不归一产出）', () => {
    const all: DisplayStatus[] = (['active', 'disable', 'unknown'] as const).map(
      (n) => toDisplayStatus(n),
    )
    expect(all).not.toContain('locked')
  })
})

describe('rawToDisplayStatus — eiam 原值一步归一', () => {
  it("'active' → active（启用）", () => {
    expect(rawToDisplayStatus('active')).toBe('active')
  })

  it("'disable' → disabled（禁用）", () => {
    expect(rawToDisplayStatus('disable')).toBe('disabled')
  })

  it('未知串 → disabled（降级禁用，不崩）', () => {
    expect(rawToDisplayStatus('something-weird')).toBe('disabled')
    expect(rawToDisplayStatus(null)).toBe('disabled')
    expect(rawToDisplayStatus(undefined)).toBe('disabled')
  })
})
