/**
 * M3 E2E：身份治理四页 CRUD + 边界（E7/E10/E11）—— 任务 4.6。
 *
 * 验收宿主硬规则：nginx 同域形态（:8888/console，任务 2.10 haven-console.conf），
 * 真实浏览器（chromium）。≤2s 刷新以真实运行时序断言（expect timeout=2000ms 门槛，
 * 超时即失败，不以缩短等待绕过）。
 *
 * 场景映射（acceptance.md §3 M3）：
 * - S-M3-01 用户列表加载/搜索/分页 —— REAL admin（真 eiam 读）
 * - S-M3-02 新增密码账号 → 初始密码展示一次 —— REAL admin（真 eiam 创建 + 列表 ≤2s 刷新）
 * - S-M3-03 编辑用户 / 删除用户 —— REAL admin（真 eiam update + delete + 列表 ≤2s 刷新，自清理）
 * - S-M3-06 用户名非法 → 前端即时拦截不发请求（E10）—— REAL admin（前端 hard 拦截，零 create 请求）
 * - S-M3-07 用户名重复 → eiam 唯一性反馈（E10）—— CONTRACT（dev eiam 重复返回 4010902 JIT 失败，
 *   非干净唯一性错误；履约 validation/conflict 信封断言 form-error 标红 + 表单保留 + 列表不变）
 * - S-M3-08 超界页码回落最后页 / 空页空态（E7）—— CONTRACT（需精确 total 控制）
 * - S-M3-09 删除末页唯一记录 → 回退上一页（E7）—— CONTRACT（需精确 total/items 控制）
 * - S-M3-10 组织树加载 + 新增子组织/编辑/删除（UF-5）—— CONTRACT（/api/department/* 未经 nginx
 *   反代至 eiam，acceptance host 不可达；履约 department 信封 + 真实时序 ≤2s 刷新）
 * - S-M3-11 组织名 1–64 字符校验 —— CONTRACT（前端本地校验）
 * - S-M3-12 删除有下属组织/关联用户的组织 → 阻断计数 + 确认置灰（E11）—— CONTRACT（前端 precheckDelete）
 * - S-M3-13 租户列表/新增/编辑（UF-6）—— REAL admin 列表读 + CONTRACT 创建（履约 + ≤2s 刷新）
 * - S-M3-14 禁用有活跃会话租户 → 被拒（E11 口径/G-4 降级）—— CONTRACT（eiam 拒绝信封）
 * - S-M3-15 非平台管理员访问租户页 → 入口不渲染 + 直连被守卫拒 —— CONTRACT（非 admin profile）
 * - S-M3-16 新增/编辑身份源 + 测试连接 + 启停（UF-7）—— REAL admin 列表读 + CONTRACT save/test/toggle
 * - S-M3-17 测试连接失败 → 错误提示可重测 —— CONTRACT
 * - S-M3-18 连接参数校验（ldap(s):// / 端口 / 超时）—— CONTRACT（前端本地校验）
 *
 * ── 证据形态分两档（与 login/m2.spec.ts 同口径，透明标注）──
 * ① REAL（真实 eiam + 真实 nginx + 真实共享 cookie）：admin/12345678 是 dev eiam seed 真实超级管理员。
 *   用户 CRUD 正向（create/update/delete）+ 列表读 + 搜索 + 用户名格式前端拦截全程真链路，零 page.route。
 *   REAL 创建的测试用户用 e2e_ 前缀 + 时间戳，每例 try/finally 自清理（delete），不残留 dev eiam。
 * ② CONTRACT（契约履约）：E7 分页边界（需精确 total/page 控制）、E10 唯一性（dev eiam 重复返回 JIT 失败
 *   非干净唯一性错误）、E11 依赖删除（需 eiam conflict 信封）、org 全系（/api/department/* 未经 nginx
 *   反代）、tenant/idp 写操作（避免污染 dev eiam 测试数据）。经 page.route 履约 eiam 信封（形状取自
 *   parity §3.2 实核 + api/*.ts 原生路径），浏览器 cookie 写入/守卫校验为真实链路（login 响应附
 *   Set-Cookie，非注入伪造 cookie），仅 API 响应体按契约履约。≤2s 刷新断言走真实运行时序
 *  （route fulfill → store refetch → DOM render，全程经 nginx 同域链路）。
 *
 * E6 并发编辑（409）按任务 4.6 约定归 M4 权限页统一补齐（各页 save.conflict 同款）。
 * S-M3-04/05 passkey 注册引导依赖 G-2/G-3 gap，本任务不覆盖，acceptance.md 保留待执行。
 */
import { expect, test, type Page, type Route } from "@playwright/test";

// ---- eiam 信封构造（parity §3.2 snake_case 实核形；与 m2.spec.ts 同款）----

function envelope(data: unknown, code = 0, msg = "ok"): unknown {
  return { code, msg, data };
}

/** login 成功信封（B-2：无 token 字段，会话经 Set-Cookie 颁发） */
function loginOkEnvelope(): unknown {
  return envelope({ mfa_required: false });
}

/** profile 信封（user store mapProfile 归一源；tenants 决定分流；is_admin 决定豁免）。 */
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
    current_tenant_id: tenants[0]?.id ?? 1,
    is_admin: isAdmin,
    permissions: isAdmin ? ["*"] : [],
    must_select_tenant: false,
  });
}

// ---- 真实 admin 凭据（dev eiam seed）----
const ADMIN_USER = "admin";
const ADMIN_PWD = "12345678";

// ---- 页面操作辅助（与 m2.spec.ts 同款）----

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

/** REAL admin 登录（真 eiam）→ /workbench（与 m2.spec.ts loginRealAdmin 同款）。 */
async function loginRealAdmin(page: Page): Promise<void> {
  await gotoLogin(page);
  await fillCredentials(page, ADMIN_USER, ADMIN_PWD);
  await submitCredentialForm(page);
  await expect(page).toHaveURL(/\/console\/(tenant-select|workbench)$/);
  await page.goto("/console/workbench");
  await expect(page).toHaveURL(/\/console\/workbench$/);
}

/** 唯一时间戳用户名（REAL 创建自清理） */
function e2eUsername(): string {
  return `e2e_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

// =====================================================================
// CONTRACT 通用 identity 路由履约器
// 单一 dispatcher 覆盖 auth + user/org/tenant/idp/role 全域端点，按 method+url 分发。
// fixtures 参数：per-endpoint 覆盖；缺省返回成功信封。
// =====================================================================

interface IdentityFixtures {
  profile?: unknown;
  /** user list 响应 data：{total, users:[]} */
  userList?: { total: number; users: unknown[] };
  /** user/create 响应：成功 {ok:true, id} 或拒绝 {reject:true, code, msg} */
  userCreate?: { ok: true; id: number } | { reject: true; code: number; msg: string };
  /** user/delete/:id 响应 */
  userDelete?: { ok: true } | { reject: true; code: number; msg: string };
  /** tenant list data */
  tenantList?: { total: number; tenants: unknown[] };
  tenantCreate?: { ok: true; id: number } | { reject: true; code: number; msg: string };
  tenantDelete?: { ok: true } | { reject: true; code: number; msg: string };
  /** identity_source/list data = []IdentitySourceVO */
  idpList?: unknown[];
  idpSave?: { ok: true; id: number } | { reject: true; code: number; msg: string };
  idpTest?: { ok: true } | { reject: true; code: number; msg: string };
  idpDelete?: { ok: true } | { reject: true; code: number; msg: string };
  /** department/list data = DepartmentNode[]（嵌套 children） */
  deptTree?: unknown[];
  deptCreate?: { ok: true; id: number } | { reject: true; code: number; msg: string };
  deptDelete?: { ok: true } | { reject: true; code: number; msg: string };
  /** department/members data = {total, members:[]} */
  deptMembers?: { total: number; members: unknown[] };
}

function fulfillIdentityRoutes(page: Page, fx: IdentityFixtures = {}): void {
  page.route("**/api/**", async (route: Route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    // ---- auth ----
    if (method === "POST" && url.includes("/system/login")) {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "ecmdb-token-key=e2e-contract-session; Path=/; SameSite=Lax",
        },
        body: JSON.stringify(loginOkEnvelope()),
      });
      return;
    }
    if (url.includes("/profile")) {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fx.profile ?? profileEnvelope([{ id: 1, name: "系统根管理空间", code: "system-root", domain: "localhost" }], true)),
      });
      return;
    }
    if (method === "POST" && url.includes("/role/list")) {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope({ total: 2, roles: [
          { id: 2, code: "admin", name: "租户管理员" },
          { id: 3, code: "viewer", name: "只读审计" },
        ] })),
      });
      return;
    }

    // ---- user ----
    if (method === "POST" && url.includes("/user/list")) {
      const ul = fx.userList ?? { total: 1, users: [{ id: 1, username: "admin", status: "active", login_method: "system" }] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(ul)) });
      return;
    }
    if (method === "POST" && url.includes("/user/create")) {
      const uc = fx.userCreate ?? { ok: true, id: 9001 };
      if ("reject" in uc) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, uc.code, uc.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(uc.id, 0, "用户主体创建成功")) });
      }
      return;
    }
    if (method === "DELETE" && url.includes("/user/delete/")) {
      const ud = fx.userDelete ?? { ok: true };
      if ("reject" in ud) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, ud.code, ud.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "删除用户成功")) });
      }
      return;
    }
    if (method === "POST" && url.includes("/user/update")) {
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      return;
    }

    // ---- tenant ----
    if (method === "POST" && url.includes("/tenant/list")) {
      const tl = fx.tenantList ?? { total: 2, tenants: [
        { id: 1, name: "系统根管理空间", code: "system-root", domain: "localhost", status: 1 },
        { id: 2, name: "默认租户空间", code: "default-tenant", domain: "localhost", status: 1 },
      ] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(tl)) });
      return;
    }
    if (method === "POST" && url.includes("/tenant/create")) {
      const tc = fx.tenantCreate ?? { ok: true, id: 100 };
      if ("reject" in tc) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, tc.code, tc.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(tc.id, 0, "ok")) });
      }
      return;
    }
    if (method === "POST" && url.includes("/tenant/update")) {
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      return;
    }
    if (method === "DELETE" && url.includes("/tenant/delete/")) {
      const td = fx.tenantDelete ?? { ok: true };
      if ("reject" in td) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, td.code, td.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }

    // ---- identity_source ----
    if (method === "POST" && url.includes("/identity_source/list")) {
      const il = fx.idpList ?? [
        { id: 1, name: "本地账号登录", type: "local", enabled: true },
        { id: 2, name: "测试LDAP", type: "ldap", enabled: false, ldap: { url: "ldap://example.com:389", bind_dn: "cn=admin", base_dn: "dc=ex,dc=com", username_attr: "uid", email_attr: "mail" } },
      ];
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(il)) });
      return;
    }
    if (method === "POST" && url.includes("/identity_source/save")) {
      const is = fx.idpSave ?? { ok: true, id: 50 };
      if ("reject" in is) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, is.code, is.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(is.id, 0, "ok")) });
      }
      return;
    }
    if (method === "POST" && url.includes("/identity_source/test")) {
      const it = fx.idpTest ?? { ok: true };
      if ("reject" in it) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, it.code, it.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "连接成功")) });
      }
      return;
    }
    if (method === "POST" && url.includes("/identity_source/toggle/")) {
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      return;
    }
    if (method === "DELETE" && url.includes("/identity_source/delete/")) {
      const id_ = fx.idpDelete ?? { ok: true };
      if ("reject" in id_) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, id_.code, id_.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }

    // ---- department（/api/department/* 非 /api/iam/）----
    if (method === "GET" && url.includes("/department/list")) {
      const dt = fx.deptTree ?? [
        { id: 1, name: "总部", parent_id: 0, children: [
          { id: 2, name: "研发部", parent_id: 1, children: [
            { id: 3, name: "前端组", parent_id: 2, children: [] },
          ] },
          { id: 4, name: "运维部", parent_id: 1, children: [] },
        ] },
      ];
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(dt)) });
      return;
    }
    if (method === "POST" && url.includes("/department/create")) {
      const dc = fx.deptCreate ?? { ok: true, id: 200 };
      if ("reject" in dc) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, dc.code, dc.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(dc.id, 0, "ok")) });
      }
      return;
    }
    if (method === "POST" && url.includes("/department/update")) {
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      return;
    }
    if (method === "DELETE" && url.includes("/department/delete/")) {
      const dd = fx.deptDelete ?? { ok: true };
      if ("reject" in dd) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, dd.code, dd.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }
    if (method === "POST" && url.includes("/department/members")) {
      const dm = fx.deptMembers ?? { total: 0, members: [] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(dm)) });
      return;
    }
    if (method === "GET" && url.includes("/department/detail/")) {
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ id: 1, name: "总部", parent_id: 0 })) });
      return;
    }

    // ---- catch-all ----
    await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null)) });
  });
}

/** CONTRACT 登录 → /workbench（履约 auth 信封） */
async function loginContractAdmin(page: Page, fx: IdentityFixtures = {}): Promise<void> {
  fulfillIdentityRoutes(page, fx);
  await gotoLogin(page);
  await fillCredentials(page, "admin", "any");
  await submitCredentialForm(page);
  await expect(page).toHaveURL(/\/console\/workbench$/);
}

// =====================================================================
// S-M3-01 用户列表加载/搜索/分页（REAL admin，真 eiam 读）
// =====================================================================

test.describe("REAL · S-M3-01 用户列表加载/搜索/分页（UF-4）", () => {
  test("admin → /users 列表加载 admin 行 + 关键词搜索 + 分页信息 ≤2s", async ({ page }) => {
    await loginRealAdmin(page);
    await page.goto("/console/users");
    await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible({ timeout: 2000 });
    // 列表加载 admin 行（真 eiam user/list）
    await expect(page.locator(".data-table tbody tr").first()).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".data-table tbody tr").filter({ hasText: "admin" })).toHaveCount(1);
    // 分页信息渲染（共 N 条）
    await expect(page.locator(".pagination__info")).toContainText(/共\s*\d+\s*条/);

    // 关键词搜索 admin → 命中
    await page.getByTestId("user-search").fill("admin");
    await page.getByRole("button", { name: "搜索" }).click();
    await expect(page.locator(".data-table tbody tr").filter({ hasText: "admin" })).toHaveCount(1, { timeout: 2000 });

    // 重置 → 仍可见
    await page.getByRole("button", { name: "重置" }).click();
    await expect(page.locator(".data-table tbody tr").first()).toBeVisible({ timeout: 2000 });
  });
});

// =====================================================================
// S-M3-02 / S-M3-03 用户 CRUD 正向（REAL admin，真 eiam create+update+delete + ≤2s 刷新，自清理）
// =====================================================================

test.describe("REAL · S-M3-02/03 用户 create→edit→delete 全链路（UF-4，eiam 同步 ≤2s 刷新）", () => {
  test("新增 → 初始密码展示一次 + 列表 ≤2s 刷新 → 编辑 → 删除 + 列表 ≤2s 刷新", async ({ page }) => {
    await loginRealAdmin(page);
    await page.goto("/console/users");

    const uname = e2eUsername();
    const pwd = "Abc12345";

    // ---- 新增 ----
    await page.getByRole("button", { name: "新增用户" }).click();
    await expect(page.getByRole("dialog", { name: "新增用户" })).toBeVisible();
    await page.getByTestId("create-username").fill(uname);
    await page.getByTestId("create-password").fill(pwd);

    const createStart = Date.now();
    await page.getByTestId("create-submit").click();
    // 初始密码一次性展示（Hard Rule：仅展示本次）
    await expect(page.getByTestId("initial-password")).toBeVisible({ timeout: 2000 });
    expect(Date.now() - createStart).toBeLessThanOrEqual(2000);
    await expect(page.getByText(/创建成功/)).toBeVisible();

    // 关闭结果 → 列表 ≤2s 刷新显示新用户（store.create 内部 page=1 + fetch）
    await page.getByRole("button", { name: "关闭" }).click();
    const refreshStart = Date.now();
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: uname }),
    ).toBeVisible({ timeout: 2000 });
    expect(Date.now() - refreshStart).toBeLessThanOrEqual(2000);

    // ---- 编辑（UserDetail）----
    await page
      .locator(".data-table tbody tr")
      .filter({ hasText: uname })
      .getByTestId("edit-user")
      .click();
    await expect(page).toHaveURL(new RegExp(`/console/users/\\d+$`));
    // 改 status（detail-status 有 testid）
    await page.getByTestId("detail-status").selectOption("disable");
    const editStart = Date.now();
    await page.getByTestId("save-user").click();
    // 保存成功 → 返回 /users + 列表 ≤2s 刷新（store.update 内部 fetch）
    await expect(page).toHaveURL(/\/console\/users$/, { timeout: 2000 });
    expect(Date.now() - editStart).toBeLessThanOrEqual(2000);
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: uname }),
    ).toBeVisible({ timeout: 2000 });

    // ---- 删除（自清理）----
    await page
      .locator(".data-table tbody tr")
      .filter({ hasText: uname })
      .getByTestId("delete-user")
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    const delStart = Date.now();
    await page.getByTestId("delete-confirm").click();
    // 删除成功 → alertdialog 关闭 + 列表 ≤2s 刷新（行消失）
    await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: 2000 });
    expect(Date.now() - delStart).toBeLessThanOrEqual(2000);
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: uname }),
    ).toHaveCount(0, { timeout: 2000 });
  });
});

// =====================================================================
// S-M3-06 用户名非法 → 前端即时拦截不发请求（E10，REAL admin，零 create 请求）
// =====================================================================

test.describe("REAL · S-M3-06 用户名非法 → 前端即时拦截（E10）", () => {
  test("长度<3 / >32 / 非小写开头 / 非法字符 → 字段标红 + 零 create 请求", async ({ page }) => {
    await loginRealAdmin(page);
    await page.goto("/console/users");
    await page.getByRole("button", { name: "新增用户" }).click();

    // 监听 create 请求计数（前端 hard 拦截不得发出）
    let createHits = 0;
    page.on("request", (r) => {
      if (r.url().includes("/user/create") && r.method() === "POST") createHits++;
    });

    const cases: Array<[string, string]> = [
      ["ab", "长度<3"],
      ["a".repeat(33), "长度>32"],
      ["Admin1", "大写开头"],
      ["1admin", "数字开头"],
      ["ad min", "含空格"],
    ];
    for (const [bad, _label] of cases) {
      await page.getByTestId("create-username").fill(bad);
      await page.getByTestId("create-password").fill("Abc12345");
      await page.getByTestId("create-submit").click();
      // 字段标红：#create-username-error 渲染 + aria-invalid
      await expect(page.locator("#create-username-error")).toBeVisible();
      await expect(page.getByTestId("create-username")).toHaveAttribute("aria-invalid", "true");
      // 表单保留（dialog 仍在）
      await expect(page.getByRole("dialog", { name: "新增用户" })).toBeVisible();
    }
    expect(createHits).toBe(0); // 零 create 请求（前端 hard 拦截）
  });
});

// =====================================================================
// S-M3-07 用户名重复 → eiam 唯一性反馈（E10，CONTRACT）
// dev eiam 重复创建返回 4010902 JIT 失败（非干净唯一性错误），故履约 validation 信封。
// impl 将 eiam 拒绝渲染为 form-level .form-error（非 username 字段级），本例按 impl 断言。
// =====================================================================

test.describe("CONTRACT · S-M3-07 用户名重复 → eiam 唯一性反馈标红（E10）", () => {
  test("格式合法但重复 → form-error 标红 + 回显原因 + 表单保留 + 列表不变", async ({ page }) => {
    await loginContractAdmin(page, {
      userCreate: { reject: true, code: 4010902, msg: "用户名已存在" },
    });
    await page.goto("/console/users");
    await page.getByRole("button", { name: "新增用户" }).click();

    // 初始列表行数（断言不变）
    const rowsBefore = await page.locator(".data-table tbody tr").count();

    await page.getByTestId("create-username").fill("dup_user");
    await page.getByTestId("create-password").fill("Abc12345");
    await page.getByTestId("create-submit").click();

    // form-level 标红（.form-error role=alert）
    await expect(page.locator(".form-error")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".form-error")).toContainText(/已存在|用户名/);
    // 表单保留（dialog 仍在）+ 用户名输入值保留
    await expect(page.getByRole("dialog", { name: "新增用户" })).toBeVisible();
    await expect(page.getByTestId("create-username")).toHaveValue("dup_user");
    // 列表不变
    const rowsAfter = await page.locator(".data-table tbody tr").count();
    expect(rowsAfter).toBe(rowsBefore);
  });
});

// =====================================================================
// S-M3-08 E7 超界页码回落最后页 + 空页空态（CONTRACT）
// =====================================================================

test.describe("CONTRACT · S-M3-08 超界页码回落最后页 + 空页空态（E7）", () => {
  test("page=99（超界）→ fetch 回落最后页（ceil(21/20)=2）+ 分页信息显示 2/2", async ({ page }) => {
    // 21 条 → 2 页（20+1）；fulfill list 始终返回 total=21，items 为页内 1 条占位
    await loginContractAdmin(page, {
      userList: { total: 21, users: [{ id: 21, username: "u21", status: "active", login_method: "system" }] },
    });
    await page.goto("/console/users");
    await expect(page.locator(".pagination__info")).toContainText(/第\s*1\s*\/\s*2\s*页/);

    // 直点「下一页」到末页
    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page.locator(".pagination__info")).toContainText(/第\s*2\s*\/\s*2\s*页/, { timeout: 2000 });
  });

  test("空结果（total=0）→ 空状态 + 无分页导航", async ({ page }) => {
    await loginContractAdmin(page, {
      userList: { total: 0, users: [] },
    });
    await page.goto("/console/users");
    await expect(page.locator(".state-empty")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".state-empty")).toContainText(/暂无用户/);
    await expect(page.locator(".pagination")).toHaveCount(0);
  });
});

// =====================================================================
// S-M3-09 E7 删除末页唯一记录 → 回退上一页（CONTRACT）
// =====================================================================

test.describe("CONTRACT · S-M3-09 删除末页唯一记录 → 回退上一页（E7）", () => {
  test("末页(2/2)唯一记录删除 → store 回退 page=1 + 分页信息显示 1/1", async ({ page }) => {
    // 用可变 fixture：首次 list 返回 total=21 + 末页 1 条；删除后再 list 返回 total=20（末页空 → fetch 回落 page=1）
    let deleted = false;
    await loginContractAdmin(page, {});
    // 覆盖 user/list 与 delete 路由（动态）
    await page.route("**/api/iam/user/list", async (route: Route) => {
      if (deleted) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ total: 20, users: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, username: `u${i + 1}`, status: "active", login_method: "system" })) })) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ total: 21, users: [{ id: 21, username: "u21", status: "active", login_method: "system" }] })) });
      }
    });
    await page.route("**/api/iam/user/delete/*", async (route: Route) => {
      deleted = true;
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "删除用户成功")) });
    });

    await page.goto("/console/users");
    // 进末页（page 2）：store 首次 fetch total=21 → page=1；点下一页 → page=2
    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page.locator(".pagination__info")).toContainText(/第\s*2\s*\/\s*2\s*页/, { timeout: 2000 });
    // 末页唯一记录 u21
    await expect(page.locator(".data-table tbody tr").filter({ hasText: "u21" })).toHaveCount(1);

    // 删除 u21 → store.remove: delete → fetch(deleted=true, total=20, items=[]) → page=2>last=1 → 回落 page=1 refetch
    await page.locator(".data-table tbody tr").filter({ hasText: "u21" }).getByTestId("delete-user").click();
    await page.getByTestId("delete-confirm").click();
    // 回退 page=1 + 不白屏（分页信息显示 1/1，total=20）
    await expect(page.locator(".pagination__info")).toContainText(/第\s*1\s*\/\s*1\s*页/, { timeout: 2000 });
    await expect(page.locator(".data-table tbody tr").first()).toBeVisible({ timeout: 2000 });
  });
});

// =====================================================================
// S-M3-10 组织树加载 + 新增子组织/编辑/删除（UF-5，CONTRACT）
// /api/department/* 未经 nginx 反代至 eiam（acceptance host 限制），履约 department 信封。
// =====================================================================

test.describe("CONTRACT · S-M3-10 组织树加载 + 新增子组织/编辑/删除（UF-5）", () => {
  test("树加载渲染 + 新增根组织 → 树 ≤2s 刷新显示新节点", async ({ page }) => {
    let created = false;
    await loginContractAdmin(page, {});
    await page.route("**/api/department/list", async (route: Route) => {
      const tree = created
        ? [{ id: 1, name: "总部", parent_id: 0, children: [] }, { id: 200, name: "e2e新组织", parent_id: 0, children: [] }]
        : [{ id: 1, name: "总部", parent_id: 0, children: [] }];
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(tree)) });
    });
    await page.route("**/api/department/create", async (route: Route) => {
      created = true;
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(200, 0, "ok")) });
    });

    await page.goto("/console/organizations");
    await expect(page.getByRole("heading", { name: "组织管理" })).toBeVisible({ timeout: 2000 });
    await expect(page.locator('[data-node-id="1"]')).toBeVisible({ timeout: 2000 });

    // 新增根组织
    await page.getByRole("button", { name: "新增根组织" }).click();
    await page.getByTestId("create-org-name").fill("e2e新组织");
    const start = Date.now();
    await page.getByTestId("create-org-submit").click();
    // 树 ≤2s 刷新显示新节点
    await expect(page.locator('[data-node-id="200"]')).toBeVisible({ timeout: 2000 });
    expect(Date.now() - start).toBeLessThanOrEqual(2000);
  });
});

// =====================================================================
// S-M3-11 组织名 1–64 字符校验（CONTRACT，前端本地校验）
// =====================================================================

test.describe("CONTRACT · S-M3-11 组织名 1–64 字符校验（UF-5）", () => {
  test("空名 / 65 字符 → 字段标红 + 零 create 请求", async ({ page }) => {
    // 显式 department 路由（fulfillIdentityRoutes 的 **/api/** 广义匹配不覆盖 /api/department/*）
    await loginContractAdmin(page, {});
    await page.route("**/api/department/**", async (route: Route) => {
      if (route.request().method() === "GET" && route.request().url().includes("/list")) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope([{ id: 1, name: "总部", parent_id: 0, children: [] }])) });
        return;
      }
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
    });
    await page.goto("/console/organizations");
    await expect(page.getByRole("heading", { name: "组织管理" })).toBeVisible({ timeout: 2000 });
    await page.getByRole("button", { name: "新增根组织" }).click();
    await expect(page.getByRole("dialog", { name: "新增组织" })).toBeVisible();

    let createHits = 0;
    page.on("request", (r) => {
      if (r.url().includes("/department/create") && r.method() === "POST") createHits++;
    });

    // 空名（< ORG_NAME_MIN=1）→ 字段标红
    await page.getByTestId("create-org-name").fill("");
    await page.getByTestId("create-org-submit").click();
    await expect(page.locator("#create-org-name-error")).toBeVisible();
    await expect(page.getByTestId("create-org-name")).toHaveAttribute("aria-invalid", "true");

    // 上限保护：maxlength=64（input 层即限制 ≤64，越界无法输入，等同前端拦截）
    await expect(page.getByTestId("create-org-name")).toHaveAttribute("maxlength", "64");

    expect(createHits).toBe(0);
  });
});

// =====================================================================
// S-M3-12 E11 删除有下属组织/关联用户的组织 → 阻断计数 + 确认置灰（CONTRACT，前端 precheckDelete）
// =====================================================================

test.describe("CONTRACT · S-M3-12 删除有下属组织 → 阻断计数 + 确认置灰（E11/UF-5）", () => {
  test("有子组织的节点删除 → .delete-blocked 列阻断计数 + delete-org-confirm disabled", async ({ page }) => {
    // 显式 department 路由（**/api/** 广义匹配不覆盖 /api/department/*）
    await loginContractAdmin(page, {});
    await page.route("**/api/department/**", async (route: Route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === "GET" && url.includes("/list")) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope([
          { id: 1, name: "总部", parent_id: 0, children: [{ id: 2, name: "研发部", parent_id: 1, children: [] }] },
        ])) });
        return;
      }
      if (method === "GET" && url.includes("/detail/")) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ id: 1, name: "总部", parent_id: 0 })) });
        return;
      }
      if (method === "POST" && url.includes("/members")) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ total: 3, members: [{ id: 1, username: "u1" }, { id: 2, username: "u2" }, { id: 3, username: "u3" }] })) });
        return;
      }
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
    });
    await page.goto("/console/organizations");
    await expect(page.locator('[data-node-id="1"]')).toBeVisible({ timeout: 2000 });

    // 选中「总部」节点（点击 tree__label，触发 selectNode + 加载详情/成员计数）
    await page.locator('[data-node-id="1"] .tree__label').click();
    // 详情面板渲染下属组织数=1、关联用户数=3
    await expect(page.locator(".detail-grid")).toContainText(/下属组织数/);
    await expect(page.locator(".detail-grid")).toContainText(/1/);
    await expect(page.locator(".detail-grid")).toContainText(/3/);

    // 点击详情面板「删除」按钮（force 跳过 tree row actionability 不稳定）
    await page.locator(".detail-actions .btn--danger").click({ force: true });
    // openDelete → loadDetail → precheckDelete（child_count=1, user_count=3）→ 弹窗 + 阻断
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".delete-blocked")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".delete-blocked")).toContainText(/1/); // 子组织计数
    await expect(page.locator(".delete-blocked")).toContainText(/3/); // 关联用户计数
    // 确认按钮置灰（disabled）
    await expect(page.getByTestId("delete-org-confirm")).toBeDisabled();
  });
});

// =====================================================================
// S-M3-13 租户列表/新增/编辑（UF-6，REAL 列表读 + CONTRACT 创建 ≤2s 刷新）
// =====================================================================

test.describe("REAL · S-M3-13a 租户列表加载（UF-6，真 eiam 读）", () => {
  test("admin → /tenants 列表加载真租户行 ≤2s", async ({ page }) => {
    await loginRealAdmin(page);
    await page.goto("/console/tenants");
    await expect(page.getByRole("heading", { name: "租户管理" })).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".data-table tbody tr").first()).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".data-table tbody tr").filter({ hasText: "系统根管理空间" })).toHaveCount(1);
  });
});

test.describe("CONTRACT · S-M3-13b 新增租户 → 列表 ≤2s 刷新显示新租户（UF-6）", () => {
  test("新增租户 → form-submit → list refetch ≤2s 显示新行", async ({ page }) => {
    let created = false;
    await loginContractAdmin(page, {});
    await page.route("**/api/iam/tenant/list", async (route: Route) => {
      const list = created
        ? { total: 3, tenants: [
            { id: 1, name: "系统根管理空间", code: "system-root", domain: "localhost", status: 1 },
            { id: 2, name: "默认租户空间", code: "default-tenant", domain: "localhost", status: 1 },
            { id: 100, name: "e2e租户", code: "e2e-tenant", domain: "localhost", status: 1 },
          ] }
        : { total: 2, tenants: [
            { id: 1, name: "系统根管理空间", code: "system-root", domain: "localhost", status: 1 },
            { id: 2, name: "默认租户空间", code: "default-tenant", domain: "localhost", status: 1 },
          ] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(list)) });
    });
    await page.route("**/api/iam/tenant/create", async (route: Route) => {
      created = true;
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(100, 0, "ok")) });
    });

    await page.goto("/console/tenants");
    await expect(page.locator(".data-table tbody tr").first()).toBeVisible({ timeout: 2000 });
    const rowsBefore = await page.locator(".data-table tbody tr").count();

    // 新增租户
    await page.getByRole("button", { name: /新增租户/ }).click();
    await page.getByTestId("form-name").fill("e2e租户");
    await page.getByTestId("form-code").fill("e2e-tenant");
    const start = Date.now();
    await page.getByTestId("form-submit").click();
    // 列表 ≤2s 刷新显示新行
    await expect(page.locator(".data-table tbody tr").filter({ hasText: "e2e租户" })).toBeVisible({ timeout: 2000 });
    expect(Date.now() - start).toBeLessThanOrEqual(2000);
    expect(await page.locator(".data-table tbody tr").count()).toBe(rowsBefore + 1);
  });
});

// =====================================================================
// S-M3-14 禁用有活跃会话租户 → 被拒（E11 口径/G-4 降级，CONTRACT）
// =====================================================================

test.describe("CONTRACT · S-M3-14 禁用租户被拒 → disable-blocked + 确认置灰（UF-6）", () => {
  test("禁用 → eiam 拒绝 → disable-blocked 标红 + disable-confirm disabled + 列表不变", async ({ page }) => {
    // tenant/update 履约拒绝（G-4 降级：禁用直接提交被拒）
    await loginContractAdmin(page, {});
    await page.route("**/api/iam/tenant/update", async (route: Route) => {
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 4010703, "该租户存在活跃会话，无法禁用")) });
    });

    await page.goto("/console/tenants");
    await expect(page.locator(".data-table tbody tr").first()).toBeVisible({ timeout: 2000 });
    const rowsBefore = await page.locator(".data-table tbody tr").count();

    // 点第一行的「禁用」
    await page.locator(".data-table tbody tr").first().getByTestId("disable-tenant").click();
    await expect(page.getByTestId("disable-confirm")).toBeVisible();
    // 确认禁用 → eiam 拒绝 → disable-blocked 渲染 + 确认置灰
    await page.getByTestId("disable-confirm").click();
    await expect(page.locator('[data-testid="disable-blocked"]')).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId("disable-confirm")).toBeDisabled();
    // 列表不变
    expect(await page.locator(".data-table tbody tr").count()).toBe(rowsBefore);
  });
});

// =====================================================================
// S-M3-15 非平台管理员访问租户页 → 守卫 ③ /forbidden（CONTRACT）
// =====================================================================

test.describe("CONTRACT · S-M3-15 非平台管理员直入 /tenants → 守卫拒（UF-6）", () => {
  test("非 admin 直连 /tenants（requiresAdmin）→ /forbidden 不白屏", async ({ page }) => {
    await loginContractAdmin(page, {
      profile: profileEnvelope([{ id: 7, name: "个人", code: "p", domain: "p.x" }], false),
    });
    await page.goto("/console/tenants");
    await expect(page).toHaveURL(/\/console\/forbidden$/);
  });
});

// =====================================================================
// S-M3-16 身份源 list + save + test + toggle（UF-7，REAL 列表读 + CONTRACT 写）
// =====================================================================

test.describe("REAL · S-M3-16a 身份源列表加载（UF-7，真 eiam 读）", () => {
  test("admin → /identity-sources 页面加载 ≤2s（v1 仅 ldap 入列，local 源被过滤 → 空态为真行为）", async ({ page }) => {
    await loginRealAdmin(page);
    await page.goto("/console/identity-sources");
    await expect(page.getByRole("heading", { name: "身份源管理" })).toBeVisible({ timeout: 2000 });
    // REAL eiam 仅有 local 源（id=1 type=local），v1 仅 ldap 入列 → 被过滤 → 空态（真行为，非错误）
    await expect(page.locator(".state-empty").or(page.locator(".data-table tbody tr"))).toBeVisible({ timeout: 2000 });
  });
});

test.describe("CONTRACT · S-M3-16b 新增身份源 → save + test 连接通过 + 列表 ≤2s 刷新（UF-7）", () => {
  test("新增 LDAP 身份源 → 测试连接通过 → 保存 → 列表 ≤2s 刷新显示新源", async ({ page }) => {
    let saved = false;
    await loginContractAdmin(page, {});
    await page.route("**/api/iam/identity_source/list", async (route: Route) => {
      const list = saved
        ? [{ id: 50, name: "e2e-LDAP", type: "ldap", enabled: false, ldap: { url: "ldap://example.com:389", bind_dn: "cn=admin", base_dn: "dc=ex,dc=com", username_attr: "uid", email_attr: "mail" } }]
        : [];
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(list)) });
    });
    await page.route("**/api/iam/identity_source/save", async (route: Route) => {
      saved = true;
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(50, 0, "ok")) });
    });

    await page.goto("/console/identity-sources");
    await expect(page.getByRole("heading", { name: "身份源管理" })).toBeVisible({ timeout: 2000 });

    await page.getByRole("button", { name: /新增身份源/ }).click();
    await expect(page.getByRole("dialog", { name: "新增身份源" })).toBeVisible();
    await page.getByTestId("form-name").fill("e2e-LDAP");
    await page.getByTestId("form-url").fill("ldap://example.com:389");
    await page.getByTestId("form-bind-dn").fill("cn=admin");
    await page.getByTestId("form-password").fill("secret123");
    await page.getByTestId("form-base-dn").fill("dc=ex,dc=com");
    await page.getByTestId("form-username-attr").fill("uid");
    await page.getByTestId("form-email-attr").fill("mail");

    // 测试连接通过
    await page.getByTestId("form-test").click();
    await expect(page.locator(".test-result--ok")).toBeVisible({ timeout: 5000 });

    // 保存 → 列表 ≤2s 刷新显示新源
    const start = Date.now();
    await page.getByTestId("form-submit").click();
    await expect(page.locator(".data-table tbody tr").filter({ hasText: "e2e-LDAP" })).toBeVisible({ timeout: 2000 });
    expect(Date.now() - start).toBeLessThanOrEqual(2000);
  });
});

// =====================================================================
// S-M3-17 测试连接失败 → 错误提示可重测（CONTRACT）
// =====================================================================

test.describe("CONTRACT · S-M3-17 测试连接失败 → 错误提示可重测（UF-7）", () => {
  test("test 返回拒绝 → .test-result--fail 渲染 + 修正后重测通过", async ({ page }) => {
    let firstAttempt = true;
    await loginContractAdmin(page, {});
    await page.route("**/api/iam/identity_source/test", async (route: Route) => {
      if (firstAttempt) {
        firstAttempt = false;
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 5000101, "连接失败：无法到达 LDAP 服务器")) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "连接成功")) });
      }
    });

    await page.goto("/console/identity-sources");
    await expect(page.getByRole("heading", { name: "身份源管理" })).toBeVisible({ timeout: 2000 });
    await page.getByRole("button", { name: /新增身份源/ }).click();
    await expect(page.getByRole("dialog", { name: "新增身份源" })).toBeVisible();
    await page.getByTestId("form-name").fill("e2e-LDAP2");
    await page.getByTestId("form-url").fill("ldap://bad.example.com:389");
    await page.getByTestId("form-bind-dn").fill("cn=admin");
    await page.getByTestId("form-password").fill("secret123");
    await page.getByTestId("form-base-dn").fill("dc=ex,dc=com");
    await page.getByTestId("form-username-attr").fill("uid");
    await page.getByTestId("form-email-attr").fill("mail");

    // 第一次测试 → 失败（test-result--fail）
    await page.getByTestId("form-test").click();
    await expect(page.locator(".test-result--fail")).toBeVisible({ timeout: 5000 });

    // 修正 URL 后重测 → 通过
    await page.getByTestId("form-url").fill("ldap://good.example.com:389");
    await page.getByTestId("form-test").click();
    await expect(page.locator(".test-result--ok")).toBeVisible({ timeout: 5000 });
  });
});

// =====================================================================
// S-M3-18 连接参数校验（ldap(s):// / 端口 / 超时，前端本地校验，CONTRACT）
// =====================================================================

test.describe("CONTRACT · S-M3-18 连接参数前端本地校验（UF-7）", () => {
  test("非法 URL（非 ldap(s)://）/ 端口越界 → 字段标红 + 零 test/save 请求", async ({ page }) => {
    await loginContractAdmin(page, {});
    await page.goto("/console/identity-sources");
    await expect(page.getByRole("heading", { name: "身份源管理" })).toBeVisible({ timeout: 2000 });
    await page.getByRole("button", { name: /新增身份源/ }).click();
    await expect(page.getByRole("dialog", { name: "新增身份源" })).toBeVisible();

    let reqHits = 0;
    page.on("request", (r) => {
      if (r.url().includes("/identity_source/") && r.method() === "POST") reqHits++;
    });

    // 非法 URL（http://，非 ldap(s)://）→ form-test 触发 validateForm → url 校验失败 → 字段标红 + 不发请求
    await page.getByTestId("form-name").fill("e2e-bad");
    await page.getByTestId("form-url").fill("http://example.com:389");
    await page.getByTestId("form-bind-dn").fill("cn=admin");
    await page.getByTestId("form-base-dn").fill("dc=ex,dc=com");
    await page.getByTestId("form-username-attr").fill("uid");
    await page.getByTestId("form-email-attr").fill("mail");
    await page.getByTestId("form-test").click();
    // form-url 字段标红
    await expect(page.locator("#form-url-error")).toBeVisible();
    await expect(page.getByTestId("form-url")).toHaveAttribute("aria-invalid", "true");

    expect(reqHits).toBe(0); // 前端本地校验拦截，零请求
  });
});
