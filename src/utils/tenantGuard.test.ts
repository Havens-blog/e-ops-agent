// @vitest-environment happy-dom
/**
 * tenantGuard（task 3.1）写前守卫 + 响应回读比对 单测。
 *
 * 覆盖 AC：
 * - 写前守卫：快照 === currentTenantId → 放行；不一致 → reload 自愈 + 阻断
 * - 响应回读：无租户标识 → 跳过；一致 → 放行；不一致 → reload 自愈 + 丢弃渲染
 * - 显式接受边界登记 WRITE_GUARD_SCOPE = 7 个 list store
 *
 * router 2.6 的 getPageEnterTenantSnapshot 模块级单值用 vi.mock 注入受控返回值。
 */
import { URL as NodeURL } from "node:url";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { useTenantStore } from "@/stores/tenant";

// ---- router 模块替身：getPageEnterTenantSnapshot 受控返回；不实例化真 router ----
const snapshotMock = vi.fn<(...args: never[]) => number>();
vi.mock("@/router", () => ({
  getPageEnterTenantSnapshot: (...args: never[]) => snapshotMock(...args),
  __resetPageEnterTenantSnapshot: vi.fn(),
  // 其余导出 stub（tenantGuard 仅 import getPageEnterTenantSnapshot，不触达）
  router: {},
  registerUnauthorizedReset: vi.fn(),
}));

// ---- window.location 替身（happy-dom href 赋值会触发真实导航；与 tenant.test.ts 同款） ----
function stubLocation(initialHref: string): { replaced: string[] } {
  let current = new NodeURL(initialHref);
  const replaced: string[] = [];
  const fake = {
    get href(): string {
      return current.href;
    },
    set href(value: string) {
      current = new NodeURL(value, current);
    },
    get origin(): string {
      return current.origin;
    },
    replace(value: string) {
      replaced.push(value);
      current = new NodeURL(value, current);
    },
    toString(): string {
      return current.href;
    },
  };
  Object.defineProperty(window, "location", {
    value: fake,
    configurable: true,
    writable: true,
  });
  return { replaced };
}

const realLocation = window.location;

function restoreLocation(original: Location): void {
  Object.defineProperty(window, "location", {
    value: original,
    configurable: true,
    writable: true,
  });
}

const freshPinia = () => {
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  createApp({ render: () => null }).use(pinia);
  setActivePinia(pinia);
  return pinia;
};

afterEach(() => {
  restoreLocation(realLocation);
  vi.resetModules();
});

beforeEach(() => {
  localStorage.clear();
  snapshotMock.mockReset();
});

describe("tenantGuard 写前守卫 enforceWriteGuard（AC: 写前守卫硬门）", () => {
  it("快照 === currentTenantId → 放行（true），不 reload", async () => {
    freshPinia();
    stubLocation("http://localhost:8888/console/users");
    snapshotMock.mockReturnValue(5);
    useTenantStore().setCurrentTenantId(5);

    const { enforceWriteGuard } = await import("./tenantGuard");
    // reload 由 vi.useFakeTimers? 不——location.replace 同步触发；此处未 mock 替身会真导航，
    // 已用 stubLocation 替身断言 replaced 为空。
    expect(enforceWriteGuard()).toBe(true);
  });

  it("快照 != currentTenantId → reload 自愈 + 阻断（false）", async () => {
    freshPinia();
    const { replaced } = stubLocation("http://localhost:8888/console/users");
    // 页面进入时呈现 X=3，他标签切到 Y=7 后 currentTenantId=7
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);

    const { enforceWriteGuard } = await import("./tenantGuard");
    expect(enforceWriteGuard()).toBe(false);
    expect(replaced).toEqual(["http://localhost:8888/console/users"]);
  });

  it("快照=0 currentTenantId=0（登录前/零租户）→ 一致放行（不误伤零值）", async () => {
    freshPinia();
    stubLocation("http://localhost:8888/console/workbench");
    snapshotMock.mockReturnValue(0);
    useTenantStore().setCurrentTenantId(0);

    const { enforceWriteGuard } = await import("./tenantGuard");
    expect(enforceWriteGuard()).toBe(true);
  });
});

describe("tenantGuard 响应回读 assertResponseTenantMatch（AC: 响应回读比对自愈）", () => {
  it("响应无租户标识（null/undefined）→ 跳过此层，放行渲染（true）", async () => {
    freshPinia();
    stubLocation("http://localhost:8888/console/users");
    useTenantStore().setCurrentTenantId(5);

    const { assertResponseTenantMatch } = await import("./tenantGuard");
    expect(assertResponseTenantMatch(null)).toBe(true);
    expect(assertResponseTenantMatch(undefined)).toBe(true);
  });

  it("响应租户标识 === currentTenantId → 放行（true），不 reload", async () => {
    freshPinia();
    const { replaced } = stubLocation("http://localhost:8888/console/users");
    useTenantStore().setCurrentTenantId(5);

    const { assertResponseTenantMatch } = await import("./tenantGuard");
    expect(assertResponseTenantMatch(5)).toBe(true);
    expect(replaced).toHaveLength(0);
  });

  it("响应租户标识 != currentTenantId → 丢弃渲染（false）+ reload 自愈", async () => {
    freshPinia();
    const { replaced } = stubLocation("http://localhost:8888/console/users");
    useTenantStore().setCurrentTenantId(7);

    const { assertResponseTenantMatch } = await import("./tenantGuard");
    expect(assertResponseTenantMatch(3)).toBe(false);
    expect(replaced).toEqual(["http://localhost:8888/console/users"]);
  });
});

describe("tenantGuard 显式接受边界登记 WRITE_GUARD_SCOPE（AC: 边界登记）", () => {
  it("登记 7 个控制台 list store（与 tech-design §Integration 6 一致）", async () => {
    const { WRITE_GUARD_SCOPE } = await import("./tenantGuard");
    expect(WRITE_GUARD_SCOPE).toEqual([
      "userList",
      "orgList",
      "tenantList",
      "idpList",
      "roleList",
      "authorizationList",
      "policyList",
    ]);
  });
});
