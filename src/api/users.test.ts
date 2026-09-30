// @vitest-environment happy-dom
/**
 * users.ts api 客户端映射单测（task 4.2）。
 *
 * 覆盖归一契约（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - mapEiamUser：snake_case → camelCase；缺 id 返回 null；status 归一（G-9 不引入 locked）；
 *   loginMethod/passkeyRegistered 缺省值（list 不直出）；
 * - mapEiamRoleRef：id/code/name；desc 不入引用；缺 id 且缺 code 返回 null；
 * - listUsers：{total, users} → Page<User>，过滤 null；
 * - listUsersByRole：role_code 载荷 + 同款归一；
 * - createUser：SignupRequest snake_case 载荷 + 初始密码回显；
 * - resetPassword：G-1 推定形状归一（initial_password → initialPassword）。
 */
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it } from "vitest";
import {
  assignRoles,
  createUser,
  deleteUser,
  listRoles,
  listRolesForUser,
  listUsers,
  listUsersByRole,
  mapEiamRoleRef,
  mapEiamUser,
  resetPassword,
  updateUser,
} from "./users";
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

describe("mapEiamUser（snake_case → camelCase 归一）", () => {
  it("完整字段归一：nickname→displayName, job_title 不入 User", () => {
    const u = mapEiamUser({
      id: 1,
      username: "alice",
      nickname: "爱丽丝",
      email: "a@b.com",
      phone: "123",
      job_title: "工程师",
      status: "active",
      last_login_at: 100,
    });
    expect(u).toMatchObject({
      id: 1,
      username: "alice",
      displayName: "爱丽丝",
      tenantId: 0,
      roles: [],
      status: "active",
      loginMethod: "password",
      passkeyRegistered: false,
    });
  });

  it("nickname 缺失 → displayName 回退 username", () => {
    const u = mapEiamUser({ id: 2, username: "bob", status: "disable" });
    expect(u?.displayName).toBe("bob");
    expect(u?.status).toBe("disable");
  });

  it("缺 id（核心标识）→ null（调用方降级过滤）", () => {
    expect(mapEiamUser({ username: "noid", status: "active" })).toBeNull();
    expect(mapEiamUser({ id: 0, username: "zero" })).toBeNull();
  });

  it("status 未知串归一 unknown（G-9：不引入 locked）", () => {
    expect(
      mapEiamUser({ id: 3, username: "c", status: "locked" })?.status,
    ).toBe("unknown");
    expect(mapEiamUser({ id: 4, username: "d", status: null })?.status).toBe(
      "unknown",
    );
    expect(
      mapEiamUser({ id: 5, username: "e", status: "ACTIVE" })?.status,
    ).toBe("unknown");
  });

  it("loginMethod/passkeyRegistered 缺省值（list 不直出，详情页 enrichment 覆盖）", () => {
    const u = mapEiamUser({ id: 1, username: "x", status: "active" });
    expect(u?.loginMethod).toBe("password");
    expect(u?.passkeyRegistered).toBe(false);
  });

  it("tenant_id 直出时归一（详情页 enrichment 场景）", () => {
    const u = mapEiamUser({
      id: 1,
      username: "x",
      status: "active",
      tenant_id: 7,
    });
    expect(u?.tenantId).toBe(7);
  });

  it("非对象 / 数组 / null → null", () => {
    expect(mapEiamUser(null)).toBeNull();
    expect(mapEiamUser("x")).toBeNull();
    expect(mapEiamUser([])).toBeNull();
  });
});

describe("mapEiamRoleRef（角色引用归一）", () => {
  it("完整字段；desc 不入引用", () => {
    expect(
      mapEiamRoleRef({ id: 1, code: "admin", name: "管理员", desc: "描述" }),
    ).toEqual({ id: 1, code: "admin", name: "管理员" });
  });

  it("name 缺失 → 回退 code", () => {
    expect(mapEiamRoleRef({ id: 1, code: "viewer" })?.name).toBe("viewer");
  });

  it("id=0 但 code 存在 → 保留（角色以 code 为准）", () => {
    expect(mapEiamRoleRef({ id: 0, code: "viewer", name: "只读" })).toEqual({
      id: 0,
      code: "viewer",
      name: "只读",
    });
  });

  it("缺 id 且缺 code → null", () => {
    expect(mapEiamRoleRef({ name: "无code" })).toBeNull();
    expect(mapEiamRoleRef(null)).toBeNull();
  });
});

describe("listUsers / listUsersByRole（{total, users} → Page<User>）", () => {
  it("listUsers：载荷 {offset,limit,keyword}；响应归一 items + 过滤 null", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({
        status: 200,
        body: {
          code: 0,
          msg: "ok",
          data: {
            total: 2,
            users: [
              { id: 1, username: "alice", status: "active" },
              { username: "noid" }, // 缺 id → 过滤
              { id: 2, username: "bob", status: "disable" },
            ],
          },
        },
      }),
      captured,
    );
    const page = await listUsers({ offset: 0, limit: 20, keyword: "a" });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ id: 1, username: "alice" });
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({ offset: 0, limit: 20, keyword: "a" });
    expect(captured[0]!.url).toBe("/api/iam/user/list");
  });

  it("listUsersByRole：载荷含 role_code；走 /user/list/attached/role", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({
        status: 200,
        body: { code: 0, msg: "ok", data: { total: 0, users: [] } },
      }),
      captured,
    );
    await listUsersByRole("admin", { offset: 20, limit: 20, keyword: "" });
    expect(captured[0]!.url).toBe("/api/iam/user/list/attached/role");
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({
      role_code: "admin",
      offset: 20,
      limit: 20,
      keyword: "",
    });
  });

  it("total 缺省 → 回退 items 长度", async () => {
    adapterFor(() => ({
      status: 200,
      body: {
        code: 0,
        msg: "ok",
        data: { users: [{ id: 1, username: "a", status: "active" }] },
      },
    }));
    const page = await listUsers({ offset: 0, limit: 20, keyword: "" });
    expect(page.total).toBe(1);
  });
});

describe("createUser（SignupRequest snake_case 载荷 + 初始密码回显）", () => {
  it("载荷含 confirm_password = password；返回 id + initialPassword 回显", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({ status: 200, body: { code: 0, msg: "", data: 42 } }),
      captured,
    );
    const result = await createUser({
      username: "new",
      password: "Init1234",
      nickname: "新",
      jobTitle: "工程师",
      status: "active",
    });
    expect(result).toEqual({ id: 42, initialPassword: "Init1234" });
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({
      username: "new",
      password: "Init1234",
      confirm_password: "Init1234",
      nickname: "新",
      email: undefined,
      phone: undefined,
      job_title: "工程师",
      status: "active",
    });
  });
});

describe("updateUser（无 password 字段——A 档实核）", () => {
  it("载荷 snake_case：job_title；无 password/confirm_password", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
      captured,
    );
    await updateUser({
      id: 1,
      nickname: "新",
      jobTitle: "工程师",
      status: "disable",
    });
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({
      id: 1,
      nickname: "新",
      email: undefined,
      phone: undefined,
      job_title: "工程师",
      status: "disable",
    });
    expect("password" in sent).toBe(false);
    expect("confirm_password" in sent).toBe(false);
  });
});

describe("deleteUser（DELETE /user/delete/:id）", () => {
  it("路径参数化：/user/delete/42", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
      captured,
    );
    await deleteUser(42);
    expect(captured[0]!.url).toBe("/api/iam/user/delete/42");
    expect(captured[0]!.method).toBe("delete");
  });
});

describe("listRolesForUser / listRoles / assignRoles（A 档）", () => {
  it("listRolesForUser：载荷 {user_id, offset, limit}；归一 RoleRef[]", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({
        status: 200,
        body: {
          code: 0,
          msg: "",
          data: {
            total: 1,
            roles: [{ id: 1, code: "admin", name: "管理员", desc: "d" }],
          },
        },
      }),
      captured,
    );
    const roles = await listRolesForUser(7);
    expect(roles).toEqual([{ id: 1, code: "admin", name: "管理员" }]);
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({ user_id: 7, offset: 0, limit: 100 });
    expect(captured[0]!.url).toBe("/api/iam/role/list/attached/user");
  });

  it("listRoles：{total, roles} → Page<RoleRef>", async () => {
    adapterFor(() => ({
      status: 200,
      body: {
        code: 0,
        msg: "",
        data: {
          total: 2,
          roles: [
            { id: 1, code: "a", name: "A" },
            { id: 2, code: "b", name: "B" },
          ],
        },
      },
    }));
    const page = await listRoles({ offset: 0, limit: 100, keyword: "" });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
  });

  it("assignRoles：载荷 {usernames, role_codes}（以 code 为准）", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({ status: 200, body: { code: 0, msg: "", data: null } }),
      captured,
    );
    await assignRoles(["alice", "bob"], ["admin", "viewer"]);
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({
      usernames: ["alice", "bob"],
      role_codes: ["admin", "viewer"],
    });
  });
});

describe("resetPassword（G-1 推定形状归一）", () => {
  it("载荷 {user_id}；响应 initial_password → initialPassword（待 eiam 排期补齐）", async () => {
    const captured: InternalAxiosRequestConfig[] = [];
    adapterFor(
      () => ({
        status: 200,
        body: { code: 0, msg: "", data: { initial_password: "TempPass001" } },
      }),
      captured,
    );
    const result = await resetPassword(7);
    expect(result).toEqual({ initialPassword: "TempPass001" });
    const sent = JSON.parse(String(captured[0]!.data));
    expect(sent).toEqual({ user_id: 7 });
    expect(captured[0]!.url).toBe("/api/iam/user/reset_password");
  });
});
