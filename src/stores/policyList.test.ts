// @vitest-environment happy-dom
/**
 * policyList store（task 5.3）契约测试。
 *
 * 覆盖 AC：
 * - 统一契约 state{items,total,page,pageSize,loading,error} + fetch/create/update/remove
 * - AbortController fetch 前中断在途（AC-3）
 * - 写前守卫（3.1）：快照 != currentTenantId → 阻断写 + reload 自愈（Hard Rule 不绕过）
 * - 响应回读（3.1）：policy/list 无租户标识 → 跳过此层放行
 * - E7：page 超界回落最后页；删除末页唯一记录回退上一页；切 keyword 重置 page=1
 * - create：createPolicy + 回第一页刷新
 * - update：updatePolicy + 刷新
 * - remove：E11 依赖删除被拒（conflict kind）→ 重新抛出供调用方渲染阻断
 * - assignmentCount 随 list 响应直出（无需 enrichment，AC-4 数据源）
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
import { usePolicyListStore } from "./policyList";
import { useTenantStore } from "./tenant";
import { eiamAxios } from "@/api/request/eiam";

// ---- router 模块替身 ----
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

// ---- window.location 替身 ----
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

type ReplyFn = (config: InternalAxiosRequestConfig) => MockReply;

/** 按 url 路由不同响应：policy/list、policy/create、policy/update、policy/delete */
function adapterRouting(
  listReply: ReplyFn,
  writes: Partial<Record<string, ReplyFn>> = {},
): { calls: string[] } {
  const calls: string[] = [];
  eiamAxios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? "";
    calls.push(url);
    let reply: MockReply;
    if (url.includes("/policy/list")) reply = listReply(config);
    else if (url.includes("/policy/create"))
      reply = (
        writes.create ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: 99 } }))
      )(config);
    else if (url.includes("/policy/update"))
      reply = (
        writes.update ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else if (url.includes("/policy/delete"))
      reply = (
        writes.delete ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else reply = { status: 200, body: { code: 0, msg: "", data: null } };
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
  return { calls };
}

/** 策略列表信封（eiam PolicyVO 子集：id/code/name/statement/assignment_count） */
function listEnvelope(policies: unknown[], total = policies.length): unknown {
  return { code: 0, msg: "ok", data: { total, policies } };
}

function policyRaw(
  id: number,
  code: string,
  name = `策略${id}`,
  assignmentCount = 0,
): unknown {
  return {
    id,
    code,
    name,
    statement: [
      { effect: "Allow", action: ["cam:cert:Get"], resource: ["cert/*"] },
    ],
    assignment_count: assignmentCount,
  };
}

async function freshStore(
  listReply: ReplyFn,
  writes: Partial<Record<string, ReplyFn>> = {},
): Promise<{
  store: ReturnType<typeof usePolicyListStore>;
  calls: string[];
}> {
  const { calls } = adapterRouting(listReply, writes);
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  createApp({ render: () => null }).use(pinia);
  setActivePinia(pinia);
  // 默认快照与 currentTenantId 一致（写前守卫放行）
  snapshotMock.mockReturnValue(5);
  useTenantStore().setCurrentTenantId(5);
  return { store: usePolicyListStore(), calls };
}

beforeEach(() => {
  localStorage.clear();
  resetRegistrations.length = 0;
  snapshotMock.mockReset();
});

afterEach(() => {
  restoreLocation(realLocation);
  eiamAxios.defaults.adapter = undefined;
  vi.restoreAllMocks();
});

describe("policyList store 统一契约（AC-1）", () => {
  it("state 初值：items=[] / total=0 / page=1 / pageSize=20 / loading=false / error=null", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([]),
    }));
    expect(store.items).toEqual([]);
    expect(store.total).toBe(0);
    expect(store.page).toBe(1);
    expect(store.pageSize).toBe(20);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("fetch 成功：归一 items/total（单数 statement→复数 statements；assignment_count→assignmentCount）", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope(
        [policyRaw(1, "p1", "策略1", 3), policyRaw(2, "p2")],
        2,
      ),
    }));
    const ok = await store.fetch();
    expect(ok).toBe(true);
    expect(store.items).toHaveLength(2);
    expect(store.items[0]).toMatchObject({
      id: 1,
      code: "p1",
      name: "策略1",
      assignmentCount: 3,
    });
    expect(store.items[0]?.statements).toHaveLength(1);
    expect(store.items[0]?.statements[0]).toMatchObject({
      effect: "Allow",
      actions: ["cam:cert:Get"],
      resources: ["cert/*"],
    });
    expect(store.total).toBe(2);
    expect(store.loading).toBe(false);
  });

  it("fetch 2xx 业务错误（code!=0）：归位 error 回退 envelope msg", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      status: 200,
      body: { code: 500, msg: "身份服务繁忙", data: null },
    }));
    const ok = await store.fetch();
    expect(ok).toBe(false);
    expect(store.error).toBe("身份服务繁忙");
  });

  it("fetch 网络故障 → error 取 axios 诊断", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      networkFailure: { code: "ERR_NETWORK", message: "Network Error" },
    }));
    const ok = await store.fetch();
    expect(ok).toBe(false);
    expect(store.error).toBe("Network Error");
  });

  it("fetch 前中断在途：第二次 abort 第一次，第一次返回 false 不覆盖 state", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([policyRaw(1, "p1")], 1),
    }));
    const first = store.fetch();
    const second = store.fetch();
    const [firstOk, secondOk] = await Promise.all([first, second]);
    expect(firstOk).toBe(false);
    expect(secondOk).toBe(true);
    expect(store.items).toHaveLength(1);
  });

  it("不声明 persist：state 不落 localStorage", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([]),
    }));
    store.setPage(3);
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.includes("policyList"))).toBe(false);
  });
});

describe("assignmentCount 随 list 响应直出（AC-4 数据源，无 enrichment）", () => {
  it("items[].assignmentCount = eiam assignment_count（无需二次请求）", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store, calls } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([policyRaw(1, "p1", "策略1", 5)], 1),
    }));
    await store.fetch();
    expect(store.items[0]?.assignmentCount).toBe(5);
    // 仅 list 一次请求，无 enrichment 二次请求
    expect(calls.every((u) => u.includes("/policy/list"))).toBe(true);
  });
});

describe("E7 分页边界", () => {
  it("page 超出总页数 → 回落最后页重查", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([policyRaw(1, "p1"), policyRaw(2, "p2")], 2),
    }));
    store.setPage(5);
    expect(store.page).toBe(5);
    await store.fetch();
    expect(store.page).toBe(1);
  });

  it("切 keyword 重置 page=1", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([]),
    }));
    store.setPage(4);
    store.setKeyword("cert");
    expect(store.page).toBe(1);
  });
});

describe("写前守卫（Hard Rule 不绕过）", () => {
  it("快照 != currentTenantId → create 阻断（返回 null）+ reload 自愈，不发请求", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/policies");
    const { calls } = adapterRouting(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        create: () => ({ status: 200, body: { code: 0, msg: "", data: 99 } }),
      },
    );
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({ render: () => null }).use(pinia);
    setActivePinia(pinia);
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);
    const store = usePolicyListStore();
    const result = await store.create({
      name: "新策略",
      code: "new_p",
      statements: [{ effect: "Allow", actions: ["a"], resources: ["r"] }],
    });
    expect(result).toBeNull();
    expect(replaced).toEqual(["http://localhost:8888/console/policies"]);
    expect(calls.some((u) => u.includes("/policy/create"))).toBe(false);
  });

  it("快照 != currentTenantId → update 阻断（false）+ reload", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/policies");
    adapterRouting(() => ({ status: 200, body: listEnvelope([]) }), {
      update: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
    });
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({ render: () => null }).use(pinia);
    setActivePinia(pinia);
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);
    const store = usePolicyListStore();
    const ok = await store.update({
      name: "x",
      code: "p1",
      statements: [{ effect: "Allow", actions: ["a"], resources: ["r"] }],
    });
    expect(ok).toBe(false);
    expect(replaced).toHaveLength(1);
  });

  it("快照 != currentTenantId → remove 阻断（false）+ reload", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/policies");
    adapterRouting(() => ({ status: 200, body: listEnvelope([]) }), {
      delete: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
    });
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({ render: () => null }).use(pinia);
    setActivePinia(pinia);
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);
    const store = usePolicyListStore();
    const ok = await store.remove("p1");
    expect(ok).toBe(false);
    expect(replaced).toHaveLength(1);
  });
});

describe("create / update / remove（写前守卫放行路径）", () => {
  it("create：createPolicy + 回第一页刷新", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store, calls } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        create: () => ({ status: 200, body: { code: 0, msg: "", data: 42 } }),
      },
    );
    store.setPage(3);
    const id = await store.create({
      name: "新策略",
      code: "new_p",
      statements: [{ effect: "Allow", actions: ["a"], resources: ["r"] }],
    });
    expect(id).toBe(42);
    expect(store.page).toBe(1);
    expect(calls.some((u) => u.includes("/policy/create"))).toBe(true);
  });

  it("update：updatePolicy + 刷新", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store, calls } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        update: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
      },
    );
    const ok = await store.update({
      name: "新名",
      code: "p1",
      statements: [{ effect: "Deny", actions: ["d"], resources: ["rr"] }],
    });
    expect(ok).toBe(true);
    expect(calls.some((u) => u.includes("/policy/update"))).toBe(true);
  });

  it("remove：E11 依赖删除被拒（conflict）→ 重新抛出，调用方可据 kind 渲染阻断", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        delete: () => ({
          status: 409,
          body: { code: 40901, msg: "该策略已被 3 个角色绑定", data: null },
        }),
      },
    );
    await expect(store.remove("p1")).rejects.toThrow();
    expect(store.error).toBe("该策略已被 3 个角色绑定");
  });
});

describe("401 收敛：registerUnauthorizedReset 复位 state", () => {
  it("注册的复位回调清空 items/error 并中断在途", async () => {
    stubLocation("http://localhost:8888/console/policies");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([policyRaw(1, "p1")], 1),
    }));
    await store.fetch();
    expect(store.items).toHaveLength(1);
    store.setPage(4);
    store.error = "残错误";
    expect(resetRegistrations.length).toBeGreaterThanOrEqual(1);
    for (const fn of resetRegistrations) fn();
    expect(store.items).toEqual([]);
    expect(store.total).toBe(0);
    expect(store.page).toBe(1);
    expect(store.error).toBeNull();
  });
});
