/**
 * 租户域 api 客户端（task 4.4，UF-6）—— 列表/详情/增删改 + 禁用前置 G-4 降级承载。
 *
 * 端点证据等级（tech-design §Interfaces + parity-checklist §3.2）：
 * - A 档（实核）：tenant/list（`{total, tenants}`，TenantVO 含 status/ctime）。
 * - C 档（路径实存、形状待核验）：tenant/create `{name, code}`、
 *   tenant/update `{id, name, code, domain, status(int 1/2)}`、
 *   tenant/delete/:id、tenant/detail/:id。
 *   （禁用经 update 承载——status int 语义 1=活跃/2=禁用，无独立 toggle 端点。）
 * - **G-4 缺口**（parity §3.2 line 324）：eiam 无任何会话计数端点，tenant 服务内无活跃会话
 *   前置校验证据 → 禁用前置降级（tech-design Data Models 注释）：前端不做自算前置校验，
 *   禁用直接提交 update(status=disable)，被 eiam 拒绝时由拒绝消息携带活跃会话数展示
 *   （tenant.disable_blocked 契约 {n}=active_session_count，与表格列同源）。
 *
 * 归一规则（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - 信封经 unwrapEnvelope<T>() 解包（api/request/eiam.ts 单一出口）；
 * - eiam 分页键 {total, tenants} → Page<Tenant>.items；
 * - TenantVO.status 原值 int（1/2）归一为字符串词表 'active'|'disable'|'unknown'
 *   （与 User.status 同款 normalizeStatus 口径，复用 StatusBadge，G-9 不引入 locked）；
 * - 其余 snake_case 键（无）一律 camelCase 归一。
 */
import { eiamAxios, unwrapEnvelope } from "@/api/request/eiam";
import type { Envelope, ListQuery, Page, Tenant } from "@/api/types";

// ---- eiam 原生形状（私有，仅本模块映射用；snake_case 不越出本模块）----

interface EiamTenantRaw {
  id?: number;
  name?: string;
  code?: string;
  domain?: string;
  /**
   * eiam 原值 int（1=活跃 / 2=禁用，parity §3.2 line 321）。
   * 未知值（null/0/其余）归一 'unknown'。
   */
  status?: number;
  ctime?: number;
}

interface EiamTenantListResult {
  total?: number;
  tenants?: unknown[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * eiam TenantVO.status 原值 int → Tenant.status 字符串词表归一。
 * - 1 → 'active'；2 → 'disable'；其余（null/undefined/0/未知）→ 'unknown'
 *   （与 User.status normalizeStatus 同款口径，复用 StatusBadge，G-9 不引入 locked）。
 */
function normalizeTenantStatus(raw: unknown): Tenant["status"] {
  if (raw === 1) return "active";
  if (raw === 2) return "disable";
  return "unknown";
}

/**
 * eiam TenantVO 原生形状 → 归一 Tenant。
 * 缺 id（核心标识）返回 null，由调用方降级过滤。
 * status 经 int→字符串归一；domain/code 缺省空串。
 */
export function mapEiamTenant(raw: unknown): Tenant | null {
  if (!isRecord(raw)) return null;
  const id = asNumber(raw.id);
  if (id === 0) return null;
  const t = raw as EiamTenantRaw;
  return {
    id,
    name: asString(t.name) ?? "",
    code: asString(t.code) ?? "",
    domain: asString(t.domain) ?? "",
    status: normalizeTenantStatus(t.status),
  };
}

/** 归一 eiam {total, tenants} → Page<Tenant>（过滤 null，total 缺省按 items 长度） */
function toTenantPage(raw: unknown): Page<Tenant> {
  if (!isRecord(raw)) return { total: 0, items: [] };
  const result = raw as EiamTenantListResult;
  const tenants = Array.isArray(result.tenants) ? result.tenants : [];
  const items = tenants
    .map(mapEiamTenant)
    .filter((t): t is Tenant => t !== null);
  return {
    total:
      typeof result.total === "number" && Number.isFinite(result.total)
        ? result.total
        : items.length,
    items,
  };
}

// ---- 租户 CRUD ----

/**
 * 租户列表（POST /api/iam/tenant/list，A 档实核）。
 * 载荷 {offset, limit, keyword}；响应归一为 Page<Tenant>（status int→字符串）。
 * **G-4**：TenantVO 不含 active_session_count 字段（无会话计数端点）→
 * 活跃会话数列无 list 数据源，列表页降级展示 '—'。
 */
export async function listTenants(q: ListQuery): Promise<Page<Tenant>> {
  const data = await unwrapEnvelope<EiamTenantListResult>(
    eiamAxios.post<Envelope<EiamTenantListResult>>("/api/iam/tenant/list", {
      offset: q.offset,
      limit: q.limit,
      keyword: q.keyword,
    }),
  );
  return toTenantPage(data);
}

/**
 * 租户详情（GET /api/iam/tenant/detail/:id，C 档路径实存、形状待核验）。
 * 响应归一为 Tenant（缺 id 返回 null）。
 */
export async function getTenantDetail(id: number): Promise<Tenant | null> {
  const data = await unwrapEnvelope<unknown>(
    eiamAxios.get<Envelope<unknown>>(`/api/iam/tenant/detail/${id}`),
  );
  return mapEiamTenant(data);
}

/** 创建租户载荷（camelCase 规范形；code 必填、max32——parity §3.2 line 320） */
export interface CreateTenantPayload {
  /** 租户名（1–64 字符，全局唯一，冲突提示契约 validation.name_exists） */
  name: string;
  /** 租户 code（eiam 必填、max32；前端校验长度，唯一性由 eiam 反馈） */
  code: string;
  /** 域名（可选） */
  domain?: string;
}

/**
 * 创建租户（POST /api/iam/tenant/create，C 档路径实存、形状待核验）。
 * 载荷 eiam `{name, code}`（parity §3.2 line 320：code 必填 max32；create 不携带 domain）。
 * domain 经 update 后置补全（编辑态）。返回新 id。
 */
export async function createTenant(
  payload: CreateTenantPayload,
): Promise<number> {
  const id = await unwrapEnvelope<number>(
    eiamAxios.post<Envelope<number>>("/api/iam/tenant/create", {
      name: payload.name,
      code: payload.code,
    }),
  );
  return id;
}

/** 更新租户载荷（UpdateTenantReq：id + name + code + domain + status int） */
export interface UpdateTenantPayload {
  id: number;
  /**
   * 全量编辑时提供；纯状态切换（disable/enable）时缺省——eiam update 载荷仅传提供字段
   * （undefined 经 JSON 序列化丢弃），禁用/启用 lever 仅靠 id + status 承载。
   */
  name?: string;
  code?: string;
  domain?: string;
  /**
   * 启用/禁用 lever（'active'→1 / 'disable'→2）。
   * 禁用经 update 承载（无独立 toggle 端点）；G-4 降级：前端不自算前置会话计数，
   * 直接提交 disable，被 eiam 拒绝时由拒绝消息携带活跃会话数展示。
   */
  status?: Tenant["status"];
}

/** 归一 Tenant.status 字符串 → eiam update 载荷 int（1=活跃 / 2=禁用） */
function statusToInt(status: NonNullable<Tenant["status"]>): number {
  if (status === "active") return 1;
  if (status === "disable") return 2;
  return 1; // unknown 兜底为活跃（不禁用，避免误禁）
}

/**
 * 更新租户（POST /api/iam/tenant/update，C 档路径实存、形状待核验）。
 * 载荷 eiam `{id, name, code, domain, status(int)}`；status int 语义 1=活跃/2=禁用。
 *
 * **G-4 禁用降级**：禁用（status='disable'）直接提交，前端不做活跃会话数前置校验
 * （无端点）。若 eiam 因活跃会话>0 拒绝，store catch 后从拒绝消息提取 active_session_count
 * 渲染 tenant.disable_blocked 契约。
 */
export async function updateTenant(
  payload: UpdateTenantPayload,
): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/tenant/update", {
      id: payload.id,
      name: payload.name,
      code: payload.code,
      domain: payload.domain,
      status:
        payload.status !== undefined ? statusToInt(payload.status) : undefined,
    }),
  );
}

/**
 * 删除租户（DELETE /api/iam/tenant/delete/:id，C 档路径实存、形状待核验）。
 * 依赖删除由 eiam 服务端拒绝。
 */
export async function deleteTenant(id: number): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.delete<Envelope<null>>(`/api/iam/tenant/delete/${id}`),
  );
}
