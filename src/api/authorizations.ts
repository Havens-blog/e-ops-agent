/**
 * 授权域 api 客户端（task 5.2，UF-9）—— 三元组词表 + 撤销语义映射降级实现。
 *
 * 端点证据等级（tech-design §Interfaces C 档 + parity-checklist §2.9/G-5/G-6/D-4）：
 * - C 档（路径实存、形状待核验）：POST /api/iam/permission/authorizations
 *   请求 {offset,limit,keyword,sub_type,obj_type} → {total, authorizations}；
 *   Authorization 原生形 {subject, target, sub_type, obj_type} —— **D-4 模型级分歧**：
 *   eiam 授权模型为 主体→目标（role|policy）二元绑定，非 PRD 三元组。
 * - C 档（路径实存、形状待核验）：POST /api/iam/permission/subjects/search
 *   请求 {keyword, sub_type, offset, limit} → {total, subjects}（sub_type=user/role/group）。
 * - **缺口 G-5**：无 resources/actions 词表枚举端点；manifest 返回的是权限资产清单（action 类），
 *   非 UF-9 语义的资源词表 → 降级为静态词表（来源版本登记于本模块 STATIC_VOCAB_SOURCE，
 *   改动随控制台发版；parity-checklist §3.1 G-5 处置 = UI 降级）。
 * - **缺口 G-6**：无三元组授权 create/revoke 端点 → 语义映射降级（待业务 owner 书面确认）：
 *   「新增授权=绑定」落点 = policy/batch-attach（action="attach"，资源为策略 code）
 *   与 role/batch_assign（action="assign"，资源为角色 code）；
 *   「撤销授权=解绑」落点 = policy/batch-detach 与 role/batch_unassign。
 *
 * 归一规则（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - 信封经 unwrapEnvelope<T>() 解包；
 * - D-4 二元绑定 {subject, target, sub_type, obj_type} → 规范三元组 Authorization{subject, resource, action}：
 *   resource = target（角色/策略 code），action = obj_type 派生的绑定语义（role→assign / policy→attach）；
 * - 词表 subjects 自 subjects/search 回填（带 sub_type），resources 自 role/list + policy/list 回填（eiam 返回
 *   的可绑定目标 code，非自由文本），actions 为静态 G-5 降级词表；
 * - 任一动态来源失败 → 降级为 STATIC_VOCAB 对应静态词表（G-5）。
 *
 * 安全口径（tech-design §Security + parity §6.2）：服务端授权由 eiam 强制，前端词表/预检仅为体验层
 * 非安全边界；三元组唯一性前端预检 + eiam 兜底（G-6 映射端点服务端校验，冲突经 ApiError conflict kind
 * 透传文案契约 grant.duplicate）。
 */
import { eiamAxios, unwrapEnvelope } from "@/api/request/eiam";
import type { Authorization, Envelope, ListQuery, Page } from "@/api/types";

// ---- G-5 静态词表（降级来源版本登记）----

/**
 * 静态词表来源版本（parity-checklist §3.1 G-5 处置 = UI 降级，2026-09-29 登记）。
 * 改动随控制台发版；eiam 若补齐 resources/actions 词表端点，升格为动态来源并同步移除本静态集。
 */
export const STATIC_VOCAB_SOURCE = "parity-checklist §3.1 G-5 (2026-09-29)";

/**
 * G-5 降级静态词表：resources/actions 无 eiam 词表端点时的兜底。
 * - subjects 静态集 = sub_type 取值（user/role/group），仅当 subjects/search 不可用时兜底
 *   （动态来源正常时返回实际主体 code + sub_type，非此静态集）；
 * - resources 静态集 = D-4 目标类型（role/policy），仅当 role/list + policy/list 均不可用时兜底；
 * - actions 静态集 = G-6 绑定语义（assign=主体→角色 / attach=主体→策略），恒静态（无端点）。
 */
export const STATIC_VOCAB = {
  subjects: ["user", "role", "group"] as const,
  resources: ["role", "policy"] as const,
  actions: ["assign", "attach"] as const,
} as const;

/** G-6 绑定语义 action 词表（assign/attach；恒静态，无 eiam 端点） */
export type BindAction = (typeof STATIC_VOCAB.actions)[number];

/** 主体词表条目（subjects/search 回填；携带 sub_type 供 G-6 映射构造 policy/batch-attach 载荷） */
export interface SubjectEntry {
  code: string;
  subType: "user" | "role" | "group";
  name?: string;
}

/** 授权词表（视图层下拉数据源） */
export interface AuthorizationVocabulary {
  subjects: SubjectEntry[];
  resources: string[];
  actions: string[];
  /** 词表来源版本标记（动态 = 端点路径集；静态 = STATIC_VOCAB_SOURCE） */
  source: string;
}

// ---- eiam 原生形状（私有，仅本模块映射用；snake_case 不越出本模块）----

interface EiamAuthorizationRaw {
  subject?: string;
  target?: string;
  sub_type?: string;
  obj_type?: string;
}

interface EiamAuthorizationListResult {
  total?: number;
  authorizations?: unknown[];
}

interface EiamSubjectRaw {
  code?: string;
  sub_type?: string;
  name?: string;
}

interface EiamSubjectSearchResult {
  total?: number;
  subjects?: unknown[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/**
 * obj_type → 绑定语义 action（D-4 → 规范三元组映射）。
 * role → "assign"（主体→角色绑定，落 role/batch_assign|batch_unassign）；
 * policy → "attach"（主体→策略绑定，落 policy/batch-attach|batch-detach）；
 * 未知 obj_type → 回退 "attach"（策略绑定语义，安全侧偏松：attach 经 policy 端点服务端校验）。
 */
function objTypeToAction(objType: string | undefined): string {
  if (objType === "role") return "assign";
  if (objType === "policy") return "attach";
  return "attach";
}

/**
 * eiam D-4 原生 Authorization → 规范三元组 Authorization。
 * {subject, target, sub_type, obj_type} → {subject, resource: target, action: objTypeToAction(obj_type)}。
 * 缺 subject 或 target（核心标识）返回 null，由调用方降级过滤。
 */
export function mapEiamAuthorization(raw: unknown): Authorization | null {
  if (!isRecord(raw)) return null;
  const eiam = raw as EiamAuthorizationRaw;
  const subject = asString(eiam.subject);
  const target = asString(eiam.target);
  if (!subject || !target) return null;
  return {
    subject,
    resource: target,
    action: objTypeToAction(asString(eiam.obj_type)),
  };
}

/** 归一 eiam {total, authorizations} → Page<Authorization>（过滤 null，total 缺省按 items 长度） */
function toAuthorizationPage(raw: unknown): Page<Authorization> {
  if (!isRecord(raw)) return { total: 0, items: [] };
  const result = raw as EiamAuthorizationListResult;
  const list = Array.isArray(result.authorizations) ? result.authorizations : [];
  const items = list
    .map(mapEiamAuthorization)
    .filter((a): a is Authorization => a !== null);
  return {
    total:
      typeof result.total === "number" && Number.isFinite(result.total)
        ? result.total
        : items.length,
    items,
  };
}

/** 归一 subjects/search 响应 → SubjectEntry[]（过滤缺 code；携带 sub_type） */
function toSubjectEntries(
  raw: unknown,
  fallbackSubType: "user" | "role" | "group",
): SubjectEntry[] {
  if (!isRecord(raw)) return [];
  const result = raw as EiamSubjectSearchResult;
  const list = Array.isArray(result.subjects) ? result.subjects : [];
  const entries: SubjectEntry[] = [];
  for (const s of list) {
    if (!isRecord(s)) continue;
    const code = asString(s.code);
    if (!code) continue;
    const subType =
      (asString((s as EiamSubjectRaw).sub_type) as SubjectEntry["subType"] | undefined) ??
      fallbackSubType;
    entries.push({
      code,
      subType,
      name: asString((s as EiamSubjectRaw).name),
    });
  }
  return entries;
}

/** 归一 role/list 响应 → 角色 code 列表（资源词表之一；过滤缺 code） */
function toRoleCodes(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  const result = raw as { total?: number; roles?: unknown[] };
  const list = Array.isArray(result.roles) ? result.roles : [];
  const codes: string[] = [];
  for (const r of list) {
    if (!isRecord(r)) continue;
    const code = asString(r.code);
    if (code) codes.push(code);
  }
  return codes;
}

/** 归一 policy/list 响应 → 策略 code 列表（资源词表之一；过滤缺 code） */
function toPolicyCodes(raw: unknown): string[] {
  if (!isRecord(raw)) return [];
  const result = raw as { total?: number; policies?: unknown[] };
  const list = Array.isArray(result.policies) ? result.policies : [];
  const codes: string[] = [];
  for (const p of list) {
    if (!isRecord(p)) continue;
    const code = asString(p.code);
    if (code) codes.push(code);
  }
  return codes;
}

// ---- 词表（G-5 降级）----

/**
 * 拉取授权三元组词表（subjects/resources/actions）。
 * - subjects：POST /api/iam/permission/subjects/search 逐 sub_type∈{user,role,group} 回填
 *   （携带 sub_type 供 G-6 映射）；失败 → 降级 STATIC_VOCAB.subjects（sub_type 取值占位）。
 * - resources：role/list（A 档）+ policy/list（C 档）回填可绑定目标 code（eiam 返回，非自由文本）；
 *   全失败 → 降级 STATIC_VOCAB.resources（目标类型占位）。
 * - actions：恒静态 STATIC_VOCAB.actions（G-5：无 eiam 词表端点）。
 * 任一来源失败不阻断整体（Promise.allSettled 容错）；source 标记词表来源版本。
 */
export async function fetchVocabulary(): Promise<AuthorizationVocabulary> {
  const subTypes = ["user", "role", "group"] as const;
  const subjectResults = await Promise.allSettled(
    subTypes.map((st) =>
      unwrapEnvelope<EiamSubjectSearchResult>(
        eiamAxios.post<Envelope<EiamSubjectSearchResult>>(
          "/api/iam/permission/subjects/search",
          { keyword: "", sub_type: st, offset: 0, limit: 100 },
        ),
      ),
    ),
  );
  const subjects: SubjectEntry[] = [];
  let subjectsDegraded = true;
  subTypes.forEach((st, i) => {
    const r = subjectResults[i];
    if (r && r.status === "fulfilled") {
      subjects.push(...toSubjectEntries(r.value, st));
      subjectsDegraded = false;
    }
  });
  const finalSubjects =
    subjects.length > 0 || !subjectsDegraded
      ? subjects
      : (STATIC_VOCAB.subjects.map((code) => ({
          code,
          subType: code as SubjectEntry["subType"],
        })) as SubjectEntry[]);

  const [roleRes, policyRes] = await Promise.allSettled([
    unwrapEnvelope<unknown>(
      eiamAxios.post<Envelope<unknown>>("/api/iam/role/list", {
        offset: 0,
        limit: 100,
        keyword: "",
      }),
    ),
    unwrapEnvelope<unknown>(
      eiamAxios.post<Envelope<unknown>>("/api/iam/policy/list", {
        offset: 0,
        limit: 100,
        keyword: "",
      }),
    ),
  ]);
  const resources: string[] = [];
  if (roleRes.status === "fulfilled") resources.push(...toRoleCodes(roleRes.value));
  if (policyRes.status === "fulfilled")
    resources.push(...toPolicyCodes(policyRes.value));
  const finalResources =
    resources.length > 0 ? resources : ([...STATIC_VOCAB.resources] as string[]);

  const actions = [...STATIC_VOCAB.actions];
  const dynamicCount =
    (subjectsDegraded ? 0 : 1) + (resources.length > 0 ? 1 : 0);
  const source =
    dynamicCount === 2
      ? "eiam: permission/subjects/search + role/list + policy/list"
      : dynamicCount === 0
        ? STATIC_VOCAB_SOURCE
        : `${STATIC_VOCAB_SOURCE} (部分动态)`;

  return {
    subjects: finalSubjects,
    resources: finalResources,
    actions,
    source,
  };
}

// ---- 列表（C 档 D-4）----

/**
 * 授权列表（POST /api/iam/permission/authorizations，C 档路径实存、形状待核验）。
 * 载荷 {offset, limit, keyword, sub_type, obj_type}（sub_type/obj_type 不分类型筛选，传空串 = 全量）；
 * 响应 {total, authorizations} 归一为 Page<Authorization>（D-4 二元绑定 → 三元组映射）。
 */
export async function listAuthorizationsPage(
  q: ListQuery,
): Promise<Page<Authorization>> {
  const data = await unwrapEnvelope<EiamAuthorizationListResult>(
    eiamAxios.post<Envelope<EiamAuthorizationListResult>>(
      "/api/iam/permission/authorizations",
      {
        offset: q.offset,
        limit: q.limit,
        keyword: q.keyword,
        sub_type: "",
        obj_type: "",
      },
    ),
  );
  return toAuthorizationPage(data);
}

// ---- 新增/撤销（G-6 语义映射降级）----

/** 新增授权载荷（规范三元组 + sub_type 可选；G-6 映射用 sub_type 构造 policy/batch-attach） */
export interface CreateAuthorizationPayload {
  /** 主体 code（user/role/group 的 code；action="assign" 时为 username） */
  subject: string;
  /** 主体类型（action="attach" 时构造 policy/batch-attach subjects 载荷用；缺省 "user"） */
  subType?: "user" | "role" | "group";
  /** 资源 = 目标 code（action="assign" 时为角色 code；action="attach" 时为策略 code） */
  resource: string;
  /** 绑定语义（assign=主体→角色 / attach=主体→策略；G-6 词表，恒来自静态词表） */
  action: string;
}

/**
 * 新增授权（G-6 语义映射降级）。
 * - action="assign" → POST /api/iam/role/batch_assign {usernames:[subject], role_codes:[resource]}
 *   （主体为 username，资源为角色 code；A 档实核端点）。
 * - action="attach" → POST /api/iam/policy/batch-attach
 *   {subjects:[{sub_type: subType ?? "user", code: subject}], policy_codes:[resource]}
 *   （C 档形状分歧 D-3 路径改判；主体可 user/role/group 混合）。
 * 唯一性由前端预检（authorizationList store）+ eiam 服务端兜底（conflict kind → grant.duplicate）。
 */
export async function createAuthorization(
  payload: CreateAuthorizationPayload,
): Promise<void> {
  if (payload.action === "assign") {
    await unwrapEnvelope<null>(
      eiamAxios.post<Envelope<null>>("/api/iam/role/batch_assign", {
        usernames: [payload.subject],
        role_codes: [payload.resource],
      }),
    );
    return;
  }
  if (payload.action === "attach") {
    const subType = payload.subType ?? "user";
    await unwrapEnvelope<null>(
      eiamAxios.post<Envelope<null>>("/api/iam/policy/batch-attach", {
        subjects: [{ sub_type: subType, code: payload.subject }],
        policy_codes: [payload.resource],
      }),
    );
    return;
  }
  // 未知 action 不发请求（G-6 词表仅 assign/attach；防御性兜底）
  throw new Error(`不支持的授权动作：${payload.action}`);
}

/** 撤销授权载荷（与新增同形；G-6 映射落解绑端点） */
export interface RevokeAuthorizationPayload {
  subject: string;
  subType?: "user" | "role" | "group";
  resource: string;
  action: string;
}

/**
 * 撤销授权（G-6 语义映射降级）。
 * - action="assign" → POST /api/iam/role/batch_unassign {usernames:[subject], role_codes:[resource]}。
 * - action="attach" → POST /api/iam/policy/batch-detach
 *   {assignments:[{subject:{sub_type: subType ?? "user", code: subject}, policy_code: resource}]}
 *   （显式逐条，避免笛卡尔积误删，与 roles.ts detachPoliciesFromRole 同款口径）。
 */
export async function revokeAuthorization(
  payload: RevokeAuthorizationPayload,
): Promise<void> {
  if (payload.action === "assign") {
    await unwrapEnvelope<null>(
      eiamAxios.post<Envelope<null>>("/api/iam/role/batch_unassign", {
        usernames: [payload.subject],
        role_codes: [payload.resource],
      }),
    );
    return;
  }
  if (payload.action === "attach") {
    const subType = payload.subType ?? "user";
    await unwrapEnvelope<null>(
      eiamAxios.post<Envelope<null>>("/api/iam/policy/batch-detach", {
        assignments: [
          {
            subject: { sub_type: subType, code: payload.subject },
            policy_code: payload.resource,
          },
        ],
      }),
    );
    return;
  }
  throw new Error(`不支持的授权动作：${payload.action}`);
}

// ---- 三元组唯一性前端预检（grant.duplicate 前端预检）----

/**
 * 三元组唯一性前端预检（Hard Rule：同一（主体,资源,动作）组合唯一）。
 * 在 store 层 create 前调用；已存在三元组返回 true（重复），调用方据此阻断并提示 grant.duplicate。
 * @param existing 当前列表项（store.items）
 * @param candidate 待新增三元组
 */
export function isDuplicateAuthorization(
  existing: Authorization[],
  candidate: { subject: string; resource: string; action: string },
): boolean {
  return existing.some(
    (a) =>
      a.subject === candidate.subject &&
      a.resource === candidate.resource &&
      a.action === candidate.action,
  );
}
