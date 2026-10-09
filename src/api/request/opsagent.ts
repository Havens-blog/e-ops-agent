/**
 * 运维 Agent（D:/Haven/opsagent，/api/v1/opsagent）专用 axios 实例 —— 运维平台控制台版。
 *
 * 来源：e-cam-web src/api/request/opsagent.ts（opsagent 前端子模块自云管 cam-web 迁入
 * 本仓，见 docs/features/haven-opsagent/records/6.1-console-relocation.md）。迁移后
 * 本文件即以本仓为真源，不再参与 shared-hashes.json 拷贝面漂移登记（云管侧源文件已撤除）。
 *
 * 后端信封为 {code, message, data}，但成功 code 存在两态：多数端点经 web.OK 写 code=0
 * （数字），chat/correct 端点手写 code="0"（字符串）。主机实（./eiam.ts）按 ginx 信封
 * 契约解包且统一走 ApiError 分类学，不适用于 opsagent 的双态成功码；故独立成实例，
 * 信封解包逻辑收敛在 src/api/opsagent.ts 的 unwrapOpsagent。
 *
 * baseURL 与 cam-web 同源（VITE_API_BASE_URL || '/api/v1'）；dev 经 vite proxy
 * 指向 opsagent 服务 :8081（与产品环境 nginx /api/v1/opsagent → :8081 同构）。
 * 认证与其他控制台模块一致：共享 cookie ecmdb-token-key → Bearer；401 复用
 * eiam.ts 的 redirectToLogin（去抖 + 跳 /console/login，不清共享 cookie）。
 */
import { redirectToLogin } from './eiam'
import axios, { type AxiosInstance } from 'axios'

/** 会话 cookie 键：与本仓 eiam.ts 同源（eiam 签发、平台共用的会话凭证） */
const SESSION_COOKIE_KEY = 'ecmdb-token-key'

/** 从共享 cookie 读取会话 token（读法与 eiam.ts getSessionToken 一致） */
function getSessionToken(): string | undefined {
    if (typeof document === 'undefined') return undefined
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_KEY}=([^;]*)`))
    return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export const opsagentAxios: AxiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
    // chat 端点为同步编排（后端 syncBudget 25s），超时须高于 25s
    timeout: 30000,
    withCredentials: false,
})

opsagentAxios.interceptors.request.use((config) => {
    const token = getSessionToken()
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

opsagentAxios.interceptors.response.use(
    (response) => response,
    (error) => {
        // 401 未认证与会话过期：与其他控制台模块一致跳转登录页（不清共享 cookie）
        if (error.response?.status === 401) {
            redirectToLogin()
        }
        return Promise.reject(error)
    },
)