/**
 * idpList store（task 4.5，UF-7）—— 7 个 list store 之一，统一契约承载身份源管理。
 *
 * 统一契约（TECH-frontend-state-002）：state{items, total, page, pageSize(默认 20、上限 100),
 * loading, error} + fetch/create/update/remove；AbortController fetch 前中断在途（AC-3）。
 *
 * 身份源特化（parity §2.7 / §3.2 D-2 + eiam handler.go/dao.go 核验固化）：
 * - eiam `identity_source/list` **非分页**（全量返回 `[]IdentitySourceVO`）→
 *   total = items.length，page/pageSize 仅守契约形（v1 身份源数量少，视图不强加分页控件）；
 * - save 为 **upsert**（id=0 建 / id>0 改，嵌套 ldap 对象，D-2）—— create/update 均命中 /save，
 *   bind_password="" 编辑态留空 = 不修改（eiam repo toPatch 经 JSON_MERGE_PATCH 剔除空串，Hard Rule 服务端兜底）；
 * - 启停走 **真实 toggle 路径** `POST /api/iam/identity_source/toggle/:id`（非 update 承载）；
 * - test 连接：保存前可测试，成功/失败提示（test 响应类型化——成功返回文案，失败抛 ApiError）。
 *
 * 跨标签租户一致性（tech-design §Integration Specs 6，task 3.1 接入）：
 * - 响应回读：identity_source/list 响应无租户标识 → 跳过此层（return true 放行）；
 * - 写前守卫：create/update/remove/toggle 提交前 enforceWriteGuard（Hard Rule：不得绕过）。
 *
 * 持久化口径（Hard Rule）：列表态不落 localStorage——本 store 不声明 persist。
 * 401 收敛：经 registerUnauthorizedReset 自助注册复位回调（router 2.6）。
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  createIdentitySource,
  deleteIdentitySource,
  listIdentitySources,
  testIdentitySource,
  toggleIdentitySource,
  updateIdentitySource,
} from "@/api/identity-sources";
import { ApiError, type IdentitySource } from "@/api/types";
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

/** 任意抛出值 → 文案（contractText(code)/message 回退，与 userList/orgList/tenantList 同款口径） */
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
    : "身份源操作失败";
}

export const useIdpListStore = defineStore("idpList", () => {
  // ---- 统一契约 state ----
  const items = ref<IdentitySource[]>([]);
  const total = ref<number>(0);
  const page = ref<number>(1);
  const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);

  /** 在途 fetch 的 AbortController（fetch 前中断在途，AC-3） */
  let fetchAbort: AbortController | null = null;

  /**
   * 拉取身份源列表。
   * - fetch 前中断在途请求（AbortController）；
   * - 成功 → 响应回读（无租户标识跳过）→ 写入 state（eiam list 非分页，total = items 长度）；
   * - 失败 → 归位 error（contractText 回退），不复位 items。
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
      const q = { offset, limit: pageSize.value, keyword: "" };
      const result = await listIdentitySources(q);
      if (abort.signal.aborted) return false;
      // 响应回读：identity_source/list 响应无租户标识 → 跳过此层（return true 放行）
      assertResponseTenantMatch(undefined);
      items.value = result.items;
      total.value = result.total;
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
   * 新增身份源（写前守卫 → createIdentitySource → 刷新）。
   * save 为 upsert（id=0 建）；唯一性冲突由 eiam 反馈，store 归位 error 供调用方渲染。
   * @returns 新 id；失败返回 null + 归位 error
   */
  async function create(source: IdentitySource): Promise<number | null> {
    if (!enforceWriteGuard()) return null;
    try {
      const id = await createIdentitySource(source);
      await fetch();
      return id;
    } catch (err) {
      error.value = errorMessage(err);
      return null;
    }
  }

  /**
   * 更新身份源（写前守卫 → updateIdentitySource → 刷新）。
   * save 为 upsert（id>0 改）；bind_password="" = 不修改原值（Hard Rule 服务端兜底）。
   */
  async function update(source: IdentitySource): Promise<boolean> {
    if (!enforceWriteGuard()) return false;
    try {
      await updateIdentitySource(source);
      await fetch();
      return true;
    } catch (err) {
      error.value = errorMessage(err);
      return false;
    }
  }

  /**
   * 测试身份源连接（保存前可测试，AC：成功/失败提示）。
   * 不走写前守卫（test 为只读探活，非写提交）。
   * @returns 成功文案 / 失败时抛 ApiError（调用方 catch 渲染失败提示）
   */
  async function test(source: IdentitySource): Promise<string> {
    try {
      return await testIdentitySource(source);
    } catch (err) {
      const msg = errorMessage(err);
      // 不归位 store.error（test 失败是非阻塞的即时反馈，由调用方就近渲染）
      throw new Error(msg);
    }
  }

  /**
   * 切换身份源启用状态（写前守卫 → toggleIdentitySource 真实路径 → 刷新）。
   * eiam ToggleEnabled = NOT enabled（翻转），无载荷。
   */
  async function toggle(id: number): Promise<boolean> {
    if (!enforceWriteGuard()) return false;
    try {
      await toggleIdentitySource(id);
      await fetch();
      return true;
    } catch (err) {
      error.value = errorMessage(err);
      return false;
    }
  }

  /**
   * 删除身份源（写前守卫 → deleteIdentitySource → 刷新）。
   */
  async function remove(id: number): Promise<boolean> {
    if (!enforceWriteGuard()) return false;
    try {
      await deleteIdentitySource(id);
      await fetch();
      return true;
    } catch (err) {
      error.value = errorMessage(err);
      throw err;
    }
  }

  // ---- 分页 UI 态 setters（守契约形；eiam list 非分页，page 变化触发全量重取）----

  /** 设置当前页 */
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
    // actions
    fetch,
    create,
    update,
    test,
    toggle,
    remove,
    setPage,
    setPageSize,
    resetState,
  };
});
