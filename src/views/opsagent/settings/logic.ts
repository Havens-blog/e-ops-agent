/**
 * 系统配置页纯展示逻辑（任务 5.6）。
 *
 * 无 Vue / DOM 运行时依赖，可被 node 环境单测直接导入。依据：
 * docs/features/haven-opsagent/design/api-handbook.md §8 + page-map.md「系统配置」。
 */

import type { PresetQuery, RiskLevel } from '@/api/opsagent'

/** 预置查询时间窗上限（与后端 24h 对齐） */
export const MAX_WINDOW_MS = 24 * 3600 * 1000

// ==================== 数据源标签 ====================

/** 数据源 name → 中文（cdn/waf/lb/metric/asset） */
export const DATA_SOURCE_LABEL: Record<string, string> = {
    cdn: 'CDN',
    waf: 'WAF',
    lb: '负载均衡',
    metric: '指标',
    asset: '资产',
}

/** 未知名兜底：原样返回 */
export function dataSourceLabel(name: string): string {
    return DATA_SOURCE_LABEL[name] ?? name
}

// ==================== 通知渠道标签 ====================

/** 通知渠道 channel → 中文（4 渠道） */
export const NOTIFY_CHANNEL_LABEL: Record<string, string> = {
    dingtalk: '钉钉',
    feishu: '飞书',
    wecom: '企业微信',
    email: '邮件',
}

export function notifyChannelLabel(channel: string): string {
    return NOTIFY_CHANNEL_LABEL[channel] ?? channel
}

// ==================== LLM 提供商标签 ====================

/** 3 LLM 提供商中文标签 */
export const PROVIDER_LABEL: Record<string, string> = {
    qwen: '通义千问',
    deepseek: 'DeepSeek',
    openai: 'OpenAI',
}

export function providerLabel(name: string): string {
    return PROVIDER_LABEL[name] ?? name
}

// ==================== 连接状态 ====================

/** 数据源连接状态文案（ok 布尔 → 正常/异常） */
export function connectionStatusText(ok: boolean): string {
    return ok ? '正常' : '异常'
}

// ==================== 风险档 ====================

export interface RiskLevelMeta {
    label: string
    tone: 'info' | 'warning' | 'danger'
}

/** 风险档徽标（read/low/high） */
export const RISK_LEVEL_META: Record<RiskLevel, RiskLevelMeta> = {
    read: { label: '只读', tone: 'info' },
    low: { label: '低危', tone: 'warning' },
    high: { label: '高危', tone: 'danger' },
}

// ==================== 时间展示 ====================

/** RFC3339 时间格式化（跨页共享，见 ../format） */
export { formatTime } from '../format'

// ==================== 预置查询校验 ====================

/**
 * 预置查询前端校验（服务端仍整体拒绝）：serviceName 非空、时间窗 ≤24h。
 * 返回错误文案或 null（合法）。
 */
export function validatePreset(preset: PresetQuery): string | null {
    if (!preset?.params?.serviceName?.trim()) {
        return '缺少 serviceName'
    }
    const tf = preset.params.timeframe
    if (tf?.startTime && tf?.endTime) {
        const s = Date.parse(tf.startTime)
        const e = Date.parse(tf.endTime)
        if (!Number.isNaN(s) && !Number.isNaN(e) && e - s > MAX_WINDOW_MS) {
            return '时间窗超过 24 小时'
        }
    }
    return null
}