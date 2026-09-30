/**
 * 身份治理域类型：用户 / 租户 / 组织（tech-design §Data Models + Phase 0 parity 回填）。
 */
import type { Ref, RoleRef } from "./common";

/**
 * 用户（UF-4 用户管理页主模型）。
 */
export interface User {
  id: number;
  username: string;
  displayName: string;
  /** 所属租户 id（eiam 禁止用户-租户 M:N，单租户归属 —— parity §2.1 A 档实核） */
  tenantId: number;
  /** 已绑角色引用（分配以 code 为准，见 RoleRef）；role/list 不直出时由 api 层经 role/list/attached/user 回填 */
  roles: RoleRef[];
  /**
   * eiam 原值为 'active' | 'disable'（ParseStatus 未知串归一 'unknown'）；写错会静默降级、启停操作失效。
   * Phase 0 锁定态核查结论（parity G-9）：锁定为登录期 redis 失败计数（lockoutKey + 24h TTL，
   * cache/user.go:68-89），不上 user 模型/VO、无查询端点 —— 状态词表收敛为 active|disable|unknown，
   * **不引入 'locked' 值**；列表状态列不展示锁定，锁定提示由登录页错误文案承接（B-2 中性固定文案口径）。
   */
  status: "active" | "disable" | "unknown";
  loginMethod: "password" | "ldap" | "passkey";
  /**
   * passkey 注册态显式字段。Phase 0 结论（parity G-2/G-3、§6.3.3）：eiam user 模型/VO 无直出字段，
   * 绑定态查询承接 = GET /api/iam/user/identity/list（L1 #24）—— api 层据其映射回填；
   * 管理员代发起注册/撤销（G-2/G-3）转 eiam 排期，v1 仅展示绑定态。
   */
  passkeyRegistered: boolean;
  /**
   * 首登强制改密标记（E1）。Phase 0 结论（parity G-8）：eiam 全链路无承载
   * （grep must_change|MustChange|force_password 0 命中），v1 不做首登强制改密拦截 ——
   * 字段保留为可选占位，待 eiam 排期补齐（建议与 G-1 重置密码一并）后由 api 层回填。
   */
  mustChangePassword?: boolean;
  /**
   * 所属组织引用（eval 残留 #2 承接，Phase 0 已核验回填）：eiam 用户域**无组织 ref 数据源**
   * （parity §6.3：租户 ref 已覆盖（C-16~C-18）、组织无）—— 组织承载为 department（D-1，见 Organization），
   * 用户表单 v1 不并入组织选择。字段保留为可选占位，待 eiam 补组织 ref 后由 api 层回填；
   * 该项由「待核验假设」改判为「无数据源（G 类缺口）」。
   */
  orgRef?: Ref;
}

/**
 * 租户（UF-6；eiam 实盘形状 = user-mapper EiamTenant：id/name/code/domain）。
 * UF-6 禁用前置「未过期会话数 = 0」Phase 0 结论（parity G-4）：eiam 无任何会话计数端点 →
 * tech-design Data Models 预置降级生效：禁用直接提交，被拒时展示 eiam 拒绝消息
 * （是否携带活跃会话数随证据-P 核验）；前端不做自算前置校验。
 */
export interface Tenant {
  id: number;
  name: string;
  code: string;
  domain: string;
}

/**
 * 组织（UF-5）。Phase 0 改判（parity 分歧 D-1，tech-design「eiam 可能为 department」已结）：
 * eiam **无 organization 端点族** —— 组织能力由 **department（部门）** 承载，端点域标注：
 * `GET /api/department/list`（树形）+ create/update/delete/:id/detail/:id + assign/remove/members
 * （eiam/internal/web/department/handler.go:26-51）。
 * eiam DepartmentVO 实盘为 `{id, parent_id, name, sort, leaders, main_leader, ...}` —— 规范形仅取
 * 设计三字段（parent_id → parentId 归一）；eiam 附加字段（sort/leaders/main_leader）不进 v1 规范形，
 * UF-5 页面需要时在 api 映射层扩展。≤1000 节点/深度 ≤8 限制无 eiam 侧校验证据（前端拦截待登记）。
 */
export interface Organization {
  id: number;
  name: string;
  /** 父节点 id（eiam 原值 parent_id）；根节点缺省 */
  parentId?: number;
}

/**
 * 组织树节点（UF-5）。Organization + 子节点数组（递归）。
 * eiam DepartmentNode = Department + {children?: DepartmentNode[]}（vo.go:48-51）；
 * 规范形仅取 id/name/parentId/children，附加字段不进 v1。
 */
export interface OrganizationNode extends Organization {
  children: OrganizationNode[];
}
