---
created: "2026-09-24"
version: "1.0.0"
related: docs/features/haven-opsagent/design/api-handbook.md
---

# Haven 底座接口契约（冻结版）

> 本文档为 opsagent（编排层）所消费的底座契约的**冻结定稿**，顶替 [api-handbook.md](../docs/features/haven-opsagent/design/api-handbook.md) Part B 中的 `{M1 冻结}` 占位。
> 冻结来源：e-cam-service / eiam 源码逐字盘点（`D:\Haven\e-cam-service`、`D:\Haven\eiam`）+ **测试环境实测响应**捕获的 golden 快照（`testdata/contracts/B1..B4/*.json`）。

| 项 | 值 |
|------|------|
| 文档版本 | **1.0.0**（M1 冻结） |
| 冻结日期 | 2026-09-24 |
| 采集环境 | 测试环境：e-cam-service `localhost:8001`、eiam `localhost:9000`（会话经 eiam 签发，租户上下文 tenant 2 / tenant 3）、MCP stdio 直连 `config/prod.yaml` 所指 MongoDB |
| 采集方式 | HTTP curl 实测（B1/B3/B4）+ MCP JSON-RPC over stdio 实测（B2）；快照为逐字节响应原文，未手写编造 |
| 消费方 | opsagent `internal/baseclient`（B1/B2/B4）、auth 中间件（B3） |

## 变更规则（Hard Rules，冻结后生效）

1. **新增字段可选**：底座向响应中新增字段不构成破坏性变更；opsagent 侧反序列化必须容忍未知字段（`encoding/json` 默认行为即满足）。
2. **破坏性变更须新增方法保留旧方法**：删除/改名/改类型既有字段、改既有路径语义，均须以**新增端点（或新增 MCP 工具）**方式交付并保留旧端点一个过渡期，同时**递增本契约版本号**并更新 golden 快照。
3. **版本断言**：每组契约带独立版本号（下表）；契约测试按版本号选择 golden 快照做字段级 diff（`encoding/json` 反序列化后逐字段比对，结构漂移即失败，纯标准库）。

| 契约 | 版本 | 语义 | 快照目录 |
|------|------|------|---------|
| B1 logquery | **1.0.0** | 多云日志联邦查询 + diagnose 风险分 | `testdata/contracts/B1/` |
| B2 MCP 资产 | **1.0.0** | MCP Tools 资产查询 | `testdata/contracts/B2/` |
| B3 eiam 鉴权 | **1.0.0** | 会话签发 / 令牌校验 / 租户上下文 | `testdata/contracts/B3/` |
| B4 通知发送 | **1.0.0** | 渠道通知发送（复用方式已择一冻结） | `testdata/contracts/B4/` |

## Golden 快照清单（实测捕获）

| 文件 | 采集点 | 采集条件 |
|------|--------|---------|
| `B1/types.json` | `GET /api/v1/cam/logs/types` | tenant 2 会话，实测字段字典（含 cdn/waf/slb 全字段与 `max_window_days`） |
| `B1/search.t2.empty.json` | `POST /api/v1/cam/logs/search` | tenant 2（无云账号），近 1h 窗口，limit=10 |
| `B1/search.t3.empty.json` | `POST /api/v1/cam/logs/search` | tenant 3（有资产但日志投递未开启），近 30min 窗口 |
| `B1/sources.t2.empty.json` / `B1/sources.t3.empty.json` | `GET /api/v1/cam/logs/sources?log_type=cdn` | tenant 2 / tenant 3 |
| `B1/diagnose.empty.json` | `POST /api/v1/cam/logs/diagnose` | tenant 2，waf，近 1h；实测 `risk_score=0 / risk_level=none / degraded=true` 降级路径 |
| `B2/tools-list.json` | MCP `tools/list` | 实测 10 个工具全量（含入参 schema） |
| `B2/call-*.json` | MCP `tools/call` | tenant 2（空结果形状） |
| `B2/call-*.t3.json` | MCP `tools/call` | tenant 3（含真实资产记录：`list_instances` / `list_accounts` / `get_asset_statistics`） |
| `B3/login.success.json` | `POST /api/user/system/login` | 实测登录响应（user / tenants / must_select_tenant 等字段） |
| `B3/session-claims.json` | 实签 JWT 载荷解码 | 实测 claims：`Uid / SSID / Data{tenant_id,username,is_admin} / Expiration` |
| `B3/tenant-switch.success.json` | `POST /api/tenant/switch` | 实测租户切换响应 |
| `B3/verify.invalid-token.json` | e-cam-service 携无效令牌访问 | 实测 401 错误信封 |
| `B4/channels.list.json` / `B4/events.list.json` | `GET /api/v1/cam/alert/channels`、`GET /api/v1/cam/alert/events` | tenant 2，实测告警模块信封（`msg:"success"` 变体） |

CI 契约测试策略：优先对 live 测试环境重放断言；服务不可用时回退 golden 快照（该用例标记 skipped 并推送告警）——与 tech-design › Testing Strategy 一致。

---

## 契约 B1：logquery 日志查询 + diagnose 风险分（v1.0.0）

**Method/Path 前缀**：`/api/v1/cam/logs`（e-cam-service，组级 `middleware.RequireTenant`）
**Auth**：eiam 会话令牌（Cookie `ecmdb-token-key` 或 Authorization 头，见 B3）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/v1/cam/logs/types` | 字段字典（含运行时探测的 `aggregatable` 白名单） |
| GET | `/api/v1/cam/logs/sources?log_type={cdn\|waf\|slb}[&clouds=aliyun,aws]` | 日志源清单（`log_type` 必填，缺失 400） |
| POST | `/api/v1/cam/logs/search` | 联邦明细查询 |
| POST | `/api/v1/cam/logs/aggregate` | 窗口聚合 |
| POST | `/api/v1/cam/logs/diagnose` | WAF 流量诊断（风险分；仅 `log_type=waf`） |
| POST | `/api/v1/cam/logs/cache-analyze` | CDN 缓存分析（feature flag 默认关，opsagent P1 不消费） |

### 请求结构（POST /search）

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| log_type | string | 是 | `cdn` \| `waf` \| `slb`（违者 400） |
| start_time | int64 | 是 | Unix 毫秒 UTC |
| end_time | int64 | 是 | Unix 毫秒 UTC；`end_time <= start_time` → 400 |
| query | string | 否 | 关键字查询 |
| clouds | []string | 否 | 云提供商过滤 |
| account_ids | []int64 | 否 | 云账号过滤 |
| resources | []string | 否 | 资源过滤 |
| filters | []FieldFilter | 否 | 结构化筛选（AND 叠加）；`{field,op,value}`，op ∈ `eq\|neq\|contains\|prefix`（空=eq），非法 → 400 |
| limit | int | 否 | 每源条数，默认 100，硬顶 **2000**（联邦归并硬顶 3000） |

`/aggregate` 同上并追加 `dimension`（/types 字段 key）、`metric`（`count|sum_bytes|avg_latency|p99_latency|nonhit_count|nonhit_bytes`，空=count）；`/diagnose` 同 search 且无 limit（维度集固定）。

### 响应结构（信封 + data）

成功信封（实测）：`{"code":0,"msg":"ok","data":{...}}`

**/search 的 data**：

| Field | Type | Description |
|-------|------|-------------|
| log_type | string | 回显 |
| total | int | 联邦总条数；**空结果 → `total=0`，不报错**（opsagent 据此明示「无匹配日志」） |
| truncated | bool | 任一源触顶或**联邦超时**时为 true |
| entries | []object | 时间倒序；**多态**：按 log_type 为 `CDNLogEntry` / `WAFLogEntry` / `SLBLogEntry` 之一（字段见 `testdata/contracts/B1/types.json` 与源码 `internal/shared/cloudx/logquery/types.go`；固定字段 `meta{cloud,account_id,account_name,region,resource_id,source}` + `timestamp`） |
| sources | []SourceOutcome \| null | per-source 状态 `{cloud,account_id,account_name,count,error,duration_ms}`；失败不静默（error 非空）。**实测注记：无源/nil 时该键值为 `null`（非 `[]`）**——契约测试按实测快照断言 |
| cached / cache_stale | bool | SWR 结果缓存标注（60s 新鲜窗 / 10min 宽限窗） |

**/diagnose 的 data**（实测快照 `B1/diagnose.empty.json`）：`log_type, window_sec, total, buckets[], top_ips[], top_uas[], top_uris[], status_codes[], actions[], prev{total,top_ip_count}, prev_error?, result, sources, dimension_notes?, aggregate_frames, summary, cached, cache_stale`。

`result`（风险分，冻结值域）：

| Field | Type | Description |
|-------|------|-------------|
| risk_score | int | **0–100** |
| risk_level | string | `none` \| `low` \| `medium` \| `high`（临界 20/40/70） |
| attack_type | string | `normal` \| `cc_flood` \| `crawler` \| `brute_force` \| `normal_burst` |
| measures | []string | 措施文案（≥3 条） |
| top_sources | []{ip,count,share} | Top 攻击源（默认前 5） |
| degraded | bool | 判据缺失降级标注（实测：前窗无数据 → `degraded=true`） |
| degraded_reason | string? | 降级原因（未降级时缺键） |
| surge_multiplier | float64 | 突增倍数 |

> 与编排层映射：`risk_score/risk_level` 即 tech-design `LogQueryResult.RiskScore` 的实测来源（int 0–100，非 *float64）；opsagent 侧裁剪 `LogEntry` 最小稳定子集（timestamp/cloud/logType/resource/level/message/fields）时按上述多态条目字段提取。

### 错误语义

| 场景 | 响应 |
|------|------|
| 参数/校验/类型不支持/flag 关闭 | HTTP **400**，`{"code":400,"msg":"<err.Error()>","data":null}`（无独立错误码枚举，msg 为服务层错误文本） |
| 会话无租户上下文 | HTTP **403**，`{"code":403,"message":"当前会话未选定租户空间"}`（**注记**：该中间件信封键为 `message`，与模块 `msg` 不一致——按实测冻结，契约测试同时断言两种键位） |
| 令牌无效/过期 | HTTP **401**（见 B3） |
| 单源失败/超时 | **不报错**，记入 `sources[].error` |
| 空结果 | 200 + `total=0` |

### 超时/降级行为

- 联邦查询/聚合总超时 **30s**（`FederationTimeout`）；超时**不报错**——返回已完成部分并置 `truncated=true`（search）/由已完成源合成（aggregate）。
- `/types` 的 `aggregatable` 运行时探测硬时限 6s，超时留空。
- 结果缓存：60s 新鲜窗直返（`cached=true`）、10min 宽限窗供旧值（`cache_stale=true`）。
- **opsagent 侧预算**：编排层 baseclient 单次超时 8s（含 1 次重试计入）超时即降级「无数据」证据——底座 30s 上限与编排 8s 预算各自独立生效。

### 租户字段

- 请求体**无** tenant 字段、响应**无** tenant 字段；租户由服务端从 JWT claims（`Data.tenant_id`）解析并注入，**请求自报租户一律不采纳**（与 DF005 一致）。
- 数据隔离：按当前租户内活跃云账号过滤（`tenant_id=0` 会话在组级即被 403 拒绝）。

---

## 契约 B2：资产查询 MCP Tools（v1.0.0）

**传输**：**stdio only**（`mcp-server.exe <config.yaml>`，无 HTTP/SSE、无端口、无传输层鉴权——信任边界为进程可执行权限；opsagent 以子进程方式拉起并经 stdio JSON-RPC 通信）。
**Server 标识**：`{"name":"e-cam-service","version":"1.0.0"}`（实测 `initialize` 响应）。

### 工具清单（实测 10 个；无 `query_ecs`/`query_rds` 等独立工具——资产类型为参数）

| 工具 | 必填入参 | 可选入参 |
|------|---------|---------|
| `list_accounts` | `tenant_id`(number) | `provider`、`status`(active\|disabled\|error) |
| `get_account` | `account_id`(number) | — |
| `test_account_connection` | `account_id`(number) | — |
| `list_instances` | `tenant_id`(number)、`asset_type`(string) | `provider`、`account_id`、`name`（模糊）、`offset`(默认0)、`limit`(默认20，max 100) |
| `get_instance` | `instance_id`(number) | — |
| `search_assets` | `tenant_id`(number)、`keyword`(string) | `asset_types`（逗号分隔）、`provider`、`account_id`、`region`、`limit`(默认20) |
| `get_asset_statistics` | `tenant_id`(number) | `account_id` |
| `sync_assets` | `account_id`(number) | `asset_types`、`regions`（逗号分隔） |
| `list_regions` | `account_id`(number) | — |
| `realtime_list_ecs` | `account_id`(number)、`region`(string) | — |

`asset_type` 值域：`ecs, rds, redis, mongodb, vpc, eip, disk, snapshot, security_group, image, nas, oss, kafka, elasticsearch, vswitch, lb, cdn, waf`。

### 返回结构（实测快照）

结果统一为 `mcp.CallToolResult`：`{"content":[{"type":"text","text":"<pretty JSON>"}]}`，业务 JSON 在 `text` 内：

| 工具 | text JSON 结构（实测字段名） |
|------|------|
| `list_instances` | `{"total", "asset_type", "items":[{id, asset_id, asset_name, model_uid, account_id, provider?, region?, status?, private_ip?, public_ip?}]}` |
| `get_instance` | 扁平对象，**含 `tenant_id`**：`{id, asset_id, asset_name, model_uid, tenant_id, account_id, attributes, create_time, update_time}` |
| `search_assets` | `{"total", "keyword", "items":[…]}`（item 字段同 list_instances） |
| `get_asset_statistics` | `{"tenant_id", "total_count", "by_type":{<type>:<count>}}`（+ `account_id` 仅当传入） |
| `list_accounts` | `{"total", "accounts":[{id, name, provider, environment, status, regions[], asset_count, last_sync_time?, description?}]}` |
| `get_account` | `{id, name, provider, environment, status, regions[], asset_count, description, config{enable_auto_sync, sync_interval_minutes, read_only, enable_cost_monitoring}, create_time, update_time, last_sync_time?, error_message?}` |
| `test_account_connection` | `{status, message, test_time, available_regions?}` |
| `sync_assets` | `{sync_id, status, message, start_time}`（异步，返回任务 ID） |
| `list_regions` | `{account_id, provider, total, regions:[{id, name, local_name}]}` |
| `realtime_list_ecs` | `{account_id, provider, region, total, instances:[{instance_id, instance_name, status, instance_type, region, zone, private_ip, os_type, cpu, memory_mb, public_ip?, vpc_id?}]}` |

实测注记：`provider` 实际取值含 `aliyun`、`volcengine` 等（schema 描述中的 `volcano` 为笔误形态，以实测为准）；`by_type` 静默吞掉单类型查询错误（失败类型不出现于映射）。

### 错误语义 / 超时

- 工具失败：`CallToolResult.isError=true`，`content[0].text` 为 `"错误: <err>"` 文本（Go error 始终为 nil，客户端须检查 `isError`）。
- 缺必填参数：同上 `isError=true`（中文错误文本）。
- **无 per-call 超时**（ctx 无 deadline；实时类工具受云 SDK 行为约束）——**opsagent 必须自行实现 5s 预算**（子进程调用超时即降级「无数据」证据，与编排预算一致）。
- 进程级：Mongo 连接 10s 超时；handler panic 由 `WithRecovery` 恢复为 `isError` 结果。

### 租户字段（冻结口径）

- **入参侧**：`tenant_id` 必填——opsagent 恒传**服务端会话派生**的租户 ID（DF005），绝不透传用户输入。
- **返回侧（冻结缺口注记）**：`get_instance` 与 `get_asset_statistics` 顶层含 `tenant_id`；`list_instances` / `search_assets` / `list_accounts` 条目**当前不含 tenant 字段**。P1 约定：list/search 条目的租户正确性由「入参 tenant_id 隔离」保证（服务端按 TenantID 过滤）；若后续需要 per-record tenant 用于引用校验，按变更规则 1 以**新增可选字段**交付（opsagent 侧已预留 `AssetRecord.tenant` 映射）。

### 已知缺陷（冻结时实测记录，须底座修复后方可联调）

`internal/mcp/server.go` 的 `ServeStdio` 以 `Listen(ctx, nil, nil)` 调用 mcp-go——**stdin 传 nil**，任何客户端首条消息即触发 nil panic（仓库内 `mcp-server.exe` 现状即此）。本契约快照经由源码级修复（`os.Stdin/os.Stdout`）的临时运行器实测捕获，工具实现与数据链路未改动。该修复属底座侧一行变更，纳入联调前置项。

---

## 契约 B3：eiam 鉴权（v1.0.0）

**机制（Open Question 收口）**：**非 OIDC introspection、非 HTTP 验证端点**——冻结为「共享密钥 JWT + 共享 Redis 会话」本地校验：eiam 与消费方（e-cam-service / opsagent）共用 `session_encrypted_key`（HMAC）与 Redis db 1 会话库，经 `github.com/ecodeclub/ginx/session` 同构校验。任一侧变更 ginx 版本 / 密钥 / Redis db 均会造成静默鉴权断裂（配置一致性为契约的一部分）。

### 端点（签发侧，eiam）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/user/system/login` | 本地账号登录，`{username, password}` |
| POST | `/api/user/ldap/login` | LDAP 登录，`{username, password}` |
| GET | `/api/user/profile`、POST `/api/user/logout` | 会话态操作 |
| POST | `/api/tenant/switch` | 租户切换 `{tenant_id}`，重签 JWT（旧会话销毁） |

**令牌投递**：Cookie `ecmdb-token-key`（域名按配置）+ `Authorization` 头双载体（`mixin.NewTokenCarrier`）；TTL 30 天。

### 登录响应（实测 `B3/login.success.json`）

`{"code":0,"msg":"登录成功，欢迎回来：<username>","data":{user{...}, tenants[], current_tenant_id, must_select_tenant, must_bind, mfa_required, is_admin, permissions}}`。
登录失败（实测）：`{"code":4010202,"msg":"认证失败 (账号或密码错误)","data":null}`。

### 令牌载荷（实测 `B3/session-claims.json`，冻结字段）

| Claim | 类型 | 说明 |
|-------|------|------|
| Uid | int64 | 用户 ID → `Identity.userId` |
| SSID | string(uuid) | 会话 ID |
| Data.tenant_id | **string**（十进制） | 租户 ID；`"0"`=未选定租户的临时凭据 → 消费方 403 |
| Data.username | string | 用户名 |
| Data.is_admin | string `"true"` / 缺省 | 管理员标记（**字符串非布尔**） |
| Data.authorized_codes | string(JSON 数组) / 缺省 | 授权码（仅 `cert:*` 前缀，受 4KB Cookie 限制） |
| Expiration | int64 | 过期时间（**Unix 毫秒**） |

### 校验语义（消费侧，opsagent auth 中间件同构实现）

- 本地 HMAC 验签 + 过期校验 + Redis 会话存在性；任一失败 → HTTP **401** `{"code":401,"message":"认证失败：会话无效或已过期"}`（实测 `B3/verify.invalid-token.json`）。
- 令牌有效但 `tenant_id=0`（未选租户）→ HTTP **403** `{"code":403,"message":"当前会话未选定租户空间"}`（401 与 403 语义分界：401=凭据无效，403=凭据有效但租户上下文缺失）。
- 无刷新令牌流程；过期即重新登录。

### 租户谓词语义

- 所有数据访问强制注入 `tenant_id`（claims → int64 → 请求上下文）；`X-Tenant-ID` 头与 `tenant_id` 查询参数**已废弃不采纳**。
- opsagent 映射：`verifyToken(token) → Identity{userId: Uid, tenant: Data.tenant_id, roles: is_admin/authorized_codes 派生}`（tech-design Shared Types 同形；roles 当前仅「管理员」粒度， finer-grained RBAC 由 eiam CheckPolicy API 承担，当前 `policy.enabled=false`，P1 不依赖）。
- 附：eiam 另暴露 gRPC `eiam.tenant.v1.TenantService/Verify`（AK/SK→tenant_id，仅 ecmdb 消费）——与本契约无关，opsagent 不使用。

---

## 契约 B4：通知渠道发送（v1.0.0）

### 复用方式（Open Question 收口，择一冻结）

**冻结决策：opsagent 直连渠道 webhook，不经 alert 模块转发。**

依据（实测盘点）：

1. alert 模块**不存在可承载任意通知载荷的 HTTP 发送端点**——仅有渠道 CRUD（`/api/v1/cam/alert/channels`）与 `POST /api/v1/cam/alert/channels/:id/test`（发送固定测试文案）；`POST /alert/events` 不存在（事件仅内部 `EmitEvent` 产生）。
2. alert 的发送能力（`channel.Sender` / `channel.Dispatcher.Dispatch` / `AlertService.EmitEvent`）均为**进程内 Go 接口**，跨服务不可调用。
3. 复用要求底座新增 HTTP facade（修改 e-cam-service），超出 P1「只调用不改写」边界；直连方案下 opsagent 与底座仅共享**消息形状语义**，无运行时耦合。
4. tech-design 依赖表已将「通知渠道」列为 opsagent 外部依赖（重试 → 计入失败率），与直连方案自洽。

副作用说明：alert 模块的告警推送（含规则匹配/去重/30s 轮询重试）继续走其自有链路；opsagent 的**诊断入口通知**（风险中心条目落库后发送）由 opsagent 自实现发送器。若未来底座提供通知 HTTP facade，按变更规则以新增端点冻结升级（B4 版本 +1）。

### 渠道与载荷（与 alert `channel.Message` 语义同构：title / content / severity / markdown）

| 渠道 | 载荷要点 |
|------|---------|
| dingtalk | POST bot webhook（`config.webhook`，可选 `secret` HMAC-SHA256 签名 `&timestamp=&sign=`）；`msgtype: markdown`（`{title, text}`）或 text（`"[severity] title\ncontent"`） |
| wecom | POST bot webhook；`msgtype: markdown`（`"## title\ncontent"`）或 text；无签名 |
| feishu | POST bot webhook；`msg_type: interactive` 卡片（header 按 severity 着色 critical→red / warning→orange / 其他→blue）；可选 `timestamp`+`sign`（HMAC-SHA256） |
| email | SMTP（`net/smtp`，PlainAuth）；主题 `"[$severity] $title"`；markdown→`text/html` 否则 `text/plain` |

内容约束（Hard）：只携带**告警摘要 + 诊断入口链接**（tech-design `Notification{tenant, channel, title, summary, diagLinkUrl}`）——不携带跨租户明细数据。

### 发送结果 NotifyResult（SC-2 成功率埋点；与 tech-design Shared Types 同形）

```json
{ "channel": "dingtalk", "ok": true, "attempts": 1, "lastError": "", "sentAt": "2026-09-24T10:00:00Z" }
```

- `attempts` 含重试，**上限 3**；每次发送 HTTP 客户端超时 **10s**（与底座 sender 实测语义一致）；失败重试计入失败率，不影响落库（`risk_entries.notified` 记账）。
- 渠道 webhook/secret/smtp 配置来源：opsagent settings `notifyChannels`（api-handbook §8），密钥不入码不入 golden。

### 错误语义 / 超时

- 非 200 → 发送失败（重试计数）；全部重试耗尽 → `ok=false, lastError=<末次错误>`，通知失败**不阻断**诊断落库与响应。
- B4 与 Part A §9 的方向相反：§9 是 alert→opsagent 的**告警入站** webhook（`X-Opsagent-Webhook-Key` 服务间密钥）；B4 是 opsagent→渠道的**出站**发送。二者独立。
- 附注（可选入站通道，不冻结为 P1 依赖）：底座证书告警存在既有出站 webhook 推送（`CertWebhookPayload`，opsagent 可注册 URL 承接），P1 不消费。

### 快照说明

`B4/channels.list.json` / `B4/events.list.json` 为 alert 模块信封实测（**注记**：该模块信封 `msg` 值为 `"success"` 且空列表键值为 `null`，与 logquery 的 `"ok"`/归一 `[]` 不一致——契约测试按实测断言，opsagent 解析信封时兼容两种形态）。发送器载荷形状以上表 + 底座源码为冻结依据（渠道 webhook 属外部 SaaS API，无 golden 可录）。

---

## Open Questions 收口对照（tech-design › Open Questions）

| Open Question | 收口结论 | 落点 |
|---------------|---------|------|
| eiam 验证端点与 token 载荷（OIDC introspection vs 内部接口） | **共享密钥 JWT + 共享 Redis 会话本地校验**（无 introspection）；claims 字段见 B3 | 契约 B3 |
| 底座各模块精确 HTTP 路由路径与响应字段名 | B1 六端点 + B2 十工具 + B3 三端点逐一冻结，字段名以源码+实测为准 | 契约 B1/B2/B3 |
| 通知渠道复用方式 | **opsagent 直连渠道 webhook**（不走 alert 通知接口） | 契约 B4 |
