# Design Evaluation — Iteration 2

- Target: `docs/features/haven-opsagent/design/tech-design.md` (+ er-diagram.md, api-handbook.md, page-map.md, schema.mongo.js)
- PRD: `prd/prd-spec.md`, `prd/prd-user-stories.md`
- Scorer stance: adversarial Staff Architect; every assertion treated as unverified until evidenced. Score only what is on the page now — no credit for "improvement from iteration 1".
- Reality checks re-performed against `D:\Haven\e-cam-service` (go.mod, internal/ layout, internal/logquery/llm/llm.go) and `D:\Haven\e-cam-web` (src/router/routes.ts, src/layouts/MainLayout.vue).

**Final Score: 871/1000** (Breakdown-Readiness gate: 144/180 — **below 160, progression to /breakdown-tasks still blocked**)

## Iteration-1 Attack Verification (fix audit — verified, not assumed)

| Iter-1 attack | Verdict |
|---|---|
| ~10 undefined shared types (`DiagnoseParams`, `LogEntry`, `AlertEvent`, `NotifyResult`, `TraceStep`, `StatusChange`, …) | **FIXED (real)** — tech-design "Shared Types（跨接口共享类型，唯一定义处）" defines all of them with json tags; api-handbook points back: "全部共享类型…在 tech-design.md › Shared Types 统一定义". `Conclusion.Citation` now anchored: "引用 Citation.SourceKey 列表；须能回指本 Diagnosis.citations 内的条目". |
| Three-level LLM degradation collapsed to one fallback | **FIXED (real)** — L0–L3 table with per-level trigger/behavior/response shape (`degradeLevel`, `type="preset_entries"`, `presets: []PresetQuery`), `DegradationController`, "逐级尝试、只降不升" + 5min cooldown, `settings.preset_queries` scope added to er-diagram and schema. |
| `expectedVersion` with no version field on risk_entries | **FIXED (real)** — `risk_entries.version int ≥1`, CAS findAndModify `{_id, tenant_id, version}` + `$inc`, documented identically in er-diagram, schema.mongo.js comment, and api-handbook §3. |
| Agent-observability / settings API gaps | **FIXED (partial)** — `GET /opsagent/agents/observability` added with queue/llmBudget/loadHistory blocks matching page-map's four sections. But `preset_queries` (the L2 degradation dependency, "管理员可配") has **no surface in the settings API contract** — GET response lists only datasources/llmProviders/notifyChannels/riskWhitelist; PUT request body is undefined entirely. |
| Cross-tenant 401/403 vs 404 contradiction | **FIXED** — consistent "跨租户一律 ERR_NOT_FOUND 404（不泄露存在性）" across tech-design, api-handbook error table; `ERR_TENANT_DENIED` scoped to 401 only. |
| status enum '待查看'… vs pending_view/viewed/done | **FIXED** — Cross-Layer Data Map now `'pending_view'\|'viewed'\|'done'（展示文案映射 待查看/已查看/已处理）`. |
| sessions.query string vs `"query.service_name"` index | **FIXED** — schema.mongo.js: "sessions.query 为自然语言提问原文（string）；服务名检索走顶层 service_name 字段"; top-level `service_name` added to er-diagram sessions and indexed `(tenant_id, service_name)`. |
| 4 vs 6 P1 pages | **FIXED** — "本功能的 6 个 P1 页面（4 核心 + 2 运维支撑）"; component diagram shows all 6. |
| Redis as durable compensation store | **FIXED** — `compensations` Mongo collection with retry_count/next_retry_at/status(retry|dead), retry ceiling 5 → dead + alert; "Redis 仅作触发信号…不作为补偿项存储". **But** the compensations collection is missing from er-diagram.md entirely (see Cross-layer consistency below). |
| ERR_CONTRACT_DRIFT → user-facing 500 | **FIXED (real)** — runtime degrade path ("无数据（契约异常）", `drift=true`, 绝不向用户抛裸 500) + runtime alert path (`opsagent_contract_drift_total{module}`, ≥3/10min escalation), explicitly decoupled from CI contract tests in both files. |
| Single-instance constraint absent | **FIXED (real)** — dedicated "单实例部署约束（P1）" section: process-local queue/concurrency semantics named, Redis-shared-queue migration deferred to P2 explicitly. Honest and grounded. |
| [blindspot] Sync 1-minute HTTP hold | **NOT FIXED** — api-handbook still "创建会话 + 首轮提问并同步编排"; no timeout budget, no server timeout config, no async/streaming fallback (see Attack 1). |
| [blindspot] Contract-testing tooling unspecified | **NOT FIXED** — still "契约测试（集成） | Go `testing` | 逐条断言冻结契约"; no mechanism named for what the CI assertion consumes (frozen doc? JSON schema? golden payloads?). |
| [blindspot] testcontainers not in manifest | **NOT FIXED** — still "testcontainers/mongo" with no acknowledgment it is a new dev dependency (verified absent from go.mod). |
| [blindspot] Webhook key management | **NOT FIXED** — still "服务间密钥（非用户令牌）"; distribution/rotation/replay unspecified. |

---

## Phase 1 — Reasoning Audit

- **Problem→Solution**: Sound. Independent pure-orchestration service over frozen HTTP contracts, single-process pipeline with 4 logical agent roles, justified against KISS and stack reuse in the Alternatives table.
- **Solution→Evidence**: Strengthened materially — shared types are now defined at a declared single source of truth, the ER/schema/API trio agrees on the risk-entry CAS mechanism, and the degradation design is concrete enough to implement. Residual weakness: Part B base contracts remain shape-only with paths "在 M1 契约盘点时以实际 e-cam-service 导出为准冻结" — acceptable as an explicit P1 deliverable, but `BaseModuleClient.QueryLogs`'s `LogQueryResult.RiskScore *float64` is still asserted, not observed from the base module.
- **Evidence→Success Criteria**: SC-1/SC-2/SC-5/SC-6/SC-7 all have test scenarios. Gap: Story-2's correction/clarification AC ("系统按纠正后的意图重新路由执行…无需我重新完整提问") is backed by an internal Go interface (`IntentClassifier.Correct(ctx, sessionID, …)`) but has **no HTTP contract** — see Attack 2.
- **Self-contradiction check**: Three found this pass. (a) `ERR_INTENT_UNKNOWN` maps to "200（降级响应，非错误）" in tech-design but to status 400 in api-handbook's chat error table. (b) The two `Diagnosis` struct definitions diverge: api-handbook's has `Trace []TraceStep` (and tech-design's own `TraceStep` comment says "Diagnosis.trace"), while tech-design Interface 3's `Diagnosis` struct omits `Trace`. (c) api-handbook §3 promises the update response is "更新后的 RiskEntry（含自增后的 `version`）", but the `RiskEntry` data contract contains no `version` field — the client cannot obtain the value `expectedVersion` is specified to be taken from after a 409 refresh.

---

## Phase 2 — Rubric Scoring

### 1. Architecture Clarity: 158/170

| Criterion | Score | Justification |
|---|---|---|
| Layer placement explicit (60) | 60 | "编排层位于「应用编排层」：**只调用、不改写** Haven 底座数据面" with capability-list mapping (#1/#2/#3/#5/#6/#7) and the new-data boundary ("自身新增的仅有数据是「会话/诊断/风险待办/告警去重/LLM 用量」等编排产物"). |
| Component diagram present (60) | 56 | Full mermaid flowchart: 6 pages, 10 internal packages, 4 base modules, stores, externals, labeled edges (DF001 webhook). Deducted: the orchestrator pipeline's internal steps are still not drawn or enumerated as units (page-map's ThinkingBlock promises "4 步编排进度（意图识别→查询→诊断→报告）" but the diagram shows only `INT --> A1` role edges); the compensation retry worker that owns `compensations` (idx `idx_comp_retry`, retry-5→dead) appears nowhere in the diagram; `DegradationController` exists only in prose. |
| Dependencies listed (50) | 42 | Internal/external tables with contract points and degrade strategies; stack claims verified on disk (gin v1.12.0, ego v1.2.6, mongo-driver v1.17.4, go-redis v9.18.0; `internal/logquery/llm/llm.go` exists). Deducted: the eiam integration form remains unverified — go.mod shows `github.com/Duke1616/eiam` is a **Go library** dependency, while the design assumes an HTTP `verifyToken(token) → {user, tenant}` service; the reconciliation is deferred to an Open Question ("eiam 具体验证端点与 token 载荷字段…M1 盘点确认") yet the component diagram already commits `MID --> Eiam` and `CTX --> Eiam` as HTTP edges. Notification-channel integration is likewise undecided ("走 alert 模块的通知发送接口，还是 opsagent 直连渠道 webhook——M1…择一冻结") while `internal/notify` is already drawn with a fixed contract. Sidebar insertion point still vague ("`e-cam-web/src/layouts/` 下主导航/侧边组件" — the directory contains only `MainLayout.vue`). |

### 2. Interface & Model Definitions: 132/170 (er-diagram.md exists → db-schema: "yes")

| Criterion | Score | Justification |
|---|---|---|
| Interface signatures typed (40) | 38 | Five Go interfaces, all params/returns typed; every previously-missing composite type now defined in Shared Types with json tags; `RiskEntry.Notified NotifyResult` resolved. Deducted: `IntentClassifier.Correct` is typed but has no exposing endpoint (Interface-to-API gap, scored under Breakdown too); `LLMRequest.Timeout time.Duration json:"-"` embeds transport policy in a data DTO. |
| Inline models concrete (40) | 32 | Shared Types block is now genuinely concrete (enums, constraints, masking rule "sk-****last4", PresetQuery/StatusChange/TraceStep all fielded). Deducted: `Diagnosis` defined twice with divergent fields (`Trace` missing in tech-design Interface 3 vs present in api-handbook); api-handbook `RiskEntry` lacks the `version` field its own §3 response description and `expectedVersion` semantics require; settings **PUT request body is entirely unspecified** (only GET response is tabled) — a developer cannot implement the write path; guided-response (超能力引导) has a `type="guided"` discriminator but no payload type or content source ("预设话术" storage undefined). |
| ER diagram complete (30) | 25 | Mermaid erDiagram with entities, relationships, cardinality; iter-1 artifacts fixed (`orchestration_trace` embedded note removed from relations; llm_usage grain corrected with explicit "不与 sessions 建关系" note; stray paren gone). Deducted: **`compensations` is absent from er-diagram.md** — tech-design's Field Quick Reference lists 8 collections and schema.mongo.js creates `db.createCollection("compensations")`, but the ER has only 7 entities and no relationship for it; mermaid types `risk_entries.notified` as `string` while the entity-detail table says object. |
| SQL DDL directly usable (30) | 27 | schema.mongo.js is executable mongosh (`mongosh <dsn>/opsagent --file`), all indexes tenant-prefixed, global-settings sentinel documented in both er-diagram ("全局配置文档存空串 \"\"（哨兵值）") and script comment, CAS index comment present. Deducted: field constraints remain prose-only ("状态机/枚举合法性由 Go 领域层校验；此处 schema 仅作文档参考") — the script's own note concedes optional `$jsonSchema` is not provided; `llm_usage` has no budget-limit field so the observability `llmBudget.budgetLimit` value's source is unmodeled. |
| Cross-layer consistency (30) | 10 | Iter-1's two conflicts fixed (status enum; sessions.query/service_name index; page count). But three new/remaining cross-file conflicts: (1) `ERR_INTENT_UNKNOWN` → "200（降级响应，非错误）" (tech-design) vs "400 \| ERR_INTENT_UNKNOWN" (api-handbook §1 Error Responses); (2) `Diagnosis` struct drift (`Trace []TraceStep` in api-handbook, absent in tech-design Interface 3 — yet tech-design's own TraceStep comment references "Diagnosis.trace"); (3) `RiskEntry` contract has no `version` field while api-handbook §3 returns "含自增后的 `version`" and the 409 flow depends on the client reading it. Per deduction rules (-30 per conflict, criterion capped at 30). |

### 3. Error Handling: 97/130

| Criterion | Score | Justification |
|---|---|---|
| Error types defined (45) | 45 | 10 named error codes with semantics, mirrored 1:1 in api-handbook's error table. |
| Propagation strategy clear (45) | 40 | Per-layer strategy now complete: LLM guarded non-blocking; step-level "无数据" evidence; baseclient closed-loop timeouts/retries; contract-drift dual path (user-side degrade + runtime alert with escalation threshold "10min 内同模块漂移 ≥3 次"); persistence "Mongo 为准" with retry 2 → compensation → retry 5 → dead + alert; cross-tenant 404 policy. Deducted: no component owns the compensation retry loop (who scans `next_retry_at`? the component diagram and interfaces never assign it); the async alert path's in-pipeline terminal state is only implied (all-steps-failed still yields a risk_entry via "无数据" evidence — never stated); Redis-INCR budget vs Mongo `llm_usage` ledger dual bookkeeping still has no reconciliation rule (which source trips the degradation predicate if they disagree after a Redis eviction?). |
| HTTP status mapped (40) | 12 | Table exists per code, `ERR_QUEUE_FULL` half-success now precisely specified ("202 + 信封 code=0…data.dropped=true…调用方无需重试；高危告警不丢弃"). Deducted: `ERR_INTENT_UNKNOWN` 200-vs-400 cross-file conflict (-30-class; criterion capped); `ERR_PERSIST_FAILED → 200（提示）` leaves envelope `code` ambiguous — is a chat response whose report was generated but not saved `code=0` or an error code, and how does the frontend distinguish? |

### 4. Testing Strategy: 122/130

| Criterion | Score | Justification |
|---|---|---|
| Per-layer test plan (45) | 45 | Five layers with type, tool, what-to-test; storm/flood (N≥100, fingerprint merge, queue overflow), tenant isolation, 409 concurrency, LLM-degradation injection scenarios all enumerated. |
| Coverage target numeric (45) | 45 | "≥ 80%" per layer + overall "80%（单元 + 集成）"; contract tests "全量契约覆盖"; E2E "关键路径全量". |
| Test tooling named (40) | 32 | Go `testing`, testcontainers/mongo, httptest, Playwright named. Deducted: contract testing — an explicit P1 deliverable — still names no mechanism or artifact (what does the CI run assert against: a frozen schema file, golden JSON, a generated client?); testcontainers still presented as if available ("testcontainers/mongo") while absent from go.mod with no acknowledgment; "httptest / supertest 等价" hedging remains. |

### 5. Breakdown-Readiness ★: 144/180 — **gate blocked**

| Criterion | Score | Justification |
|---|---|---|
| Components enumerable (65) | 58 | Countable: 10 internal packages (web/orchestrator/llm/risk/worker/baseclient/notify/repository/middleware + agents) + 4 agent roles + 6 pages + 9 API endpoints + 8 collections. Deducted: pipeline steps not designed as units; compensation retry worker and DegradationController absent from the component inventory; `loadHistory` "内存环形缓冲" is a componentless feature. |
| Tasks derivable (65) | 52 | Shared-types fix unblocks most model/schema tasks; every interface maps to an impl task; schema script provided. Remaining task-stallers: (a) chat correction flow — page-map's `IntentCorrection` cites "`POST /opsagent/chat`（纠正重路由）" but the chat request has only `message`/`requestId` (no sessionId, no target intent/params) and no session-scoped endpoint exists, so the correction task has no implementable contract; (b) settings PUT body undefined → write-path task unscoped; (c) `preset_queries` has no read/write API surface despite being "管理员可配" and load-bearing for L2 degradation; (d) risk-center StatCards needs aggregate data ("待处理 / 今日新增 / 高危") but `GET /risk-center` returns only `items/total/page/limit` — no aggregate contract. |
| PRD AC coverage (50) | 34 | Coverage map rows address nearly every AC; three-level degradation now genuinely designed (L1/L2/L3 with response shapes). Remaining AC gaps: (1) Story-2 correction/clarification AC has no HTTP realization — `IntentResult.NeedsClarify` ("低于阈值触发澄清") cannot be expressed in the chat response, whose `type` enum is `report|preset_entries|guided` with no clarify variant, and no endpoint carries `sessionID` to call `Correct`; (2) Story-1 auto-viewed AC ("打开一条「待查看」条目…状态自动流转为「已查看」") has no trigger point in any API — `POST /:id/status` explicitly says "待查看→已查看自动流转，不主动调" but nothing defines what server event performs the transition (GET /diagnosis/:id? list expand?); (3) Story-1 concurrency AC "未经确认不发生覆盖" is undermined by batch-status, which accepts only `ids`+`status` with **no per-item `expectedVersion`** — a batch can overwrite another operator's concurrent change with no CAS check at all; (4) guided-response "预设话术与正确入口提示" content source undefined. |

### 6. Security Considerations: 75/80

| Criterion | Score | Justification |
|---|---|---|
| Threat model present (40) | 40 | Five named threats with severities (高危写执行 Critical, 跨租户串库 Critical, Prompt Injection High, LLM 成本风暴 High, 契约漂移 Medium) — specific scenarios, not boilerplate. |
| Mitigations concrete (40) | 35 | Each threat paired: deterministic risk registry ("LLM 输出不得改变档位、不得引入未注册工具"), now a three-layer injection defense (strip / delimiter-wrapped untrusted text / template-slot fencing) plus output-side citation validation ("越界丢弃"), tenant forced override, storm guards (SET NX + TTL 10min, 并发5, 队列100, 滚动预算), contract freeze + tests, audit trail. Deducted: layer ① remains an unacknowledged marker blacklist ("剥离指令性标记（「忽略以上指令」「system:」等）") — trivially evaded, false positives unstated; webhook "服务间密钥" still has no key distribution/rotation/replay design; tenant-scoped LLM budget means any single user can exhaust the whole tenant's budget (no per-user cap) — unaddressed. |

### 7. Implementation Feasibility: 118/140

| Criterion | Score | Justification |
|---|---|---|
| Dependencies available (50) | 46 | Verified in go.mod: gin v1.12.0, gotomicro/ego v1.2.6, mongo-driver v1.17.4, go-redis v9.18.0; logquery/llm degradation precedent confirmed at `internal/logquery/llm/llm.go`; "不新增消息队列中间件（P1 用进程内 worker 池 + Redis）" is dependency-disciplined. Deducted: testcontainers absent from the manifest and unacknowledged. |
| Architecture fits project structure (50) | 44 | Independent service on the exact stack, HTTP-contract calling, `/api/v1/opsagent` prefix consistent with the route convention, "独立服务内重新实现同语义封装，不跨模块 import" respects module boundaries; single-instance constraint honestly bounded with a P2 Redis-shared-queue migration path. Deducted: internal package layout (`orchestrator/`, `worker/`, `risk/`, `baseclient/`) still never maps onto the convention's assembly pattern `internal/<mod>/{domain, repository/dao, service, web, module.go}` + `InitModule/RegisterRoutes`; eiam is consumed simultaneously as middleware (MID→Eiam) and as a baseclient method (`VerifyToken`) with no stated division of which path is real, against a reality where eiam is an in-process library. |
| Technical claims grounded (40) | 28 | Deducted: (a) the synchronous chat path still claims "端到端（含 LLM 解读）≤ 1 分钟" over an HTTP request that holds the connection through log federation + asset queries + an LLM call allowed to run >12s — no per-stage timeout budget, no gin/server timeout config, no async-job/streaming fallback; under load this is connection-pool exhaustion, and the claim is asserted without a latency budget sum (-6); (b) Redis-INCR budget vs Mongo `llm_usage` ledger dual sources of truth with no reconciliation rule, and a Redis maxmemory eviction silently resets the budget (-3); (c) eiam HTTP `verifyToken` unverified against the library-form reality (-3). |

**Implementation Feasibility total: 46 + 44 + 28 = 118/140**

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] Batch status has no CAS, contradicting the PRD's own concurrency guarantee.** PRD Story 1: "未经确认不发生覆盖"; api-handbook §3 gives single-mark `expectedVersion` CAS, but §4 batch-status accepts only "ids []string | status string" — no version per item. A concurrent single-mark by operator B between operator A's batch read and submit is silently overwritten, exactly the pattern the AC forbids. Must define per-item version in batch (or explicitly scope the AC to single-item marks).
2. **[blindspot] The auto-viewed transition has no trigger point.** api-handbook §3: "待查看→已查看自动流转，不主动调" — but no endpoint or server event is designated to perform it. If it fires on `GET /diagnosis/:id`, that must be stated (it also implies every detail GET mutates state and needs idempotency + CAS interplay with `version`). As written, two implementers would build different mechanisms.
3. **[blindspot] `compensations` collection exists in tech-design and schema.mongo.js but is absent from er-diagram.md.** tech-design Field Quick Reference: "compensations | payload, retry_count, status(retry/dead), next_retry_at"; schema: `db.createCollection("compensations")`. The ER — the declared data-model authority — models only 7 entities. Breakdown tasks generated from the ER will miss the compensation worker entirely.
4. **[blindspot] Chat API cannot express clarification or session continuation, though both are designed behaviors.** tech-design: `NeedsClarify bool // 置信度低，需追问` and `Correct(ctx, sessionID, …)`; PRD: "Agent 追问澄清…无需我重新完整提问". api-handbook chat: request `{message, requestId}`, response `type: report|preset_entries|guided` — no clarify type, no sessionId echo, no follow-up endpoint. The conversation the PRD describes is unimplementable over the documented API.
5. **[blindspot] `preset_queries` — the L2 degradation's data dependency — has no management surface.** tech-design: "settings.preset_queries 持久化，管理员可配"; the settings GET response table and PUT contract contain no presetQueries field. L2 cannot be exercised in production unless someone hand-writes Mongo documents, which contradicts "管理员可配".
6. **[blindspot] StatCards contract gap.** page-map: 统计卡 data source "GET /risk-center（聚合）" with "待处理 / 今日新增 / 高危"; the API returns only `{items, total, page, limit}`. The aggregate is unimplementable from the documented contract.
7. **[blindspot] `ERR_INTENT_UNKNOWN` dual mapping.** tech-design: "200（降级响应，非错误）"; api-handbook: "400 | ERR_INTENT_UNKNOWN". One of the two must be deleted; as-is, the middleware's status mapping is ambiguous for the most common error path in the system.

---

## Score Summary

| Dimension | Score |
|---|---|
| Architecture Clarity | 158/170 |
| Interface & Model Definitions | 132/170 |
| Error Handling | 97/130 |
| Testing Strategy | 122/130 |
| Breakdown-Readiness ★ | 144/180 |
| Security Considerations | 75/80 |
| Implementation Feasibility | 118/140 |
| **Total** | **871/1000** |

Gate: Breakdown-Readiness 144 < 160 → **blocked**. Blocking items: correction/clarification HTTP contract missing, settings PUT body + preset_queries surface undefined, batch-status CAS gap, auto-viewed trigger undefined, compensations missing from ER, StatCards aggregate contract, ERR_INTENT_UNKNOWN / Diagnosis.Trace / RiskEntry.version cross-file conflicts.
