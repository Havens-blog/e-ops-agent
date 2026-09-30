// @vitest-environment happy-dom
/**
 * userList store（task 4.2）契约测试。
 *
 * 覆盖 AC：
 * - 统一契约 state{items,total,page,pageSize,loading,error} + fetch/create/update/remove
 * - AbortController fetch 前中断在途（AC-3）
 * - 写前守卫（3.1）：快照 != currentTenantId → 阻断写 + reload 自愈（Hard Rule 不绕过）
 * - 响应回读（3.1）：user/list 无租户标识 → 跳过此层放行
 * - E7：page 超界回落最后页；删除末页唯一记录回退上一页；切过滤重置 page=1
 * - create：createUser + 角色分配（batch_assign）+ 回第一页刷新
 * - update：updateUser + 角色 diff（assign/unassign）
 * - remove：E11 依赖删除被拒（conflict kind）→ 重新抛出供调用方渲染阻断
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
import { useUserListStore } from "./userList";
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

type ReplyFn = (config: InternalAxiosRequestConfig) => MockReply;

/** 按 url 路由不同响应：user/list、user/create、user/update、user/delete、role/* */
function adapterRouting(
  listReply: ReplyFn,
  writes: Partial<Record<string, ReplyFn>> = {},
): { calls: string[] } {
  const calls: string[] = [];
  eiamAxios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? "";
    calls.push(url);
    let reply: MockReply;
    if (url.includes("/user/list")) reply = listReply(config);
    else if (url.includes("/user/create"))
      reply = (
        writes.create ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: 99 } }))
      )(config);
    else if (url.includes("/user/update"))
      reply = (
        writes.update ??
        (() => ({ status: 200, body: { code: 0, msg: "", data: null } }))
      )(config);
    else if (url.includes("/user/delete"))
      reply = (
        writes.delete ??
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
    else if (url.includes("/role/list/attached/user"))
      reply = (
        writes.rolesForUser ??
        (() => ({
          status: 200,
          body: { code: 0, msg: "", data: { total: 0, roles: [] } },
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

/** 用户列表信封（snake_case UserMemberVO 子集） */
function listEnvelope(users: unknown[], total = users.length): unknown {
  return { code: 0, msg: "ok", data: { total, users } };
}

function userRaw(id: number, username: string, status = "active"): unknown {
  return { id, username, nickname: `昵称${id}`, status, last_login_at: 0 };
}

async function freshStore(
  listReply: ReplyFn,
  writes: Partial<Record<string, ReplyFn>> = {},
): Promise<{
  store: ReturnType<typeof useUserListStore>;
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
  return { store: useUserListStore(), calls };
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

describe("userList store 统一契约（AC-1）", () => {
  it("state 初值：items=[] / total=0 / page=1 / pageSize=20 / loading=false / error=null", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/users");
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
    expect(replaced).toHaveLength(0);
  });

  it("fetch 成功：归一 items/total，loading 复位", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([userRaw(1, "alice"), userRaw(2, "bob")], 2),
    }));
    const ok = await store.fetch();
    expect(ok).toBe(true);
    expect(store.items).toHaveLength(2);
    expect(store.items[0]).toMatchObject({
      id: 1,
      username: "alice",
      displayName: "昵称1",
      status: "active",
      loginMethod: "password",
      passkeyRegistered: false,
    });
    expect(store.total).toBe(2);
    expect(store.loading).toBe(false);
  });

  it("fetch 2xx 业务错误（code!=0）：归位 error 回退 envelope msg，不渲染", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(() => ({
      status: 200,
      body: { code: 500, msg: "身份服务繁忙", data: null },
    }));
    const ok = await store.fetch();
    expect(ok).toBe(false);
    // 未知 code（500 不在契约表）→ contractText 返回 null → 回退 ApiError.message（envelope msg）
    expect(store.error).toBe("身份服务繁忙");
  });

  it("fetch 网络故障 → error 取 axios 诊断", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(() => ({
      networkFailure: { code: "ERR_NETWORK", message: "Network Error" },
    }));
    const ok = await store.fetch();
    expect(ok).toBe(false);
    expect(store.error).toBe("Network Error");
  });

  it("fetch 前中断在途：第二次 abort 第一次，第一次返回 false 不覆盖 state", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([userRaw(1, "alice")], 1),
    }));
    // 并发两次 fetch：第一次被 abort
    const first = store.fetch();
    const second = store.fetch();
    const [firstOk, secondOk] = await Promise.all([first, second]);
    expect(firstOk).toBe(false); // 被中断
    expect(secondOk).toBe(true); // 成功
    expect(store.items).toHaveLength(1); // 第二次结果生效
  });

  it("响应无租户标识 → assertResponseTenantMatch 跳过此层放行（不 reload）", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([userRaw(1, "alice")], 1),
    }));
    await store.fetch();
    // user/list 响应无 response 级租户标识 → 跳过 → 不 reload
    expect(replaced).toHaveLength(0);
  });

  it("不声明 persist：state 不落 localStorage", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([]),
    }));
    store.setPage(3);
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.includes("userList"))).toBe(false);
  });
});

describe("E7 分页边界（AC-2）", () => {
  it("page 超出总页数 → 回落最后页重查", async () => {
    stubLocation("http://localhost:8888/console/users");
    // total=2, pageSize=20 → 总页数 1；page=5 超界 → 回落到 1
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([userRaw(1, "alice"), userRaw(2, "bob")], 2),
    }));
    store.setPage(5);
    expect(store.page).toBe(5);
    await store.fetch();
    expect(store.page).toBe(1); // 回落最后页
  });

  it("删除末页唯一记录 → 回退上一页重查", async () => {
    stubLocation("http://localhost:8888/console/users");
    // 构造 2 页：第 1 页 20 条、第 2 页 1 条；删除第 2 页那条 → 回退到第 1 页
    // 状态化 mock：删除后 total 由 21 → 20，第 2 页变空触发 E7 回退
    let deleted = false;
    const { store } = await freshStore(
      (config) => {
        const body =
          typeof config.data === "string"
            ? JSON.parse(config.data)
            : (config.data as Record<string, unknown> | undefined);
        const offset = typeof body?.offset === "number" ? body.offset : 0;
        const total = deleted ? 20 : 21;
        // 第 2 页（offset>=20）：删除前 1 条；删除后 0 条
        if (offset >= 20) {
          return {
            status: 200,
            body: listEnvelope(deleted ? [] : [userRaw(21, "u21")], total),
          };
        }
        // 第 1 页：20 条（删除前后均如此，total 随 deleted 变化）
        const users = Array.from({ length: 20 }, (_, i) =>
          userRaw(i + 1, `u${i + 1}`),
        );
        return { status: 200, body: listEnvelope(users, total) };
      },
      {
        delete: () => {
          deleted = true;
          return { status: 200, body: { code: 0, msg: "", data: null } };
        },
      },
    );
    store.setPageSize(20);
    store.setPage(2);
    await store.fetch();
    expect(store.page).toBe(2);
    expect(store.items).toHaveLength(1);
    // 删除末页唯一记录 → total 变 20，总页数变 1，page=2 > 1 → 回退到 1
    await store.remove(21);
    expect(store.page).toBe(1);
    expect(store.items).toHaveLength(20);
  });

  it("切 keyword / roleFilter 重置 page=1", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([]),
    }));
    store.setPage(4);
    store.setKeyword("alice");
    expect(store.page).toBe(1);
    store.setPage(4);
    store.setRoleFilter("admin");
    expect(store.page).toBe(1);
  });
});

describe("写前守卫（AC-1 + 3.1 接入，Hard Rule 不绕过）", () => {
  it("快照 != currentTenantId → create 阻断（返回 null）+ reload 自愈，不发请求", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/users");
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
    snapshotMock.mockReturnValue(3); // 页面进入时 X=3
    useTenantStore().setCurrentTenantId(7); // 他标签切到 Y=7
    const store = useUserListStore();
    const result = await store.create(
      { username: "newuser", password: "P@ss1234" },
      [],
    );
    expect(result).toBeNull(); // 阻断
    expect(replaced).toEqual(["http://localhost:8888/console/users"]); // reload 自愈
    expect(calls.some((u) => u.includes("/user/create"))).toBe(false); // 未发请求
  });

  it("快照 != currentTenantId → update 阻断（false）+ reload", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/users");
    adapterRouting(() => ({ status: 200, body: listEnvelope([]) }), {
      update: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
    });
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({ render: () => null }).use(pinia);
    setActivePinia(pinia);
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);
    const store = useUserListStore();
    const ok = await store.update({ id: 1, nickname: "x" }, "alice");
    expect(ok).toBe(false);
    expect(replaced).toHaveLength(1);
  });

  it("快照 != currentTenantId → remove 阻断（false）+ reload", async () => {
    const { replaced } = stubLocation("http://localhost:8888/console/users");
    adapterRouting(() => ({ status: 200, body: listEnvelope([]) }), {
      delete: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
    });
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({ render: () => null }).use(pinia);
    setActivePinia(pinia);
    snapshotMock.mockReturnValue(3);
    useTenantStore().setCurrentTenantId(7);
    const store = useUserListStore();
    const ok = await store.remove(1);
    expect(ok).toBe(false);
    expect(replaced).toHaveLength(1);
  });
});

describe("create / update / remove（AC-3/AC-4/AC-5，写前守卫放行路径）", () => {
  it("create：createUser + 角色分配（batch_assign）+ 回第一页刷新；返回初始密码回显", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store, calls } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        create: () => ({ status: 200, body: { code: 0, msg: "", data: 42 } }),
      },
    );
    store.setPage(3);
    const result = await store.create(
      { username: "newuser", password: "InitPass123" },
      ["admin", "viewer"],
    );
    expect(result).not.toBeNull();
    expect(result?.id).toBe(42);
    expect(result?.initialPassword).toBe("InitPass123"); // 初始密码回显（展示一次）
    expect(store.page).toBe(1); // 回第一页
    expect(calls.some((u) => u.includes("/user/create"))).toBe(true);
    expect(calls.some((u) => u.includes("/role/batch_assign"))).toBe(true);
  });

  it("update：updateUser + 角色 diff（added→assign, removed→unassign）+ 刷新", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store, calls } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        update: () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
      },
    );
    const ok = await store.update(
      { id: 1, nickname: "新昵称", status: "disable" },
      "alice",
      { added: ["admin"], removed: ["viewer"] },
    );
    expect(ok).toBe(true);
    expect(calls.some((u) => u.includes("/user/update"))).toBe(true);
    expect(calls.some((u) => u.includes("/role/batch_assign"))).toBe(true);
    expect(calls.some((u) => u.includes("/role/batch_unassign"))).toBe(true);
  });

  it("remove：E11 依赖删除被拒（conflict）→ 重新抛出，调用方可据 kind 渲染阻断", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        delete: () => ({
          status: 409,
          body: { code: 40901, msg: "该用户已被依赖", data: null },
        }),
      },
    );
    await expect(store.remove(1)).rejects.toThrow();
    expect(store.error).toBe("该用户已被依赖"); // 未知 code 回退 envelope msg
  });
});

describe("401 收敛：registerUnauthorizedReset 复位 state（AC-1）", () => {
  it("注册的复位回调清空 items/error 并中断在途", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(() => ({
      status: 200,
      body: listEnvelope([userRaw(1, "alice")], 1),
    }));
    await store.fetch();
    expect(store.items).toHaveLength(1);
    store.setPage(4);
    store.error = "残错误";
    // 模拟 401 收敛：router 调用注册的复位回调
    expect(resetRegistrations.length).toBeGreaterThanOrEqual(1);
    for (const fn of resetRegistrations) fn();
    expect(store.items).toEqual([]);
    expect(store.total).toBe(0);
    expect(store.page).toBe(1);
    expect(store.error).toBeNull();
  });
});

describe("loadUserRoles（详情页角色回显 enrichment）", () => {
  it("成功返回 RoleRef[]（camelCase 归一）", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        rolesForUser: () => ({
          status: 200,
          body: {
            code: 0,
            msg: "",
            data: {
              total: 2,
              roles: [
                { id: 1, code: "admin", name: "管理员", desc: "x" },
                { id: 2, code: "viewer", name: "只读" },
              ],
            },
          },
        }),
      },
    );
    const roles = await store.loadUserRoles(1);
    expect(roles).toEqual([
      { id: 1, code: "admin", name: "管理员" },
      { id: 2, code: "viewer", name: "只读" },
    ]);
  });

  it("失败降级返回空数组（不阻断详情渲染）", async () => {
    stubLocation("http://localhost:8888/console/users");
    const { store } = await freshStore(
      () => ({ status: 200, body: listEnvelope([]) }),
      {
        rolesForUser: () => ({
          networkFailure: { code: "ERR_NETWORK", message: "fail" },
        }),
      },
    );
    const roles = await store.loadUserRoles(1);
    expect(roles).toEqual([]);
  });
});
