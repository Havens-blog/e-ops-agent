/**
 * 跨标签租户一致性写前守卫 + 响应回读比对（task 3.1，tech-design §Integration Specs 6）。
 *
 * 真值唯一在服务端共享 session + tenant store currentTenantId；本工具不持有第二份
 * 真值——仅比对「页面进入时刻的观测快照」（router 2.6 模块级单值，非持久化、非第二份
 * 租户真相存储）与 currentTenantId，阻断「标签 B 呈现 X 租户数据、发出 Y 租户请求」形态。
 *
 * 写前守卫（硬门）：create/update/remove 提交前比对快照与 currentTenantId，不一致 →
 * 触发整页 reload 自愈 + 返回 false 阻断本次写提交（用户 reload 后重新提交）。
 *
 * 响应回读比对：list store fetch 成功后回读响应所属租户标识与 currentTenantId 比对；
 * 响应无租户标识 → 跳过此层（返回 true 放行渲染）；不一致 → 丢弃渲染 + reload 自愈。
 *
 * 显式接受边界（tech-design §Integration Specs 6）：写前守卫仅覆盖控制台 7 个 list store；
 * e-cam-web / 过渡期 ecmdb-web 写路径无守卫（服务端按 session tenant_id 强制授权，
 * 越权不发生，但数据可能写入切换后的新租户）——登记为显式接受，见 WRITE_GUARD_SCOPE。
 *
 * reload 用 location.replace（不留历史条目，与 tenant store switchTenant 同款）。
 */
import { useTenantStore } from "@/stores/tenant";
import { getPageEnterTenantSnapshot } from "@/router";

/**
 * 触发整页 reload 自愈（location.replace 不留历史条目，与 tenant store switchTenant 同款）。
 * 守卫模块不直接 import window 以便 SSR/测试替身——typeof window 判空守卫。
 */
function selfHealReload(): void {
  if (typeof window !== "undefined" && window.location) {
    window.location.replace(window.location.href);
  }
}

/**
 * 写前守卫：提交前比对「页面进入时的租户快照」与 tenant store currentTenantId。
 *
 * - 一致 → 返回 true（放行写提交）；
 * - 不一致 → 触发 reload 自愈 + 返回 false（阻断本次写，Hard Rule 硬门不得绕过）。
 *
 * 调用方：4.x/5.x 各 list store 的 create/update/remove 在发请求前调用，
 * 返回 false 时早退不提交。快照取值来源 = router 2.6 守卫 ④ 在每次路由放行后写入的
 * 模块级单值 `pageEnterTenantSnapshot`（getPageEnterTenantSnapshot 读取）。
 */
export function enforceWriteGuard(): boolean {
  const snapshot = getPageEnterTenantSnapshot();
  const current = useTenantStore().currentTenantId;
  if (snapshot !== current) {
    // 标签 B 进入时呈现 X 租户、他标签切到 Y 后 currentTenantId 变 Y → 阻断写 + 自愈刷新
    selfHealReload();
    return false;
  }
  return true;
}

/**
 * 响应回读比对：list store fetch 成功后回读响应所属租户标识与 currentTenantId 比对。
 *
 * - responseTenantId 为 null/undefined（响应无租户标识）→ 跳过此层，返回 true 放行渲染；
 * - 与 currentTenantId 一致 → 返回 true；
 * - 不一致 → 丢弃渲染（返回 false）+ 触发 reload 自愈。
 *
 * 回读字段由各 list store 在 fetch 映射时从响应中提取（Phase 0 核查响应是否普遍携带
 * 租户标识；普遍携带且 RC#2 范围扩张批准时，可在 e-cam-web 请求层加最小回读，届时
 * 本边界收窄并同步修订 tech-design）。
 */
export function assertResponseTenantMatch(
  responseTenantId: number | null | undefined,
): boolean {
  if (responseTenantId === null || responseTenantId === undefined) return true;
  const current = useTenantStore().currentTenantId;
  if (responseTenantId !== current) {
    selfHealReload();
    return false;
  }
  return true;
}

/**
 * 写前守卫覆盖范围登记（tech-design §Integration Specs 6「显式接受边界」）。
 * 仅控制台 7 个 list store 的写路径接入 enforceWriteGuard；e-cam-web / ecmdb-web
 * 写路径无守卫，登记为显式接受。本常量供文档/守卫自检引用，不参与运行时。
 */
export const WRITE_GUARD_SCOPE = [
  "userList",
  "orgList",
  "tenantList",
  "idpList",
  "roleList",
  "authorizationList",
  "policyList",
] as const;
export type WriteGuardStore = (typeof WRITE_GUARD_SCOPE)[number];
