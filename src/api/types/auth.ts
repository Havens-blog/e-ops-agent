/**
 * 认证/会话域类型（tech-design §Interfaces B 档 + §Data Models + Phase 0 parity 回填）。
 */

/**
 * 会话 claims（来自共享 Redis JWT；tech-design Data Models）。
 * Phase 0 live 实测（parity §6.1）：JWT(HS256) payload `Data` 恒写 tenant_id（int64 字符串形，live "4"）
 * 与 username；uid 取顶层 `Uid`。前端不从 claims 自行判定权限（F-2 降级窗口：登录签发时 claims 可能仅
 * tenant_id+username）—— 权限以 profile 实时查询为准（tech-design Integration Specs #4）。
 */
export interface SessionClaims {
  /** eiam JWT 顶层 `Uid`（int64） */
  uid: number
  /** eiam JWT `Data.username`（恒写，live） */
  username: string
  /** 归一为 number；eiam 原值 `Data.tenant_id` 为 int64 字符串形（live "4"，恒写） */
  tenantId: number
}

/**
 * 登录结果 —— Phase 0 实核改判（parity §2.1 分歧 B-2，tech-design B 档「待核验假设」已结）：
 * eiam 实际响应为 `{mfa_required, mfa_token, must_select_tenant, must_bind, bind_token}`
 * （证据 eiam/internal/domain/user.go:143-155），本类型字段名为类型层归一形（camelCase）。
 * - **无 `token` 字段**：会话凭据经 Set-Cookie 颁发（共享 Redis session），前端不落响应体字段、
 *   不落 localStorage（tech-design Security：persist 仅 theme）；
 * - **无 `lockUntil` 字段**：锁定为纯文案 error（ErrUserLocked / ErrMfaAttemptsExhausted + 剩余次数文案，
 *   parity 锁定语义实核 login.go:37-52 / mfa.go:83-88）→ tech-design B 档预置降级生效：
 *   锁定提示用中性固定文案，不做前端倒计时自算（G-9/B-2 口径）。
 */
export interface LoginResult {
  /** true = 需要 MFA 二次验证；携 mfaTicket 调 POST /api/iam/user/login/mfa/verify（载荷 mfa_ticket + code） */
  mfaRequired?: boolean
  /** MFA 会话票据（eiam 原值 `mfa_token`；verify 端载荷字段名 `mfa_ticket`） */
  mfaTicket?: string
  /** 登录后须先选租户（UF-11 租户分流 0/1/≥2 的分流信号之一） */
  mustSelectTenant?: boolean
  /** 登录后须先完成绑定流程（eiam bind 链路） */
  mustBind?: boolean
  /** 绑定流程票据（eiam 原值 `bind_token`） */
  bindToken?: string
}

/**
 * passkey 注册引导会话：15 分钟有效、单次使用（tech-design Data Models）。
 * Phase 0 结论（parity §3.1 缺口 G-2 / 分歧 B-4）：
 * - eiam 现役 `passkey/register/start|finish` 为 L1 本人自服务（uid 取自 session claims），
 *   管理员对目标用户发起注册的端点不存在（G-2，转 eiam 排期补齐）；
 * - 同族 passkey/login 实核：会话标识原值为 `session_token`（非推定 `ticket`，B-4），finish 凭据走
 *   WebAuthn body 解析、会话标识走 header；
 * - v1 处置（G-2/G-3）：控制台仅展示 passkey 绑定态（GET /api/iam/user/identity/list），绑定动作引导
 *   用户走 eiam 自助注册流程；管理侧端点落定后本类型作为该流程的类型载体（ticket/expiresAt/used 语义不变）。
 */
export interface PasskeyRegistrationSession {
  /** 注册会话票据；eiam 同族实核原值 `session_token`（B-4），规范名归一为 ticket */
  ticket: string
  /** 过期时间戳（Unix 秒）；有效期 15 分钟 */
  expiresAt: number
  /** 单次使用标记；核销后不可复用 */
  used: boolean
}
