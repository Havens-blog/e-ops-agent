import type { RouteRecordRaw } from 'vue-router'

/**
 * 运维 Agent（D:/Haven/opsagent）子模块路由 —— 运维平台控制台承载。
 *
 * 归属迁移（cam-web /opsagent → 本仓 /console/opsagent，docs
 * features/haven-opsagent/records/6.1-console-relocation.md）：
 * opsagent 是 D:\Haven 运维平台的子模块，由控制台（haven-console）承载，
 * 不驻云管控制台（cam-web）。
 *
 * 守卫口径（与 router/index.ts 守卫链一致）：
 * - 不声明 meta.permissions / requiresAdmin —— opsagent 无 eiam 能力码，登录态即可进入；
 *   租户边界由后端 EiamAuth（会话校验 + RequireTenant）承接，控制台菜单与路由守卫
 *   只做体验层裁剪（menuConfig：requiresTenant 零租户受限态隐藏）。
 * - 未声明 skipTenantGuard：多租户未选租户态会被守卫 ② 拦到 /tenant-select，与各业务页一致。
 * - 全部 import() 懒加载，与路由表懒加载口径一致。
 *
 * 诊断详情经风险中心/对话进入、不进菜单；RCA 为 P2 预留不挂载。
 */
export const opsagentRoutes: RouteRecordRaw[] = [
    {
        path: '/opsagent/chat',
        name: 'OpsagentChat',
        component: () => import('@/views/opsagent/chat/index.vue'),
    },
    {
        path: '/opsagent/risk-center',
        name: 'OpsagentRiskCenter',
        component: () => import('@/views/opsagent/risk-center/index.vue'),
    },
    {
        path: '/opsagent/diagnosis/:id',
        name: 'OpsagentDiagnosis',
        component: () => import('@/views/opsagent/diagnosis/index.vue'),
    },
    {
        path: '/opsagent/history',
        name: 'OpsagentHistory',
        component: () => import('@/views/opsagent/history/index.vue'),
    },
    {
        path: '/opsagent/settings',
        name: 'OpsagentSettings',
        component: () => import('@/views/opsagent/settings/index.vue'),
    },
    {
        path: '/opsagent/agents',
        name: 'OpsagentAgents',
        component: () => import('@/views/opsagent/agents/index.vue'),
    },
]