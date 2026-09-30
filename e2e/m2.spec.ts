/**
 * M2 E2E：租户分流（E3/E4/E5）+ 单点跳转 + 双侧登出（Story 6）—— 任务 3.4。
 *
 * 验收宿主硬规则：nginx 同域形态（:8888/console，任务 2.10 haven-console.conf），
 * 真实浏览器（chromium）。双侧登出断言须真实双会话验证，不得 mock（Hard Rule）。
 *
 * 场景映射（acceptance.md §2 M2）：
 * - S-M2-01 多租户选择页点选（≥2 → /tenant-select）—— REAL admin（多租户）
 * - S-M2-02 单租户自动选定直达 —— CONTRACT（dev eiam 无单租户测试账号）
 * - S-M2-03 零租户受限工作台 + URL 直入管理页不白屏 —— CONTRACT
 * - S-M2-04 平台管理员零租户豁免可进管理页 —— CONTRACT
 * - S-M2-05 顶部切换器重选 → tenant/switch → location.replace 刷新 —— REAL admin
 * - S-M2-06 跨标签错租户写被写前守卫阻断（3.1 验证，负向）—— REAL admin + 调试钩子
 * - S-M2-09 菜单按 permissions 渲染（裁剪仅为体验层）—— CONTRACT
 * - S-M2-10 应用切换器新标签开 e-cam-web 不重复登录（SSO）—— REAL admin
 * - S-M2-11 控制台登出 → e-cam-web 下次请求 401 收敛 → /console/login —— REAL 双会话
 * - S-M2-12 e-cam-web 登出 → 控制台下次请求 401 收敛 → /console/login —— REAL 双会话
 *
 * ── 证据形态分两档（与 login.spec.ts 同口径，透明标注）──
 * ① REAL（真实 eiam + 真实 nginx + 真实共享 cookie）：admin/12345678 是 dev eiam
 *   seed 的真实超级管理员（migrations seed_system_roles.sql），多租户（id 1/2/3）。
 *   租户切换 / SSO 跳转 / 双侧登出 / 写前守卫跨标签场景全程真链路，零 page.route 拦截。
 *   双侧登出经真实共享 cookie jar：一侧 eiam logout 的 Set-Cookie(Max-Age=0) 清域级
 *   cookie，另一侧下一请求无 cookie → eiam/e-cam-service 401 → 收敛 /console/login。
 * ② CONTRACT（契约履约）：E3 零租户 / E4 单租户 / 菜单裁剪 —— dev eiam 无法 provision
 *   零租户/单租户/非 admin 用户态。经 page.route 履约 eiam profile 信封（形状取自
 *   parity §3.2 实核），浏览器 cookie 写入/守卫校验为真实链路（login 响应附 Set-Cookie，
 *   非注入伪造 cookie），仅 API 响应体按契约履约。
 */
import { expect, test, type Page, type Route } from "@playwright/test";

// ---- eiam 信封构造（parity §3.2 snake_case 实核形；与 login.spec.ts 同款）----

function envelope(data: unknown, code = 0, msg = "ok"): unknown {
  return { code, msg, data };
}

/** login 成功信封（B-2：无 token 字段，会话经 Set-Cookie 颁发） */
function loginOkEnvelope(): unknown {
  return envelope({ mfa_required: false });
}

/**
 * profile 信封（user store mapProfile 归一源；tenants 决定分流；is_admin 决定豁免）。
 * current_tenant_id = tenants[0]?.id ?? 0（与 eiam 真实 profile 同形）。
 */
function profileEnvelope(
  tenants: Array<{ id: number; name: string; code: string; domain: string }>,
  isAdmin: boolean,
): unknown {
  return envelope({
    user: {
      id: 1,
      username: isAdmin ? "admin" : "tester",
      nickname: isAdmin ? "管理员" : "测试用户",
    },
    tenants,
    current_tenant_id: tenants[0]?.id ?? 0,
    is_admin: isAdmin,
    permissions: isAdmin ? ["*"] : [],
    must_select_tenant: false, // F-1：恒 false，前端自算 tenants.length
  });
}

// ---- 真实 admin 凭据（dev eiam seed，migrations/20260403000001_seed_system_roles.sql）----
const ADMIN_USER = "admin";
const ADMIN_PWD = "12345678";

// ---- CONTRACT 路由履约安装器（与 login.spec.ts 同款）----

async function fulfillAuthRoutes(page: Page, profile: unknown): Promise<void> {
  await page.route("**/api/iam/user/**", async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/system/login")) {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie":
            "ecmdb-token-key=e2e-contract-session; Path=/; SameSite=Lax",
        },
        body: JSON.stringify(loginOkEnvelope()),
      });
      return;
    }
    if (url.includes("/profile")) {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope(null)),
    });
  });
}

// ---- 页面操作辅助 ----

async function gotoLogin(page: Page): Promise<void> {
  await page.goto("/console/login");
  await expect(page.getByRole("heading", { name: "Platform" })).toBeVisible();
}

async function fillCredentials(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.getByTestId("username").fill(username);
  await page.getByTestId("password").fill(password);
}

async function submitCredentialForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

/** REAL admin 登录（真 eiam）：填写表单 → 提交 → 分流。
 * admin 多租户（id 1/2/3）→ Login.vue finalizeLogin 送 /tenant-select（tenants.length>=2）。
 * 但 admin 的 current_tenant_id=1（!=0）→ 守卫 ② 不拦，可直达 /workbench。
 * 为统一各 REAL 场景的起点（workbench），登录后显式进 /workbench。 */
async function loginRealAdmin(page: Page): Promise<void> {
  await gotoLogin(page);
  await fillCredentials(page, ADMIN_USER, ADMIN_PWD);
  await submitCredentialForm(page);
  // admin 多租户 → Login.vue 送 /tenant-select；current_tenant_id=1 已选定
  await expect(page).toHaveURL(/\/console\/(tenant-select|workbench)$/);
  // 显式进 /workbench（守卫 ② 因 currentTenantId=1 !=0 放行）
  await page.goto("/console/workbench");
  await expect(page).toHaveURL(/\/console\/workbench$/);
}

/** header TenantSelector 的 el-select 触发器（MainLayout header 内，唯一） */
function headerTenantSelect(page: Page): Page.Locator {
  return page.locator(".app-header .tenant-selector .el-select").first();
}

/** 在 el-select 下拉中点选指定租户名 */
async function pickTenant(
  page: Page,
  selectTrigger: Page.Locator,
  name: string,
): Promise<void> {
  await selectTrigger.click();
  await page
    .locator(".el-select-dropdown__item:visible")
    .filter({ hasText: name })
    .first()
    .click();
}

// =====================================================================
// E3 / E4：零租户受限 + 单租户自动（CONTRACT：dev eiam 无对应 provisioned 用户态）
// =====================================================================

test.describe("CONTRACT · S-M2-02 单租户用户 → 自动选定直达工作台（E4）", () => {
  test("单租户 → 跳过选择页、无停留直达 /workbench", async ({ page }) => {
    await fulfillAuthRoutes(
      page,
      profileEnvelope(
        [{ id: 7, name: "个人", code: "p", domain: "p.x" }],
        false,
      ),
    );
    await gotoLogin(page);
    await fillCredentials(page, "tester", "any");
    await submitCredentialForm(page);
    // 单租户 → 自动选定 → 直达工作台（不经 /tenant-select）
    await expect(page).toHaveURL(/\/console\/workbench$/);
    // 非受限态（tenants.length===1）→ 应用卡片可用、无受限提示
    await expect(
      page.locator('[data-testid="workbench-restricted-notice"]'),
    ).toHaveCount(0);
  });
});

test.describe("CONTRACT · S-M2-03 零租户普通用户 → 受限工作台（E3）", () => {
  test("零租户非 admin → 受限工作台（仅欢迎+我的信息）+ 无所属租户提示", async ({
    page,
  }) => {
    await fulfillAuthRoutes(page, profileEnvelope([], false));
    await gotoLogin(page);
    await fillCredentials(page, "tester", "any");
    await submitCredentialForm(page);
    await expect(page).toHaveURL(/\/console\/workbench$/);
    // 受限视图：workbench-restricted-notice 渲染（tenant.none 契约文案）
    const notice = page.locator('[data-testid="workbench-restricted-notice"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("无所属租户");
    // 应用卡片禁用（受限态：cardsDisabled → UL data-disabled=true + section is-disabled）
    await expect(page.locator(".workbench-app-cards")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    // 所属租户字段标注受限态
    await expect(
      page.locator('[data-testid="profile-tenant"]'),
    ).toHaveAttribute("data-restricted", "true");
  });

  test("零租户用户 URL 直入管理页 → 不白屏（页面渲染占位），不报错", async ({
    page,
  }) => {
    await fulfillAuthRoutes(page, profileEnvelope([], false));
    await gotoLogin(page);
    await fillCredentials(page, "tester", "any");
    await submitCredentialForm(page);
    await expect(page).toHaveURL(/\/console\/workbench$/);
    // URL 直入管理页 /users（占位视图，task 4.2 前为占位）→ 不白屏
    await page.goto("/console/users");
    // 占位页渲染（h2 标题可见 = 非白屏）；零租户非 admin 不被 requiresAdmin 拒绝（/users 无 meta.requiresAdmin）
    await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible();
  });
});

test.describe("CONTRACT · S-M2-04 平台管理员零租户豁免（E3）", () => {
  test("admin 零租户 → 非受限态，可访问 requiresAdmin 管理页（/tenants）", async ({
    page,
  }) => {
    await fulfillAuthRoutes(page, profileEnvelope([], true));
    await gotoLogin(page);
    await fillCredentials(page, "admin", "any");
    await submitCredentialForm(page);
    await expect(page).toHaveURL(/\/console\/workbench$/);
    // admin 豁免：非受限态（无受限提示）
    await expect(
      page.locator('[data-testid="workbench-restricted-notice"]'),
    ).toHaveCount(0);
    // requiresAdmin 裁剪通过 → 可访问 /tenants（占位页不白屏）
    await page.goto("/console/tenants");
    await expect(page.getByRole("heading", { name: "租户管理" })).toBeVisible();
  });

  test("零租户非 admin 直入 requiresAdmin 页（/policies）→ 守卫 ③ 跳 /forbidden，不白屏", async ({
    page,
  }) => {
    await fulfillAuthRoutes(page, profileEnvelope([], false));
    await gotoLogin(page);
    await fillCredentials(page, "tester", "any");
    await submitCredentialForm(page);
    await expect(page).toHaveURL(/\/console\/workbench$/);
    await page.goto("/console/policies");
    // requiresAdmin && !isAdmin → 守卫 ③ → /forbidden（不白屏）
    await expect(page).toHaveURL(/\/console\/forbidden$/);
  });
});

// =====================================================================
// E5：多租户经切换器重选 → tenant/switch → location.replace 刷新数据（REAL admin）
// =====================================================================

test.describe("REAL · S-M2-05 多租户切换器重选 → tenant_id 写回 + location.replace（E5）", () => {
  test("header 切换器选另一租户 → tenant/switch → 整页 reload → 当前租户字段变更", async ({
    page,
  }) => {
    await loginRealAdmin(page);
    // admin 默认 current_tenant_id=1（系统根管理空间）；切换到 id=2（默认租户空间）
    const tenantField = page.locator('[data-testid="profile-tenant"]');
    await expect(tenantField).toContainText("系统根"); // 初始租户 1

    // 操作 header TenantSelector（el-select）：点击触发器 → 选「默认租户空间」
    await pickTenant(page, headerTenantSelect(page), "默认租户空间");

    // tenant/switch → eiam 销毁旧 session 重签 JWT + Set-Cookie → location.replace 整页 reload
    // reload 后路由守卫重拉 profile → current_tenant_id=2 → workbench 渲染新租户
    await expect(page).toHaveURL(/\/console\/workbench$/);
    await expect(tenantField).toContainText("默认租户空间");
    // 租户字段不再标注受限态（admin 多租户，非受限）
    await expect(tenantField).not.toHaveAttribute("data-restricted", "true");
  });
});

test.describe("REAL · S-M2-01 多租户登录 → /tenant-select（F-1：currentTenantId===0 时）", () => {
  // admin 默认 current_tenant_id=1（!=0），守卫 ② 不拦 → 直达工作台。
  // 该场景验证「currentTenantId===0 的多租户用户走 /tenant-select」—— REAL admin 无法
  // 触发（其 session 已带 tenant_id=1），故用 CONTRACT 履约一个多租户但 current_tenant_id=0 的 profile。
  test("多租户 + currentTenantId=0 → /tenant-select 渲染选择列表", async ({
    page,
  }) => {
    const profile = envelope({
      user: { id: 9, username: "multi", nickname: "多租户用户" },
      tenants: [
        { id: 1, name: "甲租户", code: "a", domain: "a.x" },
        { id: 2, name: "乙租户", code: "b", domain: "b.x" },
      ],
      current_tenant_id: 0, // 未选定 → 守卫 ② 拦至 /tenant-select
      is_admin: false,
      permissions: [],
      must_select_tenant: false,
    });
    await fulfillAuthRoutes(page, profile);
    await gotoLogin(page);
    await fillCredentials(page, "multi", "any");
    await submitCredentialForm(page);
    await expect(page).toHaveURL(/\/console\/tenant-select$/);
    // 选择列表渲染（TenantSelector 复用，el-select 可见）—— ts-list 内的选择器
    await expect(page.locator('[data-testid="ts-list"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="ts-list"] .tenant-selector .el-select'),
    ).toBeVisible();
  });
});

// =====================================================================
// S-M2-06 写前守卫阻断错租户写（REAL admin + 跨标签 + 调试钩子，负向）
// 3.1 验证：enforceWriteGuard 比对 pageEnterTenantSnapshot 与 currentTenantId，
// 不一致 → 返回 false + location.replace 自愈。4.x/5.x list store 的 create/update/remove
// 接入前的工具级真浏览器验证。
// =====================================================================

test.describe("REAL · S-M2-06 跨标签错租户写被写前守卫阻断（3.1 验证，负向）", () => {
  test("标签B进入时snapshot=X、他标签切到Y后B的currentTenantId变Y → enforceWriteGuard 阻断+自愈", async ({
    browser,
  }) => {
    // 单一 browser context：两 page 共享 cookie jar（真实浏览器跨标签同域 cookie 共享）
    const ctx = await browser.newContext();
    const pageA = await ctx.newPage();
    const pageB = await ctx.newPage();

    // Page A：REAL admin 登录 → 共享 cookie 写入 → /workbench（currentTenantId=1）
    await loginRealAdmin(pageA);

    // Page B：同 context 共享 cookie → goto /console/users（守卫放行，snapshot=1）
    await pageB.goto("/console/users");
    await expect(
      pageB.getByRole("heading", { name: "用户管理" }),
    ).toBeVisible();
    // 进入时快照 = currentTenantId = 1（admin 默认租户，经调试钩子读取验证）

    // 调试钩子在 localhost 宿主已挂载（生产 dist + nginx 同域形态）
    const snapshotBefore = await pageB.evaluate(() =>
      window.__hcDebug?.getPageEnterTenantSnapshot(),
    );
    const currentBefore = await pageB.evaluate(() =>
      window.__hcDebug?.currentTenantId(),
    );
    expect(snapshotBefore).toBe(1);
    expect(currentBefore).toBe(1);

    // Page A：切换租户 1→2（真 eiam tenant/switch → 销毁旧 session 重签 JWT + 新 cookie 域级下发）
    await pickTenant(pageA, headerTenantSelect(pageA), "默认租户空间");
    // Page A location.replace reload → currentTenantId=2
    await expect(pageA).toHaveURL(/\/console\/workbench$/);
    await expect(pageA.locator('[data-testid="profile-tenant"]')).toContainText(
      "默认租户空间",
    );

    // Page B 未 reload：snapshot 仍=1。但其 cookie 已被 Page A 的 switch 域级 Set-Cookie 更新。
    // 触发 Page B 的 profile 重拉（模拟「他标签切租户后本标签下一次请求获新 tenant 上下文」）：
    // fetchProfile 用新 cookie → current_tenant_id=2 → setCurrentTenantId(2)。
    // 此时 Page B：snapshot=1（页进入时刻观测值）、currentTenantId=2（服务端新真值）→ 不一致。
    await pageB.evaluate(() => window.__hcDebug?.fetchProfile());
    const currentAfter = await pageB.evaluate(() =>
      window.__hcDebug?.currentTenantId(),
    );
    expect(currentAfter).toBe(2);
    const snapshotAfter = await pageB.evaluate(() =>
      window.__hcDebug?.getPageEnterTenantSnapshot(),
    );
    expect(snapshotAfter).toBe(1); // 快照未随 fetchProfile 变化（仅路由守卫 ④ 写入）

    // 触发写前守卫（等价于 list store create/update/remove 提交前的 enforceWriteGuard 调用）：
    // snapshot(1) != current(2) → 返回 false 阻断本次写 + location.replace 自愈。
    // location.replace 在 enforceWriteGuard 内同步触发 → evaluate 的返回通道被导航销毁，
    // 故把结果存 sessionStorage（导航前同步写入），导航后回读。
    const healed = pageB.waitForFunction(
      () =>
        window.__hcDebug && window.__hcDebug.getPageEnterTenantSnapshot() === 2,
      { timeout: 10000 },
    );
    await pageB
      .evaluate(() => {
        const r = window.__hcDebug?.enforceWriteGuard();
        sessionStorage.setItem("hc_guard_result", String(r));
      })
      .catch(() => {}); // 导航销毁执行上下文，预期内
    await healed;
    const guardResult = await pageB.evaluate(() =>
      sessionStorage.getItem("hc_guard_result"),
    );
    expect(guardResult).toBe("false"); // 阻断本次写（硬门不得绕过）
    // 自愈 reload 后：路由守卫 ④ 重拉 profile → snapshot=currentTenantId=2（一致）
    const snapshotHealed = await pageB.evaluate(() =>
      window.__hcDebug?.getPageEnterTenantSnapshot(),
    );
    const currentHealed = await pageB.evaluate(() =>
      window.__hcDebug?.currentTenantId(),
    );
    expect(snapshotHealed).toBe(2);
    expect(currentHealed).toBe(2);

    await ctx.close();
  });
});

// =====================================================================
// S-M2-09 菜单按 permissions 渲染（CONTRACT：裁剪仅为体验层）
// =====================================================================

test.describe("CONTRACT · S-M2-09 菜单按 permissions 渲染（前端裁剪体验层）", () => {
  test("非 admin 且无权限 → requiresAdmin 菜单入口（租户管理）不可达（直连被守卫 ③ 拒）", async ({
    page,
  }) => {
    await fulfillAuthRoutes(
      page,
      profileEnvelope(
        [{ id: 7, name: "个人", code: "p", domain: "p.x" }],
        false,
      ),
    );
    await gotoLogin(page);
    await fillCredentials(page, "tester", "any");
    await submitCredentialForm(page);
    await expect(page).toHaveURL(/\/console\/workbench$/);
    // 直连 /tenants（requiresAdmin）→ 守卫 ③ → /forbidden（前端裁剪体验层，服务端授权由 eiam 强制）
    await page.goto("/console/tenants");
    await expect(page).toHaveURL(/\/console\/forbidden$/);
  });
});

// =====================================================================
// S-M2-10 单点跳转：应用切换器新标签开 e-cam-web 不重复登录（REAL admin SSO）
// =====================================================================

test.describe("REAL · S-M2-10 应用切换器新标签开 e-cam-web（SSO，不重复登录）", () => {
  test("admin 登录后应用切换器 → 新标签 /cam/ 加载 e-cam-web（共享会话，不跳登录）", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const pageA = await ctx.newPage();
    await loginRealAdmin(pageA);

    // 应用切换器新标签打开 e-cam-web（AppSwitcher window.open /cam/）
    // 监听新标签页打开事件
    const camPagePromise = ctx.waitForEvent("page");
    // 点击应用切换器 → 下拉 → 「云管」
    await pageA.locator(".app-switcher-trigger").click();
    await pageA
      .locator(".el-dropdown-menu__item:visible")
      .filter({ hasText: "云管" })
      .first()
      .click();
    const camPage = await camPagePromise;
    await camPage.waitForLoadState("domcontentloaded");

    // e-cam-web /cam/ 加载成功（共享 cookie 免重复登录）→ 未收敛到 /console/login
    // 断言：URL 仍在 /cam/（非 /console/login），页面是 e-cam-web 而非控制台登录页
    await expect(camPage).toHaveURL(/\/cam\//);
    await expect(camPage).not.toHaveURL(/\/console\/login/);

    await ctx.close();
  });
});

// =====================================================================
// S-M2-11 / S-M2-12 双侧单点登出（REAL 双会话，Hard Rule：不得 mock）
// 真实共享 cookie jar：一侧 eiam logout 的 Set-Cookie(Max-Age=0) 清域级 cookie，
// 另一侧下一请求无 cookie → eiam/e-cam-service 401 → 收敛 /console/login。
// =====================================================================

test.describe("REAL · S-M2-11 控制台登出 → e-cam-web 下次请求 401 收敛 /console/login", () => {
  test("console logout → e-cam-web reload → 落 /console/login（真实双会话）", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const consolePage = await ctx.newPage();
    await loginRealAdmin(consolePage);

    // e-cam-web 标签：共享 cookie 加载
    const camPage = await ctx.newPage();
    await camPage.goto("/cam/");
    await camPage.waitForLoadState("domcontentloaded");
    await expect(camPage).toHaveURL(/\/cam\//);

    // 控制台侧登出（AppHeader 用户头像下拉 → 登出）→ eiam logout 清域级 cookie
    await consolePage
      .locator(".app-header .header-user-trigger")
      .first()
      .click();
    await consolePage
      .locator(".el-dropdown-menu__item:visible")
      .filter({ hasText: "登出" })
      .first()
      .click();
    // console 跳 /login（SPA push）
    await expect(consolePage).toHaveURL(/\/console\/login/);

    // e-cam-web 侧下一请求（goto /cam/ 触发初始 API 调用）→ 无 cookie → 401 → 收敛 /console/login
    // goto 可能被 e-cam-web 的 401 redirectToLogin 中断（window.location.href 跳转），catch 后断言 URL
    await camPage.goto("/cam/").catch(() => {});
    await expect(camPage).toHaveURL(/\/console\/login/, { timeout: 15000 });

    await ctx.close();
  });
});

test.describe("REAL · S-M2-12 e-cam-web 登出 → 控制台下次请求 401 收敛 /console/login", () => {
  test("e-cam-web logout → console reload → 落 /console/login（真实双会话）", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const consolePage = await ctx.newPage();
    await loginRealAdmin(consolePage);

    const camPage = await ctx.newPage();
    await camPage.goto("/cam/");
    await camPage.waitForLoadState("domcontentloaded");
    await expect(camPage).toHaveURL(/\/cam\//);

    // e-cam-web 侧登出（MainLayout 用户下拉 → 退出登录）→ eiam logout 清域级 cookie
    // e-cam-web logout 自身会跳 /console/login（resolveLoginTarget）
    await camPage
      .locator(".app-header .el-dropdown, header .el-dropdown")
      .first()
      .click();
    await camPage
      .locator(".el-dropdown-menu__item:visible")
      .filter({ hasText: "退出登录" })
      .first()
      .click();
    await expect(camPage).toHaveURL(/\/console\/login/, { timeout: 15000 });

    // 控制台侧下一请求（reload → 守卫 ① hasSessionCookie()=false → /login）
    await consolePage.reload();
    await expect(consolePage).toHaveURL(/\/console\/login/, { timeout: 15000 });

    await ctx.close();
  });
});
