// @vitest-environment happy-dom
/**
 * identity-sources.ts api 客户端映射单测（task 4.5，UF-7）。
 *
 * 覆盖归一契约（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - mapEiamLdap / mapEiamIdentitySource：LDAPVO/IdentitySourceVO → 归一 ConnParams/IdentitySource；
 *   bind_password 恒 ""（Hard Rule：响应不回显明文）；port 从 url 解析（D-2）；timeoutSec 默认 5。
 * - toIdentitySourcePage（经 listIdentitySources）：`[]IdentitySourceVO` → Page<IdentitySource>（total = items 长度）。
 * - save 载荷：嵌套 ldap 对象（D-2 真实形状），无 port/timeoutSec 字段；bind_password 透传表单值（"" = 不修改）。
 * - create/update 均命中 /save（upsert，id=0 vs id>0）。
 * - toggle：真实路径 POST /api/iam/identity_source/toggle/:id（非 update 承载）。
 * - test：成功返回文案，失败抛 ApiError。
 * - delete/detail：DELETE / GET 路径核验。
 */
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it } from "vitest";
import {
  createIdentitySource,
  deleteIdentitySource,
  getIdentitySourceDetail,
  listIdentitySources,
  mapEiamIdentitySource,
  mapEiamLdap,
  testIdentitySource,
  toggleIdentitySource,
  updateIdentitySource,
} from "./identity-sources";
import { eiamAxios } from "@/api/request/eiam";
import type { IdentitySource } from "@/api/types";

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

describe("mapEiamLdap", () => {
  it("snake_case → camelCase 归一；port 从 url 解析；bind_password 恒空（Hard Rule）", () => {
    const conn = mapEiamLdap({
      url: "ldaps://dc.example.com:636",
      base_dn: "dc=example,dc=com",
      bind_dn: "cn=admin,dc=example,dc=com",
      bind_password: "should-not-leak",
      username_attribute: "uid",
      mail_attribute: "mail",
      display_name_attribute: "cn",
      title_attribute: "title",
      user_filter: "(objectClass=person)",
      sync_user_filter: "",
    });
    expect(conn.url).toBe("ldaps://dc.example.com:636");
    expect(conn.port).toBe(636);
    expect(conn.bindDn).toBe("cn=admin,dc=example,dc=com");
    // Hard Rule：bind_password 恒 ""，不回显明文
    expect(conn.password).toBe("");
    expect(conn.baseDn).toBe("dc=example,dc=com");
    expect(conn.attrMap.username).toBe("uid");
    expect(conn.attrMap.email).toBe("mail");
    expect(conn.timeoutSec).toBe(5); // D-2 默认值
  });

  it("url 无端口 → port=0（D-2：仅本地校验用）", () => {
    const conn = mapEiamLdap({ url: "ldap://dc.example.com" });
    expect(conn.port).toBe(0);
  });

  it("缺省字段降级为空串", () => {
    const conn = mapEiamLdap(undefined);
    expect(conn.url).toBe("");
    expect(conn.bindDn).toBe("");
    expect(conn.attrMap.username).toBe("");
  });
});

describe("mapEiamIdentitySource", () => {
  it("IdentitySourceVO → 归一 IdentitySource；type=ldap 入规范形", () => {
    const src = mapEiamIdentitySource({
      id: 7,
      name: "公司 LDAP",
      type: "ldap",
      enabled: true,
      ldap: { url: "ldap://dc:389", base_dn: "dc=x", bind_dn: "cn=a", username_attribute: "uid" },
    });
    expect(src).not.toBeNull();
    expect(src?.id).toBe(7);
    expect(src?.name).toBe("公司 LDAP");
    expect(src?.type).toBe("ldap");
    expect(src?.enabled).toBe(true);
    expect(src?.conn.url).toBe("ldap://dc:389");
  });

  it("缺 id 返回 null", () => {
    expect(mapEiamIdentitySource({ name: "x", type: "ldap" })).toBeNull();
  });

  it("type 非 ldap 返回 null（v1 仅 ldap）", () => {
    expect(
      mapEiamIdentitySource({ id: 1, name: "x", type: "oidc", enabled: false }),
    ).toBeNull();
  });
});

describe("listIdentitySources", () => {
  it("POST /api/iam/identity_source/list → `[]VO` 归一 Page（total = items 长度，非分页）", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/list") {
        return {
          body: {
            code: 0,
            msg: "ok",
            data: [
              {
                id: 1,
                name: "A",
                type: "ldap",
                enabled: true,
                ldap: { url: "ldap://h1:389", base_dn: "dc=a", bind_dn: "cn=a", username_attribute: "uid" },
              },
              {
                id: 2,
                name: "B",
                type: "ldap",
                enabled: false,
                ldap: { url: "ldap://h2:389", base_dn: "dc=b", bind_dn: "cn=b", username_attribute: "cn" },
              },
              { id: 3, name: "C", type: "oidc", enabled: true }, // 非 ldap 过滤
              { name: "no-id", type: "ldap" }, // 缺 id 过滤
            ],
          },
        };
      }
      return { status: 404 };
    }, captured);
    const page = await listIdentitySources({ offset: 0, limit: 20, keyword: "" });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.name).toBe("A");
    expect(page.total).toBe(2);
    expect(JSON.parse(String(captured[0]?.data))).toEqual({
      offset: 0,
      limit: 20,
      keyword: "",
    });
  });

  it("空数组 → Page{total:0, items:[]}", async () => {
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/list") {
        return { body: { code: 0, msg: "ok", data: [] } };
      }
      return { status: 404 };
    });
    const page = await listIdentitySources({ offset: 0, limit: 20, keyword: "" });
    expect(page.total).toBe(0);
    expect(page.items).toEqual([]);
  });
});

describe("getIdentitySourceDetail", () => {
  it("GET /api/iam/identity_source/detail/:id → 归一 IdentitySource", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/detail/5") {
        return {
          body: {
            code: 0,
            msg: "ok",
            data: {
              id: 5,
              name: "X",
              type: "ldap",
              enabled: true,
              ldap: { url: "ldap://h:389", base_dn: "dc=x", bind_dn: "cn=x", username_attribute: "uid" },
            },
          },
        };
      }
      return { status: 404 };
    }, captured);
    const src = await getIdentitySourceDetail(5);
    expect(src?.id).toBe(5);
    expect(captured[0]?.method).toBe("get");
  });
});

describe("save 载荷形状（嵌套 ldap 对象，D-2）", () => {
  function sampleSource(overrides: Partial<IdentitySource> = {}): IdentitySource {
    return {
      id: overrides.id ?? 0,
      name: overrides.name ?? "公司 LDAP",
      type: "ldap",
      conn: {
        url: "ldaps://dc.example.com:636",
        port: 636,
        bindDn: "cn=admin,dc=example,dc=com",
        password: overrides.conn?.password ?? "secret",
        baseDn: "dc=example,dc=com",
        attrMap: { username: "uid", email: "mail" },
        timeoutSec: 5,
      },
      enabled: overrides.enabled ?? true,
    };
  }

  it("createIdentitySource：id=0，载荷嵌套 ldap，无 port/timeoutSec 字段", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/save") {
        return { body: { code: 0, msg: "ok", data: 42 } };
      }
      return { status: 404 };
    }, captured);
    const id = await createIdentitySource(sampleSource());
    expect(id).toBe(42);
    const payload = JSON.parse(
      String(captured.find((c) => c.url === "/api/iam/identity_source/save")?.data),
    ) as Record<string, unknown>;
    expect(payload.id).toBe(0);
    expect(payload.type).toBe("ldap");
    expect(payload.enabled).toBe(true);
    const ldap = payload.ldap as Record<string, unknown>;
    // D-2：eiam 实有 10 字段，snake_case
    expect(ldap.url).toBe("ldaps://dc.example.com:636");
    expect(ldap.base_dn).toBe("dc=example,dc=com");
    expect(ldap.bind_dn).toBe("cn=admin,dc=example,dc=com");
    expect(ldap.bind_password).toBe("secret");
    expect(ldap.username_attribute).toBe("uid");
    expect(ldap.mail_attribute).toBe("mail");
    expect(ldap.display_name_attribute).toBe("");
    expect(ldap.title_attribute).toBe("");
    expect(ldap.user_filter).toBe("");
    expect(ldap.sync_user_filter).toBe("");
    // D-2：port / timeoutSec 不入 eiam 载荷
    expect(ldap).not.toHaveProperty("port");
    expect(payload).not.toHaveProperty("timeoutSec");
    expect(ldap).not.toHaveProperty("timeoutSec");
  });

  it("updateIdentitySource：id>0 透传，bind_password 透传表单值", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/save") {
        return { body: { code: 0, msg: "ok", data: null } };
      }
      return { status: 404 };
    }, captured);
    await updateIdentitySource(sampleSource({ id: 9 }));
    const payload = JSON.parse(
      String(captured.find((c) => c.url === "/api/iam/identity_source/save")?.data),
    ) as Record<string, unknown>;
    expect(payload.id).toBe(9);
    expect((payload.ldap as Record<string, unknown>).bind_password).toBe("secret");
  });

  it("updateIdentitySource：bind_password='' 透传空串（eiam toPatch 经 JSON_MERGE_PATCH 剔除 = 不修改，Hard Rule）", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/save") {
        return { body: { code: 0, msg: "ok", data: null } };
      }
      return { status: 404 };
    }, captured);
    const src = sampleSource({ id: 9 });
    src.conn.password = ""; // 编辑态留空 = 不修改
    await updateIdentitySource(src);
    const payload = JSON.parse(
      String(captured.find((c) => c.url === "/api/iam/identity_source/save")?.data),
    ) as Record<string, unknown>;
    expect((payload.ldap as Record<string, unknown>).bind_password).toBe("");
  });
});

describe("testIdentitySource", () => {
  it("成功 → 返回「连接成功」文案", async () => {
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/test") {
        return { body: { code: 0, msg: "连接成功", data: null } };
      }
      return { status: 404 };
    });
    const msg = await testIdentitySource({
      id: 0,
      name: "X",
      type: "ldap",
      conn: {
        url: "ldap://h:389", port: 389, bindDn: "cn=a", password: "p",
        baseDn: "dc=a", attrMap: { username: "uid" }, timeoutSec: 5,
      },
      enabled: true,
    });
    expect(msg).toBe("连接成功");
  });

  it("失败 → 抛 ApiError（msg 携带 err.Error）", async () => {
    adapterFor(() => ({
      body: { code: 5001, msg: "测试身份源连接失败: dial tcp: connection refused", data: null },
    }));
    await expect(
      testIdentitySource({
        id: 0, name: "X", type: "ldap",
        conn: { url: "ldap://h:389", port: 389, bindDn: "cn=a", password: "p", baseDn: "dc=a", attrMap: { username: "uid" }, timeoutSec: 5 },
        enabled: true,
      }),
    ).rejects.toThrow(/连接失败/);
  });
});

describe("toggleIdentitySource（真实启停路径）", () => {
  it("POST /api/iam/identity_source/toggle/:id（非 update 承载）", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/toggle/3") {
        return { body: { code: 0, msg: "状态切换成功", data: null } };
      }
      return { status: 404 };
    }, captured);
    await toggleIdentitySource(3);
    expect(captured[0]?.url).toBe("/api/iam/identity_source/toggle/3");
    expect(captured[0]?.method).toBe("post");
  });
});

describe("deleteIdentitySource", () => {
  it("DELETE /api/iam/identity_source/delete/:id", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      if (config.url === "/api/iam/identity_source/delete/7") {
        return { body: { code: 0, msg: "删除成功", data: null } };
      }
      return { status: 404 };
    }, captured);
    await deleteIdentitySource(7);
    expect(captured[0]?.url).toBe("/api/iam/identity_source/delete/7");
    expect(captured[0]?.method).toBe("delete");
  });
});
