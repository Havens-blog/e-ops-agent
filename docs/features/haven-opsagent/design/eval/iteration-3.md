# Design Evaluation — Iteration 3 (Final)

- Target: `docs/features/haven-opsagent/design/tech-design.md` (+ er-diagram.md, api-handbook.md, page-map.md, schema.mongo.js)
- PRD: `prd/prd-spec.md`, `prd/prd-user-stories.md`
- Scorer stance: adversarial Staff Architect; every fix audited against the actual files, not the revision notes. Score reflects the documents as they stand now.
- Reality checks re-performed against `D:\Haven\e-cam-service` (go.mod, internal/ layout, ioc/gin.go, pkg/) and `D:\Haven\e-cam-web` (src/layouts/, src/router/).

**Final Score: 889/1000** (Breakdown-Readiness gate: 162/180 — **at or above 160, progression to /breakdown-tasks unblocked**)

---

## Iteration-2 Attack Verification (fix audit — verified, not assumed)

| Iter-2 attack | Verdict |
|---|---|
| Correction/clarification has no HTTP contract | **FIXED (real)** — api-handbook §2 `POST /api/v1/opsagent/chat/:sessionId/correct` with `{targetIntent+params}` / `{message}` mutually-exclusive body, 404/400 error rows; chat response gains `type=clarify`, `needsClarify`, `candidates: []IntentCandidate`; page-map `IntentCorrection` now cites the correct endpoint; tech-design names it as "「`IntentClassifier.Correct` 的唯一暴露端点」" with `sessions.correction_log`. |
| settings PUT body undefined; `preset_queries` no surface | **FIXED (real)** — §8 now defines a full PUT request table (llmProviders with write-only `apiKey`, notifyChannels, riskWhitelist with registry-validation 400, presetQueries with per-row validation and server-generated ids), partial-update semantics, and GET response includes `presetQueries: []PresetQuery`. er-diagram settings scope enum includes `preset_queries`. L2 degradation is now operable end to end. |
| Batch-status had no CAS | **FIXED (real)** — §5 request is now `items: []{id, expectedVersion}` (上限 50), with explicit per-item findAndModify `{_id, tenant_id, version}` + `$inc` semantics, `failed: []{id, reason, reasonCode, currentVersion?}` and "「绝不静默覆盖」". PRD Story-1 concurrency AC now holds on the batch path. |
| Auto-viewed transition had no trigger point | **FIXED (real, thorough)** — §6 defines the lazy transition on `GET /diagnosis/:id?riskEntryId=` as the "「唯一定义触发点」", narrow-state CAS (`status: "pending_view"` filter → `$set viewed` + `$inc version` + status_history append), idempotency, and the two-operator interleaving analysis (no silent overwrite in either order). |
| `compensations` missing from ER | **FIXED (real)** — COMPENSATIONS entity added to the mermaid erDiagram, entity-detail table, and `idx_comp_retry` listed in Index Design ("与 schema.mongo.js 一致"); modeling note explains why it has no relationship edges and names `internal/worker` as唯一属主. |
| StatCards aggregate contract gap | **FIXED (real)** — §3 response adds `stats: { pendingView, todayNew, highRisk }` with scope clarified ("与 items 筛选条件独立（固定按当前租户全量统计）"); page-map RiskTable updated ("含 stats 聚合"). |
| `ERR_INTENT_UNKNOWN` 200-vs-400 conflict | **FIXED (real)** — api-handbook error table now "200（降级）…与技术设计一致，不映射 400"; §1 Error Responses adds "意图无法解析不返回 400，一律走 200 降级". Both files agree. |
| `Diagnosis.Trace` divergence | **FIXED (real)** — tech-design Interface 3 `Diagnosis` now carries `Trace []TraceStep` with an explicit "与 api-handbook Diagnosis 同形" anchor; api-handbook's struct has the same field. |
| `RiskEntry` missing `version` | **FIXED (real)** — api-handbook `RiskEntry.Version int` with "expectedVersion 取自此字段"; er-diagram risk_entries `version int ≥ 1` with CAS findAndModify description; schema.mongo.js comment matches. |
| [blindspot] Sync 1-minute HTTP hold | **FIXED (real)** — tech-design adds "同步编排延迟预算（P1）" with per-stage budget table, 25s `http.Server` Read/WriteTimeout, and a 202 async fallback (`{sessionId, status: "running"}` + 2s polling of `GET /history?sessionId=`); api-handbook §1 documents the 202 row. The connection-pool exhaustion pattern is closed. **But the budget table introduces an arithmetic inconsistency — see Attack 1.** |
| [blindspot] Contract-testing tooling unspecified | **FIXED (real)** — "golden JSON 快照（`testdata/contracts/B1..B4/*.json`，随契约版本号入库…与 golden 做字段级 diff…纯标准库，无新增依赖）". Mechanism and artifact are now named. Residual: the runtime environment contract tests need (live e-cam-service vs recorded fixtures) is unstated (Testing deduction). |
| [blindspot] testcontainers not in manifest | **FIXED (real)** — "不引入 testcontainers——go.mod 无此依赖，P1 不新增", replaced with CI `mongo:7` 容器 + `MONGO_URI` + 复用 `pkg/mongox` (verified: `pkg/mongox` exists). |
| [blindspot] Webhook key management | **FIXED (partial)** — §9 now specifies env/secret-manager injection, "不入库不入码", and 双密钥并存滚动轮换（灰度 24h）. Residual: no replay protection (no timestamp/nonce/signature scheme) — header-key auth alone permits captured-request replay. |

**Carried over, still open** (not re-fixed this round; deductions retained, not increased):
- eiam integration form unverified: `ioc/gin.go` consumes eiam as an **in-process Go SDK** (`github.com/Duke1616/eiam/pkg/web/sdk` + `ecodeclub/ginx/session.Provider`), while the design commits HTTP edges (`MID --> Eiam`, `CTX --> Eiam`, contract B3 `verifyToken(token)`) and still defers to an Open Question ("eiam 具体验证端点与 token 载荷字段…M1 盘点确认").
- Notification-channel decision still open ("走 alert 模块的通知发送接口，还是 opsagent 直连渠道 webhook——M1…择一冻结") while `internal/notify` is drawn with a fixed `Notify` contract.
- Redis INCR budget vs Mongo `llm_usage` ledger: still no reconciliation rule (which source trips the degradation predicate after a Redis eviction/reset?).
- `ERR_PERSIST_FAILED → 200（提示）` envelope `code` still ambiguous (report generated but not saved — `code=0` or error code? how does the frontend distinguish?).
- Prompt-injection defense layer ① is still an unacknowledged marker blacklist ("剥离指令性标记（「忽略以上指令」「system:」等）"); no per-user LLM budget (one user can exhaust a whole tenant's budget).
- Internal package layout (`orchestrator/`, `worker/`, `risk/`, `baseclient/`) still never maps onto the convention's `internal/<mod>/{domain, repository/dao, service, web, module.go}` + `InitModule/RegisterRoutes` assembly pattern; sidebar insertion point still vague ("`e-cam-web/src/layouts/` 下主导航/侧边组件" — the directory contains only `MainLayout.vue`).
- Guided response ("预设话术与正确入口提示", PRD Flow C) still has no content source (no settings scope, no registry, no template store).

---

## Phase 1 — Reasoning Audit

- **Problem→Solution**: Sound and now well-bounded. Independent pure-orchestration service, single-process pipeline with 4 logical agent roles, honest single-instance constraint with an explicit P2 migration path, and a latency budget with an async escape hatch. The chain PRD → independent orchestrator → frozen HTTP contracts → contract tests is coherent.
- **Solution→Evidence**: Materially strengthened. Shared types are complete and anchored; the CAS mechanism is consistent across all four files; degradation L0–L3 has response shapes and a data source (`preset_queries`) with a management surface; the compensation loop has an owner. Residual: Part B base contracts remain shape-only with paths `{M1 冻结}` — acceptable as an explicit P1 deliverable, but `LogQueryResult.RiskScore *float64` is still asserted, not observed.
- **Evidence→Success Criteria**: All PRD ACs now trace to HTTP-realizable behavior (see PRD Coverage scoring). Residual: the guided-response content ("预设话术") has no source, and the L3 response discriminator conflicts across files (Attack 3).
- **Self-contradiction check**: Two new/remaining conflicts found this pass. (a) **L3 degrade type**: tech-design L3 row returns `type="degraded_notice"` while api-handbook §1 defines `type` as `report（正常/L1/L3）| preset_entries | guided | clarify` — L3 has no `degraded_notice` member in the API enum. (b) **alerts collection write trigger**: tech-design treats `alerts` as the overflow-retainment store ("告警原文（溢出时保留落 alerts）", "队列满时同步落 alerts"), while er-diagram models `raw_payload NOT NULL` + `dedup_conclusion new|merged` + `count 窗口内归并计数` + `window_start` — fields that only make sense if a document is written per alert arrival for window accounting. When is an `alerts` document written: on every arrival, per first-of-fingerprint, or only on overflow? The dedup worker cannot be implemented from these two files without guessing.
- **Arithmetic check**: the latency budget table's own stage caps sum to 25s (2 + max(8,5) + 12 + 3), not the stated "合计 ≤ 20s" (Attack 1).

---

## Phase 2 — Rubric Scoring

### 1. Architecture Clarity: 158/170

| Criterion | Score | Justification |
|---|---|---|
| Layer placement explicit (60) | 60 | "「编排层位于『应用编排层』：**只调用、不改写** Haven 底座数据面」" with capability-list mapping and the new-data boundary ("自身新增的仅有数据是「会话/诊断/风险待办/告警去重/LLM 用量」等编排产物"). |
| Component diagram present (60) | 56 | Full mermaid flowchart: 6 pages, 10 internal packages (worker node now carries "+ 落库补偿重试循环（compensations 唯一属主）"), 4 base modules, stores, externals, labeled DF001 edge. Deducted: the pipeline's internal steps are still not drawn or enumerated as units (page-map's ThinkingBlock promises "4 步编排进度（意图识别→查询→诊断→报告）" but the diagram shows only role edges `INT --> A1/A2/A3/A4`); `DegradationController` remains prose-only, not a diagram node. |
| Dependencies listed (50) | 42 | Internal/external tables with contract points and degrade strategies; stack claims verified on disk (gin v1.12.0, ego v1.2.6, mongo-driver v1.17.4, go-redis v9.18.0, `internal/logquery/llm/llm.go`, `pkg/mongox`). Deducted: eiam is still committed as HTTP edges (`MID --> Eiam`, `CTX --> Eiam`) against on-disk evidence that eiam is consumed in-process via the `github.com/Duke1616/eiam/pkg/web/sdk` library, with reconciliation deferred to an Open Question; notification-channel integration still undecided while `internal/notify` is drawn with a fixed contract; sidebar insertion point still vague against a layouts directory containing only `MainLayout.vue`. |

### 2. Interface & Model Definitions: 130/170 (er-diagram.md exists → db-schema: "yes")

| Criterion | Score | Justification |
|---|---|---|
| Interface signatures typed (40) | 38 | Five Go interfaces, all params/returns typed; Shared Types block defines every referenced composite with json tags. Deducted: `IntentClassifier.Correct(ctx, sessionID, target IntentType, params DiagnoseParams)` cannot express the API's `message`-based correction path (api-handbook §2: "「或以自然语言纠正（message）」") — the natural-language re-route has no backing interface method; `LLMRequest.Timeout time.Duration json:"-"` still embeds transport policy in a data DTO. |
| Inline models concrete (40) | 33 | Shared Types now genuinely concrete; `RiskEntry.Version` fixed; settings PUT fielded; masking rule and validation rules present. Deducted: the `alerts` collection lifecycle is contradictory (overflow-only per tech-design vs per-arrival window accounting per er-diagram) — the dedup/merge bookkeeping cannot be implemented without resolving it; guided response has a `type="guided"` discriminator but no payload/content source ("预设话术" storage undefined); `settings` PUT says "按字段部分更新" yet `llmProviders`/`presetQueries` are whole-list replacements — per-item merge semantics unstated. |
| ER diagram complete (30) | 26 | COMPENSATIONS added with correct modeling note; `risk_entries.notified` typed `object`; `llm_usage` grain note correct. Deducted: **`settings` has an entity-detail table but is absent from the mermaid erDiagram** (7 diagram entities vs 8 modeled collections); Index Design table omits five indexes present in schema.mongo.js (`idx_sessions_tenant_type`, `idx_dx_tenant_time`, `idx_alerts_tenant_time`, `idx_re_tenant_fingerprint`, `idx_re_dx`) — the schema script is a superset with no marked authority. |
| SQL DDL directly usable (30) | 27 | schema.mongo.js remains executable mongosh, tenant-prefixed, CAS index commented, sentinel tenant documented. Deducted: field constraints still prose-only ("此处 schema 仅作文档参考" — no `$jsonSchema`); `llm_usage` has no budget-limit field, so the observability `llmBudget.budgetLimit` value's source is still unmodeled. |
| Cross-layer consistency (30) | 6 | Iter-2's three conflicts verified fixed (ERR_INTENT_UNKNOWN, Diagnosis.Trace, RiskEntry.version). Two conflicts remain/new: (1) **L3 type discriminator** — tech-design: "`type="degraded_notice"`" vs api-handbook §1: "`report`（正常/L1/L3）" — the frontend cannot branch L3 rendering consistently; (2) **alerts write trigger** — tech-design "溢出时保留落 alerts" vs er-diagram `raw_payload NOT NULL` + `dedup_conclusion`/`count`/`window_start` (window accounting implies per-arrival writes). Per deduction rules (-30 per conflict, criterion capped at 30). |

### 3. Error Handling: 121/130

| Criterion | Score | Justification |
|---|---|---|
| Error types defined (45) | 45 | 11 named error codes with semantics, mirrored 1:1 in api-handbook's error table (including the half-success `ERR_QUEUE_FULL` and the non-error `ERR_INTENT_UNKNOWN`). |
| Propagation strategy clear (45) | 41 | Per-layer strategy complete: GuardedLLM non-blocking; step-level "无数据" evidence; baseclient closed loop; contract-drift dual path (user-side degrade + `opsagent_contract_drift_total{module}` with "10min 内同模块漂移 ≥3 次" escalation) explicitly decoupled from CI tests; persistence "Mongo 为准" with retry 2 → compensation → retry 5 → dead + alert, and the retry loop now has a named owner ("该循环是 `compensations` 集合的唯一读写属主，落库失败方只负责写入"). Deducted: the async alert path's terminal state when every pipeline step fails is still only implied (a risk_entry built entirely from "无数据" evidence is never stated); Redis-INCR vs Mongo `llm_usage` dual bookkeeping still has no reconciliation rule. |
| HTTP status mapped (40) | 35 | Table complete and now cross-file consistent (all 11 codes; 202 half-success precisely specified with `code=0` + `data.dropped=true`; 202 async chat fallback documented in both files with the 25s WriteTimeout ordering). Deducted: `ERR_PERSIST_FAILED → 200（提示）` still leaves the envelope `code` ambiguous — a chat response whose report was generated but not saved: `code=0` or an error code, and how does the frontend distinguish "saved" from "not saved"? |

### 4. Testing Strategy: 125/130

| Criterion | Score | Justification |
|---|---|---|
| Per-layer test plan (45) | 45 | Five layers with type/tool/what-to-test; storm (N≥100, fingerprint merge, queue overflow), tenant isolation, 409 concurrency, LLM-degradation injection, SC-7 three-module coverage all enumerated. |
| Coverage target numeric (45) | 45 | "≥ 80%" per layer + overall "80%（单元 + 集成）"; contracts "全量契约覆盖"; E2E "关键路径全量". |
| Test tooling named (40) | 35 | Go `testing`, CI `mongo:7` container + `MONGO_URI` + `pkg/mongox` (testcontainers explicitly rejected with reason), golden-JSON contract mechanism (`testdata/contracts/B1..B4/*.json`, field-level diff via `encoding/json`), `net/http/httptest`, Playwright. Deducted: the contract tests' runtime environment is unstated — golden snapshots require live e-cam-service responses to record, but CI topology (in-repo fixture replay vs live service dependency) is unspecified; Redis-dependent logic (dedup, budget) has no stated test double although `miniredis/v2` is already in go.mod. |

### 5. Breakdown-Readiness ★: 162/180 — **gate unblocked**

| Criterion | Score | Justification |
|---|---|---|
| Components enumerable (65) | 59 | Countable: 10 internal packages + 4 agent roles + 6 pages + 10 API endpoints + 8 collections; the compensation retry worker is now a named component with an owner; DegradationController is named in prose. Deducted: pipeline steps still not designed as units (ThinkingBlock's 4-step progress has no step-level component contract); `loadHistory` "内存环形缓冲" remains a componentless feature. |
| Tasks derivable (65) | 57 | Every iter-2 task-staller is resolved: correction endpoint, settings PUT body, preset_queries surface, batch CAS, auto-viewed trigger, StatCards aggregate — all now implementable contracts. Remaining stallers: (a) guided-response content source undefined — the guided-response task cannot be scoped; (b) `internal/notify`'s task remains unscoped while the channel decision ("走 alert 模块的通知发送接口，还是直连 webhook") is open; (c) the message-based correction path has no interface method behind it (who re-classifies `message` within the session?). |
| PRD AC coverage (50) | 46 | Coverage map rows now backed by real contracts: three-level degradation (L1/L2/L3 with response shapes + data source), Story-2 clarification/correction over HTTP, Story-1 batch per-item CAS ("部分失败时仅成功条目变更…回显失败清单…重试失败项" → `failed` + reasonCode + retry entry), auto-viewed trigger, citation click-back validation, empty-result disclosure (Total/Truncated + trace summaries), notify retry/failure-rate (NotifyResult.Attempts). Remaining gaps: guided-response "预设话术与正确入口提示" content source undefined; PRD's "超出提示用户缩小范围" for >24h chat timeframes has no designed response shape (only L2 preset validation 400s). |

### 6. Security Considerations: 75/80

| Criterion | Score | Justification |
|---|---|---|
| Threat model present (40) | 40 | Five named threats with severities (高危写执行 Critical, 跨租户串库 Critical, Prompt Injection High, LLM 成本风暴 High, 契约漂移 Medium) — specific scenarios, not boilerplate. |
| Mitigations concrete (40) | 35 | Each threat paired: deterministic risk registry ("LLM 输出不得改变档位、不得引入未注册工具"), three-layer injection defense + output-side citation validation ("越界丢弃"), tenant forced override, storm guards (SET NX + TTL 10min, 并发5, 队列100, 滚动预算), contract freeze + tests + runtime drift metric, audit trail; webhook key now has injection + dual-key rotation design. Deducted: injection layer ① remains a naive marker blacklist with no false-positive/negative acknowledgment; no replay protection on the webhook (no timestamp/nonce/signature); no per-user LLM budget (a single user can exhaust the tenant's rolling budget, denying the rest of the tenant). |

### 7. Implementation Feasibility: 118/140

| Criterion | Score | Justification |
|---|---|---|
| Dependencies available (50) | 46 | Verified in go.mod: gin v1.12.0, ego v1.2.6, mongo-driver v1.17.4, go-redis v9.18.0, miniredis/v2; `pkg/mongox` exists; testcontainers correctly excluded; "不新增消息队列中间件" is dependency-disciplined. Deducted: eiam consumption still assumed as HTTP `verifyToken` against on-disk evidence of in-process SDK usage (`ioc/gin.go` imports `eiam/pkg/web/sdk`, `ginx/session`), unresolved and deferred to M1 while the diagram commits the edges. |
| Architecture fits project structure (50) | 44 | Independent service on the exact stack; `/api/v1/opsagent` prefix consistent with conventions; "独立服务内重新实现同语义封装，不跨模块 import" respects module boundaries; single-instance constraint honestly bounded with a P2 Redis-shared-queue path. Deducted: internal package layout still never maps onto the convention's `internal/<mod>/{domain, repository/dao, service, web, module.go}` + `InitModule(db,logger)`/`RegisterRoutes` assembly pattern — a new service author must invent the wiring. |
| Technical claims grounded (40) | 28 | The sync-hold fix is real (per-stage budgets, 25s server timeouts, 202 fallback with polling — the connection-exhaustion pattern is closed). Deducted: (a) the budget table's stage caps sum to 25s (2 + max(8,5) + 12 + 3) against the stated "合计（编排侧硬预算）≤ 20s" — an internal arithmetic inconsistency; either a stage must shrink or the doc needs an explicit trim rule for which stage is cut when the sum exceeds the cap (-6); (b) Redis-INCR budget vs Mongo `llm_usage` ledger remains dual-sourced with no reconciliation rule and no eviction story (-3); (c) golden-JSON contract tests presuppose recorded live e-cam-service responses with no stated capture/replay environment (-3). |

**Implementation Feasibility total: 46 + 44 + 28 = 118/140**

---

## Phase 3 — Blindspot Hunt

1. **[blindspot] The latency budget contradicts its own arithmetic.** tech-design: "「合计（编排侧硬预算）**≤ 20s**」" — but the stage rows sum to 2 + max(8, 5) + 12 + 3 = **25s**. As written, a fully-degraded-free path that hits every stage cap exceeds the stated hard budget by 25%, and the doc gives no rule for which stage is trimmed when the sum exceeds the cap (does the 12s LLM stage get cut to 7s mid-flight? is the 202 fallback the trim?). Must either reduce stage caps to sum ≤ 20s or state the trim/fallback precedence explicitly.
2. **[blindspot] The `alerts` collection has two contradictory write triggers.** tech-design: "`Raw map[string]any … // 告警原文（溢出时保留落 alerts）`" and "「高危告警不丢弃，队列满时同步落 `alerts`」" — overflow-only persistence. er-diagram: "`raw_payload | object | NOT NULL`" with "`dedup_conclusion | enum: new\|merged`", "`count | 窗口内归并计数`", "`window_start | 滚动窗口起点`" — fields that presuppose a document per alert arrival (or per first-of-fingerprint) for window accounting. The dedup worker — the heart of storm protection — cannot be implemented without deciding when `alerts` rows are written; the "「去重窗口记帐」" mentioned in the single-instance section lives nowhere concretely.
3. **[blindspot] L3 degrade response type is undefined in the API contract.** tech-design L3 row: "`degradeLevel=3, degraded=true, type="degraded_notice"`"; api-handbook §1: "`type | string | report（正常/L1/L3）| preset_entries（L2）| guided | clarify`". The API enum has no `degraded_notice` member — the frontend implementer of the degradation badge has two contradictory specifications for the most safety-critical response shape in the system (the one that must "「绝不返回看似正常的编造内容」").
4. **[blindspot] `IntentClassifier.Correct` cannot serve the `message` correction path the API exposes.** api-handbook §2: "「或以自然语言纠正（`message`）」" with `{targetIntent+params}` / `{message}` 二选一; tech-design interface: "`Correct(ctx context.Context, sessionID string, target IntentType, params DiagnoseParams) (IntentResult, error)`" — no message parameter, no stated re-classification flow. A developer implementing §2's `message` branch must invent behavior the interface does not define.
5. **[blindspot] Guided-response content has no source.** PRD Flow C: "「返回引导式回应：明示『这是 X 类问题，请走 Y 渠道/系统』，给出预设话术与正确入口提示」". The design defines `type="guided"` and `IntentOutOfScope` but no template store, settings scope, or registry holding the per-category话术 and entry links. Three iterations in, the third PRD scenario's payload is still unspecified.
6. **[blindspot] Contract-test environment is self-referential.** "「实测响应经 `encoding/json` 反序列化后与 golden 做字段级 diff」" — golden files are recorded from real responses, but B1–B4 paths are `{M1 冻结}` and no environment (live e-cam-service in CI? recorded fixtures? a stub server?) is named for either recording or replaying them. As written, the CI contract test — a P1 explicit deliverable — has no runnable home.

---

## Score Summary

| Dimension | Score |
|---|---|
| Architecture Clarity | 158/170 |
| Interface & Model Definitions | 130/170 |
| Error Handling | 121/130 |
| Testing Strategy | 125/130 |
| Breakdown-Readiness ★ | 162/180 |
| Security Considerations | 75/80 |
| Implementation Feasibility | 118/140 |
| **Total** | **889/1000** |

Gate: Breakdown-Readiness 162 ≥ 160 → **unblocked**. Residual defects to fix before freeze (all localized, none structural): budget-table arithmetic (≤20s vs 25s sum), alerts-collection write trigger, L3 `type="degraded_notice"` vs API enum, `Correct` message-path interface gap, guided-response content source, contract-test environment, eiam integration form, notification-channel decision, ERR_PERSIST_FAILED envelope code.
