import { describe, expect, it } from 'vitest'
import { defaultTimeWindow, formatTime, isTimeWindowValid, MAX_WINDOW_MS, SESSION_STATUS_LABEL, SESSION_TYPE_LABEL } from './logic'

describe('时间窗（任务 5.5 AC 检索 ≤24h）', () => {
    it('默认时间窗 now-24h → now，跨度为 24h', () => {
        const now = new Date('2026-10-08T12:00:00Z').getTime()
        const [start, end] = defaultTimeWindow(now)
        expect(new Date(end).getTime() - new Date(start).getTime()).toBe(MAX_WINDOW_MS)
    })

    it('合法性：≤24h 合法；>24h / end<start / 不可解析 非法', () => {
        expect(isTimeWindowValid('2026-10-08T00:00:00Z', '2026-10-08T12:00:00Z')).toBe(true)
        expect(isTimeWindowValid('2026-10-08T00:00:00Z', '2026-10-10T00:00:00Z')).toBe(false)
        expect(isTimeWindowValid('2026-10-09T00:00:00Z', '2026-10-08T00:00:00Z')).toBe(false)
        expect(isTimeWindowValid('bad', '2026-10-08T00:00:00Z')).toBe(false)
    })
})

describe('会话标签', () => {
    it('类型 chat/alert 与状态 running/done/failed 中文文案', () => {
        expect(SESSION_TYPE_LABEL).toEqual({ chat: '对话', alert: '告警' })
        expect(SESSION_STATUS_LABEL).toEqual({ running: '运行中', done: '已完成', failed: '失败' })
    })
})

describe('时间展示', () => {
    it('RFC3339 截断为 YYYY-MM-DD HH:mm；空值占位', () => {
        expect(formatTime('2026-10-08T15:04:05+08:00')).toBe('2026-10-08 15:04')
        expect(formatTime('')).toBe('—')
    })
})