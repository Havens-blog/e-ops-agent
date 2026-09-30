// @vitest-environment happy-dom
/**
 * 2.4 请求层用例 —— eiamAxios 实例 + unwrapEnvelope/ApiError 错误分类学。
 *
 * 分类学口径：parity-checklist §5「状态 × code → kind」对照表尚未产出（占位，待证据-P），
 * 当前按 tech-design 分类学 + 任务 AC 的 HTTP 状态优先映射
 * （401→unauthorized / 403→forbidden / 400·422→validation / 409→conflict /
 *   网络错·超时·5xx→unavailable / 其余→unknown）。
 *
 * eiam 实际业务错误形态（ginx W/B 语义实核，2.4 记录）：
 * - handler 返回非空 error → HTTP 500 + Result 信封（如登录失败 4010202）；
 * - handler 返回错误 Result + nil error → HTTP 200 + code != 0（如 4010505）；
 * - 鉴权中间件 → 真 401（空体 AbortWithStatus）/ 403 + code 403001。
 */
import { URL as NodeURL } from 'node:url'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { ApiError as ApiErrorIface, Envelope, ErrorKind, FieldErrors } from '@/api/types'

// ---- window.location 替身（happy-dom 原生 href 赋值会触发真实导航；e-cam-web RC#2 同款手法）----

function stubLocation(initialHref: string): { href: string } {
  let current = new NodeURL(initialHref)
  const fake = {
    get href(): string {
      return current.href
    },
    set href(value: string) {
      // 相对地址按当前 URL 为 base 解析（浏览器语义；生产默认登录目标 /console/login 为相对路径）
      current = new NodeURL(value, current)
    },
    get origin(): string {
      return current.origin
    },
    toString(): string {
      return current.href
    },
  }
  Object.defineProperty(window, 'location', { value: fake, configurable: true, writable: true })
  return fake
}

function restoreLocation(original: Location): void {
  Object.defineProperty(window, 'location', { value: original, configurable: true, writable: true })
}

const realLocation = window.location

afterEach(() => {
  restoreLocation(realLocation)
  vi.resetModules()
})

// ---- 适配器替身：不发包，按脚本回放 HTTP 形态（含无响应网络故障）----

interface MockReply {
  status: number
  body?: unknown
  /** 模拟网络层故障（无 response）：ERR_NETWORK / ECONNABORTED(超时) */
  networkFailure?: { code: string; message: string }
}

const STATUS_TEXT: Partial<Record<number, string>> = {
  200: 'OK',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
}

/**
 * 每用例取全新模块实例：redirectToLogin 防抖是模块级单次置位，静态实例一旦触发不再跳转
 * （e-cam-web RC#2 用例同款 vi.resetModules + 动态 import 手法）。
 * types 模块随同一注册表重解析，保证 rejection instanceof ApiError 同源。
 */
async function fresh(): Promise<{ mod: typeof import('./eiam'); ApiError: typeof import('@/api/types').ApiError }> {
  vi.resetModules()
  const [mod, types] = await Promise.all([import('./eiam'), import('@/api/types')])
  return { mod, ApiError: types.ApiError }
}

/**
 * 复刻 axios 内建适配器契约：非 2xx 经 validateStatus 判定转为 AxiosError rejection。
 * axios 的 validateStatus 只在内建适配器内部的 settle() 生效 —— 自定义 adapter 必须自行
 * 复刻，否则非 2xx 会以 resolve 流出（与真实请求行为不符，401 拦截/错误分支全部失活）。
 */
function settleLike(response: AxiosResponse): AxiosResponse {
  const validate = response.config.validateStatus ?? ((status: number) => status >= 200 && status < 300)
  if (validate(response.status)) return response
  throw new AxiosError(
    `Request failed with status code ${response.status}`,
    AxiosError.ERR_BAD_REQUEST,
    response.config,
    undefined,
    response,
  )
}

/** 把脚本化响应挂到 fresh 实例上（可重复调用换脚本，如网络错→超时两段式） */
function installAdapter(
  mod: typeof import('./eiam'),
  replyFor: (config: InternalAxiosRequestConfig) => MockReply,
): void {
  mod.eiamAxios.defaults.adapter = async (config) => {
    const reply = replyFor(config)
    if (reply.networkFailure) {
      throw new AxiosError(reply.networkFailure.message, reply.networkFailure.code, config)
    }
    return settleLike({
      data: reply.body ?? null,
      status: reply.status,
      statusText: STATUS_TEXT[reply.status] ?? '',
      headers: {},
      config,
    } as AxiosResponse)
  }
}

/** 统一发一个 POST 并解包（未来 api 客户端唯一用法：eiamAxios → unwrapEnvelope） */
function call<T>(mod: typeof import('./eiam')): Promise<T> {
  const promise = mod.eiamAxios.post<Envelope<T>>('/api/iam/user/list', {})
  return mod.unwrapEnvelope<T>(promise)
}

/** 捕获 rejection 供多断言 */
async function capture<T>(promise: Promise<T>): Promise<unknown> {
  try {
    await promise
    return new Error('预期 rejection，但实际 resolve 了')
  } catch (error) {
    return error
  }
}

function setSharedCookie(value: string): void {
  document.cookie = `ecmdb-token-key=${value}; path=/`
}

function clearSharedCookie(): void {
  document.cookie = 'ecmdb-token-key=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
}

describe('eiamAxios 实例（AC-1）', () => {
  it('withCredentials=true、timeout=15000（15s 超时）', async () => {
    const { mod } = await fresh()
    expect(mod.eiamAxios.defaults.withCredentials).toBe(true)
    expect(mod.eiamAxios.defaults.timeout).toBe(15000)
  })

  it('请求拦截从共享 cookie ecmdb-token-key 注入 Bearer', async () => {
    setSharedCookie('tok-eiam-123')
    const captured: Array<InternalAxiosRequestConfig> = []
    const { mod } = await fresh()
    installAdapter(mod, (config) => {
      captured.push(config)
      return { status: 200, body: { code: 0, msg: 'ok', data: null } }
    })
    await call(mod)
    expect(captured).toHaveLength(1)
    expect(captured[0]?.headers?.['Authorization']).toBe('Bearer tok-eiam-123')
  })

  it('无 cookie 时不注入 Authorization 头（登录页自身请求不带凭证）', async () => {
    clearSharedCookie()
    const captured: Array<InternalAxiosRequestConfig> = []
    const { mod } = await fresh()
    installAdapter(mod, (config) => {
      captured.push(config)
      return { status: 200, body: { code: 0, msg: 'ok', data: null } }
    })
    await call(mod)
    expect(captured[0]?.headers?.['Authorization']).toBeUndefined()
  })
})

describe('401 → redirectToLogin（AC-1 防抖 + Hard Rule 不清共享 cookie）', () => {
  it('401 跳转 /console/login?redirect= 回跳，且不清共享 cookie', async () => {
    setSharedCookie('shared-credential-probe')
    const current = 'http://localhost:8888/console/users?tab=all'
    stubLocation(current)
    const { mod, ApiError } = await fresh()
    installAdapter(mod, () => ({ status: 401, body: '' }))

    const error = await capture(call(mod))

    // 相对目标按当前 origin 解析（浏览器语义）
    expect(window.location.href).toBe(
      `http://localhost:8888/console/login?redirect=${encodeURIComponent(current)}`,
    )
    // Hard Rule：401 收敛不清共享 cookie（eiam/ecmdb/e-cam-service 共用平台凭证）
    expect(document.cookie).toContain('ecmdb-token-key=shared-credential-probe')
    // 401 同时映射 unauthorized
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiErrorIface).kind).toBe('unauthorized')
    expect((error as ApiErrorIface).httpStatus).toBe(401)
  })

  it('防抖：并发多个 401 只跳一次', async () => {
    setSharedCookie('shared-credential-probe')
    const fake = stubLocation('http://localhost:8888/console/users')
    const { mod } = await fresh()
    installAdapter(mod, () => ({ status: 401, body: '' }))

    await capture(call(mod))
    const firstHref = window.location.href
    expect(firstHref).toContain('/console/login?redirect=')

    // 第二次触发（另一个并发 401）必须早退：href 不再被改写
    fake.href = 'http://localhost:8888/console/tenants'
    await capture(call(mod))
    expect(window.location.href).toBe('http://localhost:8888/console/tenants')
  })
})

describe('unwrapEnvelope<T>（AC-2 两种错误形态统一解包）', () => {
  it('2xx + code=0 → 解包 data（成功路径）', async () => {
    const { mod } = await fresh()
    installAdapter(mod, () => ({
      status: 200,
      body: { code: 0, msg: 'ok', data: { total: 1, items: [{ id: 7 }] } },
    }))
    const data = await call<{ total: number; items: Array<{ id: number }> }>(mod)
    expect(data).toEqual({ total: 1, items: [{ id: 7 }] })
  })

  it('2xx + code!=0 → ApiError：kind=unknown（状态优先：2xx 不命中特定档）、code 原值透传、message=eiam 原文', async () => {
    const { mod, ApiError } = await fresh()
    installAdapter(mod, () => ({ status: 200, body: { code: 4010505, msg: '用户 ID 非法', data: null } }))
    const error = await capture(call(mod))
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiErrorIface
    expect(apiError.kind).toBe('unknown')
    expect(apiError.code).toBe(4010505)
    expect(apiError.httpStatus).toBe(200)
    expect(apiError.message).toBe('用户 ID 非法')
    expect(apiError.name).toBe('ApiError')
  })

  it('非 2xx 可解析信封 → 取 {code,msg} 抛同一 ApiError（eiam 主流形态：HTTP 500 携带业务码）', async () => {
    const { mod, ApiError } = await fresh()
    installAdapter(mod, () => ({
      status: 500,
      body: { code: 4010202, msg: '认证失败 (账号或密码错误)', data: null },
    }))
    const error = await capture(call(mod))
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiErrorIface
    expect(apiError.kind).toBe('unavailable')
    expect(apiError.code).toBe(4010202)
    expect(apiError.httpStatus).toBe(500)
    expect(apiError.message).toBe('认证失败 (账号或密码错误)')
  })

  it('非 2xx 不可解析 → 按 HTTP 状态映射 kind，message 取状态短语，code=null', async () => {
    const { mod, ApiError } = await fresh()
    installAdapter(mod, () => ({ status: 502, body: '<html>Bad Gateway</html>' }))
    const error = await capture(call(mod))
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiErrorIface
    expect(apiError.kind).toBe('unavailable')
    expect(apiError.code).toBeNull()
    expect(apiError.httpStatus).toBe(502)
    expect(apiError.message).toBe('HTTP 502 Bad Gateway')
  })

  it('2xx 非信封响应（缺 code 字段）→ unknown 格式错误，不静默放行', async () => {
    const { mod, ApiError } = await fresh()
    installAdapter(mod, () => ({ status: 200, body: { foo: 1 } }))
    const error = await capture(call(mod))
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiErrorIface
    expect(apiError.kind).toBe('unknown')
    expect(apiError.code).toBeNull()
    expect(apiError.httpStatus).toBe(200)
    expect(apiError.message).toContain('接口响应格式错误')
  })

  it('网络错 / 超时（无 response）→ unavailable，httpStatus=null', async () => {
    const { mod, ApiError } = await fresh()
    installAdapter(mod, () => ({
      status: 0,
      networkFailure: { code: AxiosError.ERR_NETWORK, message: 'Network Error' },
    }))
    const networkError = await capture(call(mod))
    expect(networkError).toBeInstanceOf(ApiError)
    expect((networkError as ApiErrorIface).kind).toBe('unavailable')
    expect((networkError as ApiErrorIface).httpStatus).toBeNull()
    expect((networkError as ApiErrorIface).code).toBeNull()

    installAdapter(mod, () => ({
      status: 0,
      networkFailure: { code: AxiosError.ECONNABORTED, message: 'timeout of 15000ms exceeded' },
    }))
    const timeoutError = await capture(call(mod))
    expect(timeoutError).toBeInstanceOf(ApiError)
    expect((timeoutError as ApiErrorIface).kind).toBe('unavailable')
    expect((timeoutError as ApiErrorIface).code).toBeNull()
  })
})

describe('kind 分类学（AC-3 六词表；§5 对照表未产出，HTTP 状态优先）', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [400, 'validation'],
    [422, 'validation'],
    [409, 'conflict'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [404, 'unknown'],
    [200, 'unknown'],
    [null, 'unavailable'],
  ] as Array<[number | null, ErrorKind]>)('resolveKind(%s) → %s', async (status, expected) => {
    const { mod } = await fresh()
    expect(mod.resolveKind(status)).toBe(expected)
  })

  it('403 信封携带 403001 → forbidden + 业务码透传（parity §6.2 实核形态）', async () => {
    const { mod, ApiError } = await fresh()
    installAdapter(mod, () => ({
      status: 403,
      body: { code: 403001, msg: '无权执行该操作，请联系管理员授权', data: null },
    }))
    const error = await capture(call(mod))
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiErrorIface
    expect(apiError.kind).toBe('forbidden')
    expect(apiError.code).toBe(403001)
    expect(apiError.httpStatus).toBe(403)
    expect(apiError.message).toBe('无权执行该操作，请联系管理员授权')
  })

  it('400 / 422 / 409 状态行为抽查（unparseable body 也按状态映射）', async () => {
    const { mod, ApiError } = await fresh()
    installAdapter(mod, () => ({ status: 400, body: '' }))
    const badRequest = await capture(call(mod))
    expect(badRequest).toBeInstanceOf(ApiError)
    expect((badRequest as ApiErrorIface).kind).toBe('validation')

    installAdapter(mod, () => ({ status: 422, body: { errors: 'none' } }))
    const unprocessable = await capture(call(mod))
    expect((unprocessable as ApiErrorIface).kind).toBe('validation')

    installAdapter(mod, () => ({ status: 409, body: 'version conflict' }))
    const conflict = await capture(call(mod))
    expect(conflict).toBeInstanceOf(ApiError)
    expect((conflict as ApiErrorIface).kind).toBe('conflict')
    expect((conflict as ApiErrorIface).code).toBeNull()
  })
})

describe('错误契约类型（types/errors.ts，AC-3 类型面）', () => {
  it('ErrorKind 六词表 + ApiError{kind,code,httpStatus} 可空性 + FieldErrors', () => {
    expectTypeOf<ErrorKind>().toEqualTypeOf<
      'unauthorized' | 'forbidden' | 'validation' | 'conflict' | 'unavailable' | 'unknown'
    >()
    expectTypeOf<ApiErrorIface['kind']>().toEqualTypeOf<ErrorKind>()
    expectTypeOf<ApiErrorIface['code']>().toEqualTypeOf<number | null>()
    expectTypeOf<ApiErrorIface['httpStatus']>().toEqualTypeOf<number | null>()
    expectTypeOf<FieldErrors>().toEqualTypeOf<Record<string, string>>()
  })

  it('unwrapEnvelope 泛型：入 Promise<AxiosResponse<Envelope<T>>> 出 Promise<T>', async () => {
    vi.resetModules()
    const mod = await import('./eiam')
    expectTypeOf(mod.unwrapEnvelope<{ id: number }>).parameters.toEqualTypeOf<
      [Promise<AxiosResponse<Envelope<{ id: number }>>>]
    >()
  })
})
