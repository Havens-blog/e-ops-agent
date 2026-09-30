// 文案契约（错误码 → 逐字文案）—— 2.5 横向基础设施。
// 唯一口径来源：docs/features/platform-console/ui/ui-design.md §文案契约（全表）。
// Hard Rule：实现不得改写任何契约文案措辞 —— 本 map 与其配套测试逐字钉死口径，改动措辞必须先改 ui-design。
// v1 仅中文，按 key 维护以备 i18n；占位符形态 {X} / {n} / {m} / {name}（命名插值）。
// 消费方式：eiam 业务 code 经 ApiError 原值透传到此（tech-design §Error Handling），
// ApiError.message 即契约文案，视图层零二次映射；字段级校验文案不在本契约内，
// 由各表单经 aria-describedby 就近维护（唯一性冲突除外：validation.name_exists 在契约内）。

/** 契约 key → 逐字文案。key 集合与 ui-design 全表一一对应，不得增删改。 */
export const COPY_CONTRACT = {
  'auth.invalid_credentials': '用户名或密码错误',
  'auth.mfa_invalid': '验证码错误，请重新输入',
  'auth.account_locked': '尝试次数过多，账号已锁定，剩余 {X} 分钟',
  'auth.empty_credentials': '请输入用户名和密码',
  'auth.passkey_unsupported': '当前浏览器不支持 Passkey，请改用密码或 LDAP 登录',
  'auth.first_login_change_password': '首次登录请修改密码',
  'session.expired': '登录已过期，请重新登录',
  forbidden: '无权限执行该操作',
  'tenant.none': '无所属租户',
  'tenant.disable_blocked': '无法禁用：该租户仍有 {n} 个活跃会话',
  'eiam.unavailable': '身份服务暂不可用，请稍后重试',
  'grant.duplicate': '授权已存在',
  'delete.blocked_org': '无法删除：存在 {n} 个下属组织、{m} 个关联用户',
  'delete.blocked_role': '无法删除：该角色已绑定 {n} 个用户',
  'delete.blocked_policy': '无法删除：该策略已被 {n} 个角色绑定',
  'validation.name_exists': '名称已存在：{name}',
  'save.conflict': '数据已被他人修改，请重新加载后再试',
} as const

/** 契约 key 类型（供视图层 key 级补全；透传 code 场景仍是 string，未知 code 走 null 回退） */
export type CopyContractKey = keyof typeof COPY_CONTRACT

/** 契约 key 全集（供遍历/断言用，与 COPY_CONTRACT 同源） */
export const CONTRACT_KEYS = Object.keys(COPY_CONTRACT) as CopyContractKey[]

/** 占位符插值参数：值为 string | number（计数、分钟数、名称等） */
export type ContractParams = Record<string, string | number>

/** 是否为已登记契约 key（原型链键名安全：eiam code 原值透传，不可被原型键污染） */
export function isContractKey(code: string): code is CopyContractKey {
  return Object.prototype.hasOwnProperty.call(COPY_CONTRACT, code)
}

/**
 * code → 契约文案。
 * 已知 key 返回逐字文案；未知 code 返回 null —— 调用方（request 层 / 契约渲染组件）
 * 回退到 eiam 返回原文（ApiError.message），零二次映射、不伪造文案。
 */
export function contractText(code: string): string | null {
  return isContractKey(code) ? COPY_CONTRACT[code] : null
}

/**
 * 契约文案占位符插值：{name} 形态命名占位符 → params 对应值。
 * 仅替换 params 中显式提供的占位符；缺参或未知占位符原样保留（缺参显式可见，不静默吞掉）。
 * 不改写入参模板（返回新字符串）。
 */
export function formatContractText(template: string, params?: ContractParams): string {
  if (!params) return template
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : token,
  )
}
