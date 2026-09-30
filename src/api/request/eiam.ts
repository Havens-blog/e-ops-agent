import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import { ApiError, type Envelope, type ErrorKind } from '@/api/types'

/**
 * eiam 统一身份服务专用请求层（拷贝面「eiamAxios 模式」文件，登记 shared-hashes.json；
 * 模式源：e-cam-web src/api/request/eiam.ts @ a6ca24e —— 本仓为自包含适配版）。
 *
 * 与模式源的两处刻意分歧（2.4 改动面仅限本文件 + api/types，不引入 request/index.ts 与
 * utils/cookie.ts，后续任务如落地对应模块可回迁收编）：
 * ① cookie 读取内联（同名 cookie `ecmdb-token-key`，读法与 e-cam-web utils/cookie.ts 一致）；
 * ② redirectToLogin（含 isRedirectingToLogin 防抖）内联 —— 模式源从 ./index 引入，
 *    本仓登录目标恒为控制台自身登录页 /console/login。
 *
 * 行为契约与模式源一致（tech-design §Architecture / §Error Handling）：
 * withCredentials、cookie→Bearer 注入、401 跳登录（isRedirectingToLogin 防抖、不清共享 cookie）、
 * 15s 超时。请求路径前缀 /api/iam/* 经 nginx（及 vite dev proxy）重写为 eiam :9000 /api/*。
 */

/** 会话 cookie 键：eiam 签发、e-cam-service / ecmdb-web 共用的平台凭证（parity §6.1 实核） */
const SESSION_COOKIE_KEY = 'ecmdb-token-key'
/** 请求超时（tech-design §Architecture：15s） */
const REQUEST_TIMEOUT_MS = 15000
/** 控制台登录页（401 收敛唯一目标；与 e-cam-web RC#2 resolveLoginTarget 默认值一致） */
const LOGIN_PATH = '/console/login'

/** 从共享 cookie 读取会话 token（JWT 为 URL-safe base64，无需容错解码） */
function getSessionToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_KEY}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export const eiamAxios: AxiosInstance = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

eiamAxios.interceptors.request.use((config) => {
  const token = getSessionToken()
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** 防止多个并发 401 请求重复跳转登录页（继承现仓同款：模块级单次置位，不复位） */
let isRedirectingToLogin = false

/**
 * 统一跳转登录页（Hard Rule：不清共享 cookie）。
 * ecmdb-token-key 是 eiam / e-cam-service / ecmdb-web 共用的平台凭证，清除它是
 * eiam logout 的职责；401 只是本应用的局部判断，在此删 cookie 会把其他服务的
 * 登录态一并清掉，使局部故障扩散为全平台掉线（现仓 request/index.ts 同款注释契约）。
 */
export function redirectToLogin(): void {
  if (isRedirectingToLogin) return
  isRedirectingToLogin = true
  const currentUrl = window.location.href
  window.location.href = `${LOGIN_PATH}?redirect=${encodeURIComponent(currentUrl)}`
}

eiamAxios.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const status = (error as { response?: { status?: number } } | null)?.response?.status
    if (status === 401) {
      redirectToLogin()
    }
    return Promise.reject(error)
  },
)

// ---- 「状态 × code → kind」分类学（tech-design §Error Handling） ----

/**
 * kind 映射。parity-checklist §5「状态 × code → kind」对照表尚未产出（占位，待证据-P），
 * 当前按 HTTP 状态优先执行；对 eiam 业务码不做区段假设（tech-design 分类学前置口径），
 * 故 2xx 业务错误不命中特定档、落 unknown。
 * §5 随证据-P 产出后如需按业务码细分，仅扩展本函数（单点），调用面不变。
 */
export function resolveKind(httpStatus: number | null): ErrorKind {
  if (httpStatus === null) return 'unavailable' // 网络错 / 15s 超时：无响应
  if (httpStatus === 401) return 'unauthorized'
  if (httpStatus === 403) return 'forbidden'
  if (httpStatus === 400 || httpStatus === 422) return 'validation'
  if (httpStatus === 409) return 'conflict'
  if (httpStatus >= 500) return 'unavailable'
  return 'unknown'
}

/** 信封可解析判定：对象且 code 为数值（ginx Result 形；msg/data 缺省容忍，用于错误回读） */
function isEnvelopeLike(value: unknown): value is { code: number; msg?: unknown; data?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code?: unknown }).code === 'number'
  )
}

/** 信封 msg 原文优先（文案契约未知 code 时回退此原文，utils/copyContract.ts 约定）；空缺回退状态短语 */
function envelopeMsg(value: { msg?: unknown }, status: number, statusText?: string): string {
  return typeof value.msg === 'string' && value.msg.length > 0
    ? value.msg
    : statusPhrase(status, statusText)
}

/** 不可解析响应的 message：取状态短语（tech-design：message 取状态短语） */
function statusPhrase(status: number, statusText?: string): string {
  return statusText ? `HTTP ${status} ${statusText}` : `HTTP ${status}`
}

/** 任意抛出值归一为 ApiError（视图层只 catch 唯一 ApiError 的保证点） */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  const axiosLike = error as
    | { response?: { status?: number; statusText?: string; data?: unknown }; message?: unknown }
    | null
  const response = axiosLike?.response
  const status = response?.status
  if (response && status !== undefined) {
    const kind = resolveKind(status)
    if (isEnvelopeLike(response.data)) {
      // 分支②：非 2xx 可解析信封 —— 取 {code,msg} 抛同一 ApiError
      // （eiam 主流业务错误形态：ginx 对 handler error 写 HTTP 500 + Result，业务码仍在信封里）
      return new ApiError(kind, envelopeMsg(response.data, status, response.statusText), {
        code: response.data.code,
        httpStatus: status,
      })
    }
    // 分支③：不可解析 —— 按 HTTP 状态映射 kind，message 取状态短语
    return new ApiError(kind, statusPhrase(status, response.statusText), { httpStatus: status })
  }
  // 无响应：网络错 / 超时 → unavailable（message 透传 axios 原始诊断）
  const message = typeof axiosLike?.message === 'string' ? axiosLike.message : 'request failed'
  return new ApiError('unavailable', message)
}

/**
 * 单一出口解包（tech-design §Error Handling：所有 api 客户端函数必经，不得直连 axios）。
 *
 * ① 2xx + code===0 → 解包 data（T）；
 * ② 2xx + code!=0 → ApiError（kind 按分类学映射，业务 code 原值透传文案契约）；
 * ③ 非 2xx 可解析信封 → 取 {code,msg} 抛同一 ApiError；不可解析 → 按 HTTP 状态映射 kind；
 * ④ 网络错 / 超时 → unavailable。
 *
 * 非 2xx 与 2xx 业务错误携带同一业务 code，store/视图经 contractText(code)（未知回退
 * ApiError.message 原文）统一取文案，零二次映射。
 */
export async function unwrapEnvelope<T>(request: Promise<AxiosResponse<Envelope<T>>>): Promise<T> {
  let response: AxiosResponse<Envelope<T>>
  try {
    response = await request
  } catch (error) {
    throw toApiError(error)
  }

  const body: unknown = response.data
  if (!isEnvelopeLike(body)) {
    // ginx 契约外形态（无 code 字段，如代理直出 HTML/空体）：格式错误，不静默放行（现仓同款）
    throw new ApiError('unknown', '接口响应格式错误（缺少 code 信封字段）', {
      httpStatus: response.status,
    })
  }

  if (body.code !== 0) {
    // 分支②：2xx 业务错误（ginx 对 handler 返回的错误 Result 写 HTTP 200 + code!=0）
    throw new ApiError(resolveKind(response.status), envelopeMsg(body, response.status, response.statusText), {
      code: body.code,
      httpStatus: response.status,
    })
  }

  return body.data as T
}
