// @vitest-environment happy-dom
/**
 * auth api 客户端测试（task 2.9）。
 *
 * 覆盖 AC：auth.ts api system/ldap/passkey 登录 + mfa verify + logout，经 unwrapEnvelope 解包。
 * 验证点：
 * - 端点路径 + 载荷形状（parity §3.2 实核：B-1 mfa_token / B-2 snake_case→camelCase / B-4 session_token+header）；
 * - 响应归一 LoginResult（mfaRequired/mfaTicket/mustSelectTenant/mustBind/bindToken，无 token/lockUntil）；
 * - unwrapEnvelope 错误形态（2xx 业务码 / 非 2xx 信封）上抛 ApiError，文案经调用方 catch。
 */
import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ldapLogin,
  logout,
  passkeyLoginFinish,
  passkeyLoginStart,
  systemLogin,
  verifyMfa,
} from "./auth";
import { eiamAxios } from "@/api/request/eiam";
import { ApiError, type Envelope, type LoginResult } from "@/api/types";

const STATUS_TEXT: Partial<Record<number, string>> = {
  200: "OK",
  500: "Internal Server Error",
};

interface MockReply {
  status?: number;
  body?: unknown;
  networkFailure?: { code: string; message: string };
}

interface CapturedRequest {
  url: string;
  method?: string;
  data?: unknown;
  headers?: Record<string, string>;
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

/** 脚本化 adapter：按 url 回放响应，并捕获请求形态供断言。 */
function installAdapter(
  replyFor: (config: InternalAxiosRequestConfig) => MockReply,
): { captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  eiamAxios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const reply = replyFor(config);
    // axios 序列化 body 为 JSON 字符串；断言时按 JSON 解析回对象
    let data: unknown = config.data;
    if (typeof data === "string" && data.length > 0) {
      try {
        data = JSON.parse(data);
      } catch {
        // 非 JSON（如 passkey assertion 原对象经 JSON.stringify 后仍可解析；保留原串）
      }
    }
    captured.push({
      url: config.url ?? "",
      method: config.method,
      data,
      headers: config.headers
        ? Object.fromEntries(
            Object.entries(config.headers).map(([k, v]) => [k, String(v)]),
          )
        : undefined,
    });
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
  return { captured };
}

afterEach(() => {
  eiamAxios.defaults.adapter = undefined;
  vi.restoreAllMocks();
});

/** eiam login 成功响应信封（B-2 实核 snake_case 形） */
function loginEnvelope(
  overrides: Record<string, unknown> = {},
): Envelope<unknown> {
  return {
    code: 0,
    msg: "ok",
    data: {
      mfa_required: false,
      must_select_tenant: false,
      must_bind: false,
      ...overrides,
    },
  };
}

async function capture<T>(promise: Promise<T>): Promise<unknown> {
  try {
    await promise;
    return new Error("预期 rejection，但实际 resolve 了");
  } catch (error) {
    return error;
  }
}

describe("systemLogin（AC：system 登录 + unwrapEnvelope 解包）", () => {
  it("POST /api/iam/user/system/login，载荷 {username,password}，响应归一 LoginResult", async () => {
    const { captured } = installAdapter(() => ({
      status: 200,
      body: loginEnvelope(),
    }));
    const result = await systemLogin("admin", "pass123");
    expect(captured[0]?.url).toBe("/api/iam/user/system/login");
    expect(captured[0]?.method).toBe("post");
    expect(captured[0]?.data).toEqual({
      username: "admin",
      password: "pass123",
    });
    // B-2 实核：归一后无 token/lockUntil 字段（类型层 api-types.test.ts 已 @ts-expect-error 钉死）
    expect(result).toEqual<LoginResult>({});
    expect(Object.keys(result)).not.toContain("token");
    expect(Object.keys(result)).not.toContain("lockUntil");
  });

  it("mfa_required 响应归一：mfaRequired=true + mfaTicket（mfa_token→mfaTicket）", async () => {
    installAdapter(() => ({
      status: 200,
      body: loginEnvelope({ mfa_required: true, mfa_token: "mfa-ticket-xyz" }),
    }));
    const result = await systemLogin("admin", "pass123");
    expect(result.mfaRequired).toBe(true);
    expect(result.mfaTicket).toBe("mfa-ticket-xyz");
    // must_select_tenant=false → 字段不设置（归一只在 true 时写入）
    expect(result.mustSelectTenant).toBeUndefined();
  });

  it("must_select_tenant / must_bind / bind_token 归一 camelCase", async () => {
    installAdapter(() => ({
      status: 200,
      body: loginEnvelope({
        must_select_tenant: true,
        must_bind: true,
        bind_token: "bind-t",
      }),
    }));
    const result = await systemLogin("admin", "pass123");
    expect(result.mustSelectTenant).toBe(true);
    expect(result.mustBind).toBe(true);
    expect(result.bindToken).toBe("bind-t");
  });
});

describe("ldapLogin（AC：ldap 登录）", () => {
  it("POST /api/iam/user/ldap/login，载荷 {username,password}（无 source_id）", async () => {
    const { captured } = installAdapter(() => ({
      status: 200,
      body: loginEnvelope(),
    }));
    await ldapLogin("alice", "pw");
    expect(captured[0]?.url).toBe("/api/iam/user/ldap/login");
    expect(captured[0]?.data).toEqual({ username: "alice", password: "pw" });
  });

  it("带 sourceId 时载荷含 source_id", async () => {
    const { captured } = installAdapter(() => ({
      status: 200,
      body: loginEnvelope(),
    }));
    await ldapLogin("alice", "pw", 7);
    expect(captured[0]?.data).toEqual({
      username: "alice",
      password: "pw",
      source_id: 7,
    });
  });
});

describe("passkeyLogin（AC：passkey 登录 start/finish，B-4 session_token + header）", () => {
  it("start：POST /api/iam/user/passkey/login/start，响应归一 {options, sessionToken}", async () => {
    const { captured } = installAdapter(() => ({
      status: 200,
      body: {
        code: 0,
        msg: "ok",
        data: { options: { challenge: "c" }, session_token: "ssn-1" },
      },
    }));
    const start = await passkeyLoginStart();
    expect(captured[0]?.url).toBe("/api/iam/user/passkey/login/start");
    expect(start.sessionToken).toBe("ssn-1");
    expect(start.options).toEqual({ challenge: "c" });
  });

  it("start 缺 session_token → 抛错（不静默放行）", async () => {
    installAdapter(() => ({
      status: 200,
      body: { code: 0, msg: "ok", data: { options: {} } },
    }));
    const error = await capture(passkeyLoginStart());
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("session_token");
  });

  it("finish：header X-Passkey-Session + body=assertion 原对象 → LoginResult", async () => {
    const { captured } = installAdapter(() => ({
      status: 200,
      body: loginEnvelope({ must_select_tenant: false }),
    }));
    const assertion = { id: "cred-id", response: { authenticatorData: "abc" } };
    const result = await passkeyLoginFinish("ssn-1", assertion);
    expect(captured[0]?.url).toBe("/api/iam/user/passkey/login/finish");
    expect(captured[0]?.headers?.["X-Passkey-Session"]).toBe("ssn-1");
    // body = assertion 原对象（非 {credential: ...} 包裹）
    expect(captured[0]?.data).toEqual(assertion);
    expect(result).toEqual<LoginResult>({});
  });
});

describe("verifyMfa（AC：mfa verify，B-1 载荷 mfa_token 非 mfa_ticket）", () => {
  it("POST /api/iam/user/login/mfa/verify，载荷 {mfa_token, code}", async () => {
    const { captured } = installAdapter(() => ({
      status: 200,
      body: loginEnvelope(),
    }));
    await verifyMfa("mfa-ticket-xyz", "123456");
    expect(captured[0]?.url).toBe("/api/iam/user/login/mfa/verify");
    expect(captured[0]?.data).toEqual({
      mfa_token: "mfa-ticket-xyz",
      code: "123456",
    });
  });

  it("verify 成功后无 mfaRequired（会话已建立）", async () => {
    installAdapter(() => ({ status: 200, body: loginEnvelope() }));
    const result = await verifyMfa("t", "000000");
    expect(result.mfaRequired).toBeUndefined();
  });
});

describe("logout（AC：logout 经 unwrapEnvelope）", () => {
  it("POST /api/iam/user/logout，data=null", async () => {
    const { captured } = installAdapter(() => ({
      status: 200,
      body: { code: 0, msg: "ok", data: null },
    }));
    await logout();
    expect(captured[0]?.url).toBe("/api/iam/user/logout");
  });
});

describe("错误形态经 unwrapEnvelope → ApiError（AC：api 经 unwrapEnvelope 解包）", () => {
  it("2xx + code!=0 → ApiError（业务码透传，message=eiam msg）", async () => {
    installAdapter(() => ({
      status: 200,
      body: { code: 4010505, msg: "后端原始文案", data: null },
    }));
    const error = await capture(systemLogin("admin", "wrong"));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(4010505);
    expect((error as ApiError).message).toBe("后端原始文案");
  });

  it("非 2xx 可解析信封 → ApiError（eiam 主流形态：HTTP 500 携带业务码）", async () => {
    installAdapter(() => ({
      status: 500,
      body: { code: 4010202, msg: "账号或密码错误", data: null },
    }));
    const error = await capture(systemLogin("admin", "wrong"));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(4010202);
    expect((error as ApiError).message).toBe("账号或密码错误");
  });

  it("网络故障 → ApiError(unavailable)", async () => {
    installAdapter(() => ({
      networkFailure: {
        code: AxiosError.ERR_NETWORK,
        message: "Network Error",
      },
    }));
    const error = await capture(systemLogin("admin", "pw"));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("unavailable");
  });
});

describe("mapLoginResult 归一（B-2：无 token/lockUntil 字段）", () => {
  it("空载荷 → 空 LoginResult", async () => {
    installAdapter(() => ({
      status: 200,
      body: { code: 0, msg: "ok", data: null },
    }));
    const result = await systemLogin("a", "b");
    expect(result).toEqual<LoginResult>({});
  });

  it("snake_case 全字段归一 camelCase，不泄露 eiam 原键", async () => {
    installAdapter(() => ({
      status: 200,
      body: loginEnvelope({
        mfa_required: true,
        mfa_token: "t",
        must_select_tenant: true,
        must_bind: true,
        bind_token: "b",
      }),
    }));
    const result = await systemLogin("a", "b");
    const keys = Object.keys(result);
    expect(keys).not.toContain("mfa_required");
    expect(keys).not.toContain("mfa_token");
    expect(keys).not.toContain("must_select_tenant");
    expect(keys).not.toContain("must_bind");
    expect(keys).not.toContain("bind_token");
    expect(result).toEqual<LoginResult>({
      mfaRequired: true,
      mfaTicket: "t",
      mustSelectTenant: true,
      mustBind: true,
      bindToken: "b",
    });
  });
});
