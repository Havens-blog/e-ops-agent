/**
 * authorizationList store（task 5.2，UF-9）—— 7 个 list store 之一，统一契约（TECH-frontend-state-002）。
 *
 * 统一契约：state{items, total, page, pageSize(默认 20、上限 100), loading, error}
 * + fetch/create/remove；AbortController fetch 前中断在途（AC-3）。
 *
 * 跨标签租户一致性（tech-design §Integration Specs 6，task 3.1 接入）：
 * - 响应回读：fetch 成功后 assertResponseTenantMatch（authorization 响应无租户标识 → 跳过，放行渲染）；
 * - 写前守卫：create/remove 提交前 enforceWriteGuard（快照 vs currentTenantId，不一致 → reload
 *   自愈 + 返回 false/阻断本次写）—— Hard Rule：写前守卫不得绕过。
 *
 * 三元组唯一性前端预检（Hard Rule：同一（主体,资源,动作）组合唯一）：
 * create 前调 isDuplicateAuthorization(items, candidate) —— 重复返回 null + 归位 error = grant.duplicate
 * 文案，不提交；eiam 服务端兜底（G-6 映射端点服务端校验冲突，conflict kind → contractText 兜底）。
 *
 * 撤销 pending 态（AC：撤销提交 → 行进 pending 态「生效中」徽标 + 操作禁用 → 生效 ≤30s 后刷新移除）：
 * remove 提交成功后将该三元组记入 pendingMark，revokePending 集合经 aria-live="polite" 播报；
 * ≤30s 上限后无论 eiam 是否返回都刷新列表移除该行（撤销生效延迟 ≤30s，Phase 0 核查 eiam 无授权
 * 缓存则即时生效；本 store 以 30s 为兜底上限，超时仍未移除则刷新强制对账）。
 *
 * 词表（G-5 降级）：fetchVocabulary 缓存至 vocab 字段供视图下拉；subjects/resources/actions 来源版本
 * 经 vocab.source 标注，降级时为 STATIC_VOCAB_SOURCE。
 *
 * 持久化口径（Hard Rule）：列表态不落 localStorage——本 store 不声明 persist。
 *
 * 401 收敛：经 registerUnauthorizedReset 自助注册复位回调（router 2.6），避免守卫反向依赖。
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import {
  createAuthorization,
  fetchVocabulary,
  isDuplicateAuthorization,
  listAuthorizationsPage,
  revokeAuthorization,
  type AuthorizationVocabulary,
  type CreateAuthorizationPayload,
  type RevokeAuthorizationPayload,
} from "@/api/authorizations";
import { ApiError, type Authorization } from "@/api/types";
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
/** 撤销生效延迟兜底上限（AC：≤30s；超时强制刷新对账） */
const REVOKE_PENDING_TIMEOUT_MS = 30_000;

/** 撤销 pending 三元组标识（subject|resource|action；行内徽标 + aria-live 播报） */
function authKey(a: { subject: string; resource: string; action: string }): string {
  return `${a.subject}|${a.resource}|${a.action}`;
}

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
    : "授权操作失败";
}

export const useAuthorizationListStore = defineStore("authorizationList", () => {
  // ---- 统一契约 state ----
  const items = ref<Authorization[]>([]);
  const total = ref<number>(0);
  const page = ref<number>(1);
  const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
  const loading = ref<boolean>(false);
  const error = ref<string | null>(null);

  // ---- 筛选 UI 态 ----
  const keyword = ref<string>("");

  // ---- 词表（G-5 降级）----
  const vocab = ref<AuthorizationVocabulary | null>(null);
  const vocabLoading = ref<boolean>(false);
  const vocabError = ref<string | null>(null);

  // ---- 撤销 pending 态（AC：行内徽标「生效中」+ 操作禁用 + aria-live 播报）----
  /** 当前处于撤销 pending 的三元组 key 集合 */
  const revokePending = ref<Set<string>>(new Set());
  /** aria-live 播报文案（时变信息不以纯视觉传达；pending 进入/退出时更新） */
  const revokeAnnouncement = ref<string>("");

  /** 在途 fetch 的 AbortController（fetch 前中断在途，AC-3） */
  let fetchAbort: AbortController | null = null;
  /** pending 兜底超时定时器（≤30s 强制刷新对账） */
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** 当前页总页数（上取整；total=0 时为 1 以便空态回落） */
  function totalPages(): number {
    if (total.value <= 0) return 1;
    return Math.ceil(total.value / pageSize.value);
  }

  /**
   * 拉取授权列表。
   * - fetch 前中断在途请求（AbortController）；
   * - 成功 → 响应回读（无租户标识跳过）→ 写入 state；
   * - page 超界 → 回落最后页重查（E7）；
   * - 失败 → 归位 error，不复位 items。
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
      const result = await listAuthorizationsPage(q);
      if (abort.signal.aborted) return false;
      // 响应回读：authorization 响应无租户标识 → 跳过此层（return true 放行）
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
   * 拉取词表（G-5 降级）。失败归位 vocabError，不阻断列表渲染（视图降级为空下拉）。
   */
  async function fetchVocab(): Promise<boolean> {
    vocabLoading.value = true;
    vocabError.value = null;
    try {
      vocab.value = await fetchVocabulary();
      return true;
    } catch (err) {
      vocabError.value = errorMessage(err);
      return false;
    } finally {
      vocabLoading.value = false;
    }
  }

  /**
   * 新增授权（写前守卫 → 唯一性前端预检 → createAuthorization）。
   * @returns 成功 true；失败返回 false + 归位 error（重复 = grant.duplicate 文案）
   */
  async function create(
    payload: CreateAuthorizationPayload,
  ): Promise<boolean> {
    // 写前守卫（Hard Rule：不得绕过）；不一致 → reload 自愈，返回 false
    if (!enforceWriteGuard()) return false;
    // 三元组唯一性前端预检（Hard Rule；grant.duplicate）
    if (
      isDuplicateAuthorization(items.value, {
        subject: payload.subject,
        resource: payload.resource,
        action: payload.action,
      })
    ) {
      error.value = contractText("grant.duplicate") ?? "授权已存在";
      return false;
    }
    try {
      await createAuthorization(payload);
      // 新增后回到第一页刷新
      page.value = 1;
      await fetch();
      return true;
    } catch (err) {
      error.value = errorMessage(err);
      return false;
    }
  }

  /**
   * 撤销授权（写前守卫 → revokeAuthorization → pending 态 ≤30s aria-live 播报 → 刷新移除该行）。
   * - 提交后将三元组记入 revokePending（行内徽标「生效中」+ 操作禁用）；
   * - aria-live="polite" 播报「正在撤销…」；
   * - ≤30s 兜底：撤销调用与超时 Promise.race——超时则强制 fetch 对账（撤销生效延迟 ≤30s，
   *   Phase 0 核查 eiam 无授权缓存则即时生效；本 store 以 30s 为兜底上限）；
   * - 成功刷新后该行移除，aria-live 播报「已撤销」；超时播报「已超时对账」。
   */
  async function remove(
    payload: RevokeAuthorizationPayload,
  ): Promise<boolean> {
    if (!enforceWriteGuard()) return false;
    const key = authKey(payload);
    revokePending.value.add(key);
    revokePending.value = new Set(revokePending.value);
    revokeAnnouncement.value = `正在撤销授权：${payload.subject} → ${payload.resource}（${payload.action}）`;

    let timedOut = false;
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      const timer = setTimeout(() => {
        pendingTimers.delete(key);
        resolve("timeout");
      }, REVOKE_PENDING_TIMEOUT_MS);
      pendingTimers.set(key, timer);
    });

    try {
      const raceResult = await Promise.race<"timeout" | "ok">([
        revokeAuthorization(payload).then(() => "ok" as const),
        timeoutPromise,
      ]);
      if (raceResult === "timeout") {
        timedOut = true;
      }
      // 成功或超时都刷新列表对账（生效移除该行 / 超时强制对账）
      await fetch();
      const timer = pendingTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        pendingTimers.delete(key);
      }
      revokePending.value.delete(key);
      revokePending.value = new Set(revokePending.value);
      revokeAnnouncement.value = timedOut
        ? `撤销超时，已刷新对账：${payload.subject} → ${payload.resource}（${payload.action}）`
        : `已撤销授权：${payload.subject} → ${payload.resource}（${payload.action}）`;
      return !timedOut;
    } catch (err) {
      // 撤销失败：移除 pending（恢复操作）+ 归位 error
      const timer = pendingTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        pendingTimers.delete(key);
      }
      revokePending.value.delete(key);
      revokePending.value = new Set(revokePending.value);
      error.value = errorMessage(err);
      return false;
    }
  }

  /** 三元组是否处于撤销 pending（行内徽标 + 操作禁用判定） */
  function isPending(a: { subject: string; resource: string; action: string }): boolean {
    return revokePending.value.has(authKey(a));
  }

  // ---- 筛选/分页 UI 态 setters（切过滤重置 page=1，E7）----

  function setKeyword(value: string): void {
    keyword.value = value;
    page.value = 1;
  }

  function setPage(p: number): void {
    page.value = p < 1 ? 1 : p;
  }

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
    for (const timer of pendingTimers.values()) {
      clearTimeout(timer);
    }
    pendingTimers.clear();
    items.value = [];
    total.value = 0;
    page.value = 1;
    pageSize.value = DEFAULT_PAGE_SIZE;
    loading.value = false;
    error.value = null;
    keyword.value = "";
    vocab.value = null;
    vocabLoading.value = false;
    vocabError.value = null;
    revokePending.value = new Set();
    revokeAnnouncement.value = "";
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
    // 词表
    vocab,
    vocabLoading,
    vocabError,
    fetchVocab,
    // 撤销 pending
    revokePending,
    revokeAnnouncement,
    isPending,
    // actions
    fetch,
    create,
    remove,
    setKeyword,
    setPage,
    setPageSize,
    resetState,
  };
});
