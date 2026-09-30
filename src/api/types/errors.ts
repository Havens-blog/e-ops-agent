/**
 * 错误处理契约类型（tech-design §Error Handling，task 2.4）。
 *
 * 视图层只 catch 唯一 ApiError（Hard Rule）：api 客户端经 unwrapEnvelope<T>()（api/request/eiam.ts）
 * 把两种错误形态（2xx 业务码 / 非 2xx HTTP）统一归一为本类型上抛，
 * store catch 后归位 error / FieldErrors，视图渲染零直连 axios。
 *
 * 本文件是 types/ 目录内唯一的运行时构造（class）：错误契约需要同一 class 实例
 * 支撑 instanceof 判定，其余数据模型仍为纯类型（见 ./index.ts 头注）。
 */

/** 错误类别词表：kind 由「状态 × code → kind」分类学映射（parity-checklist §5，HTTP 状态优先） */
export type ErrorKind = 'unauthorized' | 'forbidden' | 'validation' | 'conflict' | 'unavailable' | 'unknown'

/**
 * 请求层唯一错误对象（六个 kind 的渲染路径约定）：
 * - unauthorized：401 —— redirectToLogin() 跳 /console/login（不清共享 cookie），store 复位在途状态；
 * - forbidden：403 —— 原地提示（文案契约 forbidden），不跳转；
 * - validation：400 / 422 —— FieldErrors 就近渲染（aria-describedby），不弹全局 toast；
 * - conflict：409 —— E6 并发编辑 / E11 依赖删除被拒（eiam 是否返回 409 未证，§6.4 待核）；
 * - unavailable：网络错 / 15s 超时 / 5xx —— 页面错误态 + 重试；
 * - unknown：其余兜底，不白屏。
 */
export class ApiError extends Error {
  /** 错误类别（store/视图据其选择渲染路径：错误页 / toast / 字段级就近提示） */
  readonly kind: ErrorKind
  /** 信封业务码原值（透传文案契约 key，utils/copyContract.ts）；纯 HTTP/网络故障为 null */
  readonly code: number | null
  /** HTTP 状态；无响应（网络错 / 超时）为 null */
  readonly httpStatus: number | null

  constructor(
    kind: ErrorKind,
    message: string,
    options?: { code?: number | null; httpStatus?: number | null },
  ) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.code = options?.code ?? null
    this.httpStatus = options?.httpStatus ?? null
  }
}

/** 400 / 422 字段级错误：store 从 validation 态 ApiError 归位，表单经 aria-describedby 就近渲染 */
export type FieldErrors = Record<string, string>
