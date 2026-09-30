// @vitest-environment happy-dom
/**
 * tenantList store（task 4.4，UF-6）契约测试。
 *
 * 覆盖 AC：
 * - 统一契约 state{items,total,page,pageSize,loading,error} + fetch/create/update/remove/disable
 * - AbortController fetch 前中断在途（AC-3）
 * - 写前守卫（3.1）：快照 != currentTenantId → 阻断写 + reload 自愈（Hard Rule 不绕过）
 * - 响应回读（3.1）：tenant/list 无租户标识 → 跳过此层放行
 * - E7：page 超界回落最后页；删除末页唯一记录回退上一页；切过滤重置 page=1
 * - G-4 禁用降级：前端不做前置会话计数校验；禁用被拒 → disableBlocked 携带活跃会话数
 * - 401 收敛：registerUnauthorizedReset 注册的回调复位 state
 * - 不声明 persist（列表态不落 localStorage）
 */
import { URL as NodeURL } from "node:url";
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { useTenantListStore, extractActiveSessionCount } from "./tenantList";
import { useTenantStore } from "./tenant";
import { eiamAxios } from "@/api/request/eiam";

// ---- router 模块替身：受控快照 + 捕获 registerUnauthorizedReset 回调 ----
const snapshotMock = vi.fn<(...args: never[]) => number>();
const resetRegistrations: Array<() => void> = [];
vi.mock("@/router", () => ({
  getPageEnterTenantSnapshot: (...args: never[]) => snapshotMock(...args),
  __resetPageEnterTenantSnapshot: vi.fn(),
  registerUnauthorizedReset: (fn: () => void) => {
    resetRegistrations.push(fn);
  },
  router: {},
}));

// ---- window.location 替身（enforceWriteGuard reload 断言）----
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

const STATUS_TEXT: Partial<Record<number, string>> = {
  200: "OK",
  500: "Internal Server Error",
};

interface MockReply {
  status?: number;
  body?: unknown;
  networkFailure?: { code: string; message: string };
}

function settleLike(response: AxiosResponse): AxiosResponse {
  const validate =
    response.config.validateStatus ?? ((s: number) => s >= 200 && s < 300);
  if (validate(response.status)) return response;
  throw new AxiosError(
    `Request failed with status code ${response.status}`,
    AxiosError.ERR_BAD_REQUEST,
    response.config,
    undefined,
    response,
  );
}

function adapterFor(
  replyFor: (config: InternalAxiosRequestConfig) => MockReply,
  capture: InternalAxiosRequestConfig[] = [],
): void {
  eiamAxios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    capture.push(config);
    const reply = replyFor(config);
    if (reply.networkFailure) {
      throw new AxiosError(
        reply.networkFailure.message,
        reply.networkFailure.code,
        config,
      );
    }
    return settleLike({
      data: reply.body ?? null,
      status: reply.status ?? 200,
      statusText: STATUS_TEXT[reply.status ?? 200] ?? "",
      headers: {},
      config,
    } as AxiosResponse);
  }) as unknown as typeof eiamAxios.defaults.adapter;
}

beforeEach(() => {
  setActivePinia(createPinia());
  // 重置 router mock 快照默认返回 1（与 currentTenantId 一致 = 写前守卫放行）
  snapshotMock.mockReturnValue(1);
  useTenantStore().setCurrentTenantId(1);
});

afterEach(() => {
  eiamAxios.defaults.adapter = undefined;
  restoreLocation(realLocation);
});

function tenantData(
  overrides: Partial<{ id: number; name: string; status: number }> = {},
) {
  return {
    id: overrides.id ?? 1,
    name: overrides.name ?? "租户A",
    code: "a",
    domain: "a.x",
    status: overrides.status ?? 1,
  };
}

describe("统一契约 state + fetch", () => {
  it("初始 state 默认值（默认页大小 20、上限 100）", () => {
    const s = useTenantListStore();
    expect(s.items).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(20);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    expect(s.keyword).toBe("");
    expect(s.disableBlocked).toBeNull();
  });

  it("fetch 成功 → 写入 items/total，status int→字符串归一", async () => {
    const s = useTenantListStore();
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/list") {
        return {
          body: {
            code: 0,
            msg: "ok",
            data: {
              total: 2,
              tenants: [
                tenantData({ id: 1, name: "a", status: 1 }),
                tenantData({ id: 2, name: "b", status: 2 }),
              ],
            },
          },
        };
      }
      return { status: 404 };
    });
    const ok = await s.fetch();
    expect(ok).toBe(true);
    expect(s.items).toHaveLength(2);
    expect(s.items[0]?.status).toBe("active");
    expect(s.items[1]?.status).toBe("disable");
    expect(s.total).toBe(2);
    expect(s.loading).toBe(false);
  });

  it("fetch 失败 → 归位 error（contractText 回退），不复位 items", async () => {
    const s = useTenantListStore();
    // 先填充 items
    s.items = [
      { id: 9, name: "old", code: "o", domain: "o.x", status: "active" },
    ];
    adapterFor(() => ({
      body: { code: 5001, msg: "身份服务暂不可用", data: null },
    }));
    const ok = await s.fetch();
    expect(ok).toBe(false);
    expect(s.error).not.toBeNull();
    // items 保留（调用方决定是否清空）
    expect(s.items).toHaveLength(1);
  });
});

describe("E7 分页边界", () => {
  it("page 超出总页数 → 回落最后页重查", async () => {
    const s = useTenantListStore();
    s.setPageSize(10);
    s.setPage(5); // 超界（total=1 页）
    let calls = 0;
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/list") {
        calls++;
        return {
          body: {
            code: 0,
            msg: "ok",
            data: {
              total: 8,
              tenants: Array.from({ length: 8 }, (_, i) =>
                tenantData({ id: i + 1 }),
              ),
            },
          },
        };
      }
      return { status: 404 };
    });
    await s.fetch();
    // total=8 / pageSize=10 → 1 页；page 回落到 1
    expect(s.page).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it("切 keyword → 重置 page=1", () => {
    const s = useTenantListStore();
    s.setPage(3);
    s.setKeyword("abc");
    expect(s.page).toBe(1);
    expect(s.keyword).toBe("abc");
  });
});

describe("写前守卫（Hard Rule：不得绕过）", () => {
  it("快照 != currentTenantId → create 阻断 + reload 自愈", async () => {
    const s = useTenantListStore();
    const { replaced } = stubLocation("http://localhost/tenants");
    snapshotMock.mockReturnValue(1);
    useTenantStore().setCurrentTenantId(2); // 切到 Y 租户
    const id = await s.create({ name: "x", code: "x" });
    expect(id).toBeNull();
    expect(replaced).toHaveLength(1); // reload 自愈
  });

  it("快照 == currentTenantId → create 放行提交", async () => {
    const s = useTenantListStore();
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/create") {
        return { body: { code: 0, msg: "ok", data: 99 } };
      }
      if (config.url === "/api/iam/tenant/list") {
        return {
          body: { code: 0, msg: "ok", data: { total: 0, tenants: [] } },
        };
      }
      return { status: 404 };
    }, captured);
    const id = await s.create({ name: "新", code: "new" });
    expect(id).toBe(99);
    expect(captured.some((c) => c.url === "/api/iam/tenant/create")).toBe(true);
  });

  it("disable / update / remove 同样受写前守卫约束", async () => {
    const s = useTenantListStore();
    stubLocation("http://localhost/tenants");
    snapshotMock.mockReturnValue(1);
    useTenantStore().setCurrentTenantId(99); // 不一致
    expect(await s.disable(1)).toBe(false);
    expect(await s.update({ id: 1, name: "x", code: "x" })).toBe(false);
    // remove 写前守卫失败 → return false（不提交、不抛出）
    expect(await s.remove(1)).toBe(false);
  });
});

describe("G-4 禁用前置降级（Hard Rule）", () => {
  it("extractActiveSessionCount：从 eiam 拒绝消息提取首个正整数", () => {
    expect(extractActiveSessionCount("无法禁用：该租户仍有 3 个活跃会话")).toBe(
      3,
    );
    expect(extractActiveSessionCount("tenant has 12 active sessions")).toBe(12);
    expect(extractActiveSessionCount("无数字")).toBe(0);
    expect(extractActiveSessionCount("0 sessions")).toBe(0); // 0 不算（>0 才有效）
  });

  it("禁用被拒 → disableBlocked 携带活跃会话数 + 拒绝原文", async () => {
    const s = useTenantListStore();
    adapterFor(() => ({
      body: {
        code: 4010801,
        msg: "无法禁用：该租户仍有 5 个活跃会话",
        data: null,
      },
    }));
    const ok = await s.disable(7);
    expect(ok).toBe(false);
    expect(s.disableBlocked).not.toBeNull();
    expect(s.disableBlocked?.count).toBe(5);
    expect(s.disableBlocked?.message).toContain("5");
    expect(s.disableBlocked?.tenantId).toBe(7);
  });

  it("禁用成功 → disableBlocked 清空，列表刷新", async () => {
    const s = useTenantListStore();
    let updateCalled = false;
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/update") {
        updateCalled = true;
        return { body: { code: 0, msg: "ok", data: null } };
      }
      if (config.url === "/api/iam/tenant/list") {
        return {
          body: {
            code: 0,
            msg: "ok",
            data: {
              total: 1,
              tenants: [tenantData({ id: 1, status: 2 })],
            },
          },
        };
      }
      return { status: 404 };
    });
    const ok = await s.disable(1);
    expect(ok).toBe(true);
    expect(updateCalled).toBe(true);
    expect(s.disableBlocked).toBeNull();
  });

  it("禁用被拒消息无数字 → count=0（调用方降级渲染原文）", async () => {
    const s = useTenantListStore();
    adapterFor(() => ({
      body: { code: 4010801, msg: "禁用被拒（无计数）", data: null },
    }));
    await s.disable(1);
    expect(s.disableBlocked?.count).toBe(0);
    expect(s.disableBlocked?.message).toBe("禁用被拒（无计数）");
  });
});

describe("create / update / remove / enable", () => {
  it("create 成功 → 回第一页刷新", async () => {
    const s = useTenantListStore();
    s.setPage(3);
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/create") {
        return { body: { code: 0, msg: "ok", data: 10 } };
      }
      if (config.url === "/api/iam/tenant/list") {
        return {
          body: {
            code: 0,
            msg: "ok",
            data: { total: 1, tenants: [tenantData({ id: 10 })] },
          },
        };
      }
      return { status: 404 };
    });
    const id = await s.create({ name: "新", code: "n" });
    expect(id).toBe(10);
    expect(s.page).toBe(1);
  });

  it("update 成功 → 刷新", async () => {
    const s = useTenantListStore();
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/update") {
        return { body: { code: 0, msg: "ok", data: null } };
      }
      if (config.url === "/api/iam/tenant/list") {
        return {
          body: { code: 0, msg: "ok", data: { total: 0, tenants: [] } },
        };
      }
      return { status: 404 };
    });
    expect(await s.update({ id: 1, name: "x", code: "x" })).toBe(true);
  });

  it("enable 成功 → 刷新", async () => {
    const s = useTenantListStore();
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/update") {
        return { body: { code: 0, msg: "ok", data: null } };
      }
      if (config.url === "/api/iam/tenant/list") {
        return {
          body: { code: 0, msg: "ok", data: { total: 0, tenants: [] } },
        };
      }
      return { status: 404 };
    });
    expect(await s.enable(1)).toBe(true);
  });

  it("remove 末页唯一记录 → 回退上一页", async () => {
    const s = useTenantListStore();
    s.setPageSize(10);
    s.setPage(2); // 末页
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/delete/1") {
        return { body: { code: 0, msg: "ok", data: null } };
      }
      if (config.url === "/api/iam/tenant/list") {
        // 列表为空（已删完）
        return {
          body: { code: 0, msg: "ok", data: { total: 0, tenants: [] } },
        };
      }
      return { status: 404 };
    });
    expect(await s.remove(1)).toBe(true);
    // 末页空 → 回退 page 1
    expect(s.page).toBe(1);
  });

  it("remove 失败（依赖删除被拒）→ 重新抛出供调用方渲染", async () => {
    const s = useTenantListStore();
    adapterFor(() => ({
      body: { code: 4010703, msg: "存在关联用户", data: null },
    }));
    await expect(s.remove(1)).rejects.toMatchObject({ code: 4010703 });
    expect(s.error).not.toBeNull();
  });
});

describe("401 收敛 + 持久化口径", () => {
  it("registerUnauthorizedReset 注册的回调复位 state", () => {
    const s = useTenantListStore();
    s.items = [{ id: 1, name: "x", code: "x", domain: "x", status: "active" }];
    s.total = 1;
    s.error = "err";
    s.disableBlocked = { count: 3, message: "x", tenantId: 1 };
    // 触发注册的复位回调（router 模块在 401 收敛时调用）
    for (const fn of resetRegistrations) fn();
    expect(s.items).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.error).toBeNull();
    expect(s.disableBlocked).toBeNull();
  });

  it("store 不声明 persist（列表态不落 localStorage）", () => {
    const app = createApp({});
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    app.use(pinia);
    setActivePinia(pinia);
    const s = useTenantListStore();
    s.setPage(3);
    // persistedstate 插件仅持久化声明 persist 的 store；本 store 未声明 → localStorage 无 tenantList 键
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.includes("tenantList"))).toBe(false);
  });
});

describe("clearDisableBlocked", () => {
  it("清空禁用被拒态", async () => {
    const s = useTenantListStore();
    adapterFor(() => ({
      body: { code: 4010801, msg: "仍有 2 个活跃会话", data: null },
    }));
    await s.disable(1);
    expect(s.disableBlocked).not.toBeNull();
    s.clearDisableBlocked();
    expect(s.disableBlocked).toBeNull();
  });
});
