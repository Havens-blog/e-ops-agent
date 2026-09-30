/**
 * userList store（task 4.2，UF-4）—— 7 个 list store 之首，确立统一契约（TECH-frontend-state-002）。
 *
 * 统一契约：state{items, total, page, pageSize(默认 20、上限 100), loading, error}
 * + fetch/create/update/remove；AbortController fetch 前中断在途（AC-3）。
 *
 * 跨标签租户一致性（tech-design §Integration Specs 6，task 3.1 接入）：
 * - 响应回读：fetch 成功后 assertResponseTenantMatch（user/list 响应无租户标识 → 跳过此层，
 *   return true 放行渲染；回读字段 Phase 0 核查：UserMemberVO 不携带 response 级租户标识）；
 * - 写前守卫：create/update/remove 提交前 enforceWriteGuard（快照 vs currentTenantId，
 *   不一致 → reload 自愈 + 返回 false 阻断本次写）—— Hard Rule：写前守卫不得绕过。
 *
 * 分页边界（E7，ui-design §边界行为约定）：
 * - page 超出总页数 → 回落最后页重查；
 * - 删除使当前页变空（末页唯一记录被删）→ 回退上一页重查（整体为空转 Empty）；
 * - 切换 keyword / roleFilter → page 重置 1。
 *
 * 持久化口径（Hard Rule）：列表态不落 localStorage——本 store 不声明 persist。
 *
 * 401 收敛：经 registerUnauthorizedReset 自助注册复位回调（router 2.6），避免守卫反向依赖。
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  assignRoles,
  createUser,
  deleteUser,
  listRolesForUser,
  listUsers,
  listUsersByRole,
  unassignRoles,
  updateUser,
  type CreateUserPayload,
  type CreateUserResult,
  type UpdateUserPayload,
} from "@/api/users";
import { ApiError, type RoleRef, type User } from "@/api/types";
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

/** 任意抛出值 → 文案（contractText(code)/message 回退，与 user/tenant store 同款口径） */
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
    : "用户操作失败";
}

export const useUserListStore = defineStore("userList", () => {
  // ---- 统一契约 state ----
  const items = ref<User[]>([]);
  const total = ref<number>(0);
  const page = ref<number>(1);
  const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // ---- 筛选 UI 态（tech-design：stores 可持有分页/筛选 UI 态）----
  /** 关键词搜索（空串 = 不过滤） */
  const keyword = ref<string>("");
  /** 角色过滤（role code；空串 = 不过滤，走 user/list；非空走 user/list/attached/role） */
  const roleFilter = ref<string>("");

  /** 在途 fetch 的 AbortController（fetch 前中断在途，AC-3） */
  let fetchAbort: AbortController | null = null;

  /** 当前页总页数（上取整；total=0 时为 1 以便空态回落） */
  function totalPages(): number {
    if (total.value <= 0) return 1;
    return Math.ceil(total.value / pageSize.value);
  }

  /**
   * 拉取用户列表（按 roleFilter 切换端点）。
   * - fetch 前中断在途请求（AbortController）；
   * - 成功 → 响应回读（无租户标识跳过）→ 写入 state；
   * - page 超界 → 回落最后页重查（E7）；
   * - 失败 → 归位 error（contractText 回退），不复位 items（保留旧渲染由调用方决定）。
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
      const result =
        roleFilter.value === ""
          ? await listUsers(q)
          : await listUsersByRole(roleFilter.value, q);
      // 被 abort 的在途请求不算错误（新一轮 fetch 已接管）
      if (abort.signal.aborted) return false;
      // 响应回读：user/list 响应无 response 级租户标识 → 跳过此层（return true 放行）
      assertResponseTenantMatch(undefined);
      items.value = result.items;
      total.value = result.total;
      // E7：page 超出总页数 → 回落最后页重查（仅当当前 page > 总页数且 total>0）
      const last = totalPages();
      if (page.value > last && total.value > 0) {
        page.value = last;
        // 回落页重查（不复位 loading，复用本次在途控制已结束 → 新一轮 fetch）
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
   * 新增用户（写前守卫 → createUser + 角色分配）。
   * 初始密码经 create 承载（G-1 降级：reset 端点缺口，初始密码由 create 发放，展示一次）。
   * @returns 创建结果（含 initialPassword 一次性展示）；失败返回 null + 归位 error
   */
  async function create(
    payload: CreateUserPayload,
    roleCodes: string[] = [],
  ): Promise<CreateUserResult | null> {
    // 写前守卫（Hard Rule：不得绕过）；不一致 → reload 自愈，返回 null
    if (!enforceWriteGuard()) return null;
    try {
      const result = await createUser(payload);
      // 角色分配（以 username + role_code 为准，A 档 batch_assign）
      if (roleCodes.length > 0) {
        await assignRoles([payload.username], roleCodes);
      }
      // 新增后回到第一页刷新（新记录在第一页或搜索排序首位）
      page.value = 1;
      await fetch();
      return result;
    } catch (err) {
      error.value = errorMessage(err);
      return null;
    }
  }

  /**
   * 更新用户（写前守卫 → updateUser + 角色 diff 分配/解绑）。
   * @param roleDelta 角色变更：{added, removed} role codes
   */
  async function update(
    payload: UpdateUserPayload,
    username: string,
    roleDelta: { added: string[]; removed: string[] } = {
      added: [],
      removed: [],
    },
  ): Promise<boolean> {
    if (!enforceWriteGuard()) return false;
    try {
      await updateUser(payload);
      // 角色 diff（A 档 batch_assign / batch_unassign，以 code 为准）
      if (roleDelta.added.length > 0) {
        await assignRoles([username], roleDelta.added);
      }
      if (roleDelta.removed.length > 0) {
        await unassignRoles([username], roleDelta.removed);
      }
      await fetch();
      return true;
    } catch (err) {
      error.value = errorMessage(err);
      return false;
    }
  }

  /**
   * 删除用户（写前守卫 → deleteUser → E7 末页回退）。
   * 依赖删除由 eiam 服务端拒绝（E11）：返回 conflict kind，调用方据 catch 渲染阻断弹窗。
   */
  async function remove(id: number): Promise<boolean> {
    if (!enforceWriteGuard()) return false;
    try {
      await deleteUser(id);
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

  /** 设置角色过滤（重置 page=1，E7） */
  function setRoleFilter(code: string): void {
    roleFilter.value = code;
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

  /**
   * 加载用户已绑角色（详情子页角色回显 enrichment）。
   * 不经写前守卫（读路径）；失败返回空数组（降级，不阻断详情渲染）。
   */
  async function loadUserRoles(userId: number): Promise<RoleRef[]> {
    try {
      return await listRolesForUser(userId);
    } catch {
      return [];
    }
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
    roleFilter.value = "";
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
    roleFilter,
    // actions
    fetch,
    create,
    update,
    remove,
    setKeyword,
    setRoleFilter,
    setPage,
    setPageSize,
    loadUserRoles,
    resetState,
  };
});
