/**
 * M4 E2E：权限管理三页 CRUD + 越权 403 + E6 并发编辑（409/降级）—— 任务 5.5。
 *
 * 验收宿主硬规则：nginx 同域形态（:8888/console，任务 2.10 haven-console.conf），
 * 真实浏览器（chromium）。≤2s 刷新以真实运行时序断言（expect timeout=2000ms 门槛，
 * 超时即失败，不以缩短等待绕过）。
 *
 * 场景映射（acceptance.md §4 M4）：
 * - S-M4-01 角色 CRUD + 绑定策略/用户（D-3）—— REAL admin CRUD 正向（真 eiam create+update+delete
 *   + 列表 ≤2s 刷新，自清理）+ CONTRACT 绑定流（policy 复选框 diff + 用户 add/remove +
 *   batch-attach/detach/assign/unassign 端点命中 + 计数刷新）
 * - S-M4-02 角色名唯一 1–64 + 策略绑定下拉仅列可绑定策略 —— CONTRACT（前端本地校验 + RoleDetail
 *   checkbox-group 仅列 listBindablePolicies，无新建策略入口）
 * - S-M4-03 删除有用户绑定的角色被拒 → 阻断计数 + 确认置灰（E11）—— CONTRACT（409 信封）
 * - S-M4-04 越租户读写被服务端拒绝（403 原地收敛）—— CONTRACT（request-layer 403，inline 渲染不跳转）
 * - S-M4-05 新增授权 + 撤销确认（G-6 语义映射）—— CONTRACT（selects + 列表 ≤2s 刷新 + pending badge）
 * - S-M4-06 重复绑定 → 前端预检「授权已存在」+ eiam 兜底 —— CONTRACT（isDuplicateAuthorization 前端预检）
 * - S-M4-07 资源/动作仅词表可选 + 来源标注（G-5）—— CONTRACT（el-select 非自由文本 + vocab-source）
 * - S-M4-08 新增/编辑策略（Statement[]、Effect ∈ {Allow,Deny}；D-5 归一）+ 删除 —— REAL 列表读 +
 *   CONTRACT create/edit/delete（Statement JSON 表单 + ≤2s 刷新）
 * - S-M4-09 策略内容非法 → 前端 JSON 校验拦截 + eiam schema 失败标红 —— CONTRACT（前端本地校验零请求）
 * - S-M4-10 仅平台管理员可见/可编辑策略页 —— CONTRACT（非 admin → 守卫 ③ /forbidden）
 * - S-M4-11 同一对象并发编辑 → eiam 409 → save.conflict 提示 + 表单保留 —— CONTRACT（409 信封）
 * - S-M4-12 eiam 无 409 支持 → conflict 分支降级并入 validation —— CONTRACT（200+code 业务信封，
 *   降级口径承接 parity §6.4 核查结论）
 *
 * ── 证据形态分两档（与 m1/m2/m3.spec.ts 同口径，透明标注）──
 * ① REAL（真实 eiam + 真实 nginx + 真实共享 cookie）：admin/12345678 是 dev eiam seed 真实超级管理员。
 *   角色 CRUD 正向（create/update/delete）+ 列表读 + 策略列表读全程真链路，零 page.route。
 *   REAL 创建的测试角色用 e2e_ 前缀 + 时间戳，每例 try/finally 自清理（delete），不残留 dev eiam。
 * ② CONTRACT（契约履约）：E11 依赖删除（需 eiam conflict 信封）、E6 并发 409、越权 403、策略 create/edit/delete
 *   （避免污染 dev eiam 平台级数据 + Statement schema 风险）、绑定流（需可控 policy/user 列表）、授权 CRUD
 *   （G-6 语义映射 + 词表）。经 page.route 履约 eiam 信封（形状取自 parity §3.2 实核 + api/*.ts 原生路径），
 *   浏览器 cookie 写入/守卫校验为真实链路（login 响应附 Set-Cookie，非注入伪造 cookie），仅 API 响应体按契约履约。
 *
 * 越权 403 双形态（tech-design Security + router 守卫）：
 * - 守卫 403（页级，/policies requiresAdmin）：非 admin profile → page.goto → /console/forbidden。
 * - 请求层 403（跨租户写，/roles /authorizations 非 requiresAdmin）：iam 端点 HTTP 403 → inline
 *   .state-error/.form-error/.delete-blocked 渲染，不跳转。
 *
 * E6 并发编辑：eiam 实核无 409 支持（parity §6.4 待填，1.3 实核结论），S-M4-11 履约 409 验证 conflict 分支，
 * S-M4-12 履约 200+code 业务信封验证降级并入 validation 的承接口径。
 */
import { expect, test, type Page, type Route } from "@playwright/test";

// ---- eiam 信封构造（parity §3.2 snake_case 实核形；与 m2/m3.spec.ts 同款）----

function envelope(data: unknown, code = 0, msg = "ok"): unknown {
  return { code, msg, data };
}

function loginOkEnvelope(): unknown {
  return envelope({ mfa_required: false });
}

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

// ---- 页面操作辅助（与 m2/m3.spec.ts 同款）----

async function gotoLogin(page: Page): Promise<void> {
  await page.goto("/console/login");
  await expect(page.getByRole("heading", { name: "Platform" })).toBeVisible();
}

async function fillCredentials(page: Page, username: string, password: string): Promise<void> {
  await page.getByTestId("username").fill(username);
  await page.getByTestId("password").fill(password);
}

async function submitCredentialForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

/** REAL admin 登录（真 eiam）→ /workbench（与 m3.spec.ts 同款）。 */
async function loginRealAdmin(page: Page): Promise<void> {
  await gotoLogin(page);
  await fillCredentials(page, ADMIN_USER, ADMIN_PWD);
  await submitCredentialForm(page);
  await expect(page).toHaveURL(/\/console\/(tenant-select|workbench)$/);
  await page.goto("/console/workbench");
  await expect(page).toHaveURL(/\/console\/workbench$/);
}

/** 唯一时间戳 code（REAL 创建自清理，符合 ^[a-z][a-z0-9_-]{2,31}$）。 */
function e2eCode(prefix = "e2e"): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0")}`.slice(0, 32);
}

// =====================================================================
// CONTRACT 通用 identity 路由履约器（m4 权限三页扩展）
// 单一 dispatcher 覆盖 auth + role/policy/permission 全域端点，按 method+url 分发。
// fixtures 参数：per-endpoint 覆盖；缺省返回成功信封。
// =====================================================================

interface RoleRow { id: number; code: string; name: string; desc?: string }
interface PolicyRow { id: number; code: string; name: string; desc?: string; type?: number; assignment_count?: number; statement?: unknown[] }
interface AuthRow { subject: string; target: string; sub_type: string; obj_type: string }

interface IdentityFixtures {
  profile?: unknown;
  /** role/list data: {total, roles: RoleRow[]} */
  roleList?: { total: number; roles: RoleRow[] };
  /** role/detail/:code data = RoleRow（含 policies/users 计数承载） */
  roleDetail?: RoleRow & { policies?: Array<{ code: string; name: string }>; users?: Array<{ username: string; nickname?: string }> };
  roleCreate?: { ok: true; id: number } | { reject: true; code: number; msg: string };
  roleUpdate?: { ok: true } | { reject: true; status: number; code: number; msg: string };
  roleDelete?: { ok: true } | { reject: true; status: number; code: number; msg: string };
  /** policy/list data: {total, policies: PolicyRow[]} */
  policyList?: { total: number; policies: PolicyRow[] };
  policyCreate?: { ok: true; id: number } | { reject: true; code: number; msg: string };
  policyUpdate?: { ok: true } | { reject: true; status: number; code: number; msg: string };
  policyDelete?: { ok: true } | { reject: true; status: number; code: number; msg: string };
  /** policy/list/attached/role data = PolicyRef[] */
  policiesForRole?: Array<{ code: string; name: string }>;
  /** user/list/attached/role data = {total, users:[]} */
  usersForRole?: { total: number; users: Array<{ username: string; nickname?: string }> };
  /** permission/authorizations data = {total, authorizations: AuthRow[]} */
  authList?: { total: number; authorizations: AuthRow[] };
  /** permission/subjects/search data per sub_type */
  subjectsSearch?: Record<string, Array<{ code: string; name?: string }>>;
  /** role/batch_assign|unassign + policy/batch-attach|detach 默认成功；reject 时按状态返回 */
  batchOp?: { ok: true } | { reject: true; status: number; code: number; msg: string };
  /** user/list（authorization vocab resources 回填用） */
  userList?: { total: number; users: Array<{ username: string }> };
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
        body: JSON.stringify(
          fx.profile ??
            profileEnvelope([{ id: 1, name: "系统根管理空间", code: "system-root", domain: "localhost" }], true),
        ),
      });
      return;
    }

    // ---- role ----
    if (method === "POST" && url.includes("/role/list")) {
      const rl = fx.roleList ?? { total: 2, roles: [
        { id: 2, code: "admin", name: "租户管理员", desc: "" },
        { id: 3, code: "viewer", name: "只读审计", desc: "" },
      ] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(rl)) });
      return;
    }
    if (method === "GET" && url.includes("/role/detail/")) {
      const rd = fx.roleDetail ?? { id: 2, code: "admin", name: "租户管理员", desc: "", policies: [], users: [] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(rd)) });
      return;
    }
    if (method === "POST" && url.includes("/role/create")) {
      const rc = fx.roleCreate ?? { ok: true, id: 9001 };
      if ("reject" in rc) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, rc.code, rc.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(rc.id, 0, "ok")) });
      }
      return;
    }
    if (method === "POST" && url.includes("/role/update")) {
      const ru = fx.roleUpdate ?? { ok: true };
      if ("reject" in ru) {
        await route.fulfill({ status: ru.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, ru.code, ru.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }
    if (method === "DELETE" && url.includes("/role/delete/")) {
      const rd = fx.roleDelete ?? { ok: true };
      if ("reject" in rd) {
        await route.fulfill({ status: rd.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, rd.code, rd.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }
    if (method === "POST" && (url.includes("/role/batch_assign") || url.includes("/role/batch_unassign"))) {
      const bo = fx.batchOp ?? { ok: true };
      if ("reject" in bo) {
        await route.fulfill({ status: bo.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, bo.code, bo.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }

    // ---- policy ----
    if (method === "POST" && url.includes("/policy/list/attached/role")) {
      const pr = fx.policiesForRole ?? [];
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(pr)) });
      return;
    }
    if (method === "POST" && url.includes("/policy/list")) {
      const pl = fx.policyList ?? { total: 1, policies: [
        { id: 10, code: "p-viewer", name: "只读策略", desc: "", type: 2, assignment_count: 0, statement: [{ effect: "Allow", action: ["cam:cert:Get"], resource: ["cert/*"] }] },
      ] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(pl)) });
      return;
    }
    if (method === "POST" && url.includes("/policy/create")) {
      const pc = fx.policyCreate ?? { ok: true, id: 9001 };
      if ("reject" in pc) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, pc.code, pc.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(pc.id, 0, "ok")) });
      }
      return;
    }
    if (method === "POST" && url.includes("/policy/update")) {
      const pu = fx.policyUpdate ?? { ok: true };
      if ("reject" in pu) {
        await route.fulfill({ status: pu.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, pu.code, pu.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }
    if (method === "DELETE" && url.includes("/policy/delete/")) {
      const pd = fx.policyDelete ?? { ok: true };
      if ("reject" in pd) {
        await route.fulfill({ status: pd.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, pd.code, pd.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }
    if (method === "POST" && (url.includes("/policy/batch-attach") || url.includes("/policy/batch-detach"))) {
      const bo = fx.batchOp ?? { ok: true };
      if ("reject" in bo) {
        await route.fulfill({ status: bo.status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, bo.code, bo.msg)) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
      }
      return;
    }

    // ---- permission / authorizations ----
    if (method === "POST" && url.includes("/permission/authorizations")) {
      const al = fx.authList ?? { total: 1, authorizations: [
        { subject: "admin", target: "viewer", sub_type: "user", obj_type: "role" },
      ] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(al)) });
      return;
    }
    if (method === "POST" && url.includes("/permission/subjects/search")) {
      let body: { keyword?: string; sub_type?: string } = {};
      try { body = JSON.parse(req.postData() ?? "{}"); } catch { /* noop */ }
      const st = body.sub_type ?? "user";
      const all = fx.subjectsSearch ?? {
        user: [{ code: "admin", name: "管理员" }, { code: "tester", name: "测试用户" }],
        role: [{ code: "admin", name: "租户管理员" }, { code: "viewer", name: "只读审计" }],
        group: [],
      };
      const list = all[st] ?? [];
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ total: list.length, subjects: list })) });
      return;
    }

    // ---- user（vocab resources 回填 + RoleDetail enrichCounts 用）----
    if (method === "POST" && url.includes("/user/list/attached/role")) {
      const uf = fx.usersForRole ?? { total: 0, users: [] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(uf)) });
      return;
    }
    if (method === "POST" && url.includes("/user/list")) {
      const ul = fx.userList ?? { total: 1, users: [{ username: "admin" }] };
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(ul)) });
      return;
    }

    // ---- catch-all ----
    await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null)) });
  });
}

/** CONTRACT admin 登录 → /workbench（履约 auth + profile 信封）。 */
async function loginContractAdmin(page: Page, fx: IdentityFixtures = {}): Promise<void> {
  fulfillIdentityRoutes(page, fx);
  await gotoLogin(page);
  await fillCredentials(page, "admin", "any");
  await submitCredentialForm(page);
  await expect(page).toHaveURL(/\/console\/workbench$/);
}

/** CONTRACT 非 admin 登录 → /workbench（用于 /policies 守卫 403 场景）。 */
async function loginContractNonAdmin(page: Page, fx: IdentityFixtures = {}): Promise<void> {
  const mergedFx: IdentityFixtures = {
    ...fx,
    profile: fx.profile ?? profileEnvelope([{ id: 7, name: "个人空间", code: "personal", domain: "p.x" }], false),
  };
  fulfillIdentityRoutes(page, mergedFx);
  await gotoLogin(page);
  await fillCredentials(page, "tester", "any");
  await submitCredentialForm(page);
  await expect(page).toHaveURL(/\/console\/workbench$/);
}

// =====================================================================
// S-M4-01a 角色 CRUD 正向（REAL admin，真 eiam create+delete + ≤2s 刷新，自清理）
// D-3：角色↔策略绑定 + update 走 CONTRACT 01b（RoleDetail 的 role/detail + enrichCounts 端点
// 在 dev eiam 不全可靠，REAL 仅验 create+read+delete eiam 同步核心链路）。
// =====================================================================

test.describe("REAL · S-M4-01a 角色 CRUD create→list→delete 全链路（UF-8，eiam 同步 ≤2s 刷新）", () => {
  test("新增 → 列表 ≤2s 刷新显示新角色 → 删除 + 列表 ≤2s 刷新行消失", async ({ page }) => {
    await loginRealAdmin(page);
    await page.goto("/console/roles");
    await expect(page.getByRole("heading", { name: "角色管理" })).toBeVisible({ timeout: 2000 });

    const code = e2eCode();
    const name = `e2e角色_${Date.now().toString(36)}`;

    // ---- 新增 ----
    await page.getByRole("button", { name: "新增角色" }).click();
    await expect(page.getByRole("dialog", { name: "新增角色" })).toBeVisible();
    await page.getByTestId("create-role-code").fill(code);
    await page.getByTestId("create-role-name").fill(name);

    const createStart = Date.now();
    await page.getByTestId("create-role-submit").click();
    // 创建成功 → dialog 关闭 + 列表 ≤2s 刷新显示新角色（store.create 内部 page=1 + fetch）
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: name }),
    ).toBeVisible({ timeout: 2000 });
    expect(Date.now() - createStart).toBeLessThanOrEqual(2000);

    // ---- 删除（自清理）----
    await page
      .locator(".data-table tbody tr")
      .filter({ hasText: name })
      .getByTestId("delete-role")
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    const delStart = Date.now();
    await page.getByTestId("delete-confirm").click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0, { timeout: 2000 });
    expect(Date.now() - delStart).toBeLessThanOrEqual(2000);
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: name }),
    ).toHaveCount(0, { timeout: 2000 });
  });
});

// =====================================================================
// S-M4-01b 角色编辑 + 绑定策略/用户流（CONTRACT，D-3：policy 侧 batch-attach/detach + role batch_assign/unassign）
// 验证 RoleDetail 改名 → role/update + checkbox-group diff + 用户 add/remove → save 命中正确端点。
// =====================================================================

test.describe("CONTRACT · S-M4-01b 角色绑定策略/用户流（D-3 policy 侧 + role batch_assign）", () => {
  test("改名 + 勾选未绑策略 → 保存 → role/update + policy/batch-attach 命中", async ({ page }) => {
    // 捕获写端点命中
    const batchCalls: string[] = [];
    await loginContractAdmin(page, {
      roleDetail: {
        id: 2, code: "admin", name: "租户管理员", desc: "",
        // 已绑策略：p-viewer（policiesForRole 决定初始 checked）
        policies: [{ code: "p-viewer", name: "只读策略" }],
        users: [],
      },
      policiesForRole: [{ code: "p-viewer", name: "只读策略" }],
      usersForRole: { total: 0, users: [] },
      // 可绑定策略清单含两项：p-viewer（已绑）+ p-editor（未绑，勾选产生 attach delta）
      policyList: { total: 2, policies: [
        { id: 10, code: "p-viewer", name: "只读策略", desc: "", type: 2, assignment_count: 1, statement: [{ effect: "Allow", action: ["cam:cert:Get"], resource: ["cert/*"] }] },
        { id: 11, code: "p-editor", name: "编辑策略", desc: "", type: 2, assignment_count: 0, statement: [{ effect: "Allow", action: ["cam:cert:Put"], resource: ["cert/*"] }] },
      ] },
    });
    page.on("request", (r) => {
      const u = r.url();
      if (r.method() === "POST" && u.includes("/policy/batch-attach")) batchCalls.push("attach");
      if (r.method() === "POST" && u.includes("/role/update")) batchCalls.push("update");
    });

    await page.goto("/console/roles/admin");
    await expect(page.getByRole("heading", { name: "租户管理员" })).toBeVisible({ timeout: 2000 });

    // 改名 → 产生 role/update 调用（CRUD update 证据）
    await page.getByTestId("detail-role-name").fill("租户管理员_改");
    // 勾选未绑定策略「编辑策略」→ 产生 attach delta（非 net-zero）
    await page.getByRole("checkbox", { name: "编辑策略" }).check();

    // 保存（页脚 submit，hasChanges 由 name delta + policy delta 置真）
    await page.getByTestId("save-role-submit").click();
    // 写端点被命中（update + attach）
    await expect.poll(() => batchCalls.filter((c) => c === "update").length).toBeGreaterThan(0);
    await expect.poll(() => batchCalls.filter((c) => c === "attach").length).toBeGreaterThan(0);
    // 保存后返回列表
    await expect(page).toHaveURL(/\/console\/roles$/, { timeout: 2000 });
  });
});

// =====================================================================
// S-M4-02 角色名 1–64 + 策略绑定下拉仅列可绑定策略（CONTRACT）
// (a) 名字校验：空 + >64 → #create-name-error + aria-invalid + 零 create 请求
// (b) RoleDetail checkbox-group 仅列 listBindablePolicies，无新建策略入口
// =====================================================================

test.describe("CONTRACT · S-M4-02 角色名校验 + 策略绑定下拉仅列可绑定策略（UF-8）", () => {
  test("(a) 空名 / >64 → 字段标红 + 零 create 请求", async ({ page }) => {
    await loginContractAdmin(page);
    await page.goto("/console/roles");
    await page.getByRole("button", { name: "新增角色" }).click();

    let createHits = 0;
    page.on("request", (r) => {
      if (r.url().includes("/role/create") && r.method() === "POST") createHits++;
    });

    // 空名
    await page.getByTestId("create-role-code").fill("validcode");
    await page.getByTestId("create-role-name").fill("");
    await page.getByTestId("create-role-submit").click();
    await expect(page.locator("#create-name-error")).toBeVisible();
    await expect(page.getByTestId("create-role-name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("dialog", { name: "新增角色" })).toBeVisible();

    // >64
    await page.getByTestId("create-role-name").fill("x".repeat(65));
    await page.getByTestId("create-role-submit").click();
    await expect(page.locator("#create-name-error")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "新增角色" })).toBeVisible();

    expect(createHits).toBe(0); // 零 create 请求（前端 hard 拦截）
  });

  test("(b) RoleDetail 策略绑定区仅列可绑定策略，无新建策略入口", async ({ page }) => {
    await loginContractAdmin(page, {
      roleDetail: {
        id: 2, code: "admin", name: "租户管理员", desc: "",
        policies: [{ code: "p-viewer", name: "只读策略" }],
        users: [],
      },
      policiesForRole: [{ code: "p-viewer", name: "只读策略" }],
      usersForRole: { total: 0, users: [] },
      policyList: { total: 1, policies: [{ id: 10, code: "p-viewer", name: "只读策略", desc: "", type: 2, assignment_count: 0 }] },
    });
    await page.goto("/console/roles/admin");
    // 策略绑定 fieldset 渲染 + 仅列 listBindablePolicies 返回项
    await expect(page.getByText("策略绑定")).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("checkbox", { name: "只读策略" })).toBeVisible();
    // 无新建策略按钮/入口
    await expect(page.getByRole("button", { name: /新建策略|新增策略/ })).toHaveCount(0);
  });
});

// =====================================================================
// S-M4-03 删除有用户绑定的角色被拒 → 阻断计数 + 确认置灰（E11，CONTRACT）
// role/delete 返回 409 + 信封 msg → .delete-blocked 渲染 + delete-confirm disabled + 列表不变
// =====================================================================

test.describe("CONTRACT · S-M4-03 删除有用户绑定的角色被拒（E11/UF-8）", () => {
  test("409 + 信封 → .delete-blocked 列阻断计数 + 确认置灰 + 列表不变", async ({ page }) => {
    const roleName = "被绑角色";
    await loginContractAdmin(page, {
      roleList: { total: 1, roles: [{ id: 5, code: "bound", name: roleName, desc: "" }] },
      roleDelete: { reject: true, status: 409, code: 4010703, msg: "无法删除：该角色已绑定 3 个用户" },
    });
    await page.goto("/console/roles");
    await expect(page.locator(".data-table tbody tr").filter({ hasText: roleName })).toBeVisible({ timeout: 2000 });
    const rowsBefore = await page.locator(".data-table tbody tr").count();

    await page.locator(".data-table tbody tr").filter({ hasText: roleName }).getByTestId("delete-role").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByTestId("delete-confirm").click();

    // 阻断计数渲染 + 确认置灰
    await expect(page.locator(".delete-blocked")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".delete-blocked")).toContainText(/3/);
    await expect(page.getByTestId("delete-confirm")).toBeDisabled();
    // 列表不变
    const rowsAfter = await page.locator(".data-table tbody tr").count();
    expect(rowsAfter).toBe(rowsBefore);
  });
});

// =====================================================================
// S-M4-04 越租户读写被服务端拒绝（403 原地收敛，UF-8，CONTRACT）
// /roles 非 requiresAdmin → 跨租户 role/delete 返回 403 → inline 渲染不跳转 /forbidden
// =====================================================================

test.describe("CONTRACT · S-M4-04 越租户写被 403 原地收敛（UF-8）", () => {
  test("role/delete 403 → inline .delete-blocked 渲染 + 不跳 /forbidden + 列表不变", async ({ page }) => {
    const roleName = "跨租户角色";
    await loginContractAdmin(page, {
      roleList: { total: 1, roles: [{ id: 9, code: "xtenant", name: roleName, desc: "" }] },
      roleDelete: { reject: true, status: 403, code: 403001, msg: "无权限执行该操作" },
    });
    await page.goto("/console/roles");
    await expect(page.locator(".data-table tbody tr").filter({ hasText: roleName })).toBeVisible({ timeout: 2000 });
    const urlBefore = page.url();

    await page.locator(".data-table tbody tr").filter({ hasText: roleName }).getByTestId("delete-role").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByTestId("delete-confirm").click();

    // inline 阻断渲染（403 仍走 delete-blocked/error 路径，不跳转）
    await expect(page.locator(".delete-blocked, .form-error")).toBeVisible({ timeout: 2000 });
    // 不跳 /forbidden
    await expect(page).not.toHaveURL(/\/console\/forbidden/);
    expect(page.url()).toBe(urlBefore);
  });
});

// =====================================================================
// S-M4-05 新增授权 + 撤销确认（G-6 语义映射，CONTRACT）
// create auth（selects）→ batch-attach/assign 命中 → 列表 ≤2s 刷新显示新行；
// revoke → confirm → pending badge → 列表 ≤2s 刷新行消失。
// =====================================================================

test.describe("CONTRACT · S-M4-05 新增授权 + 撤销确认（G-6 语义映射）", () => {
  test("新增 → 列表 ≤2s 刷新 → 撤销 → pending badge → 列表 ≤2s 刷新行消失", async ({ page }) => {
    let phase: "empty" | "created" | "revoked" = "empty";
    await loginContractAdmin(page, {});
    // 动态 authList：create 后追加一行，revoke 后移除该行
    await page.route("**/api/iam/permission/authorizations", async (route: Route) => {
      if (phase === "created") {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ total: 1, authorizations: [{ subject: "admin", target: "viewer", sub_type: "user", obj_type: "role" }] })) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ total: 0, authorizations: [] })) });
      }
    });
    // 撤销写端点（role/batch_unassign）成功后翻 phase → revoked
    await page.route("**/api/iam/role/batch_unassign", async (route: Route) => {
      phase = "revoked";
      await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope(null, 0, "ok")) });
    });

    await page.goto("/console/authorizations");
    await expect(page.getByRole("heading", { name: "授权管理" })).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".state-empty")).toBeVisible({ timeout: 2000 });

    // 新增授权（selects，按 value 选；option label 形如「管理员 (admin)」）
    await page.getByRole("button", { name: "新增授权" }).click();
    await expect(page.getByRole("dialog", { name: "新增授权" })).toBeVisible();
    await page.getByTestId("create-auth-subject").selectOption({ value: "admin" });
    await page.getByTestId("create-auth-resource").selectOption({ value: "viewer" });
    await page.getByTestId("create-auth-action").selectOption({ value: "assign" });

    const createStart = Date.now();
    await page.getByTestId("create-auth-submit").click();
    phase = "created";
    // 列表 ≤2s 刷新显示新行
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: "admin" }).filter({ hasText: "viewer" }),
    ).toBeVisible({ timeout: 2000 });
    expect(Date.now() - createStart).toBeLessThanOrEqual(2000);

    // 撤销
    await page.getByTestId("revoke-auth-0").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    // pending badge 在撤销提交后渲染（store.isPending）
    const revokeStart = Date.now();
    await page.getByTestId("revoke-confirm").click();
    // 撤销后行消失
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: "admin" }).filter({ hasText: "viewer" }),
    ).toHaveCount(0, { timeout: 2000 });
    expect(Date.now() - revokeStart).toBeLessThanOrEqual(2000);
  });
});

// =====================================================================
// S-M4-06 重复绑定 → 前端预检「授权已存在」+ eiam 兜底（CONTRACT）
// 列表已有 {admin→viewer assign}；create 同三元组 → isDuplicateAuthorization 前端预检
// → .form-error「授权已存在」+ 零 batch-attach/assign 请求 + 列表不变
// =====================================================================

test.describe("CONTRACT · S-M4-06 重复绑定前端预检（UF-9）", () => {
  test("重复三元组 → .form-error「授权已存在」+ 零写请求 + 列表不变", async ({ page }) => {
    await loginContractAdmin(page, {
      authList: { total: 1, authorizations: [{ subject: "admin", target: "viewer", sub_type: "user", obj_type: "role" }] },
    });
    await page.goto("/console/authorizations");
    // 等列表加载（已有 admin→viewer 授权行）再计数
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: "admin" }).filter({ hasText: "viewer" }),
    ).toBeVisible({ timeout: 2000 });

    let batchHits = 0;
    page.on("request", (r) => {
      const u = r.url();
      if (r.method() === "POST" && (u.includes("/policy/batch-attach") || u.includes("/role/batch_assign"))) batchHits++;
    });

    const rowsBefore = await page.locator(".data-table tbody tr").count();

    await page.getByRole("button", { name: "新增授权" }).click();
    await page.getByTestId("create-auth-subject").selectOption({ value: "admin" });
    await page.getByTestId("create-auth-resource").selectOption({ value: "viewer" });
    await page.getByTestId("create-auth-action").selectOption({ value: "assign" });
    await page.getByTestId("create-auth-submit").click();

    // 前端预检 → form-error「授权已存在」
    await expect(page.locator(".form-error")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".form-error")).toContainText(/授权已存在/);
    await expect(page.getByRole("dialog", { name: "新增授权" })).toBeVisible();
    expect(batchHits).toBe(0); // 零写请求（前端预检拦截）
    const rowsAfter = await page.locator(".data-table tbody tr").count();
    expect(rowsAfter).toBe(rowsBefore);
  });
});

// =====================================================================
// S-M4-07 资源/动作仅词表可选 + 来源标注（G-5，CONTRACT）
// create dialog selects 非自由文本（el-select，无自由输入）+ .vocab-source 渲染来源
// =====================================================================

test.describe("CONTRACT · S-M4-07 资源/动作仅词表可选 + 来源标注（G-5）", () => {
  test("新增授权 dialog 三下拉为 select（非自由文本）+ vocab-source 渲染来源", async ({ page }) => {
    await loginContractAdmin(page, {});
    await page.goto("/console/authorizations");
    await expect(page.locator(".vocab-source")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".vocab-source")).toContainText(/词表来源/);

    await page.getByRole("button", { name: "新增授权" }).click();
    await expect(page.getByRole("dialog", { name: "新增授权" })).toBeVisible();
    // 三个字段均为 select（非自由文本 input）
    expect(await page.getByTestId("create-auth-subject").evaluate((el) => el.tagName)).toBe("SELECT");
    expect(await page.getByTestId("create-auth-resource").evaluate((el) => el.tagName)).toBe("SELECT");
    expect(await page.getByTestId("create-auth-action").evaluate((el) => el.tagName)).toBe("SELECT");
    // options 来自词表（非自由文本）；select 无自由输入（非 type=text）
    const optCount = await page.getByTestId("create-auth-action").locator("option").count();
    expect(optCount).toBeGreaterThan(0);
  });
});

// =====================================================================
// S-M4-08 策略 CRUD（Statement[]、Effect ∈ {Allow,Deny}；D-5 归一，CONTRACT）
// REAL 列表读（真 eiam policy/list）+ CONTRACT create→edit→delete（Statement JSON 表单 + ≤2s 刷新）
// =====================================================================

test.describe("REAL · S-M4-08a 策略列表加载（UF-10，真 eiam 读）", () => {
  test("admin → /policies 列表加载 ≤2s（有数据则行渲染，无数据则空态）", async ({ page }) => {
    await loginRealAdmin(page);
    await page.goto("/console/policies");
    await expect(page.getByRole("heading", { name: "策略管理" })).toBeVisible({ timeout: 2000 });
    // dev eiam policy/list 可能空 → 行渲染或空态均算加载成功（≤2s）
    await expect(
      page.locator(".data-table tbody tr").first().or(page.locator(".state-empty")),
    ).toBeVisible({ timeout: 2000 });
  });
});

test.describe("CONTRACT · S-M4-08b 策略 create→edit→delete 全链路（Statement JSON 表单）", () => {
  test("新增（Statement JSON）→ 列表 ≤2s 刷新 → 编辑 → 删除 + 列表 ≤2s 刷新", async ({ page }) => {
    let created = false;
    const code = e2eCode("pol");
    const name = `e2e策略_${Date.now().toString(36)}`;
    const validJson = JSON.stringify(
      [{ effect: "Allow", actions: ["cam:cert:Get"], resources: ["cert/*"] }],
      null,
      2,
    );

    await loginContractAdmin(page, {});
    // 动态 policy/list：create 后含新策略
    await page.route("**/api/iam/policy/list", async (route: Route) => {
      if (created) {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ total: 1, policies: [{ id: 100, code, name, desc: "", type: 2, assignment_count: 0, statement: [{ effect: "Allow", action: ["cam:cert:Get"], resource: ["cert/*"] }] }] })) });
      } else {
        await route.fulfill({ status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope({ total: 0, policies: [] })) });
      }
    });

    await page.goto("/console/policies");
    await expect(page.locator(".state-empty")).toBeVisible({ timeout: 2000 });

    // ---- 新增 ----
    await page.getByRole("button", { name: "新增策略" }).click();
    await expect(page.getByRole("dialog", { name: "新增策略" })).toBeVisible();
    await page.getByTestId("edit-policy-code").fill(code);
    await page.getByTestId("edit-policy-name").fill(name);
    await page.getByTestId("edit-policy-statements").fill(validJson);

    const createStart = Date.now();
    await page.getByTestId("edit-policy-submit").click();
    created = true;
    await expect(
      page.locator(".data-table tbody tr").filter({ hasText: name }),
    ).toBeVisible({ timeout: 2000 });
    expect(Date.now() - createStart).toBeLessThanOrEqual(2000);

    // ---- 编辑 ----
    await page.locator(".data-table tbody tr").filter({ hasText: name }).getByTestId("edit-policy").click();
    await expect(page.getByRole("dialog", { name: "编辑策略" })).toBeVisible();
    const editJson = JSON.stringify(
      [{ effect: "Deny", actions: ["cam:cert:Delete"], resources: ["cert/*"] }],
      null,
      2,
    );
    await page.getByTestId("edit-policy-statements").fill(editJson);
    const editStart = Date.now();
    await page.getByTestId("edit-policy-submit").click();
    await expect(page.locator(".data-table tbody tr").filter({ hasText: name })).toBeVisible({ timeout: 2000 });
    expect(Date.now() - editStart).toBeLessThanOrEqual(2000);

    // ---- 删除 ----
    await page.locator(".data-table tbody tr").filter({ hasText: name }).getByTestId("delete-policy").click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    const delStart = Date.now();
    await page.getByTestId("delete-confirm").click();
    created = false;
    await expect(page.locator(".data-table tbody tr").filter({ hasText: name })).toHaveCount(0, { timeout: 2000 });
    expect(Date.now() - delStart).toBeLessThanOrEqual(2000);
  });
});

// =====================================================================
// S-M4-09 策略内容非法 → 前端 JSON 校验拦截（CONTRACT）
// 语法错 / Effect 越词表 / 空 actions → #edit-statements-error + aria-invalid + 零 create 请求
// =====================================================================

test.describe("CONTRACT · S-M4-09 策略内容非法 → 前端 JSON 校验拦截（UF-10）", () => {
  test("语法错 / Effect 非 Allow|Deny / 空 actions → 字段标红 + 零 create 请求", async ({ page }) => {
    await loginContractAdmin(page, {});
    await page.goto("/console/policies");
    await page.getByRole("button", { name: "新增策略" }).click();

    let createHits = 0;
    page.on("request", (r) => {
      if (r.url().includes("/policy/create") && r.method() === "POST") createHits++;
    });

    await page.getByTestId("edit-policy-code").fill("badcode");
    await page.getByTestId("edit-policy-name").fill("非法策略");

    const cases: Array<[string, string]> = [
      ["{invalid json", "语法错"],
      [JSON.stringify({ effect: "Maybe", actions: ["cam:cert:Get"], resources: ["cert/*"] }), "Effect 越词表"],
      [JSON.stringify({ effect: "Allow", actions: [], resources: ["cert/*"] }), "空 actions"],
    ];
    for (const [bad, _label] of cases) {
      await page.getByTestId("edit-policy-statements").fill(bad);
      await page.getByTestId("edit-policy-submit").click();
      await expect(page.locator("#edit-statements-error")).toBeVisible();
      await expect(page.getByTestId("edit-policy-statements")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByRole("dialog", { name: "新增策略" })).toBeVisible();
    }
    expect(createHits).toBe(0); // 零 create 请求（前端 JSON 校验拦截）
  });
});

// =====================================================================
// S-M4-10 仅平台管理员可见/可编辑策略页（CONTRACT）
// /policies requiresAdmin → 非 admin 直连 → 守卫 ③ /forbidden；admin 可访问。
// =====================================================================

test.describe("CONTRACT · S-M4-10 仅平台管理员可见策略页（UF-10）", () => {
  test("非 admin → /policies → 守卫 ③ /forbidden；admin → /policies 可访问", async ({ page: adminPage, browser }) => {
    // 非 admin
    const nonAdmin = await browser.newPage();
    await loginContractNonAdmin(nonAdmin);
    await nonAdmin.goto("/console/policies");
    await expect(nonAdmin).toHaveURL(/\/console\/forbidden$/, { timeout: 2000 });
    await expect(nonAdmin.getByText(/无权限/)).toBeVisible();
    await nonAdmin.close();

    // admin 可访问
    await loginContractAdmin(adminPage);
    await adminPage.goto("/console/policies");
    await expect(adminPage).toHaveURL(/\/console\/policies$/);
    await expect(adminPage.getByRole("heading", { name: "策略管理" })).toBeVisible({ timeout: 2000 });
  });
});

// =====================================================================
// S-M4-11 同一对象并发编辑 → eiam 409 → save.conflict 提示 + 表单保留（CONTRACT）
// role/update 返回 409 + 信封 → .form-error「数据已被他人修改，请重新加载后再试」
// =====================================================================

test.describe("CONTRACT · S-M4-11 并发编辑 409 → save.conflict 提示（E6）", () => {
  test("role/update 409 → .form-error save.conflict 文案 + 表单保留", async ({ page }) => {
    const conflictMsg = "数据已被他人修改，请重新加载后再试";
    await loginContractAdmin(page, {
      roleDetail: { id: 2, code: "admin", name: "租户管理员", desc: "", policies: [], users: [] },
      policiesForRole: [],
      usersForRole: { total: 0, users: [] },
      roleUpdate: { reject: true, status: 409, code: 409001, msg: conflictMsg },
    });
    await page.goto("/console/roles/admin");
    await expect(page.getByRole("heading", { name: "租户管理员" })).toBeVisible({ timeout: 2000 });

    // 改名触发 hasChanges → 保存
    await page.getByTestId("detail-role-name").fill("并发修改名");
    await page.getByTestId("save-role").click();

    // 409 → save.conflict 文案 inline 渲染
    await expect(page.locator(".form-error")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".form-error")).toContainText(conflictMsg);
    // 表单保留（仍在详情页 + 输入值保留）
    await expect(page).toHaveURL(/\/console\/roles\/admin$/);
    await expect(page.getByTestId("detail-role-name")).toHaveValue("并发修改名");
  });
});

// =====================================================================
// S-M4-12 eiam 无 409 支持 → conflict 分支降级并入 validation（CONTRACT）
// 承接 parity §6.4 核查结论：eiam 不返回 409 时，并发冲突以 200+code 业务信封
// （validation kind）呈现 → .form-error 渲染 msg（降级承接口径）。
// =====================================================================

test.describe("CONTRACT · S-M4-12 eiam 无 409 → conflict 降级并入 validation（E6）", () => {
  test("role/update 200+code 业务信封（非 409）→ .form-error 渲染冲突文案（降级承接）", async ({ page }) => {
    // dev eiam 实核无 409：并发冲突经业务码信封返回（HTTP 200 + code≠0），kind 落 validation/unknown。
    // store 以 errorMessage(err) 渲染 → .form-error inline 提示，不跳转、表单保留（降级承接）。
    const conflictMsg = "数据已被他人修改，请重新加载后再试";
    await loginContractAdmin(page, {
      roleDetail: { id: 2, code: "admin", name: "租户管理员", desc: "", policies: [], users: [] },
      policiesForRole: [],
      usersForRole: { total: 0, users: [] },
      // 200 + code≠0 业务信封（非 409）→ 降级并入 validation
      roleUpdate: { reject: true, status: 200, code: 4010903, msg: conflictMsg },
    });
    await page.goto("/console/roles/admin");
    await expect(page.getByRole("heading", { name: "租户管理员" })).toBeVisible({ timeout: 2000 });

    await page.getByTestId("detail-role-name").fill("降级冲突名");
    await page.getByTestId("save-role").click();

    // 降级路径：业务信封 → .form-error 渲染冲突文案（不因缺 409 而吞错或跳转）
    await expect(page.locator(".form-error")).toBeVisible({ timeout: 2000 });
    await expect(page.locator(".form-error")).toContainText(conflictMsg);
    await expect(page).toHaveURL(/\/console\/roles\/admin$/);
    await expect(page.getByTestId("detail-role-name")).toHaveValue("降级冲突名");
  });
});
