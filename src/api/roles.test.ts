// @vitest-environment happy-dom
/**
 * roles.ts api 客户端映射单测（task 5.1）。
 *
 * 覆盖归一契约（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - mapEiamRole：snake_case → camelCase；desc 字段名（非 description）；缺 id 返回 null；
 * - listRolesPage：{total, roles} → Page<Role>，过滤 null；
 * - getRoleDetail：GET /role/detail/:code，按 code 查询；
 * - createRole：载荷 {name, code, desc} → 新 id；
 * - updateRole：载荷 {id, name, code, desc}；
 * - deleteRole：DELETE /role/delete/:id；
 * - listPoliciesForRole：policy/list/attached/role 载荷 role_code → PolicyRef[]；
 * - listBindablePolicies：policy/list → Page<PolicyRef>；
 * - attachPoliciesToRole：batch-attach 载荷 subjects[{sub_type:"role", code}] + policy_codes；
 * - detachPoliciesFromRole：batch-detach 载荷 assignments 逐条；
 * - assignUsersToRole / unassignUsersFromRole：batch_assign / batch_unassign 载荷
 *   {usernames, role_codes:[code]}（A 档以 code 为准）。
 */
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it } from "vitest";
import {
  assignUsersToRole,
  attachPoliciesToRole,
  createRole,
  deleteRole,
  detachPoliciesFromRole,
  getRoleDetail,
  listBindablePolicies,
  listPoliciesForRole,
  listRolesPage,
  mapEiamRole,
  unassignUsersFromRole,
  updateRole,
} from "./roles";
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

describe("mapEiamRole（snake_case → camelCase 归一；desc 非 description）", () => {
  it("完整字段归一：id/code/name/desc → Role（policies/users 留空待 enrichment）", () => {
    const r = mapEiamRole({
      id: 1,
      code: "admin",
      name: "管理员",
      desc: "系统管理员",
    });
    expect(r).toMatchObject({
      id: 1,
      code: "admin",
      name: "管理员",
      desc: "系统管理员",
      tenantId: 0,
      policies: [],
      users: [],
    });
  });

  it("desc 缺失 → 空串（非 undefined）", () => {
    const r = mapEiamRole({ id: 2, code: "viewer", name: "只读" });
    expect(r?.desc).toBe("");
  });

  it("name 缺失 → 回退 code", () => {
    const r = mapEiamRole({ id: 3, code: "ops", desc: "x" });
    expect(r?.name).toBe("ops");
  });

  it("缺 id（核心标识）→ null（调用方降级过滤）", () => {
    expect(mapEiamRole({ code: "noid", name: "x" })).toBeNull();
    expect(mapEiamRole({ id: 0, code: "zero" })).toBeNull();
  });
});

describe("listRolesPage（A 档：{total, roles} → Page<Role>）", () => {
  it("归一分页 + 过滤 null", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: {
        code: 0,
        msg: "",
        data: {
          total: 2,
          roles: [
            { id: 1, code: "admin", name: "管理员", desc: "a" },
            { id: 0, code: "bad" },
            { id: 2, code: "viewer", name: "只读" },
          ],
        },
      },
    }), capture);
    const page = await listRolesPage({ offset: 0, limit: 20, keyword: "" });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.code).toBe("admin");
    expect(page.items[1]?.code).toBe("viewer");
    // 载荷 {offset, limit, keyword}
    const body = JSON.parse(String(capture[0]?.data));
    expect(body).toEqual({ offset: 0, limit: 20, keyword: "" });
  });

  it("空响应 → total 0 / items []", async () => {
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: { total: 0, roles: [] } },
    }));
    const page = await listRolesPage({ offset: 0, limit: 20, keyword: "" });
    expect(page.total).toBe(0);
    expect(page.items).toEqual([]);
  });
});

describe("getRoleDetail（C 档：GET /role/detail/:code）", () => {
  it("按 code 查询 → Role", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: {
        code: 0,
        msg: "",
        data: { id: 7, code: "ops", name: "运维", desc: "运维角色" },
      },
    }), capture);
    const role = await getRoleDetail("ops");
    expect(role?.id).toBe(7);
    expect(role?.desc).toBe("运维角色");
    expect(capture[0]?.url).toBe("/api/iam/role/detail/ops");
    expect(capture[0]?.method).toBe("get");
  });

  it("不存在 → null", async () => {
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: { code: "ghost" } },
    }));
    const role = await getRoleDetail("ghost");
    expect(role).toBeNull();
  });
});

describe("createRole（C 档：{name, code, desc}）", () => {
  it("载荷 snake_case 映射 + 返回新 id", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: 42 },
    }), capture);
    const id = await createRole({ name: "新角色", code: "new_role", desc: "描述" });
    expect(id).toBe(42);
    const body = JSON.parse(String(capture[0]?.data));
    expect(body).toEqual({ name: "新角色", code: "new_role", desc: "描述" });
  });

  it("desc 缺省 → undefined（eiam 容错）", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: 1 },
    }), capture);
    await createRole({ name: "x", code: "y" });
    const body = JSON.parse(String(capture[0]?.data));
    expect(body.desc).toBeUndefined();
  });
});

describe("updateRole（C 档：{id, name, code, desc}）", () => {
  it("载荷含 id + 原只读 code + name + desc", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: null },
    }), capture);
    await updateRole({ id: 7, name: "新名", code: "ops", desc: "新描述" });
    const body = JSON.parse(String(capture[0]?.data));
    expect(body).toEqual({ id: 7, name: "新名", code: "ops", desc: "新描述" });
  });
});

describe("deleteRole（C 档：DELETE /role/delete/:id）", () => {
  it("按 id 删除（非 code）", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: null },
    }), capture);
    await deleteRole(7);
    expect(capture[0]?.url).toBe("/api/iam/role/delete/7");
    expect(capture[0]?.method).toBe("delete");
  });
});

describe("listPoliciesForRole（D-3：policy/list/attached/role）", () => {
  it("载荷 role_code + type=role → PolicyRef[]", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: {
        code: 0,
        msg: "",
        data: {
          total: 2,
          policies: [
            { code: "p1", name: "策略1" },
            { code: "p2", name: "策略2" },
            { id: 99, name: "无code过滤" },
          ],
        },
      },
    }), capture);
    const refs = await listPoliciesForRole("admin");
    expect(refs).toEqual([
      { code: "p1", name: "策略1" },
      { code: "p2", name: "策略2" },
    ]);
    const body = JSON.parse(String(capture[0]?.data));
    expect(body.role_code).toBe("admin");
    expect(body.type).toBe("role");
  });
});

describe("listBindablePolicies（policy/list → Page<PolicyRef>）", () => {
  it("归一为 Page<PolicyRef>", async () => {
    adapterFor(() => ({
      status: 200,
      body: {
        code: 0,
        msg: "",
        data: {
          total: 1,
          policies: [{ code: "p1", name: "策略1" }],
        },
      },
    }));
    const page = await listBindablePolicies({ offset: 0, limit: 100, keyword: "" });
    expect(page.total).toBe(1);
    expect(page.items).toEqual([{ code: "p1", name: "策略1" }]);
  });
});

describe("attachPoliciesToRole（D-3：policy/batch-attach）", () => {
  it("载荷 subjects[{sub_type:role, code}] + policy_codes", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: null },
    }), capture);
    await attachPoliciesToRole("admin", ["p1", "p2"]);
    const body = JSON.parse(String(capture[0]?.data));
    expect(body.subjects).toEqual([{ sub_type: "role", code: "admin" }]);
    expect(body.policy_codes).toEqual(["p1", "p2"]);
  });
});

describe("detachPoliciesFromRole（D-3：policy/batch-detach）", () => {
  it("载荷 assignments 逐条（subject + policy_code）", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: null },
    }), capture);
    await detachPoliciesFromRole("admin", ["p0", "p1"]);
    const body = JSON.parse(String(capture[0]?.data));
    expect(body.assignments).toEqual([
      { subject: { sub_type: "role", code: "admin" }, policy_code: "p0" },
      { subject: { sub_type: "role", code: "admin" }, policy_code: "p1" },
    ]);
  });
});

describe("assignUsersToRole / unassignUsersFromRole（A 档 batch_assign，以 code 为准）", () => {
  it("assign：载荷 {usernames, role_codes:[code]}", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: null },
    }), capture);
    await assignUsersToRole("admin", ["alice", "bob"]);
    const body = JSON.parse(String(capture[0]?.data));
    expect(body.usernames).toEqual(["alice", "bob"]);
    expect(body.role_codes).toEqual(["admin"]);
  });

  it("unassign：载荷 {usernames, role_codes:[code]}", async () => {
    const capture: InternalAxiosRequestConfig[] = [];
    adapterFor(() => ({
      status: 200,
      body: { code: 0, msg: "", data: null },
    }), capture);
    await unassignUsersFromRole("admin", ["carol"]);
    const body = JSON.parse(String(capture[0]?.data));
    expect(body.usernames).toEqual(["carol"]);
    expect(body.role_codes).toEqual(["admin"]);
  });
});
