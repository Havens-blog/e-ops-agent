/**
 * 认证域 api 客户端（task 2.9）—— 登录/登出/MFA/passkey。
 *
 * 端点形状按 Phase 0 parity-checklist §3.2 实核（B-1/B-2/B-4），非 tech-design B 档推定形：
 * - system/ldap login：`POST /api/iam/user/system/login | /ldap/login`，载荷 `{username, password}`
 *   （ldap 可选 `source_id`），响应归一为 LoginResult（实核 snake_case → camelCase）。
 * - passkey login：`start` → `{options, session_token}`（B-4：`session_token` 非 `ticket`）；
 *   `finish` 经 header `X-Passkey-Session: <session_token>` + body = WebAuthn assertion 原对象
 *   （ginx.W 不绑 body，protocol.ParseCredentialRequestResponse 直读 raw body）→ LoginResult。
 * - mfa verify：`POST /api/iam/user/login/mfa/verify`，载荷 `{mfa_token, code}`（B-1 实核：`mfa_token`
 *   非 `mfa_ticket`；type 字段 mfaTicket 是响应归一名，请求载荷仍用 eiam 原键）→ LoginResult。
 * - logout：`POST /api/iam/user/logout` → null。
 *
 * 全部经 unwrapEnvelope<T>() 解包（tech-design §Error Handling：所有 api 客户端函数必经，不得直连 axios）。
 * 错误归一为 ApiError 由调用方（登录页）catch，文案经 contractText(code)/message 回退（task 2.4 约定）。
 *
 * 会话凭据：LoginResult 无 `token` 字段（B-2 实核）—— 会话经 Set-Cookie 颁发（共享 Redis session），
 * 前端不落响应体字段、不落 localStorage（tech-design Security）。
 */
import { eiamAxios, unwrapEnvelope } from "@/api/request/eiam";
import type { Envelope, LoginResult } from "@/api/types";

/** passkey 登录 start 响应归一形（B-4：session_token → sessionToken） */
export interface PasskeyLoginStart {
  /** WebAuthn 断言请求选项（navigator.credentials.get 入参） */
  options: unknown;
  /** passkey 登录会话票据；finish 端经 header X-Passkey-Session 携带 */
  sessionToken: string;
}

// ---- eiam 原生形状（私有，仅本模块映射用；snake_case 不越出本模块）----

interface EiamLoginResult {
  mfa_required?: boolean;
  mfa_token?: string;
  must_select_tenant?: boolean;
  must_bind?: boolean;
  bind_token?: string;
}

interface EiamPasskeyStart {
  options?: unknown;
  session_token?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/**
 * eiam login 响应 → 归一 LoginResult（snake_case → camelCase，tech-design Hard Rule：
 * eiam 原生键不得直出视图层）。无 token/lockUntil 字段（B-2 实核）。
 */
function mapLoginResult(raw: unknown): LoginResult {
  if (!isRecord(raw)) return {};
  const eiam = raw as EiamLoginResult;
  const result: LoginResult = {};
  if (eiam.mfa_required === true) result.mfaRequired = true;
  const mfaTicket = asString(eiam.mfa_token);
  if (mfaTicket !== undefined) result.mfaTicket = mfaTicket;
  if (eiam.must_select_tenant === true) result.mustSelectTenant = true;
  if (eiam.must_bind === true) result.mustBind = true;
  const bindToken = asString(eiam.bind_token);
  if (bindToken !== undefined) result.bindToken = bindToken;
  return result;
}

/**
 * 本地密码登录（POST /api/iam/user/system/login）。
 * @returns LoginResult —— mfaRequired=true 时携 mfaTicket 调 verifyMfa；否则会话已建立（cookie 下发）。
 */
export async function systemLogin(
  username: string,
  password: string,
): Promise<LoginResult> {
  const data = await unwrapEnvelope<EiamLoginResult>(
    eiamAxios.post<Envelope<EiamLoginResult>>("/api/iam/user/system/login", {
      username,
      password,
    }),
  );
  return mapLoginResult(data);
}

/**
 * LDAP 登录（POST /api/iam/user/ldap/login）。sourceId 可选（身份源 id，UF-7 管理）。
 */
export async function ldapLogin(
  username: string,
  password: string,
  sourceId?: number,
): Promise<LoginResult> {
  const payload: Record<string, unknown> = { username, password };
  if (sourceId !== undefined) payload.source_id = sourceId;
  const data = await unwrapEnvelope<EiamLoginResult>(
    eiamAxios.post<Envelope<EiamLoginResult>>(
      "/api/iam/user/ldap/login",
      payload,
    ),
  );
  return mapLoginResult(data);
}

/**
 * passkey 登录 start（POST /api/iam/user/passkey/login/start）。
 * @returns {options, sessionToken} —— options 传 navigator.credentials.get，sessionToken 经 header 携带到 finish。
 */
export async function passkeyLoginStart(): Promise<PasskeyLoginStart> {
  const data = await unwrapEnvelope<EiamPasskeyStart>(
    eiamAxios.post<Envelope<EiamPasskeyStart>>(
      "/api/iam/user/passkey/login/start",
    ),
  );
  if (!isRecord(data)) throw new Error("passkey login/start 响应格式错误");
  const sessionToken = asString((data as EiamPasskeyStart).session_token);
  if (sessionToken === undefined)
    throw new Error("passkey login/start 缺少 session_token");
  return { options: (data as EiamPasskeyStart).options, sessionToken };
}

/** passkey finish 请求头键（eiam 常量，parity §2.1 / user.go:707 实核） */
const PASSKEY_SESSION_HEADER = "X-Passkey-Session";

/**
 * passkey 登录 finish（POST /api/iam/user/passkey/login/finish）。
 * header X-Passkey-Session 携带 start 返回的 sessionToken；body = navigator.credentials.get 产出的
 * assertion 原对象（eiam ginx.W 不绑 body，protocol.ParseCredentialRequestResponse 直读 raw body）。
 * @returns LoginResult —— 成功则会话已建立。
 */
export async function passkeyLoginFinish(
  sessionToken: string,
  assertion: unknown,
): Promise<LoginResult> {
  const data = await unwrapEnvelope<EiamLoginResult>(
    eiamAxios.post<Envelope<EiamLoginResult>>(
      "/api/iam/user/passkey/login/finish",
      assertion,
      {
        headers: { [PASSKEY_SESSION_HEADER]: sessionToken },
      },
    ),
  );
  return mapLoginResult(data);
}

/**
 * MFA 二次验证（POST /api/iam/user/login/mfa/verify）。
 * 载荷 `{mfa_token, code}`（B-1 实核：字段名 `mfa_token`，非推定 `mfa_ticket`）。
 * 连续 5 次失败 → eiam 返回 ErrMfaAttemptsExhausted（纯文案 error，无 lockUntil，G-9 降级）。
 * @param mfaTicket 登录响应返回的 mfaTicket（eiam 原值 mfa_token）
 * @param code 6 位验证码
 */
export async function verifyMfa(
  mfaTicket: string,
  code: string,
): Promise<LoginResult> {
  const data = await unwrapEnvelope<EiamLoginResult>(
    eiamAxios.post<Envelope<EiamLoginResult>>(
      "/api/iam/user/login/mfa/verify",
      {
        mfa_token: mfaTicket,
        code,
      },
    ),
  );
  return mapLoginResult(data);
}

/**
 * 登出（POST /api/iam/user/logout）—— 销毁共享 Redis session。
 * 双向单点登出：任一侧登出，另一侧下次请求 401 收敛跳 /console/login（tech-design Integration 3）。
 */
export async function logout(): Promise<void> {
  await unwrapEnvelope<null>(
    eiamAxios.post<Envelope<null>>("/api/iam/user/logout"),
  );
}
