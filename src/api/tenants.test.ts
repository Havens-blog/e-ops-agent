// @vitest-environment happy-dom
/**
 * tenants.ts api 客户端映射单测（task 4.4，UF-6）。
 *
 * 覆盖归一契约（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - mapEiamTenant：TenantVO → 归一 Tenant；status int(1/2)→字符串词表；缺 id 返回 null；
 * - listTenants：{total, tenants} → Page<Tenant>，过滤 null，total 缺省按 items 长度；
 * - createTenant：eiam `{name, code}` 载荷 → 新 id；
 * - updateTenant：eiam `{id,name,code,domain,status(int)}` 载荷，status 字符串→int 归一；
 * - deleteTenant：DELETE /api/iam/tenant/delete/:id；
 * - G-4：list 响应不含 active_session_count 字段（无会话计数端点）。
 */
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTenant,
  deleteTenant,
  getTenantDetail,
  listTenants,
  mapEiamTenant,
  updateTenant,
} from "./tenants";
import { eiamAxios } from "@/api/request/eiam";

const STATUS_TEXT: Partial<Record<number, string>> = {
  200: "OK",
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

afterEach(() => {
  eiamAxios.defaults.adapter = undefined;
});

describe("mapEiamTenant（TenantVO → 归一 Tenant）", () => {
  it("完整字段 + status int 1 → 'active'", () => {
    const t = mapEiamTenant({
      id: 1,
      name: "平台空间",
      code: "platform",
      domain: "platform.example.com",
      status: 1,
      ctime: 1700000000,
    });
    expect(t).toMatchObject({
      id: 1,
      name: "平台空间",
      code: "platform",
      domain: "platform.example.com",
      status: "active",
    });
  });

  it("status int 2 → 'disable'", () => {
    const t = mapEiamTenant({ id: 2, name: "x", code: "x", status: 2 });
    expect(t?.status).toBe("disable");
  });

  it("status 缺失 / 未知 → 'unknown'", () => {
    expect(mapEiamTenant({ id: 3, name: "a", code: "a" })?.status).toBe(
      "unknown",
    );
    expect(
      mapEiamTenant({ id: 4, name: "b", code: "b", status: 99 })?.status,
    ).toBe("unknown");
    expect(
      mapEiamTenant({ id: 5, name: "c", code: "c", status: null })?.status,
    ).toBe("unknown");
  });

  it("缺 id（核心标识）→ null", () => {
    expect(mapEiamTenant({ name: "noid", code: "x" })).toBeNull();
    expect(mapEiamTenant({ id: 0, name: "zero" })).toBeNull();
  });

  it("非对象输入 → null", () => {
    expect(mapEiamTenant(null)).toBeNull();
    expect(mapEiamTenant("x")).toBeNull();
    expect(mapEiamTenant([1, 2])).toBeNull();
  });
});

describe("listTenants", () => {
  it("{total, tenants} → Page<Tenant>，过滤 null，int status 归一", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/list") {
        return {
          body: {
            code: 0,
            msg: "ok",
            data: {
              total: 2,
              tenants: [
                { id: 1, name: "a", code: "a", status: 1 },
                { id: 2, name: "b", code: "b", status: 2 },
                { id: 0, name: "bad" },
              ],
            },
          },
        };
      }
      return { status: 404 };
    }, captured);

    const page = await listTenants({ offset: 0, limit: 20, keyword: "" });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ id: 1, status: "active" });
    expect(page.items[1]).toMatchObject({ id: 2, status: "disable" });
    // 载荷 snake_case offset/limit/keyword
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({ offset: 0, limit: 20, keyword: "" });
  });

  it("total 缺省 → 按 items 长度", async () => {
    adapterFor(() => ({
      body: {
        code: 0,
        msg: "ok",
        data: {
          tenants: [{ id: 1, name: "a", code: "a", status: 1 }],
        },
      },
    }));
    const page = await listTenants({ offset: 0, limit: 20, keyword: "" });
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
  });

  it("空 tenants 数组 → 空 Page", async () => {
    adapterFor(() => ({
      body: { code: 0, msg: "ok", data: { total: 0, tenants: [] } },
    }));
    const page = await listTenants({ offset: 0, limit: 20, keyword: "" });
    expect(page.total).toBe(0);
    expect(page.items).toHaveLength(0);
  });

  it("G-4：响应不含 active_session_count 字段（无会话计数端点）", async () => {
    adapterFor(() => ({
      body: {
        code: 0,
        msg: "ok",
        data: {
          total: 1,
          tenants: [{ id: 1, name: "a", code: "a", status: 1, ctime: 1 }],
        },
      },
    }));
    const page = await listTenants({ offset: 0, limit: 20, keyword: "" });
    // Tenant 模型无 activeSessionCount 字段（G-4 降级：列无 list 数据源）
    expect(page.items[0]).not.toHaveProperty("activeSessionCount");
  });

  it("2xx + code!=0 → 抛 ApiError（业务码透传）", async () => {
    adapterFor(() => ({
      body: { code: 1001, msg: "权限不足", data: null },
    }));
    await expect(
      listTenants({ offset: 0, limit: 20, keyword: "" }),
    ).rejects.toMatchObject({ code: 1001, message: "权限不足" });
  });
});

describe("createTenant", () => {
  it("载荷 {name, code}（create 不携带 domain）→ 新 id", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/create") {
        return { body: { code: 0, msg: "ok", data: 42 } };
      }
      return { status: 404 };
    }, captured);
    const id = await createTenant({ name: "新租户", code: "new", domain: "x" });
    expect(id).toBe(42);
    // create 载荷仅 {name, code}（domain 不进 create 载荷，经 update 后置补全）
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({ name: "新租户", code: "new" });
  });
});

describe("updateTenant", () => {
  it("载荷 {id,name,code,domain,status(int)}，status 字符串→int 归一", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/update") {
        return { body: { code: 0, msg: "ok", data: null } };
      }
      return { status: 404 };
    }, captured);
    await updateTenant({
      id: 1,
      name: "x",
      code: "x",
      domain: "x.com",
      status: "disable",
    });
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({
      id: 1,
      name: "x",
      code: "x",
      domain: "x.com",
      status: 2,
    });
  });

  it("status='active' → int 1", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({
        body: { code: 0, msg: "ok", data: null },
      }),
      captured,
    );
    await updateTenant({ id: 5, name: "a", code: "a", status: "active" });
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toMatchObject({ id: 5, status: 1 });
  });

  it("status undefined → status 字段不传（undefined 被 JSON 丢弃）", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({
        body: { code: 0, msg: "ok", data: null },
      }),
      captured,
    );
    await updateTenant({ id: 5, name: "a", code: "a" });
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).not.toHaveProperty("status");
  });

  it("禁用被拒（G-4）：eiam 拒绝 msg 携带活跃会话数 → 业务码透传", async () => {
    adapterFor(() => ({
      body: {
        code: 4010801,
        msg: "无法禁用：该租户仍有 3 个活跃会话",
        data: null,
      },
    }));
    await expect(
      updateTenant({ id: 1, name: "x", code: "x", status: "disable" }),
    ).rejects.toMatchObject({
      code: 4010801,
      message: "无法禁用：该租户仍有 3 个活跃会话",
    });
  });
});

describe("deleteTenant", () => {
  it("DELETE /api/iam/tenant/delete/:id → null", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/delete/7") {
        return { body: { code: 0, msg: "ok", data: null } };
      }
      return { status: 404 };
    }, captured);
    await deleteTenant(7);
    expect(captured[0]?.method).toBe("delete");
    expect(captured[0]?.url).toBe("/api/iam/tenant/delete/7");
  });
});

describe("getTenantDetail", () => {
  it("GET /api/iam/tenant/detail/:id → 归一 Tenant", async () => {
    adapterFor((config) => {
      if (config.url === "/api/iam/tenant/detail/3") {
        return {
          body: {
            code: 0,
            msg: "ok",
            data: { id: 3, name: "d", code: "d", domain: "d.x", status: 1 },
          },
        };
      }
      return { status: 404 };
    });
    const t = await getTenantDetail(3);
    expect(t).toMatchObject({ id: 3, name: "d", status: "active" });
  });

  it("缺 id → null", async () => {
    adapterFor(() => ({
      body: { code: 0, msg: "ok", data: { name: "noid" } },
    }));
    expect(await getTenantDetail(99)).toBeNull();
  });
});
