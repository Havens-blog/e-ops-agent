// @vitest-environment happy-dom
/**
 * authorizationList store（task 5.2）契约测试。
 *
 * 覆盖 AC：
 * - 统一契约 state{items,total,page,pageSize,loading,error} + fetch/create/remove
 * - AbortController fetch 前中断在途（AC-3）
 * - 写前守卫（3.1）：快照 != currentTenantId → 阻断写 + reload 自愈（Hard Rule 不绕过）
 * - 三元组唯一性前端预检（grant.duplicate）：重复 → 阻断 create + error 归位
 * - eiam 服务端兜底：conflict kind → contractText(grant.duplicate) 文案
 * - 撤销 pending 态：remove 提交 → isPending=true + revokeAnnouncement 播报 → fetch 刷新移除
 * - pending ≤30s 兜底超时强制刷新（定时器模拟）
 * - 词表 G-5 降级：fetchVocab 成功/失败归位 vocab/vocabError
 * - E7：page 超界回落最后页；切 keyword 重置 page=1
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
import { useAuthorizationListStore } from "./authorizationList";
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

function adapterRouting(
  listReply: ReplyFn,
  writes: Partial<Record<string, ReplyFn>> = {},
): { calls: string[] } {
  const calls: string[] = [];
  eiamAxios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? "";
    calls.push(url);
    let reply: MockReply;
    if (url.includes("/permission/authorizations"))
      reply = (writes.list ?? listReply)(config);
    else if (url.includes("/role/batch_assign"))
      reply = (writes.createAssign ?? (() => ({ body: { code: 0, msg: "", data: null } })))(config);
    else if (url.includes("/policy/batch-attach"))
      reply = (writes.createAttach ?? (() => ({ body: { code: 0, msg: "", data: null } })))(config);
    else if (url.includes("/role/batch_unassign"))
      reply = (writes.revokeAssign ?? (() => ({ body: { code: 0, msg: "", data: null } })))(config);
    else if (url.includes("/policy/batch-detach"))
      reply = (writes.revokeAttach ?? (() => ({ body: { code: 0, msg: "", data: null } })))(config);
    else if (url.includes("/permission/subjects/search"))
      reply = (writes.subjects ?? (() => ({ body: { code: 0, msg: "", data: { total: 0, subjects: [] } } })))(config);
    else if (url.includes("/role/list"))
      reply = (writes.roleList ?? (() => ({ body: { code: 0, msg: "", data: { total: 0, roles: [] } } })))(config);
    else if (url.includes("/policy/list"))
      reply = (writes.policyList ?? (() => ({ body: { code: 0, msg: "", data: { total: 0, policies: [] } } })))(config);
    else reply = { body: { code: 0, msg: "", data: null } };
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

function authEnvelope(items: unknown[], total = items.length): unknown {
  return { code: 0, msg: "ok", data: { total, authorizations: items } };
}

function authRaw(
  subject: string,
  target: string,
  objType: "role" | "policy" = "role",
): unknown {
  return { subject, target, sub_type: "user", obj_type: objType };
}

async function freshStore(
  listReply: ReplyFn,
  writes: Partial<Record<string, ReplyFn>> = {},
): Promise<{
  store: ReturnType<typeof useAuthorizationListStore>;
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
  return { store: useAuthorizationListStore(), calls };
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

describe("authorizationList store 统一契约（AC-1）", () => {
  it("state 初值：items=[] / total=0 / page=1 / pageSize=20 / loading=false / error=null", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({
      status: 200,
      body: authEnvelope([]),
    }));
    expect(store.items).toEqual([]);
    expect(store.total).toBe(0);
    expect(store.page).toBe(1);
    expect(store.pageSize).toBe(20);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.revokePending.size).toBe(0);
    expect(store.revokeAnnouncement).toBe("");
    expect(store.vocab).toBeNull();
  });

  it("fetch 成功：归一 items/total（D-4→三元组），loading 复位", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({
      status: 200,
      body: authEnvelope([
        authRaw("alice", "admin", "role"),
        authRaw("bob", "P1", "policy"),
      ]),
    }));
    const ok = await store.fetch();
    expect(ok).toBe(true);
    expect(store.items).toHaveLength(2);
    expect(store.items[0]).toEqual({
      subject: "alice",
      resource: "admin",
      action: "assign",
    });
    expect(store.items[1]).toEqual({
      subject: "bob",
      resource: "P1",
      action: "attach",
    });
    expect(store.total).toBe(2);
    expect(store.loading).toBe(false);
  });

  it("fetch 2xx 业务错误（code!=0）：归位 error 回退 envelope msg", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({
      status: 200,
      body: { code: 500001, msg: "服务暂不可用", data: null },
    }));
    const ok = await store.fetch();
    expect(ok).toBe(false);
    expect(store.error).toBe("服务暂不可用");
    expect(store.items).toEqual([]);
  });

  it("fetch 5xx：归位 error = HTTP 状态短语（unavailable kind）", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({
      status: 500,
      body: { code: 0, msg: "", data: null },
    }));
    await store.fetch();
    expect(store.error).toContain("HTTP 500");
  });
});

describe("authorizationList 唯一性前端预检（AC-2，grant.duplicate）", () => {
  it("重复三元组 → 阻断 create + error = grant.duplicate 文案，不发请求", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store, calls } = await freshStore(() => ({
      status: 200,
      body: authEnvelope([authRaw("alice", "admin", "role")]),
    }));
    await store.fetch();
    calls.length = 0;
    const ok = await store.create({
      subject: "alice",
      resource: "admin",
      action: "assign",
    });
    expect(ok).toBe(false);
    expect(store.error).toBe("授权已存在");
    // 不发 create 请求（被前端预检拦截）
    expect(calls.some((c) => c.includes("batch_assign"))).toBe(false);
  });

  it("不重复 → create 成功（G-6 映射 action=assign → role/batch_assign）+ 回第一页刷新", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store, calls } = await freshStore(() => ({
      status: 200,
      body: authEnvelope([authRaw("alice", "admin", "role")]),
    }), {
      createAssign: () => ({ body: { code: 0, msg: "", data: null } }),
    });
    await store.fetch();
    calls.length = 0;
    const ok = await store.create({
      subject: "bob",
      resource: "viewer",
      action: "assign",
    });
    expect(ok).toBe(true);
    expect(calls.some((c) => c.includes("role/batch_assign"))).toBe(true);
    expect(store.page).toBe(1);
  });

  it("action=attach → policy/batch-attach", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store, calls } = await freshStore(() => ({
      status: 200,
      body: authEnvelope([authRaw("alice", "admin", "role")]),
    }), {
      createAttach: () => ({ body: { code: 0, msg: "", data: null } }),
    });
    await store.fetch();
    calls.length = 0;
    const ok = await store.create({
      subject: "alice",
      resource: "P1",
      action: "attach",
      subType: "user",
    });
    expect(ok).toBe(true);
    expect(calls.some((c) => c.includes("policy/batch-attach"))).toBe(true);
  });

  it("eiam 服务端兜底拒绝（conflict kind）：contractText 兜底文案", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({
      status: 200,
      body: authEnvelope([authRaw("alice", "admin", "role")]),
    }), {
      createAssign: () => ({
        status: 200,
        body: { code: 409001, msg: "授权已存在", data: null },
      }),
    });
    await store.fetch();
    // 新三元组（前端预检通过，eiam 兜底拒绝）
    const ok = await store.create({
      subject: "newuser",
      resource: "viewer",
      action: "assign",
    });
    expect(ok).toBe(false);
    // contractText(409001) 未知 code → 回退 envelope msg = "授权已存在"
    expect(store.error).toBe("授权已存在");
  });
});

describe("authorizationList 写前守卫（Hard Rule：不得绕过）", () => {
  it("快照 != currentTenantId → 阻断 create + reload 自愈", async () => {
    const loc = stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({
      status: 200,
      body: authEnvelope([]),
    }));
    // 快照与 currentTenantId 不一致
    snapshotMock.mockReturnValue(99);
    const ok = await store.create({
      subject: "alice",
      resource: "admin",
      action: "assign",
    });
    expect(ok).toBe(false);
    expect(loc.replaced.length).toBeGreaterThan(0);
  });

  it("快照 != currentTenantId → 阻断 remove + reload 自愈", async () => {
    const loc = stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({
      status: 200,
      body: authEnvelope([authRaw("alice", "admin", "role")]),
    }), {
      revokeAssign: () => ({ body: { code: 0, msg: "", data: null } }),
    });
    await store.fetch();
    snapshotMock.mockReturnValue(99);
    const ok = await store.remove({
      subject: "alice",
      resource: "admin",
      action: "assign",
    });
    expect(ok).toBe(false);
    expect(loc.replaced.length).toBeGreaterThan(0);
  });
});

describe("authorizationList 撤销 pending 态（AC-3/AC-4，≤30s aria-live）", () => {
  it("remove 提交成功 → isPending=true + revokeAnnouncement 播报 + fetch 刷新移除该行", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(
      () => ({
        status: 200,
        body: authEnvelope([authRaw("alice", "admin", "role")]),
      }),
      {
        revokeAssign: () => ({ body: { code: 0, msg: "", data: null } }),
        list: () => ({ body: authEnvelope([]) }),
      },
    );
    await store.fetch();
    const target = { subject: "alice", resource: "admin", action: "assign" };
    expect(store.isPending(target)).toBe(false);
    const ok = await store.remove(target);
    expect(ok).toBe(true);
    // 撤销成功后该行移除 + pending 清除
    expect(store.isPending(target)).toBe(false);
    expect(store.items.find((a) => a.subject === "alice")).toBeUndefined();
    // aria-live 播报含「已撤销」
    expect(store.revokeAnnouncement).toContain("已撤销");
  });

  it("remove 提交期间 isPending=true（pending 态行内徽标 + 操作禁用）", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    let resolveRevoke: () => void = () => {};
    const { store } = await freshStore(
      () => ({ body: authEnvelope([authRaw("alice", "admin", "role")]) }),
      {
        revokeAssign: () =>
          new Promise<MockReply>((resolve) => {
            resolveRevoke = () => resolve({ body: { code: 0, msg: "", data: null } });
          }) as unknown as MockReply,
        list: () => ({ body: authEnvelope([]) }),
      },
    );
    await store.fetch();
    const target = { subject: "alice", resource: "admin", action: "assign" };
    const pending = store.remove(target);
    // 提交期间 pending 态生效
    await vi.waitFor(() => expect(store.isPending(target)).toBe(true));
    expect(store.revokeAnnouncement).toContain("正在撤销");
    resolveRevoke();
    await pending;
    expect(store.isPending(target)).toBe(false);
  });

  it("pending ≤30s 兜底超时强制刷新对账（定时器模拟）", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    vi.useFakeTimers();
    const { store } = await freshStore(
      () => ({ body: authEnvelope([authRaw("alice", "admin", "role")]) }),
      {
        // revoke 永不返回（模拟超时）
        revokeAssign: () =>
          new Promise<MockReply>(() => {}) as unknown as MockReply,
        list: () => ({ body: authEnvelope([]) }),
      },
    );
    await store.fetch();
    const target = { subject: "alice", resource: "admin", action: "assign" };
    const pending = store.remove(target);
    await vi.waitFor(() => expect(store.isPending(target)).toBe(true));
    // 30s 超时触发强制刷新
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.isPending(target)).toBe(false);
    // 强制 fetch 对账后该行移除
    expect(store.items.find((a) => a.subject === "alice")).toBeUndefined();
    // 清理未完成的 promise
    await pending.catch(() => {});
    vi.useRealTimers();
  });

  it("remove 失败 → 移除 pending（恢复操作）+ error 归位", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(
      () => ({ body: authEnvelope([authRaw("alice", "admin", "role")]) }),
      {
        revokeAssign: () => ({
          status: 200,
          body: { code: 500001, msg: "撤销失败", data: null },
        }),
      },
    );
    await store.fetch();
    const target = { subject: "alice", resource: "admin", action: "assign" };
    const ok = await store.remove(target);
    expect(ok).toBe(false);
    expect(store.isPending(target)).toBe(false);
    expect(store.error).toBe("撤销失败");
  });
});

describe("authorizationList 词表 G-5 降级（AC-5）", () => {
  it("fetchVocab 成功 → vocab 回填 + source 标注", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(
      () => ({ body: authEnvelope([]) }),
      {
        subjects: (config) => {
          const body = JSON.parse(config.data);
          if (body.sub_type === "user") {
            return {
              body: {
                code: 0,
                msg: "",
                data: {
                  total: 1,
                  subjects: [{ code: "alice", sub_type: "user" }],
                },
              },
            };
          }
          return {
            body: { code: 0, msg: "", data: { total: 0, subjects: [] } },
          };
        },
        roleList: () => ({
          body: { code: 0, msg: "", data: { total: 1, roles: [{ code: "admin" }] } },
        }),
        policyList: () => ({
          body: {
            code: 0,
            msg: "",
            data: { total: 0, policies: [] },
          },
        }),
      },
    );
    const ok = await store.fetchVocab();
    expect(ok).toBe(true);
    expect(store.vocab?.subjects).toEqual([
      { code: "alice", subType: "user", name: undefined },
    ]);
    expect(store.vocab?.resources).toEqual(["admin"]);
    expect(store.vocab?.actions).toEqual(["assign", "attach"]);
    expect(store.vocab?.source).toContain("eiam");
  });

  it("fetchVocab 全端点失败 → 降级静态词表（G-5），ok=true（降级非错误）", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({ body: authEnvelope([]) }), {
      subjects: () => ({ networkFailure: { code: "ERR", message: "down" } }),
      roleList: () => ({ networkFailure: { code: "ERR", message: "down" } }),
      policyList: () => ({ networkFailure: { code: "ERR", message: "down" } }),
    });
    const ok = await store.fetchVocab();
    // fetchVocabulary 内部 Promise.allSettled 容错降级，不抛错 → ok=true + 静态词表回填
    expect(ok).toBe(true);
    expect(store.vocab).not.toBeNull();
    expect(store.vocab?.actions).toEqual(["assign", "attach"]);
    expect(store.vocab?.source).toContain("parity-checklist");
  });
});

describe("authorizationList E7 分页边界 + 401 收敛", () => {
  it("切 keyword 重置 page=1", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({ body: authEnvelope([]) }));
    store.setPage(5);
    store.setKeyword("alice");
    expect(store.page).toBe(1);
    expect(store.keyword).toBe("alice");
  });

  it("setPageSize 重置 page=1 + clamp 上限 100", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({ body: authEnvelope([]) }));
    store.setPage(3);
    store.setPageSize(500);
    expect(store.pageSize).toBe(100);
    expect(store.page).toBe(1);
  });

  it("401 收敛：registerUnauthorizedReset 回调复位 state", async () => {
    stubLocation("http://localhost:8888/console/authorizations");
    const { store } = await freshStore(() => ({
      body: authEnvelope([authRaw("alice", "admin", "role")]),
    }));
    await store.fetch();
    store.setPage(3);
    store.setKeyword("x");
    // 模拟 401 收敛触发复位回调
    for (const fn of resetRegistrations) fn();
    expect(store.items).toEqual([]);
    expect(store.page).toBe(1);
    expect(store.keyword).toBe("");
    expect(store.revokePending.size).toBe(0);
    expect(store.revokeAnnouncement).toBe("");
    expect(store.vocab).toBeNull();
  });
});
