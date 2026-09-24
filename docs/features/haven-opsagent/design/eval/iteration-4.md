# Design Evaluation — Iteration 4 (Verification Re-Score)

- Target: `docs/features/haven-opsagent/design/tech-design.md` (+ er-diagram.md, api-handbook.md, page-map.md, schema.mongo.js)
- PRD: `prd/prd-spec.md`, `prd/prd-user-stories.md`
- Scorer stance: adversarial Staff Architect, verification pass. Every one of the 7 polish items was audited against the current file contents (quote-level), not against the revision claims. Score reflects the documents as they stand now.
- Prior: 821 → 871 → 889. This pass verifies the 7-item polish targeting 900.

**Score: 904/1000** (Breakdown-Readiness gate: 164/180 — above 160, progression to `/breakdown-tasks` unblocked)

---

## Part 1 — Polish Fix Audit (all 7 verified against current files)

| # | Iter-3 residual | Verdict | Evidence |
|---|---|---|---|
| 1 | Budget arithmetic (≤20s vs 25s sum) | **FIXED (real)** | tech-design: "「**合计（编排侧硬预算）≤ 25s**（2 + max(8,5) + 12 + 3）」" — arithmetic now correct and self-consistent; api-handbook §1 aligned ("「服务端 http.Server 写超时统一 30s（与编排侧 25s 硬预算对齐）」"). |
| 2 | `alerts` dual write trigger | **FIXED (real)** | tech-design Data Models now defines per-arrival window accounting: "「窗口内首条到达建文档（`dedup_conclusion=new`, count=1），后续同指纹对同一文档 `$inc count` 并置 `dedup_conclusion=merged`；队列溢出丢弃的低级别告警亦各写一条（…`dedup_conclusion=overflow_dropped`）」"; identical semantics in er-diagram (enum new\|merged\|overflow_dropped), schema.mongo.js, and api-handbook §9. The dedup/merge bookkeeping is now implementable. Residual concurrency nit → Attack 8. |
| 3 | L3 `type="degraded_notice"` not in API enum | **FIXED (real)** | api-handbook §1 type enum now includes "「`degraded_notice`（L3 明示降级）」" matching tech-design L3 row. |
| 4 | `Correct` had no `message` parameter | **FIXED (real)** | Interface 1: "「Correct(ctx context.Context, sessionID string, target IntentType, params DiagnoseParams, message string) (IntentResult, error)」" with XOR documented ("「target+params 与 message 二选一（XOR，与 api-handbook §2 一致）」"); api-handbook §2 and page-map `IntentCorrection` all agree. |
| 5 | Guided-response content had no source | **FIXED (real)** | `guided_templates` added as a settings scope (tech-design settings row, er-diagram scope enum, schema.mongo.js comment) and given a full GET/PUT surface in api-handbook §8 ("「guidedTemplates \| object \| 否 \| 整体替换；键为超能力意图类型，值为 {话术模板, 正确渠道/系统入口}」"). Flow C is now end-to-end operable. |
| 6 | Contract-test capture/replay environment unstated | **FIXED (real)** | "「CI 优先对 live 测试环境 e-cam-service 重放断言，服务不可用时回退 golden fixtures（该用例标记 skipped 并推送告警）」" in both tech-design Testing table and api-handbook Part B. The CI contract test now has a runnable home. |
| 7 | `ERR_PERSIST_FAILED` envelope `code` ambiguous | **FIXED (real)** | Both error tables now state: "「HTTP 仍 200，`code`=`ERR_PERSIST_FAILED`（非 0 业务错误码）、`message`=「结果暂未能保存」、`data.report` 仍返回诊断正文」" — the frontend distinguishes saved vs not-saved via `code≠0` with a populated `data.report`. |

**Carried over, still open** (deductions retained from iter-3, not increased):
eiam integration form unverified (design commits HTTP edges `MID --> Eiam` / `CTX --> Eiam` / contract B3 `verifyToken` while on-disk reality is in-process SDK `eiam/pkg/web/sdk` + `ginx/session`); notification-channel decision still an Open Question while `internal/notify` carries a fixed contract; Redis INCR vs Mongo `llm_usage` dual bookkeeping with no reconciliation rule; prompt-injection layer ① still a naive marker blacklist ("「剥离指令性标记（『忽略以上指令』『system:』等）」") with no false-positive acknowledgment; no per-user LLM budget; internal package layout (`orchestrator/`, `worker/`, `risk/`, `baseclient/`) never mapped onto the convention's `internal/<mod>/{domain, repository/dao, service, web, module.go}` assembly; chat >24h timeframe ("「超出提示用户缩小范围」") still has no designed response shape.

---

## Part 2 — Phase 1 Reasoning Audit

- **Problem→Solution**: Sound. Independent pure-orchestration service, single-process pipeline with 4 logical roles, honest single-instance constraint with an explicit P2 migration path, per-stage latency budget with a 202 escape hatch. The PRD → orchestrator → frozen contracts → contract-tests chain is coherent.
- **Solution→Evidence**: All iter-3 evidence gaps in the 7 polish areas are closed. Residual: LLM budget limit's configuration source is unmodeled (Attack 4); `Session` type referenced by `Orchestrator.RunChat` is defined nowhere (Attack 2).
- **Evidence→Success Criteria**: All PRD ACs trace to HTTP-realizable behavior except the list-expand auto-viewed path (Attack 3) and the overflow-archive retrieval surface (Attack 5).
- **Self-contradiction check**: iter-3's two conflicts (L3 type, alerts trigger) verified fixed; one **new** cross-file conflict found this pass — the alert webhook field name (`window` vs `timeframe`, Attack 1) — plus a stale page-map control contradicting the security design (Attack 6).

---

## Part 3 — Rubric Scoring

### 1. Architecture Clarity: 158/170

| Criterion | Score | Justification |
|---|---|---|
| Layer placement explicit (60) | 60 | "「编排层位于『应用编排层』：**只调用、不改写** Haven 底座数据面」" with the new-data boundary ("「自身新增的仅有数据是…编排产物」"). |
| Component diagram present (60) | 56 | Full mermaid flowchart: 6 pages, 10 internal packages, 4 base modules, stores, externals, labeled DF001 edge; worker node carries the compensation-loop ownership. Deducted: pipeline steps still not drawn/enumerated as step-level units (page-map `ThinkingBlock` promises "「4 步编排进度（意图识别→查询→诊断→报告）」" but the diagram shows only role edges); `DegradationController` remains prose-only, not a diagram node. |
| Dependencies listed (50) | 42 | Internal/external tables with contract points and degrade strategies; stack claims verified on disk in iter-3 (gin, ego, mongo-driver, go-redis v9, `pkg/mongox`, `internal/logquery/llm`). Deducted: eiam committed as HTTP edges against on-disk in-process-SDK evidence, deferred to an Open Question; notification-channel integration undecided while `internal/notify` is drawn with a fixed contract; sidebar insertion point still vague ("「`e-cam-web/src/layouts/` 下主导航/侧边组件」"). |

### 2. Interface & Model Definitions: 134/170 (er-diagram.md exists → db-schema: "yes")

| Criterion | Score | Justification |
|---|---|---|
| Interface signatures typed (40) | 39 | All five interfaces fully typed; `Correct` now covers both API correction paths; Shared Types define every referenced composite with json tags. Deducted: `Orchestrator.RunChat(ctx context.Context, session *Session, input string)` references a `Session` type that is defined in **neither** tech-design Shared Types nor api-handbook Data Contracts — the developer must reverse-engineer its shape from the er-diagram sessions table. |
| Inline models concrete (40) | 36 | Shared Types genuinely concrete; `RiskEntry.Version`, settings PUT fielding, masking rules all verified. Deducted: the LLM budget limit has no modeled source — `LLMProviderConfig` carries only "「name/default/model/keyMasked」", `llm_usage` has no limit field, yet §10 returns `llmBudget.budgetLimit` (Attack 4); `AlertEvent.Level` ("「参与指纹」") has no value enum, so fingerprint semantics are only partially pinned. |
| ER diagram complete (30) | 24 | COMPENSATIONS/SETTINGS modeling notes correct; `risk_entries.notified` typed; `llm_usage` grain note correct. Deducted: **`settings` still has an entity-detail table but is absent from the mermaid erDiagram** (7 diagram entities vs 8 modeled collections — carried from iter-3); Index Design table still omits five indexes present in schema.mongo.js (`idx_sessions_tenant_type`, `idx_dx_tenant_time`, `idx_alerts_tenant_time`, `idx_re_tenant_fingerprint`, `idx_re_dx`) with no marked authority. |
| SQL DDL directly usable (30) | 25 | schema.mongo.js is executable mongosh, tenant-prefixed, CAS index commented, sentinel tenant documented. Deducted: field constraints still prose-only ("「此处 schema 仅作文档参考」", no `$jsonSchema`); `llm_usage` has no budget-limit field; and 4 of the script's own indexes (`idx_dx_session`, `idx_cit_dx`, `idx_re_dx`, `idx_comp_retry`) violate the script's own header claim "「所有索引以 tenant_id 为前缀」". |
| Cross-layer consistency (30) | 10 | iter-3's two conflicts verified fixed. The Cross-Layer Data Map itself matches er-diagram column names. **One new conflict** (Attack 1): api-handbook §9 request field "「window \| object \| 是 \| 时间窗」" vs tech-design `AlertEvent.Timeframe` ("「Timeframe Timeframe \`json:\"timeframe\"\`」") under the shared-types note "「AlertEvent…json tag 与本节 DTO 同形」" — the webhook sender and the consuming struct disagree on the wire name; a §9-compliant request binds to a zero-value `Timeframe`. Per deduction rule (-30 per conflict), criterion reduced to a residual floor. |

### 3. Error Handling: 121/130

| Criterion | Score | Justification |
|---|---|---|
| Error types defined (45) | 45 | 11 named codes, mirrored 1:1 in api-handbook; `ERR_PERSIST_FAILED` envelope now fully specified (fix 7 verified); `ERR_QUEUE_FULL` half-success precisely defined. |
| Propagation strategy clear (45) | 38 | Per-layer strategy complete, compensation loop owned ("「该循环是 `compensations` 集合的唯一读写属主，落库失败方只负责写入」"), contract-drift dual path decoupled from CI tests. Deducted: (a) **multi-document persist atomicity and compensation replay idempotency unspecified** (Attack 7) — a "「payload…自包含原写操作快照」" replayed after a partial write (session inserted, diagnosis failed) can duplicate sessions; no Mongo transaction or idempotency-key design anywhere; (b) async-path terminal states: the 202 flow's background continuation is an in-process goroutine with no orphaned-session recovery, and Redis-INCR vs `llm_usage` still has no reconciliation rule (carried). |
| HTTP status mapped (40) | 38 | Status table complete and cross-file consistent; 202 half-success and 202 async fallback both precise. Deducted: the 202 polling instruction has no terminal condition for failure — "「前端每 2s 轮询 `GET /history?sessionId=` 至 `status=done`」" while `SessionSummary.Status` includes `failed`; a background persist that exhausts compensation (dead) leaves the frontend polling indefinitely with no defined display state (Attack 8b). |

### 4. Testing Strategy: 127/130

| Criterion | Score | Justification |
|---|---|---|
| Per-layer test plan (45) | 45 | Five layers with type/tool/what-to-test; storm, tenant isolation, 409 concurrency, LLM-degradation injection, SC-7 all enumerated. |
| Coverage target numeric (45) | 45 | "「≥ 80%」" per layer, "「80%（单元 + 集成）」" overall, "「全量契约覆盖」", "「关键路径全量」". |
| Test tooling named (40) | 37 | Go `testing`, CI `mongo:7` container + `MONGO_URI` + `pkg/mongox` (testcontainers rejected with reason), golden-JSON mechanism, `net/http/httptest`, Playwright; contract-test environment now stated (fix 6). Deducted: Redis-dependent logic (fingerprint dedup, INCR budget) still has no named test double although miniredis/v2 is already in go.mod. |

### 5. Breakdown-Readiness ★: 164/180 — **gate unblocked**

| Criterion | Score | Justification |
|---|---|---|
| Components enumerable (65) | 59 | Countable: 10 internal packages + 4 agent roles + 6 pages + 10 endpoints + 8 collections; compensation worker owned; `DegradationController` named. Deducted: pipeline steps still not designed as step-level units; `loadHistory` "「内存环形缓冲」" remains a componentless feature. |
| Tasks derivable (65) | 60 | Iter-3 stallers resolved: guided_templates store defined (task now scopeable), `Correct` message path backed by an interface. Remaining: `internal/notify` task unscoped pending the channel decision ("「走 alert 模块的通知发送接口，还是 opsagent 直连渠道 webhook——M1…择一冻结」"); LLM budget-limit task cannot be fully scoped without a config source; alert window-accounting task has an unspecified upsert/uniqueness requirement (Attack 8a). |
| PRD AC coverage (50) | 45 | Coverage map rows backed by real contracts; degradation L0–L3, correction/clarification, batch CAS, auto-viewed detail trigger, citation click-back validation all verified. Remaining gaps: (a) **list-expand auto-viewed** — Story-1 AC "「我打开一条『待查看』条目（列表内展开或进入详情页）」" but §6's lazy transition fires only on `GET /diagnosis/:id?riskEntryId=` and §4 is explicitly "「待查看→已查看自动流转，不主动调」" — the 列表内展开 path has no transition mechanism (Attack 3); (b) overflow archive "「保留告警原文与去重结论可查」" has no retrieval surface — no endpoint exposes `alerts` documents (Attack 5); (c) >24h chat timeframe response shape still undefined (carried). |

### 6. Security Considerations: 75/80

| Criterion | Score | Justification |
|---|---|---|
| Threat model present (40) | 40 | Five named threats with severities and specific scenarios. |
| Mitigations concrete (40) | 35 | Each threat paired with a mechanism; webhook key injection + dual-key rotation designed. Deducted (carried): injection layer ① is a marker blacklist with no false-positive/negative acknowledgment; no replay protection on the webhook (no timestamp/nonce/signature — header-key auth permits captured-request replay); no per-user LLM budget (one user can exhaust the tenant's rolling budget); "「落库前加密」" for `apiKey` names no key-management mechanism. |

### 7. Implementation Feasibility: 125/140

| Criterion | Score | Justification |
|---|---|---|
| Dependencies available (50) | 46 | Verified in go.mod (iter-3): gin, ego, mongo-driver, go-redis v9, miniredis; `pkg/mongox` exists; "「不新增消息队列中间件」" is dependency-disciplined. Deducted: eiam consumption assumed as HTTP `verifyToken` against on-disk in-process-SDK evidence, unresolved and deferred to M1. |
| Architecture fits project structure (50) | 44 | Independent service on the exact stack; `/api/v1/opsagent` prefix consistent; "「独立服务内重新实现同语义封装，不跨模块 import」" respects boundaries; single-instance constraint honestly bounded with a P2 Redis-shared-queue path. Deducted: internal package layout never maps onto the convention's `internal/<mod>/{domain, repository/dao, service, web, module.go}` + `InitModule`/`RegisterRoutes` assembly. |
| Technical claims grounded (40) | 35 | Budget arithmetic now correct (fix 1) and the 202 fallback ordering (25s budget < 30s WriteTimeout) is grounded. Deducted: (a) Redis INCR vs `llm_usage` dual bookkeeping with no reconciliation or eviction story (-3, carried); (b) `llmBudget.budgetLimit` in §10 has no configuration source anywhere in the design (-2, Attack 4); (c) the async-fallback claim "「（25s 同步 + 后台完成 ≤ 1min）」" is arithmetically loose — read literally the sum is 85s, and the doc never states the background path resumes with a remaining-time budget, so "端到端 ≤ 1 分钟" via the 202 path is asserted, not derived (-0 explicit; flagged for the record). |

---

## Part 4 — Blindspot Hunt (new/residual attacks, this pass)

1. **[Interface & Model Definitions] Alert webhook wire-name conflict.** api-handbook §9: "「window | object | 是 | 时间窗」"; tech-design: "「Timeframe Timeframe `json:"timeframe"`」" with the shared-types note "「AlertEvent…json tag 与本节 DTO 同形」". A §9-compliant alert payload binds to a zero-value `Timeframe` — the first alert processed by the storm-protection path would carry an empty window. One of the two names must be renamed.
2. **[Interface & Model Definitions] `Session` is referenced but never defined.** `RunChat(ctx context.Context, session *Session, input string)` — no `Session` struct exists in tech-design Shared Types or api-handbook Data Contracts; its shape must be guessed from the er-diagram sessions table (which itself is the DB view, not the domain type).
3. **[Breakdown-Readiness] List-expand auto-viewed has no mechanism.** Story-1 AC: "「我打开一条『待查看』条目（列表内展开或进入详情页）…该条目状态自动流转为『已查看』」". §6 defines the trigger only for `GET /diagnosis/:id?riskEntryId=`; §4 is "「待查看→已查看自动流转，不主动调」"; page-map `RiskTable` wires only "「点击条目跳转诊断详情并携带 `riskEntryId`」". The 列表内展开 branch of the AC is unservable as specified.
4. **[Implementation Feasibility] LLM budget limit has no source.** §10 promises "「llmBudget | object | { windowStart, calls, budgetLimit, exceeded }」" but no settings scope/env var/constant defines the limit: `LLMProviderConfig` has no budget field, `llm_usage` has no limit column, PRD requires "「每滚动 1 小时设次数上限（预算化）」". The BudgetGauge component cannot be implemented without inventing the limit's home.
5. **[Breakdown-Readiness] Overflow archive is retained but not queryable.** PRD: "「溢出的低级别告警排查被丢弃，但保留告警原文与去重结论可查」". The design writes `overflow_dropped` documents but defines no endpoint/page exposing `alerts` — the AC's "可查" is satisfied only at the database level, not for any user.
6. **[Interface & Model Definitions] page-map ships a control that contradicts the security design.** SecurityTab: "「租户注入开关 + 风险白名单表」" — there is no `tenant_injection` settings scope (enum: datasource|llm|notify|risk_whitelist|preset_queries|guided_templates), and a toggle would contradict "「tenant 强制注入…客户端传值丢弃」" (tenant isolation is a hard constraint, not a switch). Stale prototype leftover.
7. **[Error Handling] Multi-document persist atomicity + replay idempotency unspecified.** "「仍失败写入 `compensations` 集合…逐条重放」" — a chat persist spans sessions + diagnoses + citations; Mongo is never given a transaction, and the replayed "「原写操作请求快照（自包含）」" has no idempotency key, so a partial first attempt (session written, diagnosis failed) followed by a full replay duplicates the session document. Unhandled concurrency at the exact point the compensation mechanism exists to protect.
8. **[Interface & Model Definitions / Error Handling] 202 async-path failure semantics.** (a) Window-accounting race: "「窗口内首条到达建文档」" is guarded only by the non-unique `idx_alerts_fingerprint_window` — two concurrent first-arrivals of the same fingerprint can both create `new` documents; no upsert/unique constraint is specified. (b) Terminal state: polling is defined "「直至 `status=done`」" with no instruction for `status=failed`, and a process restart mid-background-run strands the session in `running` forever (no orphaned-session recovery; compensations cover persist failure only, not orchestration continuation).
9. **[carried, unchanged] eiam HTTP-vs-SDK; notification-channel decision; Redis/`llm_usage` dual ledger; marker-blacklist injection defense; no per-user LLM budget; internal layout vs `internal/<mod>` convention; >24h chat timeframe response shape.**

---

## Score Summary

| Dimension | Score |
|---|---|
| Architecture Clarity | 158/170 |
| Interface & Model Definitions | 134/170 |
| Error Handling | 121/130 |
| Testing Strategy | 127/130 |
| Breakdown-Readiness ★ | 164/180 |
| Security Considerations | 75/80 |
| Implementation Feasibility | 125/140 |
| **Total** | **904/1000** |

Gate: Breakdown-Readiness 164 ≥ 160 → **unblocked**. Target 900 reached (904 ≥ 900) with all 7 polish fixes verified real; remaining defects are localized (wire-name conflict, `Session` type, list-expand trigger, budget-limit source, overflow retrieval surface, stale page-map toggle, persist atomicity/replay idempotency, 202 failure semantics) plus the carried eiam/notify/layout items — none structural.
