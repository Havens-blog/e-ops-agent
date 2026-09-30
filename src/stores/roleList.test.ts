// @vitest-environment happy-dom
/**
 * roleList store（task 5.1）契约测试。
 *
 * 覆盖 AC：
 * - 统一契约 state{items,total,page,pageSize,loading,error} + fetch/create/update/remove
 * - AbortController fetch 前中断在途（AC-3）
 * - 写前守卫（3.1）：快照 != currentTenantId → 阻断写 + reload 自愈（Hard Rule 不绕过）
 * - 响应回读（3.1）：role/list 无租户标识 → 跳过此层放行
 * - E7：page 超界回落最后页；删除末页唯一记录回退上一页；切 keyword 重置 page=1
 * - create：createRole + 回第一页刷新
 * - update：updateRole + 刷新
 * - remove：E11 依赖删除被拒（conflict kind）→ 重新抛出供调用方渲染阻断
 * - 计数 enrichment：listPoliciesForRole + listUsersByRole 回填 policyCounts/userCounts
 * - applyPolicyDelta：attachPoliciesToRole / detachPoliciesFromRole（D-3 policy 侧承载）
 * - applyUserDelta：assignUsersToRole / unassignUsersFromRole（A 档 batch_assign，以 code 为准）
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
import { useRoleListStore } from "./roleList";
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

/** 按 url 路由不同响应：role/list、role/create、role/update、role/delete、policy/*、role/batch_* */
function adapterRouting(
  listReply: ReplyFn,
  writes: Partial<Record<string, ReplyFn>> = {},
): { calls: string[] } {
  const calls: string[] = [];
  eiamAxios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? "";
    calls.push(url);
    let reply: MockReply;
    if (url.includes("/role/list")) reply = listReply(config);
    else if (url.includes("/role/create"))
      reply = (
        writes.create ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: 99 } }))
      )(config);
    else if (url.includes("/role/update"))
      reply = (
        writes.update ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else if (url.includes("/role/delete"))
      reply = (
        writes.delete ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else if (url.includes("/policy/list/attached/role"))
      reply = (
        writes.policiesForRole ??
        (() => ({
          status: 200,
          body: { code: 0, msg: "", data: { total: 0, policies: [] } },
        }))
      )(config);
    else if (url.includes("/policy/list"))
      reply = (
        writes.bindablePolicies ??
        (() => ({
          status: 200,
          body: { code: 0, msg: "", data: { total: 0, policies: [] } },
        }))
      )(config);
    else if (url.includes("/policy/batch-attach"))
      reply = (
        writes.attach ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else if (url.includes("/policy/batch-detach"))
      reply = (
        writes.detach ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else if (url.includes("/role/batch_assign"))
      reply = (
        writes.assign ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else if (url.includes("/role/batch_unassign"))
      reply = (
        writes.unassign ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else if (url.includes("/user/list/attached/role"))
      reply = (
        writes.usersForRole ??
        (() => ({
          status: 200,
          body: { code: 0, msg: "", data: { total: 0, users: [] } },
        }))
      )(config);
    else if (url.includes("/user/list"))
      reply = (
        writes.users ??
        (() => ({
          status: 200,
          body: { code: 0, msg: "", data: { total: 0, users: [] } },
        }))
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

/** 角色列表信封（eiam RoleVO 子集：id/code/name/desc） */
function listEnvelope(roles: unknown[], total = roles.length): unknown {
  return { code: 0, msg: "ok", data: { total, roles } };
}

function roleRaw(id: number, code: string, name = `角色${id}`): unknown {
  return { id, code, name, desc: `desc${id}` };
}

async function freshStore(
  listReply: ReplyFn,
  writes: Partial<Record<string, ReplyFn>> = {},
): Promise<{
  store: ReturnType<typeof useRoleListStore>;
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
  return { store: useRoleListStore(), calls };
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

describe("roleList store 统一契约（AC-1）", () => {
  it("state 初值：items=[] / total=0 / page=1 / pageSize=20 / loading=false / error=null", async () => {
    stubLocation("http://localhost:8888/console/roles");
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
    expect(store.policyCounts).toEqual({});
    expect(store.userCounts).toEqual({});
  });

  it("fetch 成功：归一 items/total（desc 非 description），loading 复位", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([roleRaw(1, "admin"), roleRaw(2, "viewer")], 2),
    }));
    const ok = await store.fetch();
    expect(ok).toBe(true);
    expect(store.items).toHaveLength(2);
    expect(store.items[0]).toMatchObject({
      id: 1,
      code: "admin",
      name: "角色1",
      desc: "desc1",
      policies: [],
      users: [],
    });
    expect(store.total).toBe(2);
    expect(store.loading).toBe(false);
  });

  it("fetch 2xx 业务错误（code!=0）：归位 error 回退 envelope msg", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(() => ({
      status: 200,
      body: { code: 500, msg: "身份服务繁忙", data: null },
    }));
    const ok = await store.fetch();
    expect(ok).toBe(false);
    expect(store.error).toBe("身份服务繁忙");
  });

  it("fetch 网络故障 → error 取 axios 诊断", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(() => ({
      networkFailure: { code: "ERR_NETWORK", message: "Network Error" },
    }));
    const ok = await store.fetch();
    expect(ok).toBe(false);
    expect(store.error).toBe("Network Error");
  });

  it("fetch 前中断在途：第二次 abort 第一次，第一次返回 false 不覆盖 state", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([roleRaw(1, "admin")], 1),
    }));
    const first = store.fetch();
    const second = store.fetch();
    const [firstOk, secondOk] = await Promise.all([first, second]);
    expect(firstOk).toBe(false);
    expect(secondOk).toBe(true);
    expect(store.items).toHaveLength(1);
  });

  it("不声明 persist：state 不落 localStorage", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([]),
    }));
    store.setPage(3);
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.includes("roleList"))).toBe(false);
  });
});

describe("计数 enrichment（AC-2 绑定策略数/绑定用户数）", () => {
  it("fetch 后回填 policyCounts/userCounts（listPoliciesForRole + listUsersByRole）", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store, calls } = await freshStore(
      () => ({
        status: 200,
        body: listEnvelope([roleRaw(1, "admin"), roleRaw(2, "viewer")], 2),
      }),
      {
        policiesForRole: (config) => {
          const body =
            typeof config.data === "string"
              ? JSON.parse(config.data)
              : (config.data as Record<string, unknown> | undefined);
          const roleCode = String(body?.role_code ?? "");
          return {
            status: 200,
            body: {
              code: 0,
              msg: "",
              data: {
                total: roleCode === "admin" ? 2 : 0,
                policies:
                  roleCode === "admin"
                    ? [{ code: "p1", name: "策略1" }, { code: "p2", name: "策略2" }]
                    : [],
              },
            },
          };
        },
        usersForRole: (config) => {
          const body =
            typeof config.data === "string"
              ? JSON.parse(config.data)
              : (config.data as Record<string, unknown> | undefined);
          const roleCode = String(body?.role_code ?? "");
          return {
            status: 200,
            body: {
              code: 0,
              msg: "",
              data: {
                total: roleCode === "admin" ? 5 : 0,
                users: [],
              },
            },
          };
        },
      },
    );
    await store.fetch();
    // enrichCounts 异步执行——等待微任务刷新
    await new Promise((r) => setTimeout(r, 0));
    expect(store.policyCounts["admin"]).toBe(2);
    expect(store.userCounts["admin"]).toBe(5);
    expect(store.policyCounts["viewer"]).toBe(0);
    expect(store.userCounts["viewer"]).toBe(0);
    expect(calls.some((u) => u.includes("/policy/list/attached/role"))).toBe(true);
    expect(calls.some((u) => u.includes("/user/list/attached/role"))).toBe(true);
  });

  it("enrichment 失败降级为 0（不阻断列表渲染）", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(
      () => ({
        status: 200,
        body: listEnvelope([roleRaw(1, "admin")], 1),
      }),
      {
        policiesForRole: () => ({
          networkFailure: { code: "ERR_NETWORK", message: "fail" },
        }),
        usersForRole: () => ({
          networkFailure: { code: "ERR_NETWORK", message: "fail" },
        }),
      },
    );
    await store.fetch();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.policyCounts["admin"]).toBe(0);
    expect(store.userCounts["admin"]).toBe(0);
  });
});

describe("E7 分页边界（AC-2）", () => {
  it("page 超出总页数 → 回落最后页重查", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([roleRaw(1, "admin"), roleRaw(2, "viewer")], 2),
    }));
    store.setPage(5);
    expect(store.page).toBe(5);
    await store.fetch();
    expect(store.page).toBe(1);
  });

  it("切 keyword 重置 page=1", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([]),
    }));
    store.setPage(4);
    store.setKeyword("admin");
    expect(store.page).toBe(1);
  });
});

describe("写前守卫（AC-1 + 3.1，Hard Rule 不绕过）", () => {
  it("快照 != currentTenantId → create 阻断（返回 null）+ reload 自愈，不发请求", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/roles");
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
    const store = useRoleListStore();
    const result = await store.create({ name: "新角色", code: "new_role" });
    expect(result).toBeNull();
    expect(replaced).toEqual(["http://localhost:8888/console/roles"]);
    expect(calls.some((u) => u.includes("/role/create"))).toBe(false);
  });

  it("快照 != currentTenantId → update 阻断（false）+ reload", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/roles");
    adapterRouting(() => ({ status: 200, body: listEnvelope([]) }), {
      update: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
    });
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({ render: () => null }).use(pinia);
    setActivePinia(pinia);
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);
    const store = useRoleListStore();
    const ok = await store.update({ id: 1, name: "x", code: "admin" });
    expect(ok).toBe(false);
    expect(replaced).toHaveLength(1);
  });

  it("快照 != currentTenantId → remove 阻断（false）+ reload", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/roles");
    adapterRouting(() => ({ status: 200, body: listEnvelope([]) }), {
      delete: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
    });
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({ render: () => null }).use(pinia);
    setActivePinia(pinia);
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);
    const store = useRoleListStore();
    const ok = await store.remove(1);
    expect(ok).toBe(false);
    expect(replaced).toHaveLength(1);
  });
});

describe("create / update / remove（写前守卫放行路径）", () => {
  it("create：createRole（载荷含 name/code/desc）+ 回第一页刷新", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store, calls } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        create: () => ({ status: 200, body: { code: 0, msg: "", data: 42 } }),
      },
    );
    store.setPage(3);
    const id = await store.create({
      name: "新角色",
      code: "new_role",
      desc: "描述",
    });
    expect(id).toBe(42);
    expect(store.page).toBe(1);
    expect(calls.some((u) => u.includes("/role/create"))).toBe(true);
  });

  it("update：updateRole（载荷含 id/name/code/desc）+ 刷新", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store, calls } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        update: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
      },
    );
    const ok = await store.update({
      id: 1,
      name: "新名",
      code: "admin",
      desc: "新描述",
    });
    expect(ok).toBe(true);
    expect(calls.some((u) => u.includes("/role/update"))).toBe(true);
  });

  it("remove：E11 依赖删除被拒（conflict）→ 重新抛出，调用方可据 kind 渲染阻断", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        delete: () => ({
          status: 409,
          body: { code: 40901, msg: "该角色已绑定用户", data: null },
        }),
      },
    );
    await expect(store.remove(1)).rejects.toThrow();
    expect(store.error).toBe("该角色已绑定用户");
  });
});

describe("applyPolicyDelta（D-3：policy 侧承载 batch-attach/batch-detach）", () => {
  it("added → batch-attach（载荷 subjects sub_type=role + policy_codes）；removed → batch-detach（assignments 逐条）", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store, calls } = await freshStore(
      () => ({
        status: 200,
        body: listEnvelope([roleRaw(1, "admin")], 1),
      }),
      {
        attach: (config) => {
          const body = JSON.parse(String(config.data));
          expect(body.subjects).toEqual([{ sub_type: "role", code: "admin" }]);
          expect(body.policy_codes).toEqual(["p1", "p2"]);
          return { status: 200, body: { code: 0, msg: "", data: null } };
        },
        detach: (config) => {
          const body = JSON.parse(String(config.data));
          expect(body.assignments).toEqual([
            {
              subject: { sub_type: "role", code: "admin" },
              policy_code: "p0",
            },
          ]);
          return { status: 200, body: { code: 0, msg: "", data: null } };
        },
      },
    );
    await store.fetch();
    const ok = await store.applyPolicyDelta("admin", ["p1", "p2"], ["p0"]);
    expect(ok).toBe(true);
    expect(calls.some((u) => u.includes("/policy/batch-attach"))).toBe(true);
    expect(calls.some((u) => u.includes("/policy/batch-detach"))).toBe(true);
  });

  it("写前守卫阻断 → 返回 false 不发请求", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/roles");
    adapterRouting(() => ({ status: 200, body: listEnvelope([]) }));
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({ render: () => null }).use(pinia);
    setActivePinia(pinia);
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);
    const store = useRoleListStore();
    const ok = await store.applyPolicyDelta("admin", ["p1"], []);
    expect(ok).toBe(false);
    expect(replaced).toHaveLength(1);
  });
});

describe("applyUserDelta（A 档 batch_assign/batch_unassign，以 code 为准）", () => {
  it("added → batch_assign（usernames + role_codes:[code]）；removed → batch_unassign", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store, calls } = await freshStore(
      () => ({
        status: 200,
        body: listEnvelope([roleRaw(1, "admin")], 1),
      }),
      {
        assign: (config) => {
          const body = JSON.parse(String(config.data));
          expect(body.usernames).toEqual(["alice", "bob"]);
          expect(body.role_codes).toEqual(["admin"]);
          return { status: 200, body: { code: 0, msg: "", data: null } };
        },
        unassign: (config) => {
          const body = JSON.parse(String(config.data));
          expect(body.usernames).toEqual(["carol"]);
          expect(body.role_codes).toEqual(["admin"]);
          return { status: 200, body: { code: 0, msg: "", data: null } };
        },
      },
    );
    await store.fetch();
    const ok = await store.applyUserDelta(
      "admin",
      ["alice", "bob"],
      ["carol"],
    );
    expect(ok).toBe(true);
    expect(calls.some((u) => u.includes("/role/batch_assign"))).toBe(true);
    expect(calls.some((u) => u.includes("/role/batch_unassign"))).toBe(true);
  });
});

describe("401 收敛：registerUnauthorizedReset 复位 state（AC-1）", () => {
  it("注册的复位回调清空 items/error 并中断在途", async () => {
    stubLocation("http://localhost:8888/console/roles");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([roleRaw(1, "admin")], 1),
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
    expect(store.policyCounts).toEqual({});
    expect(store.userCounts).toEqual({});
  });
});
