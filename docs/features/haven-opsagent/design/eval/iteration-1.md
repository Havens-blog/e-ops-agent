# Design Evaluation — Iteration 1

- Target: `docs/features/haven-opsagent/design/tech-design.md` (+ er-diagram.md, api-handbook.md, page-map.md, schema.mongo.js)
- PRD: `prd/prd-spec.md`, `prd/prd-user-stories.md`
- Scorer stance: adversarial Staff Architect; every assertion treated as unverified until evidenced.
- Reality checks performed against `D:\Haven\e-cam-service` (go.mod, internal/ layout) and `D:\Haven\e-cam-web` (src/router, src/layouts).

**Final Score: 821/1000** (Breakdown-Readiness gate: 147/180 — **below 160, progression to /breakdown-tasks blocked**)

---

## Phase 1 — Reasoning Audit

Argument chain trace:

- **Problem→Solution**: Sound. PRD identifies "no unified orchestration layer over mature base modules"; design answers with a pure-orchestration independent service calling base modules over HTTP. Coherent.
- **Solution→Evidence**: Weakened by deferred contracts. All four base-module contracts are explicitly unfrozen ("精确路径/字段名在 M1 契约盘点时以实际 e-cam-service 导出为准冻结", api-handbook B1 Path = `{M1 冻结}`). The design therefore cannot evidence that its `BaseModuleClient` signatures match reality — e.g. `LogQueryResult.RiskScore` as `*float64` is invented, not observed.
- **Evidence→Success Criteria**: Mostly carried over from PRD (SC-1 ≤1min, SC-2 ≥99% of N≥100). But the three-level LLM degradation in the PRD (模板意图匹配 → 预置查询入口 → 明示降级) is collapsed by the design into a single fallback ("返回空串 + degraded=true … diagnose 规则引擎结论兜底") — levels 2 and 3 have no design (no "预置查询入口" response shape, no "明示降级模式" behavior).
- **Self-contradiction check**: Two found. (a) The decision table justifies an independent service for "独立部署/扩缩容", yet the entire async path is process-local (in-process worker pool, in-process queue of 100, Redis SET NX dedup) — horizontal scaling breaks the concurrency-5/queue-100 semantics and duplicate-execution guards; no instance-count or leader-election constraint is stated. (b) Error semantics contradict themselves on cross-tenant access: the error table maps `ERR_TENANT_DENIED`（鉴权失败 / 跨租户访问）→ 401/403 while the Propagation Strategy says "跨租户访问一律返回 404（不泄露资源存在性）" and api-handbook repeats 404.

---

## Phase 2 — Rubric Scoring

### 1. Architecture Clarity: 162/170

| Criterion | Score | Justification |
|---|---|---|
| Layer placement explicit (60) | 60 | "编排层位于「应用编排层」：**只调用、不改写** Haven 底座数据面" — explicit, with capability mapping (#1/#2/#3/#5/#6/#7). |
| Component diagram present (60) | 58 | Full mermaid flowchart with 6 frontend pages, 9 internal packages, 4 base modules, stores, externals, and labeled edges (DF001). Minor: Agent-role edges `A1 --> A2 --> CTX` imply a linear call chain while the text says "角色间以 Go interface 协作" without defining who calls whom or the pipeline step order contract. |
| Dependencies listed (50) | 44 | Internal (logquery/alert/mcp+cam/eiam) and external (LLM, notify, Mongo/Redis) tables with contract points and degrade strategies; verified against go.mod. Deducted: the eiam call form is asserted but unverified — `github.com/Duke1616/eiam` is a Go *library* dependency of e-cam-service, and the design assumes an HTTP `verifyToken(token) → {user, tenant}` service; the actual integration form (library import vs HTTP) is an open question deferred to M1. Frontend dependencies (Element Plus present? cyan token scope) are asserted against e-cam-web but the sidebar insertion point is vague ("`e-cam-web/src/layouts/` 下主导航/侧边组件" — the layouts dir contains only `MainLayout.vue`). |

### 2. Interface & Model Definitions: 108/170 (er-diagram.md exists → db-schema: "yes" branch)

| Criterion | Score | Justification |
|---|---|---|
| Interface signatures typed (40) | 28 | Five Go interfaces with typed params/returns — good. But types referenced by the core interfaces are never defined anywhere: `DiagnoseParams` and `IntentCandidate` (the *output payload* of IntentClassifier, "Params DiagnoseParams // 抽取的服务名/时间窗/指标"), `LogEntry` (payload of the primary log contract), `AlertEvent` (input to `RunAlert`), `Identity`, `Severity` type, and in api-handbook `NotifyResult`, `TraceStep`, `StatusChange`, `LLMRequest`, `Datasource/LLMProvider/NotifyChannel/RiskWhitelistEntry` (settings API). A developer must guess these. Also `Conclusion.Citation []string "citation key 引用"` — "citation key" is undefined; `Citation` has no key field matching it (`SourceKey` is the source's key, not the citation record's). |
| Inline models concrete (40) | 30 | `Diagnosis`, `RiskEntry`, `LogQueryRequest/Result` concrete with json tags and constraints. Deducted for the undefined composite types above and for `DispositionStep.Executed bool // P1 恒 false` — fine, but `RiskEntry.Notified NotifyResult` type missing. |
| ER diagram complete (30) | 26 | Mermaid erDiagram with all 7 entities, relationships, cardinality, plus field-detail tables and index design. Deducted: (a) syntax artifact `array orchestration_trace "内嵌")` (stray paren); (b) `SESSIONS \|\|--o{ ORCHESTRATION_TRACE` models an *embedded array* as a separate entity ("内嵌"), contradicting itself; (c) `SESSIONS \|\|--o{ LLM_USAGE : "消耗LLM预算"` is semantically wrong — `llm_usage` is a per-tenant per-1h-window ledger (`window_start`, `calls`), not a per-session child; the "one-to-many" business meaning ("诊断过程中的 LLM 调用计入用量账本") does not match the entity's grain. |
| SQL DDL directly usable (30) | 24 | Mongo analog (`schema.mongo.js`) is executable mongosh with named, tenant-prefixed indexes — the multi-tenant hard constraint is respected. Deducted: field constraints are only prose comments ("状态机/枚举合法性由 Go 领域层校验；此处 schema 仅作文档参考") — no `$jsonSchema` validator despite the script's own note "可选 JSON Schema 校验"; `settings` unique index `{scope:1, tenant_id:1}` collides with "部分全局" settings — no statement of what `tenant_id` holds for global docs (null sentinel undocumented). |
| Cross-layer consistency (30) | 0 | Two direct conflicts: (1) **status enum**: Cross-Layer Data Map says frontend/API `status: '待查看'\|'已查看'\|'已处理'` while er-diagram, schema.mongo.js and api-handbook all use `pending_view\|viewed\|done` — the TS type contradicts the actual API contract. (2) **sessions.query**: tech-design defines `query` as the user's natural-language string ("用户自然语言提问"), yet `schema.mongo.js` builds `db.sessions.createIndex({ tenant_id: 1, "query.service_name": 1 }, ...)` treating `query` as an embedded object; er-diagram's own Index Design table says `(tenant_id, service_name)` top-level and the sessions entity has **no** `service_name` field at all. The index cannot be built against the modeled data. Also tech-design "4 个 P1 页面" vs page-map "P1 页面（4 核心 + 2 运维支撑）" (6 pages). Per deduction rules: -30 per cross-section conflict. |

### 3. Error Handling: 91/130

| Criterion | Score | Justification |
|---|---|---|
| Error types defined (45) | 45 | 10 explicit error codes with names and semantics, mirrored in api-handbook. |
| Propagation strategy clear (45) | 36 | Per-layer strategy present (LLM layer / orchestrator step-level "无数据" evidence / baseclient closed-loop / API mapping / persist compensation). Deducted: (a) compensation durability is asserted but not designed — "补偿队列（Redis 持久化待处理项）": Redis is not a durable store by default; no persistence config, retry ceiling, or dead-letter path for compensation items that keep failing ("仍失败进入补偿队列… + 监控告警" — then what?). (b) Async (alert) path failure surfacing is thin: webhook returns 202 unconditionally ("入队成功 / 队列满溢出时亦 202，仅标记丢弃低级别") — the caller cannot distinguish accepted vs dropped, and a risk_entry whose in-pipeline diagnosis fails has no defined terminal state. |
| HTTP status mapped (40) | 10 | Table exists, but contains a direct cross-section conflict: `ERR_TENANT_DENIED … 鉴权失败 / 跨租户访问 … 401/403` vs Propagation "跨租户访问一律返回 404（不泄露资源存在性）" vs api-handbook "跨租户访问一律返回 404". These cannot both be implemented. Additionally `ERR_QUEUE_FULL → 202` as an "error code" contradicts the envelope semantics (`code != 0` 为错误) — is `code` nonzero with 202, and how does the alert-module caller react? Per rules: -30 cross-section conflict. |

### 4. Testing Strategy: 123/130

| Criterion | Score | Justification |
|---|---|---|
| Per-layer test plan (45) | 45 | Five layers (domain rules, repository, base-contract, web/API, frontend E2E) each with test type and what-to-test; storm/flood, tenant isolation, concurrency-409, LLM-degradation scenarios enumerated. |
| Coverage target numeric (45) | 45 | "≥ 80%" per layer + overall "80%"; contract tests "全量契约覆盖"; E2E "关键路径全量". |
| Test tooling named (40) | 33 | Go `testing`, testcontainers/mongo, httptest, Playwright named. Deducted: (a) contract testing — the P1 explicit deliverable — has no named tooling or mechanism beyond "Go testing"; no contract-publish/consumer flow, so "契约测试守护漂移" is a CI-run assertion against what artifact is unspecified; (b) testcontainers-go is not in the project manifest (new dev dependency, unstated); (c) "httptest / supertest 等价" hedges. |

### 5. Breakdown-Readiness ★: 147/180 — **gate blocked**

| Criterion | Score | Justification |
|---|---|---|
| Components enumerable (65) | 62 | 9 internal packages + 4 agent roles + 6 frontend pages + 8 API endpoints — countable. Deducted: orchestrator pipeline internals ("编排流水线") never enumerated as components (page-map implies 4 steps: 意图识别→查询→诊断→报告, but the steps are not designed as units with owners/inputs/outputs). |
| Tasks derivable (65) | 55 | Each interface maps to an impl task; models map to schema tasks (script provided). Deducted: tasks would stall on the ~10 undefined shared types (`DiagnoseParams`, `LogEntry`, `AlertEvent`, `NotifyResult`, `TraceStep`, `StatusChange`, …); the `internal/notify` component's contract is materially undecided ("走 alert 模块的通知发送接口，还是 opsagent 直连渠道 webhook——M1 契约盘点时择一冻结"), so its task cannot be scoped; page-map's Agent 管理 page cites data sources "运行指标接口" and "worker 观测接口" that exist nowhere in api-handbook — frontend tasks with no backend contract. |
| PRD AC coverage (50) | 30 | Coverage map is broad and most user-story ACs (dedup window, queue 5/100, batch failure list + retry, 409 + refresh, high-risk no controls, auto-viewed transition, citation click-back, empty-result disclosure, notify retry/failure-rate) are addressed. Deducted AC gaps: (1) **三级降级 partially unaddressed** — user story 2 requires "系统按三级降级（模板意图匹配 / 预置查询入口 / 明示降级模式）响应"; the design implements only a single fallback (empty string + rule-engine conclusions); "预置查询入口" and "明示降级模式" appear nowhere as designed behavior or data shapes (-30-class gap, partially mitigated by the GuardedLLM/degraded-flag work that does exist). (2) Page-set inconsistency (design 4 P1 pages vs page-map 6) leaves the two "运维支撑" pages outside any AC trace while consuming design scope. |

### 6. Security Considerations: 76/80

| Criterion | Score | Justification |
|---|---|---|
| Threat model present (40) | 40 | Five named threats with severity (高危写执行, 跨租户串库, Prompt Injection, LLM 成本风暴, 契约漂移) — specific, not generic. |
| Mitigations concrete (40) | 36 | Each threat paired: deterministic risk registry ("LLM 输出不得改变档位、不得引入未注册工具"), three-layer injection defense (strip / delimit / template-slot fencing) plus output-side citation validation, tenant forced override, storm guards, contract freeze, audit trail. Deducted: (a) injection defense layer ① is a naive marker blacklist ("剥离指令性标记（「忽略以上指令」「system:」等）") with no stated escape for false positives/negatives — concrete but weak, and the design doesn't acknowledge it; (b) webhook auth "服务间密钥（非用户令牌）" — key distribution/rotation/replay is unspecified. |

### 7. Implementation Feasibility: 114/140

| Criterion | Score | Justification |
|---|---|---|
| Dependencies available (50) | 46 | Verified in `D:\Haven\e-cam-service\go.mod`: gin v1.12.0, gotomicro/ego v1.2.6, mongo-driver v1.17.4 (matches schema.mongo.js header), go-redis v9.18.0; `internal/logquery/llm` degraded-wrapper precedent confirmed on disk. Deducted: testcontainers absent from manifest. |
| Architecture fits project structure (50) | 42 | Independent service reusing the exact stack, HTTP-contract calling per conventions, `/api/v1/opsagent` prefix consistent with the convention note; "不跨模块 import" re-implementation of the llm degrade semantics is convention-consistent. Deducted: the proposed internal layout (`orchestrator/`, `worker/`, `risk/`, `baseclient/`) never maps onto the established assembly pattern `internal/<mod>/{domain, repository/dao, service, web, module.go}` + `RegisterRoutes(r)` — for a new service this is adaptable, but the design is silent on how middleware (`RequireTenant` equivalent, eiam session) plugs into gin given eiam is consumed both as middleware (MID→Eiam) and as a baseclient method (VerifyToken) with no stated division. |
| Technical claims grounded (40) | 26 | Deducted: (a) **scaling claim contradiction** — "独立部署/扩缩容" vs process-local worker pool/queue/dedup; nothing states opsagent must be single-instance, and nothing explains multi-instance behavior (each instance gets its own queue-100/concurrency-5; Redis SET NX dedup holds but window bookkeeping in Mongo `alerts.window_start` under concurrent writers is undesigned) (-8); (b) "Redis 持久化待处理项" treats Redis as durable without any persistence/eviction policy — Redis maxmemory eviction or restart loses compensation items (-4); (c) LLM budget is double-tracked (Redis INCR "滚动 1h 预算" and Mongo `llm_usage` window ledger) with no reconciliation rule between the two sources of truth (-2). |

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] No concurrency model for the risk-entry optimistic lock's backing field.** api-handbook requires `expectedVersion | string | 否 | 乐观锁版本（防并发覆盖）`, but neither er-diagram nor schema.mongo.js defines any `version`/`updated_at`-based CAS field on `risk_entries` (`status_history` is an append log, not a version). The PRD's core concurrency AC ("未经确认不发生覆盖") has no data-model support. Must add a version field + compare-and-swap update design.
2. **[blindspot] Synchronous 1-minute HTTP request is a production outage pattern.** "创建会话 + 首轮提问并同步编排" with "端到端（含 LLM 解读）≤ 1 分钟" means the chat endpoint holds an HTTP connection through log federation + asset queries + LLM calls (each LLM call alone allowed up to >12s). No timeout budget sum, no gin/server timeout config, no streaming/async-job fallback for the chat path. Under load this is exactly the connection-pool exhaustion pattern that takes the whole service down.
3. **[blindspot] Contract drift surfaces as user-facing 500.** "ERR_CONTRACT_DRIFT | 底座响应与契约不符 | 500（触发契约测试告警）" — a base-module shape change returns raw 500 to end users with no degraded/deterministic fallback path (unlike LLM/base-timeout paths), and "触发契约测试告警" conflates a CI test with a runtime alerting mechanism. Drift needs its own runtime degrade + alert path.
4. **[blindspot] `sessions.query` string vs `"query.service_name"` index.** tech-design: "query | 用户自然语言提问"; schema.mongo.js: `db.sessions.createIndex({ tenant_id: 1, "query.service_name": 1 }, ...)`. The shipped schema script is unbuildable against the modeled document — one of the two is wrong and neither is marked authoritative.
5. **[blindspot] Document hygiene artifact suggesting unreviewed content.** api-handbook contract B4: "响应：发送结果（用于 SC-2 383 成功率埋点）" — "383" is a stray artifact; combined with the 403/404 contradiction and the 4-vs-6 page count, this indicates cross-file review has not caught copy drift. A final consistency pass is required before freeze.

---

## Score Summary

| Dimension | Score |
|---|---|
| Architecture Clarity | 162/170 |
| Interface & Model Definitions | 108/170 |
| Error Handling | 91/130 |
| Testing Strategy | 123/130 |
| Breakdown-Readiness ★ | 147/180 |
| Security Considerations | 76/80 |
| Implementation Feasibility | 114/140 |
| **Total** | **821/1000** |

Gate: Breakdown-Readiness 147 < 160 → **blocked**. Blocking items: undefined shared types, three-level degradation gap, expectedVersion with no version field, settings/agent-observability API gaps, cross-file contradictions (403/404, status enum, sessions.query, page count).
