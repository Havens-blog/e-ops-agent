/**
 * 运维 Agent 跨页共享展示工具（DRY：RFC3339 时间格式化）。
 *
 * 风险中心 / 历史回溯 / 系统配置三页此前各自重复 3 行 formatTime，
 * 收敛至此统一实现，各 logic.ts 重导出保持既有 import 不变。
 */

/** RFC3339 → 「YYYY-MM-DD HH:mm」；空值回退占位 */
export function formatTime(rfc3339: string): string {
    if (!rfc3339) return '—'
    return rfc3339.slice(0, 16).replace('T', ' ')
}