// @vitest-environment happy-dom
/**
 * authorizations.ts api 客户端映射单测（task 5.2）。
 *
 * 覆盖归一契约（Hard Rule：eiam 原生形状不经归一不越视图层）：
 * - mapEiamAuthorization：D-4 {subject, target, sub_type, obj_type} → 三元组 {subject, resource, action}；
 *   obj_type=role→action=assign / policy→action=attach；缺 subject/target 返回 null。
 * - listAuthorizationsPage：{total, authorizations} → Page<Authorization>，过滤 null。
 * - fetchVocabulary：subjects 自 subjects/search 逐 sub_type 回填（携带 subType）；
 *   resources 自 role/list + policy/list 回填；actions 恒静态（G-5）；
 *   全失败降级 STATIC_VOCAB + STATIC_VOCAB_SOURCE。
 * - createAuthorization：action=assign→role/batch_assign {usernames, role_codes}；
 *   action=attach→policy/batch-attach {subjects[{sub_type, code}], policy_codes}。
 * - revokeAuthorization：action=assign→role/batch_unassign；action=attach→policy/batch-detach
 *   {assignments[{subject, policy_code}]}（显式逐条）。
 * - isDuplicateAuthorization：三元组唯一性前端预检。
 */
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it } from "vitest";
import {
  STATIC_VOCAB,
  STATIC_VOCAB_SOURCE,
  createAuthorization,
  fetchVocabulary,
  isDuplicateAuthorization,
  listAuthorizationsPage,
  mapEiamAuthorization,
  revokeAuthorization,
} from "./authorizations";
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

function envelope<T>(data: T) {
  return { code: 0, msg: "", data };
}

describe("mapEiamAuthorization（D-4 二元绑定 → 三元组映射）", () => {
  it("obj_type=role → action=assign", () => {
    const a = mapEiamAuthorization({
      subject: "alice",
      target: "admin",
      sub_type: "user",
      obj_type: "role",
    });
    expect(a).toEqual({
      subject: "alice",
      resource: "admin",
      action: "assign",
    });
  });

  it("obj_type=policy → action=attach", () => {
    const a = mapEiamAuthorization({
      subject: "alice",
      target: "P1",
      sub_type: "user",
      obj_type: "policy",
    });
    expect(a).toEqual({
      subject: "alice",
      resource: "P1",
      action: "attach",
    });
  });

  it("未知 obj_type → 回退 attach", () => {
    const a = mapEiamAuthorization({
      subject: "bob",
      target: "T",
      obj_type: "unknown",
    });
    expect(a?.action).toBe("attach");
  });

  it("缺 subject → null", () => {
    expect(mapEiamAuthorization({ target: "T", obj_type: "role" })).toBeNull();
  });

  it("缺 target → null", () => {
    expect(
      mapEiamAuthorization({ subject: "alice", obj_type: "role" }),
    ).toBeNull();
  });

  it("非对象 → null", () => {
    expect(mapEiamAuthorization(null)).toBeNull();
    expect(mapEiamAuthorization("x")).toBeNull();
  });
});

describe("listAuthorizationsPage", () => {
  it("归一 {total, authorizations} → Page<Authorization>，过滤 null", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      calls.push(config);
      if ((config.url ?? "").includes("/permission/authorizations")) {
        return {
          body: envelope({
            total: 2,
            authorizations: [
              {
                subject: "alice",
                target: "admin",
                sub_type: "user",
                obj_type: "role",
              },
              {
                subject: "bob",
                target: "P1",
                obj_type: "policy",
              },
              { target: "x", obj_type: "role" },
            ],
          }),
        };
      }
      return { body: envelope(null) };
    }, calls);
    const result = await listAuthorizationsPage({
      offset: 0,
      limit: 20,
      keyword: "",
    });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      subject: "alice",
      resource: "admin",
      action: "assign",
    });
    expect(result.items[1]).toEqual({
      subject: "bob",
      resource: "P1",
      action: "attach",
    });
  });

  it("total 缺省按 items 长度", async () => {
    adapterFor((config) => {
      if ((config.url ?? "").includes("/permission/authorizations")) {
        return {
          body: envelope({
            authorizations: [
              {
                subject: "a",
                target: "r",
                obj_type: "role",
              },
            ],
          }),
        };
      }
      return { body: envelope(null) };
    });
    const result = await listAuthorizationsPage({
      offset: 0,
      limit: 20,
      keyword: "",
    });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it("载荷携带 offset/limit/keyword + sub_type/obj_type 空串（全量）", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor(() => {
      return {
        body: envelope({ total: 0, authorizations: [] }),
      };
    }, calls);
    await listAuthorizationsPage({ offset: 10, limit: 5, keyword: "a" });
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]!.data);
    expect(body).toEqual({
      offset: 10,
      limit: 5,
      keyword: "a",
      sub_type: "",
      obj_type: "",
    });
  });
});

describe("fetchVocabulary（G-5 降级）", () => {
  it("动态来源：subjects/search + role/list + policy/list 回填，actions 恒静态", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      calls.push(config);
      const url = config.url ?? "";
      const body = JSON.parse(config.data);
      if (url.includes("/permission/subjects/search")) {
        if (body.sub_type === "user") {
          return {
            body: envelope({
              total: 1,
              subjects: [{ code: "alice", sub_type: "user", name: "Alice" }],
            }),
          };
        }
        if (body.sub_type === "role") {
          return {
            body: envelope({
              total: 1,
              subjects: [{ code: "admin", sub_type: "role" }],
            }),
          };
        }
        return { body: envelope({ total: 0, subjects: [] }) };
      }
      if (url.includes("/role/list")) {
        return {
          body: envelope({ total: 1, roles: [{ code: "admin" }] }),
        };
      }
      if (url.includes("/policy/list")) {
        return {
          body: envelope({ total: 1, policies: [{ code: "P1" }] }),
        };
      }
      return { body: envelope(null) };
    }, calls);
    const vocab = await fetchVocabulary();
    expect(vocab.subjects).toContainEqual({
      code: "alice",
      subType: "user",
      name: "Alice",
    });
    expect(vocab.subjects).toContainEqual({
      code: "admin",
      subType: "role",
      name: undefined,
    });
    expect(vocab.resources).toEqual(expect.arrayContaining(["admin", "P1"]));
    expect(vocab.actions).toEqual([...STATIC_VOCAB.actions]);
    expect(vocab.source).toContain("eiam");
  });

  it("全失败降级 STATIC_VOCAB + STATIC_VOCAB_SOURCE", async () => {
    adapterFor(() => ({
      networkFailure: { code: "ERR_NETWORK", message: "down" },
    }));
    const vocab = await fetchVocabulary();
    expect(vocab.subjects.map((s) => s.code)).toEqual([
      ...STATIC_VOCAB.subjects,
    ]);
    expect(vocab.resources).toEqual([...STATIC_VOCAB.resources]);
    expect(vocab.actions).toEqual([...STATIC_VOCAB.actions]);
    expect(vocab.source).toBe(STATIC_VOCAB_SOURCE);
  });
});

describe("createAuthorization（G-6 语义映射）", () => {
  it("action=assign → role/batch_assign {usernames, role_codes}", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor(() => {
      return { body: envelope(null) };
    }, calls);
    await createAuthorization({
      subject: "alice",
      resource: "admin",
      action: "assign",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/role/batch_assign");
    expect(JSON.parse(calls[0]!.data)).toEqual({
      usernames: ["alice"],
      role_codes: ["admin"],
    });
  });

  it("action=attach → policy/batch-attach {subjects[{sub_type, code}], policy_codes}", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      calls.push(config);
      return { body: envelope(null) };
    }, calls);
    await createAuthorization({
      subject: "admin",
      subType: "role",
      resource: "P1",
      action: "attach",
    });
    expect(calls[0]!.url).toContain("/policy/batch-attach");
    expect(JSON.parse(calls[0]!.data)).toEqual({
      subjects: [{ sub_type: "role", code: "admin" }],
      policy_codes: ["P1"],
    });
  });

  it("action=attach subType 缺省 → user", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      calls.push(config);
      return { body: envelope(null) };
    }, calls);
    await createAuthorization({
      subject: "alice",
      resource: "P1",
      action: "attach",
    });
    expect(JSON.parse(calls[0]!.data).subjects[0].sub_type).toBe("user");
  });

  it("未知 action → 抛错不发请求", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      calls.push(config);
      return { body: envelope(null) };
    }, calls);
    await expect(
      createAuthorization({
        subject: "a",
        resource: "r",
        action: "bogus",
      }),
    ).rejects.toThrow("不支持的授权动作");
    expect(calls).toHaveLength(0);
  });
});

describe("revokeAuthorization（G-6 语义映射）", () => {
  it("action=assign → role/batch_unassign", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      calls.push(config);
      return { body: envelope(null) };
    }, calls);
    await revokeAuthorization({
      subject: "alice",
      resource: "admin",
      action: "assign",
    });
    expect(calls[0]!.url).toContain("/role/batch_unassign");
    expect(JSON.parse(calls[0]!.data)).toEqual({
      usernames: ["alice"],
      role_codes: ["admin"],
    });
  });

  it("action=attach → policy/batch-detach {assignments 逐条}", async () => {
    const calls: InternalAxiosRequestConfig[] = [];
    adapterFor((config) => {
      calls.push(config);
      return { body: envelope(null) };
    }, calls);
    await revokeAuthorization({
      subject: "admin",
      subType: "role",
      resource: "P1",
      action: "attach",
    });
    expect(calls[0]!.url).toContain("/policy/batch-detach");
    expect(JSON.parse(calls[0]!.data)).toEqual({
      assignments: [
        {
          subject: { sub_type: "role", code: "admin" },
          policy_code: "P1",
        },
      ],
    });
  });
});

describe("isDuplicateAuthorization（唯一性前端预检）", () => {
  const items = [
    { subject: "alice", resource: "admin", action: "assign" },
    { subject: "alice", resource: "P1", action: "attach" },
  ];
  it("重复三元组 → true", () => {
    expect(
      isDuplicateAuthorization(items, {
        subject: "alice",
        resource: "admin",
        action: "assign",
      }),
    ).toBe(true);
  });
  it("不重复 → false", () => {
    expect(
      isDuplicateAuthorization(items, {
        subject: "bob",
        resource: "admin",
        action: "assign",
      }),
    ).toBe(false);
  });
  it("动作不同 → 不重复", () => {
    expect(
      isDuplicateAuthorization(items, {
        subject: "alice",
        resource: "admin",
        action: "attach",
      }),
    ).toBe(false);
  });
});
