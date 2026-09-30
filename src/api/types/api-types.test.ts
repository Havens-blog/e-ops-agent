// 2.3 数据模型类型契约测试 —— 纯类型层（被测对象零运行时逻辑），全部断言为编译期类型检查。
// 运行期由 vitest 跑通（expectTypeOf 为运行期 no-op），真正的校验力来自 `pnpm typecheck`
// （vue-tsc，tsconfig.app include src/**/*.ts 覆盖本文件）：错误形状 / 错误词表 / 冗余字段
// 会在类型检查期失败；`// @ts-expect-error` 同时反向验证「非法形状确被拒绝」。
import { describe, expectTypeOf, it } from 'vitest'
import type {
  Authorization,
  ConnParams,
  Envelope,
  IdentitySource,
  ListQuery,
  LoginResult,
  Organization,
  Page,
  PasskeyRegistrationSession,
  Policy,
  PolicyCondition,
  PolicyStatement,
  Ref,
  Role,
  RoleRef,
  SessionClaims,
  Tenant,
  User,
} from './index'

describe('统一归一类型（AC-3）', () => {
  it('Envelope{code,msg,data}：成功 code===0，字段为 msg 非 message', () => {
    const envelope: Envelope<{ total: number }> = { code: 0, msg: 'ok', data: { total: 1 } }
    expectTypeOf(envelope.data).toEqualTypeOf<{ total: number }>()
    expectTypeOf(envelope.msg).toEqualTypeOf<string>()
    // @ts-expect-error eiam 原生信封字段是 msg 而非 message（e-cam-web eiam-mapper.ts 实盘核验），不得引入 message
    const withMessage: Envelope<null> = { code: 0, message: 'ok', data: null }
    expectTypeOf(withMessage).toEqualTypeOf<Envelope<null>>()
  })

  it('ListQuery{offset,limit,keyword} 为必填三元组', () => {
    const query: ListQuery = { offset: 0, limit: 20, keyword: '' }
    expectTypeOf(query.offset).toEqualTypeOf<number>()
    expectTypeOf(query.limit).toEqualTypeOf<number>()
    expectTypeOf(query.keyword).toEqualTypeOf<string>()
    // @ts-expect-error offset 必填（分页偏移不设默认值，视图层显式传参）
    const missingOffset: ListQuery = { limit: 20, keyword: '' }
    expectTypeOf(missingOffset).toEqualTypeOf<ListQuery>()
  })

  it('Page<T>{total,items}：api 层把 eiam {total,users|roles|tenants} 归一为 items', () => {
    const page: Page<User> = { total: 1, items: [] }
    expectTypeOf(page.total).toEqualTypeOf<number>()
    expectTypeOf(page.items).toEqualTypeOf<User[]>()
    // @ts-expect-error 视图层只认归一键 items，eiam 原生分页键 users 不得直出（Hard Rule）
    const rawKey: Page<User> = { total: 1, users: [] }
    expectTypeOf(rawKey).toEqualTypeOf<Page<User>>()
  })
})

describe('共享引用类型（AC-2）', () => {
  it('Ref{id,name} / RoleRef{id,code,name}：角色分配以 code 为准', () => {
    const ref: Ref = { id: 1, name: '证书资产' }
    const roleRef: RoleRef = { id: 1, code: 'admin', name: '管理员' }
    expectTypeOf(ref).toEqualTypeOf<Ref>()
    expectTypeOf(roleRef.code).toEqualTypeOf<string>()
  })

  it('SessionClaims{uid,username,tenantId}：JWT claims 归一形', () => {
    const claims: SessionClaims = { uid: 1, username: 'op', tenantId: 4 }
    expectTypeOf(claims.uid).toEqualTypeOf<number>()
    expectTypeOf(claims.tenantId).toEqualTypeOf<number>()
    expectTypeOf(claims.username).toEqualTypeOf<string>()
  })

  it('LoginResult：Phase 0 B-2 实核形 —— 有 mfaRequired/mfaTicket，无 token/lockUntil', () => {
    const mfa: LoginResult = { mfaRequired: true, mfaTicket: 'mfa-ticket' }
    const bind: LoginResult = { mustSelectTenant: true, mustBind: false, bindToken: 'bind-ticket' }
    expectTypeOf(mfa.mfaRequired).toEqualTypeOf<boolean | undefined>()
    expectTypeOf(mfa.mfaTicket).toEqualTypeOf<string | undefined>()
    expectTypeOf(bind.mustSelectTenant).toEqualTypeOf<boolean | undefined>()
    expectTypeOf(bind.bindToken).toEqualTypeOf<string | undefined>()
    // @ts-expect-error B-2：无 token 字段 —— 会话凭据经 Set-Cookie 颁发，不落响应体/不落 localStorage
    const withToken: LoginResult = { token: 'jwt' }
    expectTypeOf(withToken).toEqualTypeOf<LoginResult>()
    // @ts-expect-error B-2：无 lockUntil 字段 —— 锁定为纯文案 error，降级中性固定文案（不做前端倒计时）
    const withLockUntil: LoginResult = { lockUntil: 1790000000 }
    expectTypeOf(withLockUntil).toEqualTypeOf<LoginResult>()
    // @ts-expect-error Hard Rule：eiam 原生 snake_case 键不得直出（mfa_required → mfaRequired 归一）
    const rawKey: LoginResult = { mfa_required: true }
    expectTypeOf(rawKey).toEqualTypeOf<LoginResult>()
  })

  it('PasskeyRegistrationSession{ticket,expiresAt,used}：15 分钟一次性会话', () => {
    const session: PasskeyRegistrationSession = { ticket: 't', expiresAt: 1790000000, used: false }
    expectTypeOf(session.ticket).toEqualTypeOf<string>()
    expectTypeOf(session.expiresAt).toEqualTypeOf<number>()
    expectTypeOf(session.used).toEqualTypeOf<boolean>()
  })

  it('ConnParams 六字段：password 仅写入不回显，attrMap.username 必填', () => {
    const conn: ConnParams = {
      url: 'ldap://host:389',
      port: 389,
      bindDn: 'cn=admin,dc=example,dc=com',
      password: 'secret',
      baseDn: 'dc=example,dc=com',
      attrMap: { username: 'uid', email: 'mail', dn: 'entryDn' },
      timeoutSec: 5,
    }
    expectTypeOf(conn.password).toEqualTypeOf<string>()
    expectTypeOf(conn.attrMap.username).toEqualTypeOf<string>()
    expectTypeOf(conn.attrMap.email).toEqualTypeOf<string | undefined>()
    expectTypeOf(conn.attrMap.dn).toEqualTypeOf<string | undefined>()
    const noUsernameAttr: ConnParams = {
      url: 'ldap://host:389',
      port: 389,
      bindDn: 'cn=admin,dc=example,dc=com',
      password: 'secret',
      baseDn: 'dc=example,dc=com',
      // @ts-expect-error attrMap.username 必填（用户名属性必填约束）
      attrMap: { email: 'mail' },
      timeoutSec: 5,
    }
    expectTypeOf(noUsernameAttr).toEqualTypeOf<ConnParams>()
  })
})

describe('领域模型（AC-1 / AC-5）', () => {
  it('User：status 词表 active|disable|unknown（G-9：锁定不进列表状态列）', () => {
    const user: User = {
      id: 1,
      username: 'op',
      displayName: '运维员',
      tenantId: 4,
      roles: [{ id: 1, code: 'ops', name: '运维' }],
      status: 'disable',
      loginMethod: 'ldap',
      passkeyRegistered: false,
    }
    expectTypeOf(user.status).toEqualTypeOf<'active' | 'disable' | 'unknown'>()
    expectTypeOf(user.loginMethod).toEqualTypeOf<'password' | 'ldap' | 'passkey'>()
    expectTypeOf(user.roles).toEqualTypeOf<RoleRef[]>()
    expectTypeOf(user.orgRef).toEqualTypeOf<Ref | undefined>()
    expectTypeOf(user.mustChangePassword).toEqualTypeOf<boolean | undefined>()
    // @ts-expect-error G-9：锁定为登录期临时态（redis 失败计数，不上 user 模型/VO），状态词表不含 'locked'
    const locked: User['status'] = 'locked'
    expectTypeOf(locked).toEqualTypeOf<'active' | 'disable' | 'unknown'>()
  })

  it('Tenant{id,name,code,domain}（eiam 实盘 EiamTenant 形）', () => {
    const tenant: Tenant = { id: 1, name: '平台空间', code: 'platform', domain: 'example.com' }
    expectTypeOf(tenant).toEqualTypeOf<Tenant>()
  })

  it('Organization{id,name,parentId?}（Phase 0 D-1：承载端点域 = /api/department/*）', () => {
    const root: Organization = { id: 1, name: '总部' }
    const child: Organization = { id: 2, name: '华东', parentId: 1 }
    expectTypeOf(root).toEqualTypeOf<Organization>()
    expectTypeOf(child.parentId).toEqualTypeOf<number | undefined>()
  })

  it('IdentitySource：type 词表当前仅 ldap，conn 为 ConnParams 嵌套', () => {
    const source: IdentitySource = {
      id: 1,
      name: '主 LDAP',
      type: 'ldap',
      enabled: true,
      conn: {
        url: 'ldaps://host:636',
        port: 636,
        bindDn: 'cn=admin,dc=example,dc=com',
        password: 'secret',
        baseDn: 'dc=example,dc=com',
        attrMap: { username: 'uid' },
        timeoutSec: 5,
      },
    }
    expectTypeOf(source.type).toEqualTypeOf<'ldap'>()
    expectTypeOf(source.conn.baseDn).toEqualTypeOf<string>()
    expectTypeOf(source.enabled).toEqualTypeOf<boolean>()
  })

  it('Role：eiam 实盘字段 desc（非 description），分配以 code 为准', () => {
    const role: Role = {
      id: 1,
      code: 'ops',
      name: '运维',
      desc: '运维角色',
      tenantId: 4,
      policies: [{ id: 1, name: '只读策略' }],
      users: [{ id: 2, name: 'op' }],
    }
    expectTypeOf(role.desc).toEqualTypeOf<string>()
    expectTypeOf(role.code).toEqualTypeOf<string>()
    const withDescription: Role = {
      id: 1,
      code: 'ops',
      name: '运维',
      desc: '运维角色',
      tenantId: 4,
      policies: [],
      users: [],
      // @ts-expect-error eiam 角色字段是 desc 不是 description（A 档实盘核验），不得引入 description
      description: '运维角色',
    }
    expectTypeOf(withDescription).toEqualTypeOf<Role>()
  })

  it('Authorization 三元组（D-4/G-6：eiam 原生为二元绑定，规范形随 5.2 语义映射修订）', () => {
    const authorization: Authorization = { subject: 'user:1', resource: 'cert:prod-*', action: 'get' }
    expectTypeOf(authorization).toEqualTypeOf<Authorization>()
  })
})

describe('Policy Statement 数组形（AC-4）', () => {
  it('PolicyCondition：{key,operator,values[]} 数组（operator 词表待 5.3 联调回填）', () => {
    const entry: PolicyCondition[number] = { key: 'aws:PrincipalOrgID', operator: 'StringEquals', values: ['o-1'] }
    const condition: PolicyCondition = [entry]
    expectTypeOf(entry.key).toEqualTypeOf<string>()
    expectTypeOf(entry.operator).toEqualTypeOf<string>()
    expectTypeOf(entry.values).toEqualTypeOf<string[]>()
    expectTypeOf(condition).toEqualTypeOf<PolicyCondition>()
  })

  it('PolicyStatement：effect Allow|Deny、actions/resources 必填数组、condition 可选', () => {
    const statement: PolicyStatement = { effect: 'Allow', actions: ['cam:cert:Get'], resources: ['cert/*'] }
    const withCondition: PolicyStatement = {
      effect: 'Deny',
      actions: ['cam:cert:Delete'],
      resources: ['cert/prod-*'],
      condition: [{ key: 'aws:PrincipalOrgID', operator: 'StringEquals', values: ['o-1'] }],
    }
    expectTypeOf(statement.effect).toEqualTypeOf<'Allow' | 'Deny'>()
    expectTypeOf(statement.actions).toEqualTypeOf<string[]>()
    expectTypeOf(statement.resources).toEqualTypeOf<string[]>()
    expectTypeOf(withCondition.condition).toEqualTypeOf<PolicyCondition | undefined>()
    // @ts-expect-error Effect 词表首字母大写对齐 UF-10（'allow' 不合法）
    const lowercaseEffect: PolicyStatement['effect'] = 'allow'
    expectTypeOf(lowercaseEffect).toEqualTypeOf<'Allow' | 'Deny'>()
    // @ts-expect-error actions 必填（不允许无动作声明）
    const missingActions: PolicyStatement = { effect: 'Deny', resources: ['cert/*'] }
    expectTypeOf(missingActions).toEqualTypeOf<PolicyStatement>()
    // @ts-expect-error resources 必填
    const missingResources: PolicyStatement = { effect: 'Deny', actions: ['cam:cert:Delete'] }
    expectTypeOf(missingResources).toEqualTypeOf<PolicyStatement>()
  })

  it('Policy：statements 为 PolicyStatement[]（Phase 0 D-5：eiam 原生即 Statement 数组）', () => {
    const policy: Policy = {
      id: 1,
      name: '证书只读',
      statements: [
        { effect: 'Allow', actions: ['cam:cert:List', 'cam:cert:Get'], resources: ['cert/*'] },
        { effect: 'Deny', actions: ['cam:cert:Delete'], resources: ['cert/prod-*'] },
      ],
    }
    expectTypeOf(policy.statements).toEqualTypeOf<PolicyStatement[]>()
    const nonArrayStatements: Policy = {
      id: 1,
      name: 'p',
      // @ts-expect-error 策略内容必须是 Statement 数组（同一策略可同时含 Allow 与 Deny 声明）
      statements: { effect: 'Allow', actions: ['a'], resources: ['r'] },
    }
    expectTypeOf(nonArrayStatements).toEqualTypeOf<Policy>()
  })
})
