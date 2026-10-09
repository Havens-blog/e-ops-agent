/**
 * 对话排障页纯展示逻辑（任务 5.2）。
 *
 * 无 Vue / DOM 运行时依赖，可被 node 环境单测直接导入（同 cert 领域
 * format.ts 约定）。依据：docs/features/haven-opsagent/design/api-handbook.md
 * §1/§2 + page-map.md「对话排障」Page Sections（组件 + 数据源）。
 *
 * 职责：chat 响应 type 判别、降级徽标、证据卡 source_type→agent 角色着色、
 * 4 步编排进度（意图识别→查询→诊断→报告）由 trace 派生。
 */

import type {
    ChatData,
    ChatType,
    TraceStep,
} from '@/api/opsagent'

// 证据 source_type → agent 角色着色（跨页共享，见 ../evidence）。
export { SOURCE_TYPE_META, sourceTypeMeta } from '../evidence'
export type { EvidenceSourceMeta } from '../evidence'

// ==================== 响应 type 判别 ====================

/** chat 响应 type 的用户侧徽标文案 */
export function chatTypeLabel(type: ChatType): string {
    switch (type) {
        case 'preset_entries':
            return '预置查询'
        case 'guided':
            return '超能力引导'
        case 'clarify':
            return '待澄清'
        case 'degraded_notice':
            return '降级模式'
        default:
            return '诊断报告'
    }
}

/**
 * 响应是否携带诊断报告正文（type=report 或 persist-failed 后仍返回的 report）。
 * type=clarify 时 diagnosis=null 且 report 为追问话术，不算报告。
 */
export function hasDiagnosisReport(data: ChatData): boolean {
    return data.type === 'report' && data.diagnosis !== null
}

// ==================== 降级徽标 ====================

export type BadgeTone = 'info' | 'warning' | 'danger'

export interface BadgeMeta {
    text: string
    tone: BadgeTone
}

/** 降级徽标：0=正常（无徽标）；1 模板 / 2 预置入口 / 3 明示降级（api-handbook degradeLevel） */
export function degradeBadge(level: number): BadgeMeta | null {
    switch (level) {
        case 1:
            return { text: '模板降级', tone: 'warning' }
        case 2:
            return { text: '预置查询入口', tone: 'warning' }
        case 3:
            return { text: '降级模式', tone: 'danger' }
        default:
            return null
    }
}

// ==================== 4 步编排进度 ====================

export interface ThinkingStage {
    key: string
    label: string
    /** 该阶段在 trace 中对应的 action */
    action: string
    /** 命中的首个 trace 步骤（未命中 = 尚未执行） */
    step?: TraceStep
}

/** 4 步编排阶段（Description：意图识别→查询→诊断→报告） */
const STAGE_ORDER: { key: string; label: string; action: string }[] = [
    { key: 'intent', label: '意图识别', action: 'intent' },
    { key: 'query', label: '查询', action: 'query' },
    { key: 'diagnose', label: '诊断', action: 'diagnose' },
    { key: 'report', label: '报告', action: 'report' },
]

/** 由 trace 派生 4 步编排进度（每阶段取首个命中的步骤） */
export function buildThinkingStages(trace: TraceStep[]): ThinkingStage[] {
    return STAGE_ORDER.map((s) => ({ ...s, step: trace.find((t) => t.action === s.action) }))
}

// ==================== 引用回指 ====================

/**
 * 结论 citation 回指引用：Conclusion.citation 存 Citation.SourceKey 列表，
 * 须能回指 citations 内条目（服务端已校验，前端仅做安全展开防下标越界）。
 */
export function resolveCitation(sourceKey: string, citations: { sourceKey: string }[]): { sourceKey: string } | undefined {
    return citations.find((c) => c.sourceKey === sourceKey)
}