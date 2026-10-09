/**
 * 运维 Agent 证据引用着色（跨页共享：对话排障 EvidenceCard / 诊断详情 EvidenceList）。
 *
 * 依据：docs/features/haven-opsagent/design/tech-design.md 4 逻辑 Agent 角色
 * （Coordinator/LogAnalyst/Monitor/Inspector）+ page-map.md「数据源引用」。
 * source_type 依正冻结契约（api-handbook Data Contracts）为 4 类
 * log|metric|asset|alert（page-map 文案的「六类」为早期描述），按 agent 角色点色。
 */

import type { CitationSourceType } from '@/api/opsagent'

export interface EvidenceSourceMeta {
    label: string
    /** agent 角色（tech-design 4 逻辑 Agent） */
    agent: string
    /** CSS 变量名，落在 .opsagent-page 的 --agent-* tokens（opsagent-theme.css） */
    colorVar: string
}

/** 证据 source_type → agent 角色元数据（点色区分 agent 角色） */
export const SOURCE_TYPE_META: Record<CitationSourceType, EvidenceSourceMeta> = {
    log: { label: '日志', agent: 'LogAnalyst', colorVar: 'var(--agent-log)' },
    metric: { label: '指标', agent: 'Monitor', colorVar: 'var(--agent-monitor)' },
    asset: { label: '资产', agent: 'Inspector', colorVar: 'var(--agent-inspector)' },
    alert: { label: '告警', agent: 'Coordinator', colorVar: 'var(--agent-coord)' },
}

/** 未知 source_type 的兜底元数据（容错，不吞数据） */
export function sourceTypeMeta(sourceType: string): EvidenceSourceMeta {
    return SOURCE_TYPE_META[sourceType as CitationSourceType] ?? {
        label: sourceType || '未知',
        agent: 'Coordinator',
        colorVar: 'var(--agent-coord)',
    }
}