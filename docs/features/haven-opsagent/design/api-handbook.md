---
created: "2026-09-23"
related: design/tech-design.md
---

# API Handbook: Haven 运维 Agent（编排层）

## API Overview

编排层 HTTP API 分两部分：

- **A. opsagent 自身对前端暴露的 API**（`/api/v1/opsagent/*`）——承载对话排障、风险中心、诊断详情、历史回溯、系统配置、Agent 观测 6 组功能。
- **B. 底座接口契约**（`/api/v1/cam/*` 及其它）——opsagent **消费**的 e-cam-service / eiam 能力，为 P1 显式交付物「契约文档 + 契约测试」的冻结对象。

统一约定：

- **鉴权**：所有端点在 eiam 会话/令牌下访问；`tenant` 一律由服务端从会话派生，请求体中的 `tenant` 字段丢弃（DF005）。
- **响应信封**：`{ "code": 0, "message": "ok", "data": {...} }`；`code != 0` 为错误（沿用 Haven 既有 API 约定，冻结时对齐）。
- **租户安全**：跨租户访问一律返回 404（不泄露资源存在性）；LLM 输出引用经服务端校验，越界丢弃。

---

## Part A — opsagent 自身 API

### 1. 发起对话排障

**Method**: `POST`
**Path**: `/api/v1/opsagent/chat`
**Auth**: 登录用户

发起一次自然语言排障（创建会话 + 首轮提问并同步编排；预算超时转异步回退，见下方 202 响应）。

#### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| message | string | 是 | 自然语言提问（含服务名 + 时间窗 + 现象） |
| requestId | string | 否 | 幂等键 |

#### Response (200) — `data`

| Field | Type | Description |
|-------|------|-------------|
| sessionId | string | 会话 ID |
| diagnosis \| null | object | 诊断报告（见数据契约 Diagnosis）；`type=clarify` 时为 null（未进入编排） |
| report | string | 面向用户的报告正文（降级/截断时含显式提示）；`type=clarify` 时为追问话术 |
| type | string | `report`（正常/L1）\| `preset_entries`（L2）\| `guided`（超能力引导）\| `clarify`（置信度低，追问澄清）\| `degraded_notice`（L3 明示降级） |
| needsClarify | bool | true 表示置信度低于阈值，前端展示追问 + 候选意图（用户可点击纠正，无需重新完整提问） |
| candidates | []IntentCandidate | 仅 `type=clarify` 时返回（备选意图，供一键纠正） |
| degradeLevel | int | 0 正常 / 1 模板意图匹配 / 2 预置查询入口 / 3 明示降级（见 tech-design 三级降级设计） |
| presets | []PresetQuery | 仅 `type=preset_entries` 时返回（L2 预置查询目录） |

#### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | ERR_PARAM_INVALID | 请求体非法（message 为空/超长）；意图无法解析不返回 400，一律走 200 降级 |
| 401 | ERR_TENANT_DENIED | 未登录 |
| 200 | — | 三级降级（L1 模板/L2 预置入口/L3 明示降级）/ 澄清追问（type=clarify）/ 超能力引导（以 degradeLevel/type 字段区分） |
| 202 | — | **异步回退**（非错误）：同步编排超出延迟预算（见 tech-design › 同步编排延迟预算）时，编排转入后台继续，立即返回 `data: { sessionId, status: "running" }`；前端每 2s 轮询 `GET /history?sessionId=` 直至 `status=done` 后按 `diagnosisId` 拉取 §6 详情。服务端 `http.Server` 写超时统一 30s（与编排侧 25s 硬预算对齐），预算超时先于写超时触发，连接不因编排挂起被占满 |

---

### 2. 会话内纠正（一键纠正重路由）

**Method**: `POST`
**Path**: `/api/v1/opsagent/chat/:sessionId/correct`
**Auth**: 登录用户（须为该会话归属租户）

在既有会话内重路由：用户对候选意图一键点击（`targetIntent`+`params`），或以自然语言纠正（`message`）。复用会话上下文，**无需重新完整提问**（PRD Story-2 AC）；误分类 + 纠正记录追加至 `sessions.correction_log`（对应 `IntentClassifier.Correct`）。

#### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| targetIntent | string | 二选一 | 候选意图（diagnose\|resource\|out_of_scope，取自 candidates.type） |
| params | object | 随 targetIntent | DiagnoseParams（取自 candidates.params，前端可改后提交） |
| message | string | 二选一 | 自然语言纠正（如「不对，我要查资产」）；`targetIntent` 与 `message` 必须二选一 |
| requestId | string | 否 | 幂等键 |

#### Response (200) — `data`：与 §1 chat 响应同形（type/needsClarify/diagnosis/degradeLevel 等）

纠正后再次置信度低可再次返回 `type=clarify`（澄清可多轮）。

#### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | ERR_NOT_FOUND | 会话不存在或跨租户 |
| 400 | ERR_PARAM_INVALID | targetIntent 与 message 均缺省，或均提供 |

---

### 3. 风险中心列表

**Method**: `GET`
**Path**: `/api/v1/opsagent/risk-center`
**Auth**: 登录用户

#### Request（Query）

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tenant | string | 否 | 服务端覆盖 |
| startTime | string | 否 | 时间窗起点 RFC3339 |
| endTime | string | 否 | 时间窗终点 |
| serviceName | string | 否 | 服务名模糊匹配 |
| status | string | 否 | pending_view\|viewed\|done |
| severity | string | 否 | P0\|P1\|P2\|P3 |
| page | int | 否 | 页码（默认 1） |
| limit | int | 否 | 每页条数（默认 20，上限 100） |

#### Response (200) — `data`

| Field | Type | Description |
|-------|------|-------------|
| items | []RiskEntry | 条目列表 |
| total | int | 总数 |
| page | int | 当前页 |
| limit | int | 每页条数 |
| stats | object | 聚合统计（供统计卡）：`{ pendingView, todayNew, highRisk }`——待处理数 / 今日新增数 / 高危数，与 items 筛选条件独立（固定按当前租户全量统计） |

---

### 4. 单条标记状态

**Method**: `POST`
**Path**: `/api/v1/opsagent/risk-center/:id/status`
**Auth**: 登录用户

#### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| status | string | 是 | viewed\|done（待查看→已查看自动流转，不主动调） |
| expectedVersion | string | 否 | CAS 乐观锁：取自条目 `version` 字段（risk_entries 文档，创建时为 1，每次更新 +1）。服务端以 `{_id, tenant_id, version: expectedVersion}` 过滤执行 findAndModify，`$inc version`；不传则不做版本校验 |

#### Response (200) — `data`：更新后的 RiskEntry（含自增后的 `version`）

#### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | ERR_NOT_FOUND | 不存在或跨租户 |
| 409 | ERR_CONFLICT | version 不匹配（被他人抢先更新），返回最新 RiskEntry 供刷新 |

---

### 5. 批量标记状态

**Method**: `POST`
**Path**: `/api/v1/opsagent/risk-center/batch-status`
**Auth**: 登录用户

#### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| items | []{id, expectedVersion} | 是 | 条目 ID + 各自当前版本（上限 50，可配）；`expectedVersion` 语义与 §4 单条标记完全一致，取自列表响应 RiskEntry.version |
| status | string | 是 | viewed\|done |

**并发语义**：批量**不做整批事务**——每个条目独立执行与 §4 相同的 `{_id, tenant_id, version: expectedVersion}` findAndModify CAS + `$inc`。这保证 PRD「未经确认不发生覆盖」在批量路径同样成立：任何一条在读取后被他人抢先更新的条目落入 `failed`（reason=conflict），**绝不静默覆盖**。

#### Response (200) — `data`

| Field | Type | Description |
|-------|------|-------------|
| succeeded | []{id, version} | 成功条目 ID + 更新后新版本 |
| failed | []{id, reason, reasonCode, currentVersion?} | 失败条目及原因；`reasonCode`: `conflict`（409 同语义，CAS 不匹配，附 `currentVersion` 供刷新重试）\| `not_found`；前端提供逐条重试入口 |

---

### 6. 诊断详情

**Method**: `GET`
**Path**: `/api/v1/opsagent/diagnosis/:id`
**Auth**: 登录用户

#### Request（Query）

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| riskEntryId | string | 否 | 从风险中心点入时携带关联条目 ID；用于触发「待查看→已查看」自动流转（见下） |

#### Response (200) — `data`：完整 Diagnosis（含 conclusions/disposition/citations/trace）

**自动查看流转（PRD Story-1 AC 的唯一定义触发点）**：当请求携带 `riskEntryId` 且该条目（同租户、关联本诊断）`status=pending_view` 时，服务端在本 GET 内**惰性执行**一次 findAndModify：过滤 `{_id, tenant_id, status: "pending_view"}` → `$set status="viewed"` + `$inc version` + 追加 `status_history`（`from=pending_view, to=viewed, by=当前用户`）。

并发语义：

- 转换是**窄状态迁移**（仅 pending_view 可触发），故不要求客户端传 `expectedVersion`，但服务端仍走 CAS 过滤并正常 `$inc version`（与其他写路径共用同一套版本记账）。
- 幂等：条目已为 viewed/done 时过滤不命中，直接返回详情，无副作用。
- 若另一操作员并发将条目标记为 done，本流转不命中（不回退他人操作）；若本流转先命中，操作员随后的 done 标记照常成功——两路径均为 CAS，不存在静默覆盖。
- 不带 `riskEntryId` 的诊断详情访问（如历史回溯）不触发任何状态变更。

#### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | ERR_NOT_FOUND | 不存在或跨租户（含 riskEntryId 不存在/跨租户/不关联本诊断时，忽略流转并按无参数处理） |

---

### 7. 历史会话检索

**Method**: `GET`
**Path**: `/api/v1/opsagent/history`
**Auth**: 登录用户

#### Request（Query）

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| serviceName | string | 否 | 服务名 |
| startTime / endTime | string | 否 | 时间窗（≤ 24h，可配） |
| sessionId | string | 否 | 精确会话 |
| page / limit | int | 否 | 分页 |

#### Response (200) — `data`：`{ items: []SessionSummary, total, page, limit }`

---

### 8. 系统配置读 / 写

**Method**: `GET` / `PUT`
**Path**: `/api/v1/opsagent/settings`
**Auth**: 登录用户（管理员写）

#### Response (200) — `data`

| Field | Type | Description |
|-------|------|-------------|
| datasources | []Datasource | 数据源连接状态 |
| llmProviders | []LLMProviderConfig | 模型提供商（默认 provider，Key 掩码） |
| notifyChannels | []NotifyChannel | 通知渠道开关 |
| riskWhitelist | []RiskWhitelistEntry | 低危白名单（只读/低危/高危三档） |
| presetQueries | []PresetQuery | L2 降级预置查询目录（label + 预填 DiagnoseParams；`id` 服务端生成） |
| guidedTemplates | object | 引导话术映射（超能力意图类型 → {话术模板, 正确渠道/系统入口}，PRD Flow C）；P1 内置默认随代码/配置固化，管理员可改 |

#### PUT Request — `data`（按字段部分更新：仅提供的字段被覆盖，未提供的保持不变）

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| llmProviders | []LLMProviderConfig | 否 | `keyMasked` 不可作写入字段——新 Key 以 `apiKey` 明文字段提交（只写不读，落库前加密），GET 永远只返回掩码 |
| notifyChannels | []NotifyChannel | 否 | 渠道开关 |
| riskWhitelist | []RiskWhitelistEntry | 否 | 整表替换；任一 tool 未命中风险注册表或 riskLevel=high → 400 整体拒绝 |
| presetQueries | []PresetQuery | 否 | 整表替换；校验每条 `params.serviceName` 非空、时间窗 ≤ 24h，非法 → 400 整体拒绝（`id` 由服务端重新生成，客户端传入的 id 忽略） |
| guidedTemplates | object | 否 | 整体替换；键为超能力意图类型，值为 {话术模板, 正确渠道/系统入口}；P1 内置默认随代码/配置固化，管理员可覆盖 |

写入即生效（下次请求读取新值）；L2 降级在预置目录变更后立即可用，无需重启。datasources 为只读探测结果，PUT 携带即忽略。

---

### 9. 告警入站 webhook（供 e-cam-service/alert 推送）

**Method**: `POST`
**Path**: `/api/v1/opsagent/alerts`
**Auth**: 服务间密钥（非用户令牌）——`X-Opsagent-Webhook-Key` 请求头携带。密钥注入与轮换：由部署环境提供（env `OPSAGENT_ALERT_WEBHOOK_KEY` / secret manager，不入库不入码）；支持**双密钥并存滚动轮换**（新密钥灰度期 24h 内新旧同时有效，之后下线旧密钥），轮换仅需重启 alert→opsagent 两侧配置，无需发版。

#### Request — `data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tenant | string | 是 | 租户 |
| serviceName | string | 是 | 服务名 |
| metric | string | 是 | 指标名 |
| level | string | 是 | 级别（参与指纹） |
| window | object | 是 | 时间窗 |
| raw | object | 是 | 告警原文（落 alerts 留档） |

#### Response：202 Accepted — `data: { accepted: bool, dropped: bool }`

入队成功 `accepted=true, dropped=false`；队列满溢出丢弃**低级别**告警时 `accepted=true, dropped=true`（信封 `code=0`，半成功语义，调用方无需重试；高危告警不丢弃）。每条到达的告警均按指纹窗口记账落 `alerts`：窗口内首条建文档（`dedup_conclusion=new`，count=1），后续同指纹到达对同一文档 `$inc count` 并置 `dedup_conclusion=merged`；溢出丢弃的低级别告警亦各写一条（保留 raw_payload，`dedup_conclusion=overflow_dropped`）。

---

### 10. Agent 观测（Agent 管理页数据源）

**Method**: `GET`
**Path**: `/api/v1/opsagent/agents/observability`
**Auth**: 登录用户（运维/管理员）

聚合进程内 Agent 角色指标、告警 worker 队列观测与 LLM 预算用量（对应 page-map `/opsagent/agents` 页四个区块）。

#### Response (200) — `data`

| Field | Type | Description |
|-------|------|-------------|
| agents | []{name, status, tasksTotal, tasksFailed, avgDurationMs} | 4 个逻辑 Agent（coordinator/log_analyst/monitor/inspector）状态与负载 |
| queue | object | `{ depth, capacity(100), inflight, concurrency(5), overflowTotal }` worker 队列观测 |
| llmBudget | object | `{ windowStart, calls, budgetLimit, exceeded }`（`llm_usage` 当前窗口聚合） |
| loadHistory | []{ts, depth, inflight} | 负载时间序列（内存环形缓冲，最近 1h，步长 1min） |

---

## Part B — 底座接口契约（冻结对象，M1 盘点定稿）

> 以下为契约「形状」，**精确路径/字段名在 M1 契约盘点时以实际 e-cam-service 导出为准冻结**，此处约束调用语义。契约测试 fixtures（golden JSON 快照 `testdata/contracts/B1..B4/*.json`）于 M1 冻结时从**测试环境 e-cam-service 实测响应**捕获；CI 优先对 live 测试环境 e-cam-service 重放断言，服务不可用时回退 golden fixtures（标记 skipped 并告警）。

### 契约 B1：logquery 日志查询 + diagnose 风险分

**Method**: `POST` · **Path**: `{M1 冻结}` · **Auth**: 服务间

- 请求：日志类型 × 云 × 账号 × 资源 × 时间范围（`LogQueryRequest`）
- 响应：联邦结果 + `truncated` + diagnose `riskScore`
- 语义：空结果 → `total=0`（编排层明示「无匹配日志」）；超时 → 降级空证据

### 契约 B2：资产查询（MCP Tools）

- 工具清单（MCP）：`query_ecs` / `query_rds` / `query_redis` / …
- 入参 schema 稳定；返回结构**必含 `tenant` 字段**

### 契约 B3：eiam 鉴权

- `verifyToken(token) → { userId, tenant, roles }`
- 租户谓词语义：所有数据访问强制注入 `tenant`

### 契约 B4：通知渠道发送

- 渠道：钉钉 / 飞书 / 企微 / 邮件
- 请求：渠道 + 告警摘要 + 诊断入口链接（**不携带跨租户数据**）
- 响应：发送结果 `NotifyResult`（用于 SC-2 通知成功率埋点）

---

## Data Contracts（共享类型）

> **唯一定义处**：全部共享类型（`DiagnoseParams` / `LogEntry` / `AlertEvent` / `Identity` / `Notification` / `NotifyResult` / `LLMRequest` / `StatusChange` / `TraceStep` / `SessionSummary` / `PresetQuery` / `Datasource` / `LLMProviderConfig` / `NotifyChannel` / `RiskWhitelistEntry` / `Severity` 等）在 [tech-design.md › Shared Types](./tech-design.md) 统一定义，json tag 与本节 DTO 同形，此处不重复。注意：settings 响应中的 LLM 提供商类型名为 `LLMProviderConfig`（避免与编排层 `LLMProvider` 接口重名）。

```go
type Diagnosis struct {
    ID          string           `json:"id"`
    SessionID   string           `json:"sessionId"`
    Tenant      string           `json:"tenant"`
    RootCause   string           `json:"rootCause"`
    Confidence  float64          `json:"confidence"`
    Severity    string           `json:"severity"`    // P0|P1|P2|P3
    RiskLevel   string           `json:"riskLevel"`   // read|low|high
    Conclusions []Conclusion     `json:"conclusions"`
    Disposition []DispositionStep `json:"disposition"`
    Citations   []Citation       `json:"citations"`
    Degraded    bool             `json:"degraded"`
    Truncated   bool             `json:"truncated"`
    Trace       []TraceStep      `json:"trace"`
}

type RiskEntry struct {
    ID           string          `json:"id"`
    Tenant       string          `json:"tenant"`
    Fingerprint  string          `json:"fingerprint"`
    DiagnosisID  string          `json:"diagnosisId"`
    ServiceName  string          `json:"serviceName"`
    Severity     string          `json:"severity"`
    Status       string          `json:"status"`       // pending_view|viewed|done
    Version      int             `json:"version"`      // CAS 乐观锁，创建为 1，每次成功更新 +1；expectedVersion 取自此字段
    StatusHistory []StatusChange `json:"statusHistory"`
    Notified     NotifyResult    `json:"notified"`
    CreatedAt    time.Time       `json:"createdAt"`
}

type Citation struct {
    SourceType string `json:"sourceType"` // log|metric|asset|alert
    SourceKey  string `json:"sourceKey"`
    Snippet    string `json:"snippet"`
}

type Conclusion struct {
    Text     string   `json:"text"`
    Citation []string `json:"citation"` // 引用 Citation.SourceKey 列表；须能回指本 Diagnosis.citations 内的条目，服务端校验失败即丢弃
}

type DispositionStep struct {
    Step     string `json:"step"`     // 处置步骤
    Risk     string `json:"risk"`     // read|low|high
    Action   string `json:"action"`   // 建议动作
    Executed bool   `json:"executed"` // P1 恒 false
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| ERR_PARAM_INVALID | 400 | 请求体非法（必填缺失/超长/互斥字段同现）；仅入参校验使用，语义降级（意图不明等）一律 200 |
| ERR_INTENT_UNKNOWN | 200（降级） | 意图无法识别，走三级降级（L2/L3）——**非错误**，与技术设计一致，不映射 400 |
| ERR_OUT_OF_SCOPE | 200（引导） | 超能力意图，返回引导式回应 |
| ERR_LLM_UNAVAILABLE | 200（降级） | LLM 不可用，按三级降级响应（degradeLevel 1~3） |
| ERR_BASE_TIMEOUT | 200（降级） | 底座超时，该步降级「无数据」证据 |
| ERR_CONTRACT_DRIFT | 200（降级 + 运行时告警） | 底座响应与契约不符：该步降级「无数据（契约异常）」，响应 `degraded=true, drift=true`；递增 `opsagent_contract_drift_total` 指标并推送运维告警（与 CI 契约测试独立）。**不向用户返回裸 500** |
| ERR_TENANT_DENIED | 401 | 仅鉴权失败（未登录/令牌无效）；**跨租户一律 ERR_NOT_FOUND 404** |
| ERR_NOT_FOUND | 404 | 资源不存在或跨租户（跨租户不泄露存在性） |
| ERR_CONFLICT | 409 | CAS version 不匹配（并发更新冲突），返回最新条目 |
| ERR_QUEUE_FULL | 202（code=0） | 队列溢出半成功：`data.dropped=true` 标记低级别丢弃，调用方无需重试 |
| ERR_PERSIST_FAILED | 200（code≠0） | 落库失败：HTTP 仍 200，信封 `code`=`ERR_PERSIST_FAILED`（非 0 业务错误码）、`message`=「结果暂未能保存」、`data.report` 仍返回诊断正文；异步进 Mongo `compensations` 补偿队列 |

> 契约漂移的**用户侧确定性降级**与**告警路径**详见 tech-design › Error Handling › Propagation Strategy；CI 契约测试失败是独立机制，二者不可混用。