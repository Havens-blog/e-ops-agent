/**
 * 历史回溯页纯展示逻辑（任务 5.5）。
 *
 * 无 Vue / DOM 运行时依赖，可被 node 环境单测直接导入。依据：
 * docs/features/haven-opsagent/design/api-handbook.md §7 +
 * page-map.md「历史回溯」Page Sections（Query Parameters 时间窗 ≤24h）。
 */

import type { SessionStatus, SessionType } from '@/api/opsagent'

/** 时间窗最大跨度（与后端 maxWin 对齐） */
export const MAX_WINDOW_MS = 24 * 3600 * 1000

// ==================== 时间窗 ====================

/** 默认时间窗 now-24h → now，返回 RFC3339 [start, end] */
export function defaultTimeWindow(now: number = Date.now()): [string, string] {
    return [new Date(now - MAX_WINDOW_MS).toISOString(), new Date(now).toISOString()]
}

/** 时间窗合法性：起止可解析、end≥start、跨度 ≤24h */
export function isTimeWindowValid(start: string, end: string): boolean {
    const s = Date.parse(start)
    const e = Date.parse(end)
    if (Number.isNaN(s) || Number.isNaN(e)) return false
    return e >= s && e - s <= MAX_WINDOW_MS
}

// ==================== 会话标签 ====================

/** 会话类型 label（chat|alert） */
export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
    chat: '对话',
    alert: '告警',
}

/** 会话状态 label（running|done|failed） */
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
    running: '运行中',
    done: '已完成',
    failed: '失败',
}

// ==================== 时间展示 ====================

/** RFC3339 时间格式化（跨页共享，见 ../format） */
export { formatTime } from '../format'