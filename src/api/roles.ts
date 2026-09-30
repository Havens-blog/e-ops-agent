/**
 * 角色域 api 客户端（task 5.1，UF-8）—— 列表/详情/增删改 + 策略/用户绑定。
 *
 * 端点证据等级（tech-design §Interfaces + parity-checklist §2.8/D-3）：
 * - A 档（实核）：role/list（{total, roles}，字段 id/code/name/desc——desc 非 description）、
 *   role/batch_assign|batch_unassign（{usernames, role_codes}，以 code 为准）。
 * - C 档（路径实存、形状待核验）：role/create {name, code, desc}、role/update {id, name, code, desc}、
 *   role/delete/:id、role/detail/:code（按 code 查询，非 id）。
 * - C 档形状分歧 D-3（路径改判，非缺口）：角色↔策略绑定经 **policy 侧**承载——
 *   绑定 = POST /api/iam/policy/batch-attach {subjects:[{sub_type, code}], policy_codes}（主体可
 *   user/role/group 混合，角色为主体时 sub_type=role）；
 *   解绑 = POST /api/iam/policy/batch-detach {assignments:[{subject, policy_code}]}（显式逐条，
 *   避免笛卡尔积误删）；另有单体 policy/detach。
 *   角色已绑策略清单 = POST /api/iam/policy/list/attached/role {role_code, offset, limit, keyword, type}。
 * - 角色已绑用户清单 = POST /api/iam/user/list/attached/role {role_code, ...}（A 档路径实存，
 *   反向承接 C 档推定的 role/attached/users；已在 users.ts 实现为 listUsersByRole，本域复用）。
 *
 * 归一规则（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - 信封经 unwrapEnvelope<T>() 解包（api/request/eiam.ts 单一出口）；
 * - eiam 分页键 {total, roles} → Page<Role>.items；
 * - snake_case 原生键归一 camelCase；
 * - Role.desc 字段名对齐 A 档实盘（非 description）。
 *
 * G-6 语义映射（parity §G-6 + D-3/D-4）：角色↔策略绑定落点在 policy 侧（policy/batch-attach|
 * batch-detach），角色↔用户绑定落点在 role 侧（role/batch_assign|batch_unassign）。本域两类绑定
 * 函数均按实核路径调用，载荷对齐 A 档 batch_assign 惯例（role_codes / policy_codes）。
 */
import { eiamAxios, unwrapEnvelope } from "@/api/request/eiam";
import type { Envelope, ListQuery, Page, Role } from "@/api/types";

// ---- eiam 原生形状（私有，仅本模块映射用；snake_case 不越出本模块）----

interface EiamRoleRaw {
  id?: number;
  code?: string;
  name?: string;
  desc?: string;
}

interface EiamRoleListResult {
  total?: number;
  roles?: unknown[];
}

/** 可绑定策略引用（policy/list 返回子集；policy 以 code 为键，引用形 {code, name}） */
export interface PolicyRef {
  code: string;
  name: string;
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
 * eiam role 原生形状 → 归一 Role（snake_case → camelCase）。
 * role/list 与 role/detail 均返回 {id, code, name, desc}；policies/users 不在 list/detail 直出，
 * 由 api 层经 policy/list/attached/role 与 user/list/attached/role 回填（parity D-3）。
 * 缺 id（核心标识）返回 null，由调用方降级过滤。
 */
export function mapEiamRole(raw: unknown): Role | null {
  if (!isRecord(raw)) return null;
  const id = asNumber(raw.id);
  if (id === 0) return null;
  const eiam = raw as EiamRoleRaw;
  const code = asString(eiam.code) ?? "";
  const name = asString(eiam.name) ?? code;
  return {
    id,
    code,
    name,
    desc: asString(eiam.desc) ?? "",
    tenantId: 0, // role/list/detail 不直出 tenant_id；所属租户由当前上下文承载（list 页展示）
    policies: [],
    users: [],
  };
}

/** 归一 eiam {total, roles} → Page<Role>（过滤 null，total 缺省按 items 长度） */
function toRolePage(raw: unknown): Page<Role> {
  if (!isRecord(raw)) return { total: 0, items: [] };
  const result = raw as EiamRoleListResult;
  const roles = Array.isArray(result.roles) ? result.roles : [];
  const items = roles.map(mapEiamRole).filter((r): r is Role => r !== null);
  return {
    total:
      typeof result.total === "number" && Number.isFinite(result.total)
        ? result.total
        : items.length,
    items,
  };
}

/** 归一 policy/list/attached/role 响应 → PolicyRef[]（过滤缺 code 的项） */
function toPolicyRefs(raw: unknown): PolicyRef[] {
  if (!isRecord(raw)) return [];
  const result = raw as { total?: number; policies?: unknown[] };
  const policies = Array.isArray(result.policies) ? result.policies : [];
  const refs: PolicyRef[] = [];
  for (const p of policies) {
    if (!isRecord(p)) continue;
    const code = asString(p.code);
    if (!code) continue;
    refs.push({ code, name: asString(p.name) ?? code });
  }
  return refs;
}

// ---- 角色 CRUD ----

/**
 * 角色列表（POST /api/iam/role/list，A 档实核）。
 * 载荷 {offset, limit, keyword}；响应归一为 Page<Role>（policies/users 不直出，留空待 enrichment）。
 */
export async function listRolesPage(q: ListQuery): Promise<Page<Role>> {
  const data = await unwrapEnvelope<EiamRoleListResult>(
    eiamAxios.post<Envelope<EiamRoleListResult>>("/api/iam/role/list", {
      offset: q.offset,
      limit: q.limit,
      keyword: q.keyword,
    }),
  );
  return toRolePage(data);
}

/**
 * 角色详情（GET /api/iam/role/detail/:code，C 档路径实存、形状待核验）。
 * 按 code 查询（非 id）；响应归一为 Role（policies/users 留空待 enrichment）。
 */
export async function getRoleDetail(code: string): Promise<Role | null> {
  const data = await unwrapEnvelope<unknown>(
    eiamAxios.get<Envelope<unknown>>(`/api/iam/role/detail/${encodeURIComponent(code)}`),
  );
  return mapEiamRole(data);
}

/** 创建角色载荷（camelCase 规范形；api 层映射为 eiam snake_case 载荷） */
export interface CreateRolePayload {
  /** 角色名（1–64 字符，租户内唯一，eiam 校验） */
  name: string;
  /** 角色 code（稳定标识，batch_assign/policy 绑定以此为键；创建后不可改） */
  code: string;
  /** 描述（可选） */
  desc?: string;
}

/**
 * 创建角色（POST /api/iam/role/create，C 档路径实存、形状待核验）。
 * 载荷 eiam {name, code, desc}（parity §2.8 实核 vo.go:5-9）。
 * @returns 新角色 id
 */
export async function createRole(payload: CreateRolePayload): Promise<number> {
  const id = await unwrapEnvelope<number>(
    eiamAxios.post<Envelope<number>>("/api/iam/role/create", {
      name: payload.name,
      code: payload.code,
      desc: payload.desc,
    }),
  );
  return id;
}

/** 更新角色载荷（id + name + code + desc；code 为原值只读回传，eiam update 载荷含 code） */
export interface UpdateRolePayload {
  id: number;
  name: string;
  /** 角色 code（创建后不可改；update 载荷回传原值） */
  code: string;
  desc?: string;
}

/** 更新角色（POST /api/iam/role/update，C 档路径实存、形状待核验） */
export async function updateRole(payload: UpdateRolePayload): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/role/update", {
      id: payload.id,
      name: payload.name,
      code: payload.code,
      desc: payload.desc,
    }),
  );
}

/**
 * 删除角色（DELETE /api/iam/role/delete/:id，C 档路径实存、形状待核验）。
 * 依赖删除由 eiam 服务端拒绝（E11）：角色已绑定用户时被拒，调用方据 conflict kind 渲染阻断弹窗
 * （文案契约 delete.blocked_role：无法删除：该角色已绑定 {n} 个用户）。
 */
export async function deleteRole(id: number): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.delete<Envelope<null>>(`/api/iam/role/delete/${id}`),
  );
}

// ---- 策略绑定（D-3：经 policy 侧承载）----

/**
 * 角色已绑策略清单（POST /api/iam/policy/list/attached/role，C 档路径实存、形状待核验）。
 * 载荷 {role_code, offset, limit, keyword, type}；响应归一为 PolicyRef[]（详情页策略回显 + 列表页计数）。
 * @param roleCode 角色 code（非 id；policy 侧以 role_code 为键）
 */
export async function listPoliciesForRole(
  roleCode: string,
): Promise<PolicyRef[]> {
  const data = await unwrapEnvelope<unknown>(
    eiamAxios.post<Envelope<unknown>>("/api/iam/policy/list/attached/role", {
      role_code: roleCode,
      offset: 0,
      limit: 100,
      keyword: "",
      type: "role",
    }),
  );
  return toPolicyRefs(data);
}

/**
 * 可绑定策略清单（POST /api/iam/policy/list，C 档路径实存、形状待核验）。
 * UF-8 策略绑定多选数据源——**仅列 eiam 返回的可绑定策略，无新建/编辑/删除策略入口**
 * （Hard Rule：租户管理员策略绑定下拉仅列 eiam 可绑定策略）。
 * 载荷 {offset, limit, keyword}；响应归一为 PolicyRef[]。
 */
export async function listBindablePolicies(
  q: ListQuery,
): Promise<Page<PolicyRef>> {
  const data = await unwrapEnvelope<{ total?: number; policies?: unknown[] }>(
    eiamAxios.post<Envelope<{ total?: number; policies?: unknown[] }>>(
      "/api/iam/policy/list",
      {
        offset: q.offset,
        limit: q.limit,
        keyword: q.keyword,
      },
    ),
  );
  if (!isRecord(data)) return { total: 0, items: [] };
  const result = data as { total?: number; policies?: unknown[] };
  const items = toPolicyRefs(data);
  return {
    total:
      typeof result.total === "number" && Number.isFinite(result.total)
        ? result.total
        : items.length,
    items,
  };
}

/** 主体引用（policy/batch-attach 载荷 subjects 成员；角色为主体时 sub_type=role） */
export interface PolicySubject {
  sub_type: "user" | "role" | "group";
  code: string;
}

/**
 * 绑定策略到角色（POST /api/iam/policy/batch-attach，C 档形状分歧 D-3 路径改判）。
 * 载荷 {subjects:[{sub_type:"role", code: roleCode}], policy_codes}（主体可 user/role/group 混合；
 * 角色为主体时 sub_type=role）。G-6 语义映射：角色↔策略绑定落点在 policy 侧。
 * @param roleCode 角色 code（主体键）
 * @param policyCodes 待绑定策略 code 列表
 */
export async function attachPoliciesToRole(
  roleCode: string,
  policyCodes: string[],
): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/policy/batch-attach", {
      subjects: [{ sub_type: "role", code: roleCode }] as PolicySubject[],
      policy_codes: policyCodes,
    }),
  );
}

/**
 * 解绑策略（POST /api/iam/policy/batch-detach，C 档形状分歧 D-3 路径改判）。
 * 载荷 {assignments:[{subject, policy_code}]}（显式逐条，避免笛卡尔积误删）。
 * @param roleCode 角色 code（主体键）
 * @param policyCodes 待解绑策略 code 列表（逐条构造 assignment）
 */
export async function detachPoliciesFromRole(
  roleCode: string,
  policyCodes: string[],
): Promise<void> {
  const assignments = policyCodes.map((code) => ({
    subject: { sub_type: "role", code: roleCode } as PolicySubject,
    policy_code: code,
  }));
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/policy/batch-detach", {
      assignments,
    }),
  );
}

// ---- 用户绑定（A 档：role/batch_assign|batch_unassign，以 code 为准）----

/**
 * 分配用户到角色（POST /api/iam/role/batch_assign，A 档实核）。
 * 载荷 {usernames, role_codes}（角色分配以 code 为准）；角色↔用户绑定以角色为主体，复用 A 档端点。
 * @param roleCode 角色 code
 * @param usernames 待绑定用户名列表
 */
export async function assignUsersToRole(
  roleCode: string,
  usernames: string[],
): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/role/batch_assign", {
      usernames,
      role_codes: [roleCode],
    }),
  );
}

/**
 * 解绑用户（POST /api/iam/role/batch_unassign，A 档实核）。
 * 载荷 {usernames, role_codes}。
 * @param roleCode 角色 code
 * @param usernames 待解绑用户名列表
 */
export async function unassignUsersFromRole(
  roleCode: string,
  usernames: string[],
): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/role/batch_unassign", {
      usernames,
      role_codes: [roleCode],
    }),
  );
}

// ---- 复用导出（users.ts 已实现的 A 档角色引用映射，供本域调用方面复用）----

export type { RoleRef } from "@/api/types";
