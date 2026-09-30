/**
 * policyList store（task 5.3，UF-10）—— 7 个 list store 之一，统一契约（TECH-frontend-state-002）。
 *
 * 统一契约：state{items, total, page, pageSize(默认 20、上限 100), loading, error}
 * + fetch/create/update/remove；AbortController fetch 前中断在途（AC-3）。
 *
 * 跨标签租户一致性（tech-design §Integration Specs 6，task 3.1 接入）：
 * - 响应回读：fetch 成功后 assertResponseTenantMatch（policy/list 响应无租户标识 → 跳过此层，
 *   return true 放行渲染）；
 * - 写前守卫：create/update/remove 提交前 enforceWriteGuard（快照 vs currentTenantId，
 *   不一致 → reload 自愈 + 返回 false/阻断本次写）—— Hard Rule：写前守卫不得绕过。
 *
 * 绑定角色数（AC-4 E11 数据源）：policy/list 响应直出 assignment_count（PolicyVO 字段），
 * 经 mapEiamPolicy 归一为 PolicyWithMeta.assignmentCount，无需额外请求（与 roleList
 * 计数 enrichment 需二次请求不同）。删除被拒时视图据目标 assignmentCount 格式化
 * delete.blocked_policy 契约文案（{n} = 绑定角色数）。
 *
 * 分页边界（E7）：page 超出总页数 → 回落最后页重查；删除使末页变空 → 回退上一页；
 * 切 keyword → page 重置 1。
 *
 * 持久化口径（Hard Rule）：列表态不落 localStorage——本 store 不声明 persist。
 *
 * 401 收敛：经 registerUnauthorizedReset 自助注册复位回调（router 2.6），避免守卫反向依赖。
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  createPolicy,
  deletePolicy,
  listPoliciesPage,
  updatePolicy,
  type CreatePolicyPayload,
  type PolicyWithMeta,
  type UpdatePolicyPayload,
} from "@/api/policies";
import { ApiError } from "@/api/types";
import { contractText } from "@/utils/copyContract";
import {
  assertResponseTenantMatch,
  enforceWriteGuard,
} from "@/utils/tenantGuard";
import { registerUnauthorizedReset } from "@/router";

/** 默认页大小（TECH-frontend-state-002：默认 20） */
const DEFAULT_PAGE_SIZE = 20;
/** 页大小上限（TECH-frontend-state-002：上限 100） */
const MAX_PAGE_SIZE = 100;

function clampPageSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(size), MAX_PAGE_SIZE);
}

/** 任意抛出值 → 文案（contractText(code)/message 回退，与 roleList store 同款口径） */
function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code !== null) {
      const text = contractText(String(error.code));
      if (text) return text;
    }
    return error.message;
  }
  return typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : "策略操作失败";
}

export const usePolicyListStore = defineStore("policyList", () => {
  // ---- 统一契约 state ----
  const items = ref<PolicyWithMeta[]>([]);
  const total = ref<number>(0);
  const page = ref<number>(1);
  const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // ---- 筛选 UI 态 ----
  /** 关键词搜索（空串 = 不过滤） */
  const keyword = ref<string>("");

  /** 在途 fetch 的 AbortController（fetch 前中断在途，AC-3） */
  let fetchAbort: AbortController | null = null;

  /** 当前页总页数（上取整；total=0 时为 1 以便空态回落） */
  function totalPages(): number {
    if (total.value <= 0) return 1;
    return Math.ceil(total.value / pageSize.value);
  }

  /**
   * 拉取策略列表。
   * - fetch 前中断在途请求（AbortController）；
   * - 成功 → 响应回读（无租户标识跳过）→ 写入 state；
   * - page 超界 → 回落最后页重查（E7）；
   * - 失败 → 归位 error，不复位 items。
   * assignmentCount 随列表响应直出（无需 enrichment 二次请求）。
   */
  async function fetch(): Promise<boolean> {
    if (fetchAbort) {
      fetchAbort.abort();
    }
    const abort = new AbortController();
    fetchAbort = abort;

    loading.value = true;
    error.value = null;
    try {
      const offset = (page.value - 1) * pageSize.value;
      const q = { offset, limit: pageSize.value, keyword: keyword.value };
      const result = await listPoliciesPage(q);
      // 被 abort 的在途请求不算错误（新一轮 fetch 已接管）
      if (abort.signal.aborted) return false;
      // 响应回读：policy/list 响应无 response 级租户标识 → 跳过此层（return true 放行）
      assertResponseTenantMatch(undefined);
      items.value = result.items;
      total.value = result.total;
      // E7：page 超出总页数 → 回落最后页重查
      const last = totalPages();
      if (page.value > last && total.value > 0) {
        page.value = last;
        return fetch();
      }
      return true;
    } catch (err) {
      if (abort.signal.aborted) return false;
      error.value = errorMessage(err);
      return false;
    } finally {
      if (fetchAbort === abort) {
        fetchAbort = null;
        loading.value = false;
      }
    }
  }

  /**
   * 新增策略（写前守卫 → createPolicy）。
   * @returns 新策略 id；失败返回 null + 归位 error
   */
  async function create(payload: CreatePolicyPayload): Promise<number | null> {
    // 写前守卫（Hard Rule：不得绕过）；不一致 → reload 自愈，返回 null
    if (!enforceWriteGuard()) return null;
    try {
      const id = await createPolicy(payload);
      // 新增后回到第一页刷新（新记录在第一页或搜索排序首位）
      page.value = 1;
      await fetch();
      return id;
    } catch (err) {
      error.value = errorMessage(err);
      return null;
    }
  }

  /**
   * 更新策略（写前守卫 → updatePolicy）。
   * eiam update 载荷含 code（原值只读回传）+ name + desc + statement[]。
   */
  async function update(payload: UpdatePolicyPayload): Promise<boolean> {
    if (!enforceWriteGuard()) return false;
    try {
      await updatePolicy(payload);
      await fetch();
      return true;
    } catch (err) {
      error.value = errorMessage(err);
      return false;
    }
  }

  /**
   * 删除策略（写前守卫 → deletePolicy → E7 末页回退）。
   * 依赖删除由 eiam 服务端拒绝（E11）：策略已绑定角色时被拒（conflict kind），
   * 调用方据 catch + 目标 assignmentCount 渲染 delete.blocked_policy 契约文案。
   */
  async function remove(code: string): Promise<boolean> {
    if (!enforceWriteGuard()) return false;
    try {
      await deletePolicy(code);
      // E7：删除使当前页变空（末页唯一记录被删）→ 回退上一页重查
      const last = totalPages();
      if (page.value > 1 && page.value > last) {
        page.value = Math.max(1, last);
      }
      await fetch();
      return true;
    } catch (err) {
      error.value = errorMessage(err);
      // 重新抛出供调用方据 kind 渲染 E11 阻断弹窗（conflict kind = 依赖删除被拒）
      throw err;
    }
  }

  // ---- 筛选/分页 UI 态 setters（切过滤重置 page=1，E7）----

  /** 设置关键词搜索（重置 page=1，E7） */
  function setKeyword(value: string): void {
    keyword.value = value;
    page.value = 1;
  }

  /** 设置当前页（超界由 fetch 回落，E7） */
  function setPage(p: number): void {
    page.value = p < 1 ? 1 : p;
  }

  /** 设置页大小（重置 page=1） */
  function setPageSize(size: number): void {
    pageSize.value = clampPageSize(size);
    page.value = 1;
  }

  /** 复位（401 收敛 / 离开页面由调用方触发） */
  function resetState(): void {
    if (fetchAbort) {
      fetchAbort.abort();
      fetchAbort = null;
    }
    items.value = [];
    total.value = 0;
    page.value = 1;
    pageSize.value = DEFAULT_PAGE_SIZE;
    loading.value = false;
    error.value = null;
    keyword.value = "";
  }

  // 自助注册 401 复位回调（router 2.6 单点扩展，避免守卫反向依赖本 store）
  registerUnauthorizedReset(resetState);

  return {
    // 统一契约 state
    items,
    total,
    page,
    pageSize,
    loading,
    error,
    // 筛选 UI 态
    keyword,
    // actions
    fetch,
    create,
    update,
    remove,
    setKeyword,
    setPage,
    setPageSize,
    resetState,
  };
});
