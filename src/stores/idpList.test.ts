// @vitest-environment happy-dom
/**
 * idpList store（task 4.5，UF-7）契约测试。
 *
 * 覆盖 AC：
 * - 统一契约 state{items,total,page,pageSize,loading,error} + fetch/create/update/remove/toggle
 * - AbortController fetch 前中断在途（AC-3）
 * - 写前守卫（3.1）：快照 != currentTenantId → 阻断写 + reload 自愈（Hard Rule 不绕过）
 * - 响应回读（3.1）：identity_source/list 无租户标识 → 跳过此层放行
 * - save upsert（create id=0 / update id>0 均命中 /save，嵌套 ldap，D-2）
 * - 启停走真实 toggle 路径（非 update 承载）
 * - test 连接：成功返回文案 / 失败抛错（不归位 store.error）
 * - Bind 密码 Hard Rule：编辑态留空（password=""）透传，eiam 服务端兜底不修改
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
import { useIdpListStore } from "./idpList";
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
  snapshotMock.mockReturnValue(1);
  useTenantStore().setCurrentTenantId(1);
});

afterEach(() => {
  eiamAxios.defaults.adapter = undefined;
  restoreLocation(realLocation);
});

function ldapSource(overrides: Partial<{
  id: number;
  name: string;
  enabled: boolean;
  password: string;
}> = {}) {
  return {
    id: overrides.id ?? 0,
    name: overrides.name ?? "公司 LDAP",
    type: "ldap" as const,
    conn: {
      url: "ldaps://dc.example.com:636",
      port: 636,
      bindDn: "cn=admin,dc=example,dc=com",
      password: overrides.password ?? "secret",
      baseDn: "dc=example,dc=com",
      attrMap: { username: "uid", email: "mail" },
      timeoutSec: 5,
    },
    enabled: overrides.enabled ?? true,
  };
}

function listReply(sources: unknown[]) {
  return { code: 0, msg: "ok", data: sources };
}

describe("统一契约 state + fetch", () => {
  it("初始 state 默认值（默认页大小 20、上限 100）", () => {
    const s = useIdpListStore();
    expect(s.items).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(20);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("fetch 成功 → 写入 items/total（eiam list 非分页，total = items 长度）", async () => {
    const s = useIdpListStore();
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/list") {
        return {
          body: listReply([
            { id: 1, name: "A", type: "ldap", enabled: true, ldap: { url: "ldap://h:389", base_dn: "dc=a", bind_dn: "cn=a", username_attribute: "uid" } },
            { id: 2, name: "B", type: "ldap", enabled: false, ldap: { url: "ldap://h:389", base_dn: "dc=b", bind_dn: "cn=b", username_attribute: "cn" } },
          ]),
        };
      }
      return { status: 404 };
    });
    const ok = await s.fetch();
    expect(ok).toBe(true);
    expect(s.items).toHaveLength(2);
    expect(s.items[0]?.name).toBe("A");
    expect(s.items[0]?.conn.password).toBe(""); // Hard Rule：不回显
    expect(s.total).toBe(2);
    expect(s.loading).toBe(false);
  });

  it("fetch 失败 → 归位 error（contractText 回退），不复位 items", async () => {
    const s = useIdpListStore();
    s.items = [
      { id: 9, name: "old", type: "ldap", conn: { url: "", port: 0, bindDn: "", password: "", baseDn: "", attrMap: { username: "uid" }, timeoutSec: 5 }, enabled: true },
    ];
    adapterFor(() => ({
      body: { code: 5001, msg: "身份服务暂不可用", data: null },
    }));
    const ok = await s.fetch();
    expect(ok).toBe(false);
    expect(s.error).not.toBeNull();
    expect(s.items).toHaveLength(1); // 保留
  });
});

describe("写前守卫（3.1，Hard Rule）", () => {
  it("快照 != currentTenantId → create 阻断写 + reload 自愈，返回 null", async () => {
    const { replaced } = stubLocation("http://localhost/identity-sources");
    snapshotMock.mockReturnValue(1);
    useTenantStore().setCurrentTenantId(2); // 切租户后不一致
    const s = useIdpListStore();
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({ body: { code: 0, msg: "ok", data: 99 } }), captured);
    const id = await s.create(ldapSource());
    expect(id).toBeNull();
    expect(captured).toHaveLength(0); // 未发请求
    expect(replaced.length).toBeGreaterThan(0); // reload 自愈
  });

  it("快照 != currentTenantId → update 阻断写，返回 false", async () => {
    const { replaced } = stubLocation("http://localhost/identity-sources");
    snapshotMock.mockReturnValue(1);
    useTenantStore().setCurrentTenantId(2);
    const s = useIdpListStore();
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({ body: { code: 0, msg: "ok", data: null } }), captured);
    const ok = await s.update(ldapSource({ id: 5 }));
    expect(ok).toBe(false);
    expect(captured).toHaveLength(0);
    expect(replaced.length).toBeGreaterThan(0);
  });

  it("快照 != currentTenantId → toggle 阻断写", async () => {
    const { replaced } = stubLocation("http://localhost/identity-sources");
    snapshotMock.mockReturnValue(1);
    useTenantStore().setCurrentTenantId(2);
    const s = useIdpListStore();
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({ body: { code: 0, msg: "ok", data: null } }), captured);
    const ok = await s.toggle(5);
    expect(ok).toBe(false);
    expect(captured).toHaveLength(0);
    expect(replaced.length).toBeGreaterThan(0);
  });

  it("快照 != currentTenantId → remove 阻断写", async () => {
    const { replaced } = stubLocation("http://localhost/identity-sources");
    snapshotMock.mockReturnValue(1);
    useTenantStore().setCurrentTenantId(2);
    const s = useIdpListStore();
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({ body: { code: 0, msg: "ok", data: null } }), captured);
    const ok = await s.remove(5);
    expect(ok).toBe(false);
    expect(captured).toHaveLength(0);
    expect(replaced.length).toBeGreaterThan(0);
  });
});

describe("save upsert（D-2 嵌套 ldap）", () => {
  it("create：id=0 命中 /save，载荷嵌套 ldap，无 port/timeoutSec 字段", async () => {
    const s = useIdpListStore();
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/save") {
        return { body: { code: 0, msg: "ok", data: 42 } };
      }
      if (config.url === "/api/iam/identity_source/list") {
        return { body: listReply([]) };
      }
      return { status: 404 };
    }, captured);
    const id = await s.create(ldapSource());
    expect(id).toBe(42);
    const saveCall = captured.find((c) => c.url === "/api/iam/identity_source/save");
    const payload = JSON.parse(String(saveCall?.data)) as Record<string, unknown>;
    expect(payload.id).toBe(0);
    const ldap = payload.ldap as Record<string, unknown>;
    expect(ldap).not.toHaveProperty("port");
    expect(ldap).not.toHaveProperty("timeoutSec");
    expect(ldap.bind_password).toBe("secret");
  });

  it("update：id>0 命中 /save（upsert），bind_password='' 透传（Hard Rule 编辑态留空）", async () => {
    const s = useIdpListStore();
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/save") {
        return { body: { code: 0, msg: "ok", data: null } };
      }
      if (config.url === "/api/iam/identity_source/list") {
        return { body: listReply([]) };
      }
      return { status: 404 };
    }, captured);
    const src = ldapSource({ id: 9, password: "" }); // 编辑态留空 = 不修改
    const ok = await s.update(src);
    expect(ok).toBe(true);
    const saveCall = captured.find((c) => c.url === "/api/iam/identity_source/save");
    const payload = JSON.parse(String(saveCall?.data)) as Record<string, unknown>;
    expect(payload.id).toBe(9);
    expect((payload.ldap as Record<string, unknown>).bind_password).toBe("");
  });

  it("create 失败 → 归位 error，返回 null", async () => {
    const s = useIdpListStore();
    adapterFor(() => ({
      body: { code: 4001, msg: "名称已存在：公司 LDAP", data: null },
    }));
    const id = await s.create(ldapSource());
    expect(id).toBeNull();
    expect(s.error).not.toBeNull();
  });
});

describe("启停真实 toggle 路径", () => {
  it("toggle 命中 /api/iam/identity_source/toggle/:id（非 update 承载）", async () => {
    const s = useIdpListStore();
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/toggle/3") {
        return { body: { code: 0, msg: "状态切换成功", data: null } };
      }
      if (config.url === "/api/iam/identity_source/list") {
        return { body: listReply([]) };
      }
      return { status: 404 };
    }, captured);
    const ok = await s.toggle(3);
    expect(ok).toBe(true);
    const toggleCall = captured.find((c) => c.url === "/api/iam/identity_source/toggle/3");
    expect(toggleCall?.method).toBe("post");
  });
});

describe("test 连接（成功/失败提示，不归位 store.error）", () => {
  it("成功 → 返回文案，store.error 不被污染", async () => {
    const s = useIdpListStore();
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/test") {
        return { body: { code: 0, msg: "连接成功", data: null } };
      }
      return { status: 404 };
    });
    const msg = await s.test(ldapSource());
    expect(msg).toBe("连接成功");
    expect(s.error).toBeNull();
  });

  it("失败 → 抛错（调用方就近渲染），store.error 不被污染（非阻塞即时反馈）", async () => {
    const s = useIdpListStore();
    adapterFor(() => ({
      body: { code: 5001, msg: "测试身份源连接失败: dial tcp: connection refused", data: null },
    }));
    await expect(s.test(ldapSource())).rejects.toThrow();
    expect(s.error).toBeNull();
  });
});

describe("AbortController fetch 前中断在途（AC-3，结构覆盖）", () => {
  it("连续 fetch → 最后一次结果写入（旧请求被 store 中断在途，不污染 items）", async () => {
    const s = useIdpListStore();
    let call = 0;
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/list") {
        call += 1;
        // 第一次返回 A，第二次返回 B；store fetch 前中断在途，最终以最后一次为准
        return {
          body: listReply([
            {
              id: call,
              name: call === 1 ? "A" : "B",
              type: "ldap",
              enabled: true,
              ldap: { url: "ldap://h:389", base_dn: "dc=a", bind_dn: "cn=a", username_attribute: "uid" },
            },
          ]),
        };
      }
      return { status: 404 };
    });
    await s.fetch();
    await s.fetch();
    expect(s.items).toHaveLength(1);
    expect(s.items[0]?.name).toBe("B");
    expect(s.loading).toBe(false);
  });
});

describe("分页 UI 态 setters + resetState", () => {
  it("setPage 设置当前页（<1 归 1）", () => {
    const s = useIdpListStore();
    s.setPage(3);
    expect(s.page).toBe(3);
    s.setPage(0);
    expect(s.page).toBe(1);
    s.setPage(-1);
    expect(s.page).toBe(1);
  });

  it("setPageSize 钳制到上限 100 并重置 page=1", () => {
    const s = useIdpListStore();
    s.setPage(5);
    s.setPageSize(999);
    expect(s.pageSize).toBe(100);
    expect(s.page).toBe(1);
    s.setPageSize(0);
    expect(s.pageSize).toBe(20); // 非法回落默认
  });

  it("resetState 复位全部 state", () => {
    const s = useIdpListStore();
    s.items = [
      { id: 1, name: "x", type: "ldap", conn: { url: "", port: 0, bindDn: "", password: "", baseDn: "", attrMap: { username: "uid" }, timeoutSec: 5 }, enabled: true },
    ];
    s.total = 1;
    s.page = 3;
    s.error = "err";
    s.resetState();
    expect(s.items).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(20);
    expect(s.error).toBeNull();
  });
});

describe("401 收敛 + 不声明 persist", () => {
  it("registerUnauthorizedReset 回调复位 state", () => {
    const s = useIdpListStore();
    s.items = [
      { id: 9, name: "old", type: "ldap", conn: { url: "", port: 0, bindDn: "", password: "", baseDn: "", attrMap: { username: "uid" }, timeoutSec: 5 }, enabled: true },
    ];
    s.total = 9;
    s.error = "down";
    s.loading = true;
    // 触发注册的复位回调
    for (const fn of resetRegistrations) fn();
    expect(s.items).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("store 不声明 persist（列表态不落 localStorage）", () => {
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate as never);
    const app = createApp({});
    app.use(pinia);
    const s = useIdpListStore(pinia);
    s.items = [
      { id: 1, name: "x", type: "ldap", conn: { url: "", port: 0, bindDn: "", password: "", baseDn: "", attrMap: { username: "uid" }, timeoutSec: 5 }, enabled: true },
    ];
    // persistedstate 默认写 localStorage（key=store id）—— 本 store 不声明 persist，不应落
    expect(localStorage.getItem("idpList")).toBeNull();
  });
});
