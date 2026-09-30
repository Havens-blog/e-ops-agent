// 状态归一词表（4.1，tech-design 三共享组件之一 StatusBadge 的词表模块）。
// 唯一口径来源：
// - docs/features/platform-console/ui/ui-design.md §状态徽章映射（启用/禁用/锁定 三态视觉）
// - docs/features/platform-console/design/tech-design.md §Data Models User.status
//   （eiam 原值 'active' | 'disable'，ParseStatus 未知串归一 'unknown'）
// Parity G-9：eiam 锁定态无数据源，「锁定」按词表占位、缺数据降级为禁用态展示。
// Hard Rule：success/warning 语义色仅用于状态与结果反馈，不作装饰；
//            danger 保留给删除/危险操作，状态列不得硬编码色值。

/** 展示态（StatusBadge 三态词表；锁定为 G-9 占位态，eiam 暂无数据源） */
export type DisplayStatus = 'active' | 'disabled' | 'locked'

/** eiam 归一后的 status（tech-design User.status：'active' | 'disable' | 'unknown'） */
export type NormalizedStatus = 'active' | 'disable' | 'unknown'

/**
 * 语义色调式 key —— 组件按此查 CSS 变量，绝不硬编码色值。
 * - success → accent-green（启用态，success 语义色仅用于状态/结果反馈）
 * - warning → color-warning（锁定态，warning 语义色仅用于状态/结果反馈）
 * - neutral → tag-bg + text-regular（禁用态，中性；不用 danger，danger 保留给删除/危险操作）
 */
export type StatusTone = 'success' | 'warning' | 'neutral'

/** 词表条目：展示态 → 中文标签 + 语义色调式 key */
export interface StatusVocabEntry {
  label: string
  tone: StatusTone
}

/** 状态归一词表（全站统一；ui-design §状态徽章映射 三行一一对应，不得增删） */
export const STATUS_VOCAB: Record<DisplayStatus, StatusVocabEntry> = {
  active: { label: '启用', tone: 'success' },
  disabled: { label: '禁用', tone: 'neutral' },
  locked: { label: '锁定', tone: 'warning' },
}

/** 展示态全集（供遍历/断言用，与 STATUS_VOCAB 同源） */
export const DISPLAY_STATUSES = Object.keys(STATUS_VOCAB) as DisplayStatus[]

/**
 * eiam 原值 → 归一 status（ParseStatus 同款归一，tech-design User.status）。
 * - 'active' / 'disable' 原值直通；
 * - 未知串（含 null/undefined/空串/其余任意值）归一 'unknown'，不抛错、不崩。
 * 原型链键名安全：严格相等比较，不可被原型键污染。
 */
export function normalizeStatus(raw: unknown): NormalizedStatus {
  if (raw === 'active') return 'active'
  if (raw === 'disable') return 'disable'
  return 'unknown'
}

/**
 * 归一 status → 展示态（词表归一）。
 * - active → active（启用）
 * - disable → disabled（禁用）
 * - unknown → disabled（降级展示：Parity G-9 缺数据/未知串降级为禁用态，不崩）
 *
 * 锁定（locked）为 G-9 占位态，eiam 暂无锁定数据源；归一路径不产出 locked，
 * 仅由显式调用方经 `toDisplayStatusExplicit` 或直接传 'locked' 进组件时启用。
 */
export function toDisplayStatus(normalized: NormalizedStatus): DisplayStatus {
  switch (normalized) {
    case 'active':
      return 'active'
    case 'disable':
      return 'disabled'
    default:
      return 'disabled' // unknown 降级为禁用（G-9：缺数据降级禁用态展示）
  }
}

/**
 * eiam 原值 → 展示态（一步归一，列表页常用入口）。
 * 内部走 normalizeStatus → toDisplayStatus；未知串降级为禁用态。
 */
export function rawToDisplayStatus(raw: unknown): DisplayStatus {
  return toDisplayStatus(normalizeStatus(raw))
}
