/**
 * 身份源域 api 客户端（task 4.5，UF-7）—— 列表/详情/upsert save/test/toggle/delete。
 *
 * 端点证据等级（tech-design §Interfaces C 档 + parity-checklist §2.7 / §3.2 D-2）：
 * 全部 C 档（路径实存、形状经 eiam 源码核验固化）：
 * - `POST /api/iam/identity_source/list` —— eiam `ginx.W(h.List)`（无请求体绑定），
 *   响应 data = `[]IdentitySourceVO`（**非分页**，全量返回；store 据此归一 Page，total = items 长度）。
 * - `POST /api/iam/identity_source/save` —— **upsert 语义**（id=0 建、id>0 改），
 *   载荷 `SaveIdentitySourceReq {id, name, type, enabled, ldap{...}}`（**嵌套 ldap 对象**，D-2）。
 *   create / update 在本 api 各暴露一具名函数，均命中 /save（id=0 vs id>0 区分），承接统一契约 create/update。
 * - `POST /api/iam/identity_source/test` —— 载荷同 save（`SaveIdentitySourceReq`），
 *   成功 `ginx.Result{Msg:"连接成功"}`（data=null），失败抛 ApiError（msg 携带 err.Error()）。
 * - `POST /api/iam/identity_source/toggle/:id` —— **真实启停路径**（非 update 承载，parity §3.2 line 333）。
 * - `DELETE /api/iam/identity_source/delete/:id`、`GET /api/iam/identity_source/detail/:id`。
 *
 * 形状分歧 D-2（parity §3.2 line 337）：eiam `LDAPVO` =
 * `{url, base_dn, bind_dn, bind_password, username_attribute, mail_attribute,
 *   display_name_attribute, title_attribute, user_filter, sync_user_filter}`
 * —— **无独立 port（含于 url）、无 timeoutSec 载荷位**。
 * 处置（D-2 + identity-source.ts 类型注释）：UF-7 表单 port/timeoutSec → 前端仅入 url 组装与本地校验，
 * 不越出 ConnParams 规范形；save 载荷只发 eiam 实有的 10 个 ldap 字段（port/timeoutSec 不入载荷）。
 *
 * Bind 密码 Hard Rule（task ## Hard Rules + tech-design §Security）：
 * - eiam `toVo` 固定 `bind_password=""`（handler.go:220）—— 响应永不回显明文，编辑态留空；
 * - eiam repo `toPatch` 经 JSON_MERGE_PATCH 剔除 `""` 与 `"******"`（dao:95-98）——
 *   编辑态留空（bind_password=""）= 不修改原值（DB 保留旧密文）。
 * 故本 api：save 载荷 bind_password 直接透传表单值（空串留空 = 不修改），不做前端掩码替换。
 *
 * 归一规则（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - 信封经 unwrapEnvelope<T>() 解包（api/request/eiam.ts 单一出口）；
 * - snake_case 原生键（base_dn/bind_dn/bind_password/username_attribute/mail_attribute 等）→ camelCase；
 * - 嵌套 ldap{...} ↔ ConnParams 双向映射收敛在本模块；
 * - list 响应 `[]IdentitySourceVO` → Page<IdentitySource>.items（total = items 长度）。
 */
import { eiamAxios, unwrapEnvelope } from "@/api/request/eiam";
import type { Envelope, IdentitySource, ListQuery, Page } from "@/api/types";

// ---- eiam 原生形状（私有，仅本模块映射用；snake_case 不越出本模块）----

/** eiam LDAPVO（vo.go:20-35）—— 无 port/timeoutSec 载荷位（D-2） */
interface EiamLdapVO {
  url?: string;
  base_dn?: string;
  bind_dn?: string;
  bind_password?: string;
  username_attribute?: string;
  mail_attribute?: string;
  display_name_attribute?: string;
  title_attribute?: string;
  user_filter?: string;
  sync_user_filter?: string;
}

/** eiam IdentitySourceVO（vo.go:67-80）—— 嵌套配置按 type 返回对应子对象 */
interface EiamIdentitySourceVO {
  id?: number;
  name?: string;
  type?: string;
  enabled?: boolean;
  ctime?: string | number;
  utime?: string | number;
  ldap?: EiamLdapVO;
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

function asBool(v: unknown): boolean {
  return v === true;
}

/** 从 eiam LDAPVO.url（ldap(s)://host:port）解析端口；无端口返回 0（仅本地校验用，不入载荷） */
function parsePortFromUrl(url: string): number {
  // 匹配 :port 结尾（host:port 或 [ipv6]:port）
  const m = url.match(/:(\d+)(?:\/|$)/);
  if (!m) return 0;
  const p = Number(m[1]);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/**
 * eiam LDAPVO 原生形状 → 归一 ConnParams。
 * - port 从 url 解析（D-2：eiam 无独立 port 字段，仅本地校验用）；
 * - timeoutSec 默认 5（D-2：eiam 无载荷位，仅本地校验用）；
 * - bind_password 恒为 ""（eiam toVo 固定不回显 —— Hard Rule）。
 */
export function mapEiamLdap(raw: unknown): IdentitySource["conn"] {
  const vo = (isRecord(raw) ? raw : {}) as EiamLdapVO;
  const url = asString(vo.url) ?? "";
  const username = asString(vo.username_attribute) ?? "";
  return {
    url,
    port: parsePortFromUrl(url),
    bindDn: asString(vo.bind_dn) ?? "",
    password: "", // Hard Rule：响应永不回显明文
    baseDn: asString(vo.base_dn) ?? "",
    attrMap: {
      username,
      email: asString(vo.mail_attribute),
    },
    timeoutSec: 5, // D-2 默认值（eiam 无载荷位）
  };
}

/**
 * eiam IdentitySourceVO 原生形状 → 归一 IdentitySource。
 * 缺 id（核心标识）返回 null，由调用方降级过滤。
 * type 仅 'ldap' 入 v1 规范形（其余 type 返回 null 过滤）。
 */
export function mapEiamIdentitySource(raw: unknown): IdentitySource | null {
  if (!isRecord(raw)) return null;
  const id = asNumber(raw.id);
  if (id === 0) return null;
  const vo = raw as EiamIdentitySourceVO;
  const type = asString(vo.type);
  if (type !== "ldap") return null; // v1 仅 ldap
  return {
    id,
    name: asString(vo.name) ?? "",
    type: "ldap",
    conn: mapEiamLdap(vo.ldap),
    enabled: asBool(vo.enabled),
  };
}

/** 归一 eiam `[]IdentitySourceVO` → Page<IdentitySource>（过滤 null，total = items 长度） */
function toIdentitySourcePage(raw: unknown): Page<IdentitySource> {
  const arr = Array.isArray(raw) ? raw : [];
  const items = arr
    .map(mapEiamIdentitySource)
    .filter((s): s is IdentitySource => s !== null);
  return { total: items.length, items };
}

// ---- 身份源 CRUD ----

/**
 * 身份源列表（POST /api/iam/identity_source/list，C 档路径实存、形状核验固化）。
 * eiam `ginx.W(h.List)` 无请求体绑定 —— 全量返回 `[]IdentitySourceVO`（非分页）；
 * 本函数仍按统一契约传 ListQuery（offset/limit/keyword 被服务端忽略），归一为 Page<IdentitySource>。
 */
export async function listIdentitySources(
  q: ListQuery,
): Promise<Page<IdentitySource>> {
  const data = await unwrapEnvelope<unknown[]>(
    eiamAxios.post<Envelope<unknown[]>>("/api/iam/identity_source/list", {
      offset: q.offset,
      limit: q.limit,
      keyword: q.keyword,
    }),
  );
  return toIdentitySourcePage(data);
}

/**
 * 身份源详情（GET /api/iam/identity_source/detail/:id，C 档）。
 * 响应归一为 IdentitySource（缺 id/type 非 ldap 返回 null）。
 */
export async function getIdentitySourceDetail(
  id: number,
): Promise<IdentitySource | null> {
  const data = await unwrapEnvelope<unknown>(
    eiamAxios.get<Envelope<unknown>>(
      `/api/iam/identity_source/detail/${id}`,
    ),
  );
  return mapEiamIdentitySource(data);
}

/**
 * 归一 ConnParams → eiam SaveIdentitySourceReq.ldap 嵌套对象（D-2 真实形状）。
 * 仅发 eiam 实有的 10 个字段；port/timeoutSec 不入载荷（D-2）。
 * bind_password 透传表单值（"" = 编辑态留空不修改，eiam toPatch 经 JSON_MERGE_PATCH 剔除）。
 */
function toEiamLdapPayload(conn: IdentitySource["conn"]): Record<string, string> {
  return {
    url: conn.url,
    base_dn: conn.baseDn,
    bind_dn: conn.bindDn,
    bind_password: conn.password, // "" = 不修改（eiam toPatch 剔除）
    username_attribute: conn.attrMap.username,
    mail_attribute: conn.attrMap.email ?? "",
    display_name_attribute: "",
    title_attribute: "",
    user_filter: "",
    sync_user_filter: "",
  };
}

/** 归一 IdentitySource → eiam SaveIdentitySourceReq（嵌套 ldap，upsert 载荷） */
function toEiamSavePayload(
  source: IdentitySource,
): {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  ldap: Record<string, string>;
} {
  return {
    id: source.id,
    name: source.name,
    type: "ldap",
    enabled: source.enabled,
    ldap: toEiamLdapPayload(source.conn),
  };
}

/**
 * 创建身份源（POST /api/iam/identity_source/save，id=0，upsert 语义）。
 * 返回新 id。bind_password 必须由调用方在 create 时提供（首建需凭据）。
 */
export async function createIdentitySource(
  source: IdentitySource,
): Promise<number> {
  const payload = toEiamSavePayload({ ...source, id: 0 });
  const id = await unwrapEnvelope<number>(
    eiamAxios.post<Envelope<number>>("/api/iam/identity_source/save", payload),
  );
  return id;
}

/**
 * 更新身份源（POST /api/iam/identity_source/save，id>0，upsert 语义）。
 * bind_password="" = 不修改原值（eiam repo toPatch 经 JSON_MERGE_PATCH 剔除空串/占位符）。
 */
export async function updateIdentitySource(
  source: IdentitySource,
): Promise<void> {
  const payload = toEiamSavePayload(source);
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/identity_source/save", payload),
  );
}

/**
 * 测试身份源连接（POST /api/iam/identity_source/test，载荷同 save）。
 * 成功 → ginx.Result{Msg:"连接成功"}（data=null），本函数 resolve（返回成功文案）；
 * 失败 → 抛 ApiError（msg = "测试身份源连接失败: " + err.Error()，调用方据 message 渲染失败提示）。
 */
export async function testIdentitySource(
  source: IdentitySource,
): Promise<string> {
  const payload = toEiamSavePayload(source);
  // 成功 data=null，unwrapEnvelope 返回 null；失败抛 ApiError
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/identity_source/test", payload),
  );
  return "连接成功";
}

/**
 * 切换身份源启用状态（POST /api/iam/identity_source/toggle/:id，**真实启停路径**）。
 * eiam ToggleEnabled = `NOT enabled`（dao:139）—— 翻转当前状态，无载荷。
 */
export async function toggleIdentitySource(id: number): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>(
      `/api/iam/identity_source/toggle/${id}`,
    ),
  );
}

/**
 * 删除身份源（DELETE /api/iam/identity_source/delete/:id，C 档）。
 */
export async function deleteIdentitySource(id: number): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.delete<Envelope<null>>(
      `/api/iam/identity_source/delete/${id}`,
    ),
  );
}
