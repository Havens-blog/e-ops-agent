import { describe, expect, it } from 'vitest'
import type { PresetQuery } from '@/api/opsagent'
import {
    connectionStatusText,
    dataSourceLabel,
    DATA_SOURCE_LABEL,
    formatTime,
    NOTIFY_CHANNEL_LABEL,
    PROVIDER_LABEL,
    RISK_LEVEL_META,
    notifyChannelLabel,
    providerLabel,
    validatePreset,
} from './logic'

describe('数据源标签（任务 5.6 AC 数据源配置）', () => {
    it('5 数据源全覆盖 + 未知兜底', () => {
        expect(Object.keys(DATA_SOURCE_LABEL).sort()).toEqual(['asset', 'cdn', 'lb', 'metric', 'waf'])
        expect(dataSourceLabel('cdn')).toBe('CDN')
        expect(dataSourceLabel('unknown')).toBe('unknown')
    })
})

describe('通知渠道 / LLM 提供商标签', () => {
    it('4 渠道中文标签', () => {
        expect(NOTIFY_CHANNEL_LABEL).toEqual({ dingtalk: '钉钉', feishu: '飞书', wecom: '企业微信', email: '邮件' })
        expect(notifyChannelLabel('wecom')).toBe('企业微信')
    })

    it('3 提供商中文标签 + 未知兜底', () => {
        expect(PROVIDER_LABEL).toEqual({ qwen: '通义千问', deepseek: 'DeepSeek', openai: 'OpenAI' })
        expect(providerLabel('deepseek')).toBe('DeepSeek')
        expect(providerLabel('x')).toBe('x')
    })
})

describe('连接状态 / 风险档', () => {
    it('连接状态文案', () => {
        expect(connectionStatusText(true)).toBe('正常')
        expect(connectionStatusText(false)).toBe('异常')
    })

    it('风险档三态徽标（read/low/high）', () => {
        expect(RISK_LEVEL_META).toEqual({
            read: { label: '只读', tone: 'info' },
            low: { label: '低危', tone: 'warning' },
            high: { label: '高危', tone: 'danger' },
        })
    })
})

describe('时间展示', () => {
    it('RFC3339 截断；空值占位', () => {
        expect(formatTime('2026-10-08T15:04:05Z')).toBe('2026-10-08 15:04')
        expect(formatTime('')).toBe('—')
    })
})

describe('预置查询校验（任务 5.6 AC 预置查询可配置）', () => {
    function preset(serviceName: string, start: string, end: string): PresetQuery {
        return { id: '', label: 'x', params: { serviceName, timeframe: { startTime: start, endTime: end } } }
    }

    it('serviceName 非空 + 时间窗 ≤24h 合法；缺 serviceName / 超窗非法', () => {
        expect(validatePreset(preset('order-service', '2026-10-08T00:00:00Z', '2026-10-08T12:00:00Z'))).toBeNull()
        expect(validatePreset(preset('', '', ''))).toBe('缺少 serviceName')
        expect(validatePreset(preset('svc', '2026-10-08T00:00:00Z', '2026-10-10T00:00:00Z'))).toBe('时间窗超过 24 小时')
    })
})