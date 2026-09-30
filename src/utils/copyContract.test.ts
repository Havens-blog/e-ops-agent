// 文案契约单测（2.5）：EXPECTED 表逐字取自 ui-design「文案契约」全表，
// 断言 map 与契约全表深度相等 —— 措辞不得改写（任务 Hard Rule），任何漂移在此暴露。
import { describe, expect, it } from 'vitest'
import { CONTRACT_KEYS, COPY_CONTRACT, contractText, formatContractText, isContractKey } from './copyContract'

// 逐字口径：docs/features/platform-console/ui/ui-design.md §文案契约
// （不加 Record 注解：保留字面量 key 推断，noUncheckedIndexedAccess 下插值取参仍是 string）
const EXPECTED = {
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
}

describe('文案契约 map（2.5 契约）', () => {
  it('全 key 逐字一致：与 ui-design 文案契约全表深度相等', () => {
    expect(COPY_CONTRACT).toEqual(EXPECTED)
  })

  it('key 集合恰好 17 个、无重复（key 即唯一性）', () => {
    expect(CONTRACT_KEYS).toHaveLength(Object.keys(EXPECTED).length)
    expect(new Set(CONTRACT_KEYS).size).toBe(CONTRACT_KEYS.length)
  })

  it('contractText 已知 code 返回逐字文案，未知 code 返回 null（调用方回退 ApiError.message 原文）', () => {
    expect(contractText('session.expired')).toBe('登录已过期，请重新登录')
    expect(contractText('unknown.code')).toBeNull()
    expect(contractText('')).toBeNull()
  })

  it('contractText 对 Object 原型链键名安全（eiam code 原值透传，不可被原型键污染）', () => {
    expect(contractText('toString')).toBeNull()
    expect(contractText('constructor')).toBeNull()
    expect(isContractKey('hasOwnProperty')).toBe(false)
    expect(isContractKey('forbidden')).toBe(true)
  })
})

describe('契约占位符插值（2.5 契约）', () => {
  it('auth.account_locked {X}：剩余分钟数插值', () => {
    expect(formatContractText(EXPECTED['auth.account_locked'], { X: 3 })).toBe(
      '尝试次数过多，账号已锁定，剩余 3 分钟',
    )
  })

  it('tenant.disable_blocked {n}：活跃会话数插值', () => {
    expect(formatContractText(EXPECTED['tenant.disable_blocked'], { n: 12 })).toBe(
      '无法禁用：该租户仍有 12 个活跃会话',
    )
  })

  it('delete.blocked_org {n}/{m} 双占位符各自插值', () => {
    expect(formatContractText(EXPECTED['delete.blocked_org'], { n: 2, m: 7 })).toBe(
      '无法删除：存在 2 个下属组织、7 个关联用户',
    )
  })

  it('validation.name_exists {name}：字符串参数插值', () => {
    expect(formatContractText(EXPECTED['validation.name_exists'], { name: '财务部' })).toBe(
      '名称已存在：财务部',
    )
  })

  it('缺参占位符原样保留（缺参显式可见，不静默吞掉）；部分插值互不影响', () => {
    expect(formatContractText(EXPECTED['delete.blocked_org'], { n: 2 })).toBe(
      '无法删除：存在 2 个下属组织、{m} 个关联用户',
    )
    expect(formatContractText(EXPECTED['auth.account_locked'])).toBe(EXPECTED['auth.account_locked'])
  })

  it('params 未提供的未知占位符与模板内花括号保持原样，不做猜测替换', () => {
    expect(formatContractText('值 {unknown_place} 保持', { n: 1 })).toBe('值 {unknown_place} 保持')
  })

  it('同一占位符多次出现全部替换，且不改写入参模板（返回新串）', () => {
    const template = '{n}/{n}'
    expect(formatContractText(template, { n: 4 })).toBe('4/4')
    expect(template).toBe('{n}/{n}')
  })
})
