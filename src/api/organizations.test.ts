// @vitest-environment happy-dom
/**
 * organizations.ts api 客户端映射单测（task 4.3，UF-5）。
 *
 * 覆盖归一契约（Hard Rule：eiam 原生形状不经归一不越视图层）+ D-1 改判（组织=department）：
 * - mapDepartmentNode：snake_case → camelCase；children 递归归一；缺 id 返回 null；
 * - listOrganizationTree：GET /api/department/list → OrganizationNode[]（树形，过滤 null）；
 * - createOrganization：CreateDeptRequest snake_case 载荷（parent_id + name）→ 新 id；
 * - updateOrganization：UpdateDeptRequest 载荷（id + name + parent_id）；
 * - deleteOrganization：DELETE /api/department/delete/:id；
 * - getOrganizationDetail：扁平 Department → Organization（无计数）；
 * - listOrganizationMembers：{total, members} → Page<DeptMember>（snake_case 归一）。
 */
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it } from "vitest";
import {
  createOrganization,
  deleteOrganization,
  getOrganizationDetail,
  listOrganizationMembers,
  listOrganizationTree,
  mapDepartmentNode,
  updateOrganization,
} from "./organizations";
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

interface RouteAdapter {
  calls: { method: string; url: string; body?: unknown }[];
}

/** 按 method+url 路由不同响应 */
function adapterFor(
  routes: Partial<
    Record<string, (config: InternalAxiosRequestConfig) => MockReply>
  >,
): RouteAdapter {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  eiamAxios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const method = (config.method ?? "get").toLowerCase();
    const url = config.url ?? "";
    const body =
      typeof config.data === "string"
        ? (() => {
            try {
              return JSON.parse(config.data);
            } catch {
              return config.data;
            }
          })()
        : config.data;
    calls.push({ method, url, body });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const reply = key
      ? routes[key]!(config)
      : { status: 200, body: { code: 0, msg: "", data: null } };
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

afterEach(() => {
  eiamAxios.defaults.adapter = undefined;
});

describe("mapDepartmentNode 归一（AC-1）", () => {
  it("snake_case → camelCase，children 递归归一", () => {
    const raw = {
      id: 1,
      parent_id: 0,
      name: "总部",
      sort: 1,
      leaders: ["u1"],
      main_leader: "u1",
      children: [
        { id: 2, parent_id: 1, name: "研发", children: [] },
        {
          id: 3,
          parent_id: 1,
          name: "运维",
          children: [{ id: 4, parent_id: 3, name: "SRE" }],
        },
      ],
    };
    const node = mapDepartmentNode(raw);
    expect(node).not.toBeNull();
    expect(node!.id).toBe(1);
    expect(node!.name).toBe("总部");
    expect(node!.parentId).toBeUndefined(); // parent_id=0 → asNumber(0)||undefined
    expect(node!.children).toHaveLength(2);
    expect(node!.children[0]!.name).toBe("研发");
    expect(node!.children[1]!.children[0]!.name).toBe("SRE");
  });

  it("缺 id 返回 null（核心标识缺失降级）", () => {
    expect(mapDepartmentNode({ parent_id: 0, name: "x" })).toBeNull();
  });

  it("非对象输入返回 null", () => {
    expect(mapDepartmentNode(null)).toBeNull();
    expect(mapDepartmentNode("x")).toBeNull();
    expect(mapDepartmentNode([])).toBeNull();
  });
});

describe("listOrganizationTree（GET /api/department/list，D-1）", () => {
  it("树形响应归一为 OrganizationNode[]，过滤缺 id 项", async () => {
    const { calls } = adapterFor({
      "/department/list": () => ({
        status: 200,
        body: {
          code: 0,
          msg: "ok",
          data: [
            {
              id: 1,
              parent_id: 0,
              name: "总部",
              children: [{ id: 2, parent_id: 1, name: "研发" }],
            },
            { id: 3, parent_id: 0, name: "财务" },
          ],
        },
      }),
    });
    const tree = await listOrganizationTree();
    expect(calls[0]!.method).toBe("get");
    expect(tree).toHaveLength(2);
    expect(tree[0]!.children[0]!.name).toBe("研发");
    expect(tree[1]!.children).toEqual([]);
  });

  it("非数组 data → 空树（降级不抛错）", async () => {
    adapterFor({
      "/department/list": () => ({
        status: 200,
        body: { code: 0, msg: "", data: null },
      }),
    });
    const tree = await listOrganizationTree();
    expect(tree).toEqual([]);
  });
});

describe("createOrganization（POST /api/department/create）", () => {
  it("载荷 snake_case：parent_id + name；返回新 id", async () => {
    const { calls } = adapterFor({
      "/department/create": () => ({
        status: 200,
        body: { code: 0, msg: "", data: 99 },
      }),
    });
    const id = await createOrganization({ parentId: 5, name: "子组" });
    expect(id).toBe(99);
    expect(calls[0]!.method).toBe("post");
    expect(calls[0]!.body).toEqual({ parent_id: 5, name: "子组" });
  });

  it("根组织 parent_id 缺省传 0", async () => {
    const { calls } = adapterFor({
      "/department/create": () => ({
        status: 200,
        body: { code: 0, msg: "", data: 1 },
      }),
    });
    await createOrganization({ name: "根" });
    expect(calls[0]!.body).toEqual({ parent_id: 0, name: "根" });
  });
});

describe("updateOrganization（POST /api/department/update）", () => {
  it("载荷 id + name + parent_id", async () => {
    const { calls } = adapterFor({
      "/department/update": () => ({
        status: 200,
        body: { code: 0, msg: "", data: null },
      }),
    });
    await updateOrganization({ id: 7, name: "改名", parentId: 1 });
    expect(calls[0]!.body).toEqual({ id: 7, parent_id: 1, name: "改名" });
  });
});

describe("deleteOrganization（DELETE /api/department/delete/:id）", () => {
  it("路径参数 :id；E11 后置拒绝 code=4010703 透传 ApiError", async () => {
    adapterFor({
      "/department/delete": () => ({
        status: 200,
        body: { code: 4010703, msg: "存在子部门，无法删除", data: null },
      }),
    });
    await expect(deleteOrganization(7)).rejects.toMatchObject({
      name: "ApiError",
      code: 4010703,
    });
  });

  it("成功删除返回 void", async () => {
    const { calls } = adapterFor({
      "/department/delete": () => ({
        status: 200,
        body: { code: 0, msg: "", data: null },
      }),
    });
    await deleteOrganization(7);
    expect(calls[0]!.method).toBe("delete");
    expect(calls[0]!.url).toContain("/department/delete/7");
  });
});

describe("getOrganizationDetail（GET /api/department/detail/:id）", () => {
  it("扁平 Department → Organization（无计数字段）", async () => {
    const { calls } = adapterFor({
      "/department/detail": () => ({
        status: 200,
        body: {
          code: 0,
          msg: "",
          data: {
            id: 5,
            parent_id: 1,
            name: "研发",
            sort: 2,
            leaders: [],
            main_leader: "",
          },
        },
      }),
    });
    const org = await getOrganizationDetail(5);
    expect(calls[0]!.url).toContain("/department/detail/5");
    expect(org).toEqual({ id: 5, name: "研发", parentId: 1 });
  });

  it("缺 id 返回 null", async () => {
    adapterFor({
      "/department/detail": () => ({
        status: 200,
        body: { code: 0, msg: "", data: { parent_id: 1, name: "x" } },
      }),
    });
    expect(await getOrganizationDetail(0)).toBeNull();
  });
});

describe("listOrganizationMembers（POST /api/department/members）", () => {
  it("载荷 dept_id + 分页 + keyword；{total, members} → Page<DeptMember>", async () => {
    const { calls } = adapterFor({
      "/department/members": () => ({
        status: 200,
        body: {
          code: 0,
          msg: "",
          data: {
            total: 2,
            members: [
              {
                id: 1,
                username: "alice",
                nickname: "Alice",
                email: "a@x.com",
                phone: "1",
              },
              { id: 2, username: "bob", nickname: "Bob" },
            ],
          },
        },
      }),
    });
    const page = await listOrganizationMembers(5, {
      offset: 0,
      limit: 20,
      keyword: "",
    });
    expect(calls[0]!.body).toEqual({
      dept_id: 5,
      offset: 0,
      limit: 20,
      keyword: "",
    });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]!.displayName).toBe("Alice");
    expect(page.items[1]!.email).toBeUndefined();
  });

  it("缺省 total 按 items 长度", async () => {
    adapterFor({
      "/department/members": () => ({
        status: 200,
        body: {
          code: 0,
          msg: "",
          data: { members: [{ id: 1, username: "x" }] },
        },
      }),
    });
    const page = await listOrganizationMembers(1, {
      offset: 0,
      limit: 20,
      keyword: "",
    });
    expect(page.total).toBe(1);
  });

  it("缺 id 成员过滤", async () => {
    adapterFor({
      "/department/members": () => ({
        status: 200,
        body: {
          code: 0,
          msg: "",
          data: {
            total: 1,
            members: [{ username: "noid" }, { id: 1, username: "ok" }],
          },
        },
      }),
    });
    const page = await listOrganizationMembers(1, {
      offset: 0,
      limit: 20,
      keyword: "",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.username).toBe("ok");
  });
});
