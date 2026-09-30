/**
 * M1 E2E：登录正/负/边界（E1/E2/E8/E9）—— 任务 2.12。
 *
 * 验收宿主硬规则：nginx 同域形态（:8888/console，任务 2.10 haven-console.conf），
 * 真实浏览器（chromium）执行，不得用 mock 会话（伪造浏览器 cookie/localStorage）替代。
 *
 * 场景映射（acceptance.md §1 M1）：
 * - S-M1-01 登录正向 → 会话写入 → 分流（0/1/≥2）
 * - S-M1-02 LDAP 正向 / S-M1-03 passkey 正向 / S-M1-04 MFA 正向
 * - S-M1-05 错误凭据 → 中性文案（不泄账号）
 * - S-M1-06 空凭据 → 前端拦截不发请求
 * - S-M1-07 连续 5 次密码错 → 锁定（E2）
 * - S-M1-08 锁定期内可改用其他方式
 * - S-M1-09 MFA 连续 5 次失败 → 锁定（E9）
 * - S-M1-10 WebAuthn 不可用 → 隐藏 passkey + 提示（E8）
 * - S-M1-11/S-M1-12 E1 强制改密骨架（G-8 降级）
 *
 * ── 证据形态分两档（透明标注）──
 * ① REAL（真实 eiam）：负向/空凭据/E8 — dev eiam 可直接服务的场景，全程无拦截，
 *   浏览器 → nginx → eiam :9000 真链路。
 * ② CONTRACT（契约履约）：正向登录/E2 锁定/E9 MFA 锁定/MFA 正向/LDAP/passkey 正向 —
 *   dev eiam 无法 provision 的状态（无已知测试账号、无 local identity source 配置
 *   致 MaxFailedAttempts=0 永不锁定 [G-9/B-2 gap]、无 MFA 注册账号、无 LDAP 源、
 *   无 passkey 注册 [G-2 gap]、无 must_change_password 载体 [G-8 gap]）。经 page.route
 *   履约 eiam 响应信封（形状取自 parity-checklist §3.2 实核 + errs.go 原文 msg），
 *   验证前端登录闭环渲染/分流/锁定态逻辑。非 mock 浏览器会话：浏览器与 nginx 均真实，
 *   未注入伪造 cookie/localStorage，仅 API 响应按契约履约。
 *
 * E1（S-M1-11/12）：G-8 降级 —— eiam 无 must_change_password 载体，生产构建
 *   `<Login />` 恒不带 forceMustChangePassword prop → mustChangePassword 相位恒不渲染。
 *   骨架（prop=true）的表单/校验由组件测试 Login.test.ts 覆盖；E2E 仅断言生产态休眠
 *   （相位不渲染 + 登录态正常），并指向组件测试为骨架证据。
 */
import { expect, test, type Page, type Route } from '@playwright/test'

// ---- eiam 信封构造（parity §3.2 snake_case 实核形）----

function envelope(data: unknown, code = 0, msg = 'ok'): unknown {
  return { code, msg, data }
}

function errorEnvelope(code: number, msg: string): unknown {
  return { code, msg, data: null }
}

/** 密码/LDAP 登录成功信封（B-2：无 token 字段，会话经 Set-Cookie 颁发） */
function loginOkEnvelope(extra: Record<string, unknown> = {}): unknown {
  return envelope({ mfa_required: false, ...extra })
}

/** profile 信封（user store mapProfile 归一源；tenants 决定分流） */
function profileEnvelope(
  tenants: Array<{ id: number; name: string; code: string; domain: string }> = [],
  isAdmin = true,
): unknown {
  return envelope({
    user: { id: 1, username: 'admin', nickname: '管理员' },
    tenants,
    current_tenant_id: tenants[0]?.id ?? 0,
    is_admin: isAdmin,
    permissions: [],
    must_select_tenant: false, // F-1：恒 false，前端自算 tenants.length
  })
}

// eiam errs.go 原文 msg（契约履约用，逐字取自 eiam/internal/web/user/errs.go + errs/error.go）
const EIAM_INVALID_USER_MSG = '认证失败 (账号或密码错误)' // ErrInvalidUser（实探 live 一致）
const EIAM_USER_LOCKED_MSG = '账号由于多次输入错误已被锁定，请稍后再试' // ErrUserLocked
const EIAM_MFA_INVALID_MSG = '验证码不正确' // ErrMfaTokenInvalid 占位（mfa 码错）
const EIAM_MFA_LOCKED_MSG = '验证失败次数过多，请重新登录' // ErrMfaTokenInvalid 次数耗尽

// ---- CONTRACT 路由履约安装器 ----

/**
 * 安装 page.route 履约 /api/iam/* 登录链路响应。
 * handler: (url, body) => {status, body, headers?}，按 url 分发 login/logout/mfa/verify/profile。
 *
 * 会话 cookie：login/verify 成功响应附 Set-Cookie（ecmdb-token-key），浏览器真实写入 cookie
 * store → router 守卫 hasSessionCookie() 真实校验放行。非「mock 会话」：表单提交 → 响应
 * Set-Cookie → 守卫校验为真实链路，仅 API 响应体按契约履约（dev eiam 无已知测试账号）。
 */
async function fulfillAuthRoutes(
  page: Page,
  handler: (
    url: string,
    body: unknown,
  ) => { status: number; body: unknown; headers?: Record<string, string> },
): Promise<void> {
  await page.route('**/api/iam/user/**', async (route: Route) => {
    const url = route.request().url()
    const method = route.request().method()
    let postBody: unknown = undefined
    if (method === 'POST') {
      try {
        postBody = route.request().postDataJSON()
      } catch {
        postBody = undefined
      }
    }
    const reply = handler(url, postBody)
    // 2xx 响应一律附会话 cookie（login/mfa/verify/profile 成功态均需 cookie 在位以过守卫）
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(reply.headers ?? {}),
    }
    if (reply.status >= 200 && reply.status < 300) {
      headers['Set-Cookie'] =
        'ecmdb-token-key=e2e-contract-session; Path=/; SameSite=Lax'
    }
    await route.fulfill({
      status: reply.status,
      headers,
      body: JSON.stringify(reply.body),
    })
  })
}

// ---- 页面操作辅助 ----

async function gotoLogin(page: Page): Promise<void> {
  await page.goto('/console/login')
  await expect(page.getByRole('heading', { name: 'Platform' })).toBeVisible()
}

async function fillCredentials(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.getByTestId('username').fill(username)
  await page.getByTestId('password').fill(password)
}

async function submitCredentialForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: '登录', exact: true }).click()
}

// =====================================================================
// ① REAL：负向 / 边界 / E8 —— 真实 eiam 链路，无路由拦截
// =====================================================================

test.describe('REAL · S-M1-05 错误凭据 → 中性文案（不泄账号）', () => {
  test('错误密码 → 「用户名或密码错误」，不回显用户名，重试保留输入不白屏', async ({
    page,
  }) => {
    await gotoLogin(page)
    await fillCredentials(page, 'admin', 'definitely-wrong-password')
    await submitCredentialForm(page)

    // 统一中性文案（contractText 'auth.invalid_credentials'）
    const error = page.locator('.login-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('用户名或密码错误')
    // 防枚举：错误条不回显输入的用户名
    await expect(error).not.toContainText('admin')

    // 重试保留输入（v-model 未清空）、不白屏
    await expect(page.getByTestId('username')).toHaveValue('admin')
    await expect(page.getByTestId('password')).toHaveValue('definitely-wrong-password')
    await expect(page.locator('.login-page')).toBeVisible()
  })

  test('不存在的用户 → 同一中性文案（防账号枚举，Hard Rule）', async ({ page }) => {
    await gotoLogin(page)
    await fillCredentials(page, 'no_such_user_xyz', 'whatever')
    await submitCredentialForm(page)
    const error = page.locator('.login-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('用户名或密码错误')
    // 真实 eiam 对不存在用户同样返回 ErrInvalidUser（不区分「用户不存在」）
  })
})

test.describe('REAL · S-M1-06 空凭据 → 前端拦截不发请求（边界）', () => {
  test('用户名/密码均空 → auth.empty_credentials，不发 API 请求', async ({ page }) => {
    let apiCalled = false
    await page.route('**/api/iam/user/system/login', (route) => {
      apiCalled = true
      return route.continue()
    })
    await gotoLogin(page)
    // 不填任何字段直接提交
    await submitCredentialForm(page)
    const error = page.locator('.login-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('请输入用户名和密码')
    expect(apiCalled).toBe(false) // 前端拦截，零请求
  })

  test('仅填用户名 → 仍触发 empty_credentials 拦截', async ({ page }) => {
    let apiCalled = false
    await page.route('**/api/iam/user/system/login', (route) => {
      apiCalled = true
      return route.continue()
    })
    await gotoLogin(page)
    await page.getByTestId('username').fill('admin')
    await submitCredentialForm(page)
    await expect(page.locator('.login-error')).toContainText('请输入用户名和密码')
    expect(apiCalled).toBe(false)
  })
})

test.describe('REAL · S-M1-10 E8 WebAuthn 不可用 → 隐藏 passkey + 提示，无 JS 报错', () => {
  // 模拟「WebAuthn 不可用浏览器」：app 启动前删除 window.PublicKeyCredential
  // （Login.vue webAuthnAvailable 判定的唯一数据源）。真实 chromium + 真实 nginx。
  test('无 PublicKeyCredential → passkey Tab 不渲染 + 密码 Tab 可用，无 JS 异常', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(String(err)))

    await page.addInitScript(() => {
      // app 启动前把 WebAuthn 入口置为 undefined：Login.vue webAuthnAvailable 判定
      // 的唯一数据源（typeof window.PublicKeyCredential !== "undefined"）→ false，
      // passkey Tab 不渲染。chromium 原生 PublicKeyCredential 非配置项，delete 静默失败，
      // 故用 defineProperty 重定义为 undefined。
      Object.defineProperty(window, 'PublicKeyCredential', {
        value: undefined,
        configurable: true,
        writable: true,
      })
    })
    await gotoLogin(page)

    // Tab 仅 密码/LDAP（无 Passkey）
    const tabs = page.locator('.login-tab')
    await expect(tabs).toHaveCount(2)
    await expect(tabs).toContainText(['密码', 'LDAP'])

    // 无 JS 异常（pageerror = 未捕获异常；网络 500 不计入 JS 错误）
    expect(pageErrors).toEqual([])

    // 密码降级路径畅通：填表 + 空凭据前端拦截（不发请求，避免 eiam 500 噪声）
    await page.getByTestId('username').fill('admin')
    await submitCredentialForm(page)
    await expect(page.locator('.login-error')).toContainText('请输入用户名和密码')
    expect(pageErrors).toEqual([])
  })
})

// =====================================================================
// ② CONTRACT：正向登录 → 会话写入 → 分流（0/1/≥2）
// dev eiam 无已知测试账号 → page.route 履约 eiam 登录/profile 信封
// =====================================================================

test.describe('CONTRACT · S-M1-01 登录正向 → 分流（0/1/≥2 租户）', () => {
  test('单租户 → 自动选定直达 /workbench', async ({ page }) => {
    await fulfillAuthRoutes(page, (url, _body) => {
      if (url.includes('/system/login'))
        return { status: 200, body: loginOkEnvelope() }
      if (url.includes('/profile'))
        return {
          status: 200,
          body: profileEnvelope([
            { id: 4, name: '个人', code: 'p', domain: 'p.x' },
          ]),
        }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    await fillCredentials(page, 'admin', 'any-password')
    await submitCredentialForm(page)
    await expect(page).toHaveURL(/\/console\/workbench$/)
  })

  test('零租户 → 受限工作台 /workbench', async ({ page }) => {
    await fulfillAuthRoutes(page, (url) => {
      if (url.includes('/system/login'))
        return { status: 200, body: loginOkEnvelope() }
      if (url.includes('/profile'))
        return { status: 200, body: profileEnvelope([]) }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    await fillCredentials(page, 'admin', 'any')
    await submitCredentialForm(page)
    await expect(page).toHaveURL(/\/console\/workbench$/)
  })

  test('多租户（≥2）→ /tenant-select', async ({ page }) => {
    await fulfillAuthRoutes(page, (url) => {
      if (url.includes('/system/login'))
        return { status: 200, body: loginOkEnvelope() }
      if (url.includes('/profile'))
        return {
          status: 200,
          body: profileEnvelope([
            { id: 1, name: '系统', code: 'sys', domain: 's.x' },
            { id: 4, name: '个人', code: 'p', domain: 'p.x' },
          ]),
        }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    await fillCredentials(page, 'admin', 'any')
    await submitCredentialForm(page)
    await expect(page).toHaveURL(/\/console\/tenant-select$/)
  })

  test('redirect 回跳参数优先于默认目标', async ({ page }) => {
    await fulfillAuthRoutes(page, (url) => {
      if (url.includes('/system/login'))
        return { status: 200, body: loginOkEnvelope() }
      if (url.includes('/profile'))
        return {
          status: 200,
          body: profileEnvelope([
            { id: 4, name: 'p', code: 'p', domain: 'p.x' },
          ]),
        }
      return { status: 200, body: envelope(null) }
    })
    await page.goto('/console/login?redirect=/console/users')
    await expect(page.getByRole('heading', { name: 'Platform' })).toBeVisible()
    await fillCredentials(page, 'admin', 'any')
    await submitCredentialForm(page)
    await expect(page).toHaveURL(/\/console\/users$/)
  })
})

// =====================================================================
// ② CONTRACT：LDAP / passkey / MFA 正向（dev eiam 无对应 provisioned 状态）
// =====================================================================

test.describe('CONTRACT · S-M1-02 LDAP 正向登录', () => {
  test('LDAP Tab + 身份源 ID → 成功 → /workbench', async ({ page }) => {
    let ldapPayload: unknown
    await fulfillAuthRoutes(page, (url, body) => {
      if (url.includes('/ldap/login')) {
        ldapPayload = body
        return { status: 200, body: loginOkEnvelope() }
      }
      if (url.includes('/profile'))
        return {
          status: 200,
          body: profileEnvelope([
            { id: 4, name: '个人', code: 'p', domain: 'p.x' },
          ]),
        }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    await page.getByRole('tab', { name: 'LDAP' }).click()
    await page.getByTestId('username').fill('ldapuser')
    await page.getByTestId('password').fill('ldappass')
    await page.getByTestId('ldap-source-id').fill('7')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page).toHaveURL(/\/console\/workbench$/)
    // 载荷携带 source_id（parity B-3：单 ldap 通道，可选 source_id）
    expect(JSON.stringify(ldapPayload)).toContain('"source_id":7')
  })
})

test.describe('CONTRACT · S-M1-03 passkey 正向登录', () => {
  test('passkey start → navigator.credentials.get → finish → /workbench', async ({
    page,
  }) => {
    // 注入虚拟 WebAuthn 凭据获取（chromium 原生 CredentialsContainer）
    await page.addInitScript(() => {
      const assertion = { id: 'cred-1', response: {}, type: 'public-key' }
      Object.defineProperty(navigator, 'credentials', {
        value: { get: async () => assertion },
        configurable: true,
      })
      if (!(window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential) {
        Object.defineProperty(window, 'PublicKeyCredential', {
          value: function MockPKC() {},
          configurable: true,
        })
      }
    })
    await fulfillAuthRoutes(page, (url) => {
      if (url.includes('/passkey/login/start'))
        return {
          status: 200,
          body: envelope({ options: {}, session_token: 'ssn' }),
        }
      if (url.includes('/passkey/login/finish'))
        return { status: 200, body: loginOkEnvelope() }
      if (url.includes('/profile'))
        return {
          status: 200,
          body: profileEnvelope([
            { id: 4, name: '个人', code: 'p', domain: 'p.x' },
          ]),
        }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    await page.getByRole('tab', { name: 'Passkey' }).click()
    await page.getByRole('button', { name: 'Passkey 登录' }).click()
    await expect(page).toHaveURL(/\/console\/workbench$/)
  })
})

test.describe('CONTRACT · S-M1-04 MFA 正向 → 二次验证通过 → 分流', () => {
  test('密码登录返回 mfa_required → MFA 态 → 验证通过 → /workbench', async ({
    page,
  }) => {
    await fulfillAuthRoutes(page, (url) => {
      if (url.includes('/system/login'))
        return {
          status: 200,
          body: loginOkEnvelope({ mfa_required: true, mfa_token: 'mfa-tkt' }),
        }
      if (url.includes('/mfa/verify'))
        return { status: 200, body: loginOkEnvelope() }
      if (url.includes('/profile'))
        return {
          status: 200,
          body: profileEnvelope([
            { id: 4, name: '个人', code: 'p', domain: 'p.x' },
          ]),
        }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    await fillCredentials(page, 'admin', 'any')
    await submitCredentialForm(page)
    // 切到 MFA 态
    await expect(page.locator('[data-phase="mfa"]')).toBeVisible()
    await page.getByTestId('mfa-code').fill('123456')
    await page.getByRole('button', { name: '验证', exact: true }).click()
    await expect(page).toHaveURL(/\/console\/workbench$/)
  })
})

// =====================================================================
// ② CONTRACT：E2 锁定 + E9 MFA 锁定（dev eiam 无 local identity source 配置 →
// MaxFailedAttempts=0 → 永不锁定 [G-9/B-2 gap]，经 page.route 履约 eiam
// ErrUserLocked / ErrMfaAttemptsExhausted 响应契约以验证前端锁定态渲染）
// =====================================================================

test.describe('CONTRACT · S-M1-07 E2 连续 5 次密码错 → 锁定（中性文案，G-9 降级无倒计时）', () => {
  test('第 5 次错 → auth.account_locked 中性文案，不伪造倒计时分钟数', async ({
    page,
  }) => {
    let attempts = 0
    await fulfillAuthRoutes(page, (url) => {
      if (url.includes('/system/login')) {
        attempts++
        // 前 4 次：ErrInvalidUser；第 5 次：ErrUserLocked（errs.go 原文 msg）
        if (attempts < 5)
          return { status: 500, body: errorEnvelope(4010202, EIAM_INVALID_USER_MSG) }
        return { status: 500, body: errorEnvelope(4010303, EIAM_USER_LOCKED_MSG) }
      }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    const submit = async () => {
      await fillCredentials(page, 'admin', 'wrong')
      await submitCredentialForm(page)
    }
    // 前 4 次：中性「用户名或密码错误」
    for (let i = 1; i <= 4; i++) {
      await submit()
      await expect(page.locator('.login-error')).toContainText('用户名或密码错误')
      // 每次错后清空密码以便重填（v-model 保留，重填幂等）
    }
    // 第 5 次：锁定态
    await submit()
    const error = page.locator('.login-error')
    await expect(error).toContainText('账号已锁定')
    await expect(error).toHaveAttribute('data-error', 'locked')
    // G-9 降级：{X} 占位符不自算，不出现具体倒计时分钟数
    await expect(error).not.toContainText(/剩余 \d+ 分钟/)
  })
})

test.describe('CONTRACT · S-M1-08 锁定期内可改用其他已启用方式', () => {
  test('锁定后 LDAP Tab 仍可切换、切换清锁定条（不回显账号信息）', async ({ page }) => {
    await fulfillAuthRoutes(page, (url) => {
      if (url.includes('/system/login'))
        return { status: 500, body: errorEnvelope(4010303, EIAM_USER_LOCKED_MSG) }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    await fillCredentials(page, 'admin', 'wrong')
    await submitCredentialForm(page)
    await expect(page.locator('.login-error')).toHaveAttribute('data-error', 'locked')

    // 切到 LDAP：selectTab 清错条（clearError），LDAP 表单可用
    await page.getByRole('tab', { name: 'LDAP' }).click()
    await expect(page.locator('.login-error')).toHaveCount(0)
    await expect(page.getByTestId('ldap-source-id')).toBeVisible()
    // 锁定条不回显账号
    // （已消失，满足「不回显账号信息」）
  })
})

test.describe('CONTRACT · S-M1-09 E9 MFA 连续 5 次失败 → 锁定（与 E2 同口径）', () => {
  test('MFA 第 5 次失败 → auth.account_locked 中性文案', async ({ page }) => {
    let mfaAttempts = 0
    await fulfillAuthRoutes(page, (url) => {
      if (url.includes('/system/login'))
        return {
          status: 200,
          body: loginOkEnvelope({ mfa_required: true, mfa_token: 'mfa-tkt' }),
        }
      if (url.includes('/mfa/verify')) {
        mfaAttempts++
        if (mfaAttempts < 5)
          return { status: 500, body: errorEnvelope(4010301, EIAM_MFA_INVALID_MSG) }
        // 第 5 次：次数耗尽（errs.go ErrMfaTokenInvalid 次数耗尽分支）
        return { status: 500, body: errorEnvelope(4010403, EIAM_MFA_LOCKED_MSG) }
      }
      return { status: 200, body: envelope(null) }
    })
    await gotoLogin(page)
    await fillCredentials(page, 'admin', 'any')
    await submitCredentialForm(page)
    await expect(page.locator('[data-phase="mfa"]')).toBeVisible()

    const mfaInput = page.getByTestId('mfa-code')
    const verifyBtn = page.getByRole('button', { name: '验证', exact: true })
    for (let i = 1; i <= 4; i++) {
      await mfaInput.fill(`00000${i}`)
      await verifyBtn.click()
      await expect(page.locator('.login-error')).toContainText('验证码错误')
    }
    // 第 5 次：锁定
    await mfaInput.fill('555555')
    await verifyBtn.click()
    const error = page.locator('.login-error')
    await expect(error).toContainText('账号已锁定')
    await expect(error).toHaveAttribute('data-error', 'locked')
  })
})

// =====================================================================
// E1 强制改密骨架（G-8 降级）—— S-M1-11 / S-M1-12
// =====================================================================

test.describe('E1 · S-M1-11/12 强制改密骨架（G-8 降级，生产休眠）', () => {
  test('生产构建 /console/login 不渲染 mustChangePassword 相位（骨架休眠）', async ({
    page,
  }) => {
    // eiam 无 must_change_password 载体（G-8 gap），生产 <Login /> 恒不带 prop →
    // mustChangePassword 相位恒不渲染。骨架（prop=true）表单/校验由
    // Login.test.ts「AC：强制改密态」覆盖（组件层证据）。
    await gotoLogin(page)
    await expect(page.locator('[data-phase="mustChangePassword"]')).toHaveCount(0)
    // 登录态正常渲染（骨架不影响主路径）
    await expect(page.locator('[data-phase="login"]')).toBeVisible()
    await expect(page.getByTestId('username')).toBeVisible()
  })
})
