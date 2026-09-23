# PRD Evaluation Report — Haven 运维 Agent (Iteration 1)

- **Mode**: A (feature has UI surface; `prd-ui-functions.md` present)
- **Scorer**: Senior QA Engineer (adversarial stance)
- **Date**: 2026-09-23
- **Documents evaluated**:
  - `F:\AiOpsAagent\docs\features\haven-opsagent\prd\prd-spec.md`
  - `F:\AiOpsAagent\docs\features\haven-opsagent\prd\prd-user-stories.md`
  - `F:\AiOpsAagent\docs\features\haven-opsagent\prd\prd-ui-functions.md`

---

## Total Score: 827 / 1000

| # | Dimension | Score | Max |
|---|-----------|-------|-----|
| 1 | Background & Goals | 95 | 100 |
| 2 | Flow Diagrams | 140 | 150 |
| 3 | Functional Specs | 170 | 200 |
| 4 | User Stories | 185 | 200 |
| 5 | Scenario Completeness | 75 | 150 |
| 6 | Edge Case Coverage | 72 | 100 |
| 7 | Scope Clarity | 90 | 100 |
|   | **Total** | **827** | **1000** |

---

## Dimension 1: Background & Goals — 95/100

### Background has three elements (28/30)
Reason / Target / Users all present and specific. "Why" cites concrete baselines: "月均告警约 3000 条、单次「告警→定位」人工串联 20–40 分钟、每月 60–100 人时耗在机械串联、MTTR 1–2 小时、同类告警重复占比 ≥ 30%". **Deduction (-2)**: every baseline number is explicitly unverified — "基线运营指标（初估，P1 启动前以 alert/audit 历史数据核实）". A baseline that is "初估" (rough estimate) means the improvement targets anchored to it (≤1 min vs "20–40 分钟") rest on unverified data. The doc self-flags this, which is honest, but until verified the numbers are estimates, not evidence. (-2, not -20, because the doc quantifies a verification plan rather than leaving it vague.)

### Goals are quantified (30/30)
Multiple numeric targets: "端到端 ≤ 1 分钟", "成功率 ≥ 99%", "落库完整率 100%", "1 分钟内可检索". Criterion satisfied.

### Background–goal logical consistency (37/40)
Goals follow from the stated problem (manual cross-system switching → automated orchestration). **Deduction (-3)**: Goal 3 is explicitly non-quantified — "以「无需人工跨系统切换」为定性目标" — while every other goal has a metric. A goal table containing one admittedly qualitative row weakens the "Goals are quantified" story; no acceptance criteria anywhere test "无需人工跨系统切换".

---

## Dimension 2: Flow Diagrams — 140/150

### Mermaid diagram exists (50/50)
`flowchart TD` present with labeled decision branches.

### Main path complete (40/50)
Happy path covers Start → Trigger → Dialog/Probe → Orchestrate → Diagnose → LLM → Report → Persist → RiskCenter → Ack → End. **Deduction (-10)**: the `Persist --> RiskCenter` edge conflates two different artifacts — every chat conversation AND every guided reply (`Guide --> Persist`) funnels into the risk center node. Per spec, the risk center holds "告警主动触发产生的诊断条目" (UF-2 Description), not chat sessions or guidance replies. The diagram's single Persist→RiskCenter edge contradicts the UI spec's data source ("编排层/落库 ... 告警主动触发诊断") and implies chat diagnostics also become risk-center to-dos, which no text states. This is a semantic defect a downstream implementer could faithfully build wrong.

### Decision points + error branches (50/50)
Diamonds: Trigger, StormCheck, Intent, LLM, HighRisk, Ack. Error/exception branches present: "Fallback[三级降级]", "RuleOnly[返回纯规则结论]", Merge path for duplicate fingerprints. Criterion fully met.

Additional nit (not scored separately): `Intent -->|LLM 不可用| Fallback` models LLM availability as an intent-classification outcome, mixing concerns — intent recognition and LLM report generation are separate stages in the text ("编排层按意图调用底座… → LLM 解读").

---

## Dimension 3: Functional Specs — 170/200 (evaluates prd-ui-functions.md)

### Placement & Interaction completeness (55/70)
Every UI Function has Placement (Mode/Target/Position) and a User Interaction Flow; Navigation Architecture defines primary nav, secondary pages, and back-navigation rules. **Deductions (-15)**:
- "历史诊断回溯" is declared a secondary page ("Secondary Pages: 历史诊断回溯") but has **no UI Function definition** — no fields, no states, no validation rules. A downstream designer cannot build it from this document. The navigation rule "Every navigation target must correspond to a page defined in this document" is technically satisfied (it's in Secondary Pages) but the page has zero functional spec.
- UF-1's interaction flow covers only the happy path: "用户输入问题 → 发送 → … → 展示诊断报告卡片 → 用户点击结论行 → 展开数据源引用". The 降级/错误/引导式回应 states exist only in the States table; the flow text never branches, so the interaction path through degradation is not specified (e.g., can the user re-send from degraded mode? does the预置查询入口 open in-page?).

### Data Requirements & States clarity (60/70)
Field tables with Type/Source/Notes per UF; state tables with triggers per UF. **Deductions (-10)**:
- UF-2 "处理状态 | 枚举 | **本地标记**" contradicts the persistence model: prd-spec says "状态仅记录值班处理进度" and sessions are "完整落库，1 分钟内可按租户/时间/服务名检索", and Story 1 expects state transitions to be observable. "本地标记" reads as client-local state, which would not survive device/worker changes. Source of truth for the state machine is ambiguous. (-5, vague/unverified source)
- UF-2 has no volume/pagination requirement. In-scope includes alert-storm scenarios (thousands of alerts/month, dedup windows); the list spec says only "按时间倒序列表展示" with no page size, windowing, or max-load statement. (-5)

### Validation Rules explicit (55/60)
Actionable and mostly quantified: "空输入不可发送", "输入超长（> 500 字符）提示精简", "筛选按租户强制注入当前登录租户". **Deduction (-5)**: no validation rules for the filter inputs (time-range validity, malformed service name, reversed time window) and no rule for what happens when the same entry is marked 已处理 twice or marked in batch while the list refreshes.

---

## Dimension 4: User Stories — 185/200

### Coverage: one story per target user (50/50)
Both "Who" roles covered: 一线值班运维 (Stories 1–2), 资深运维/SRE (Story 3).

### Format correct (50/50)
All three stories follow As a / I want / So that; verbs are concrete (查看/筛选/标记/检索/回指), no "manage/handle" vagueness.

### AC per story in Given/When/Then (50/50)
All stories carry multiple G/W/T ACs, including negative ACs (LLM unavailable, out-of-capability intents).

### AC verifiability & boundary coverage (35/50)
Generally testable: "Then 我在 1 分钟内（端到端，含 LLM 解读）收到…", "Then 该条目状态流转为「已处理」，且不触发任何写操作", "Then …不跨租户可见" — each Then is objectively checkable. **Deduction (-15)** — key behaviors shipped in scope have **no AC at all**:
1. **Alert-storm protection is never tested.** Scope commits "告警风暴防护（指纹聚合去重 / 并发上限 / LLM 调用预算）" and Flow B defines "队列溢出 → 丢弃低级别告警排查", yet Story 1 only uses dedup as a *Given precondition* — no AC asserts "duplicate fingerprint within window produces exactly ONE diagnosis item" or "queue overflow preserves alert原文". A core in-scope feature with zero acceptance criteria.
2. **Batch marking has no AC.** UF-2 promises "支持批量标记已读/已处理" but no story covers batch operations (partial failure during batch? marking items the user hasn't opened?).
3. **No boundary AC for the 500-char input limit or empty query results** — the limit exists only in the UI validation list, never exercised by any AC.

---

## Dimension 5: Scenario Completeness — 75/150

### End-to-end scenario coverage (50/60)
Main scenarios cover trigger → final state: dialog troubleshooting (S1), alert proactive (S2), guidance (S7), risk-center handling, history retrieval. **Deduction (-10)**:
- The alert-storm scenario is truncated: Flow B names "队列溢出 → 丢弃低级别告警排查、保留告警原文与去重结论" but never describes the end state — where do discarded alerts surface? Can a on-call operator later see that an alert was dropped? Scenario is half-described.
- The 历史诊断回溯 scenario lacks its full lifecycle (entry criteria, what a "session" boundary is for a multi-turn conversation, exit state).

### Implicit assumptions surfaced (25/40)
Some surfaced well (LLM availability, LLM budget, dedup windows, P1 read-only constraint). **Deduction (-15)** for unstated prerequisites that scenarios silently rely on:
- **Data retention / storage growth is never addressed.** With "月均告警约 3000 条" plus every chat "完整落库", storage grows unboundedly; no retention period, no archive policy, no size limit. The "1 分钟内可检索" goal has no stated data-volume ceiling.
- **LLM provisioning is assumed, never specified**: who supplies the model, token limits, latency SLA of the LLM itself (the ≤1 min end-to-end goal depends on it).
- **Role/permission model beyond tenant is unstated**: 一线值班运维 and 资深运维/SRE are distinct users, but every AC treats them identically; nothing says whether SRE sees more (e.g., 编排调用链) than 一线. UF-3 says 调用链 is "供 SRE 二次核实" — is the调用链 hidden from 一线? Unstated.

### Business-rules consistency (0/50)
**Deduction (-30, cross-section conflict)**: the risk-item state machine is named inconsistently across sections. prd-spec defines "`待查看` → `已查看` → `已处理`", and UF-2's data table uses "待查看 / 已查看 / 已处理" — but UF-2's Description and Story 1 both say 标记「**已读**/已处理」. "已读" vs "已查看" are never reconciled; a test written from Story 1 will use a state name that doesn't exist in the state machine.
**Deduction (-20, ambiguous rule)**: the tenant filter is self-contradictory. Scope: "按租户/时间/服务名筛选"; Story 1: "When 我按租户 / 时间 / 服务名筛选"; but UF-2 Validation: "筛选按租户强制注入当前登录租户，不可跨租户查询". If tenant is always forced to the login tenant, a user-facing tenant filter is a no-op — either it doesn't exist (then two sections describe a filter that can't be built) or it exists with undefined semantics. Undefined rule = -20.

---

## Dimension 6: Edge Case Coverage — 72/100

### Error paths documented (30/40)
Strong set: "LLM 不可用 → 三级降级", "底座接口超时 → 返回确定性规则引擎结论", "LLM 预算耗尽 → 降级纯规则结论", "队列溢出 → 丢弃低级别告警排查", UI error states with retry ("底座接口超时且无可回退结论", "接口异常"). **Deduction (-10)**:
- **Intent-recognition failure path missing**: what happens when the classifier can't confidently route between 排障诊断 / 资源查询 / 超能力意图? No low-confidence branch, no clarification-prompt behavior.
- **Prompt injection unaddressed**: natural-language input feeds an LLM that can read cross-system ops data. Security section covers tenant leakage on output ("LLM 回复引用校验越界丢弃") but nothing about adversarial input shaping the LLM's tool calls.

### Boundary conditions covered (25/35)
Present: 500-char input cap, "并发上限默认 5，超出排队", per-hour LLM budget. **Deduction (-10)**:
- **Empty data results unspecified**: logquery/asset queries returning zero rows (e.g., service emitted no logs in window) — no defined report behavior ("insufficient data" state? empty-state copy?). Chat states table has no "无数据" state.
- **No upper bound on query time windows**: examples use "最近一小时" but nothing limits "帮我看看过去一年"; large-dataset log queries (the explicit rubric item) are unaddressed.

### Failure recovery described (17/25)
Degradation paths include what the user sees and can do (retry buttons, "明示降级模式" + 预置查询入口). **Deduction (-8)**:
- **Persistence failure unrecoverable**: if "会话与诊断落库" fails, does the diagnosis still display? Is the risk-center item created? The "落库完整率 100%" goal has no stated failure handling — and the history-retrieval AC ("1 分钟内检索到") silently assumes persistence succeeded.
- **Partial source failure unspecified**: report when logquery succeeds but asset query times out — is the conclusion marked partial? Nothing said.

---

## Dimension 7: Scope Clarity — 90/100

### In-scope items are concrete deliverables (35/35)
Every bullet is a specific capability ("对话式排障助手", "告警主动触发", "底座接口契约文档 + 契约测试（P1 显式交付物）"). No vague areas.

### Out-of-scope explicitly lists deferred items (30/30)
Named with phase tags: "写操作执行 / 高危人工确认执行流（P3）", "历史故障库 + SOP 语义检索（P2）", "CI/CD 数据源接入（P3）", plus a pointer to the proposal doc.

### Scope consistent with functional specs and user stories (25/35)
**Deduction (-10)**:
- **Batch marking is in the UI spec but absent from scope and stories**: Scope defines risk-center P1 interaction as "查看详情、标记已读/已处理、按租户/时间/服务名筛选（仅展示+状态标记，无确认执行）" — no 批量. UF-2 adds "支持批量标记已读/已处理". Either scope under-lists a deliverable or UF-2 over-delivers; the two disagree.
- **历史诊断回溯 page** appears in Navigation Architecture and in-scope ("会话与诊断结果落库回溯") but has no UI Function spec — scope claims it, specs don't describe it.

---

## [blindspot] Attacks

1. **[blindspot][Functional Specs/User Stories] Alert-storm protection is a deliverable with zero acceptance criteria.** Scope: "含告警风暴防护（指纹聚合去重 / 并发上限 / LLM 调用预算）" — no story, no AC, no test scenario verifies dedup produces one diagnosis per fingerprint window, that concurrency caps at 5, or that budget exhaustion degrades. This is the exact pattern of "feature listed, never testable" that produces unverified production behavior during the next alert storm — precisely when it matters.
2. **[blindspot][Scenario Completeness] Unbounded persistence with no retention policy.** "会话内容 + 诊断报告 + 数据源引用" persisted "每次诊断", at "月均告警约 3000 条" plus chat volume, with "落库完整率 100%" — and no retention, archival, or storage-capacity statement anywhere. The "1 分钟内可按租户/时间/服务名检索" goal will silently degrade as volume grows.
3. **[blindspot][Edge Case Coverage] Prompt-injection surface unaddressed.** UF-1 invites arbitrary natural language ("用户以自然语言输入排障问题") into an LLM that can invoke orchestration (logquery/asset queries) under the user's tenant context. Security Requirements only cover output-side tenant leakage ("LLM 回复引用校验越界丢弃"); input-side injection defense is absent.
4. **[blindspot][Functional Specs] 历史诊断回溯 page is referenced but unspecified.** Navigation Architecture: "历史诊断回溯 | UF-1「历史诊断」入口（对话页）或风险中心检索" — no Placement, no Interaction Flow, no Data Requirements, no Validation Rules exist for it anywhere in prd-ui-functions.md. A downstream ui-design agent cannot execute this step.
5. **[blindspot][Edge Case Coverage] Intent-classification low-confidence path missing.** Scope commits "将用户意图分类到「排障诊断 / 资源查询 / 超能力意图」" but no branch handles ambiguous/low-confidence classification; the degradation ladder (三级降级) only covers LLM unavailability, not intent uncertainty. Misrouting a dev-consultation question into a logquery call is an unhandled, user-visible failure.
6. **[blindspot][User Stories] No AC exercises any boundary value.** The 500-char input limit, zero-result queries, max time window, batch-mark on empty selection — all exist only as UI validation bullets or are simply absent; no Given/When/Then ever pushes a limit. Per the QA failure pattern: happy path tested, boundaries untested.

---

## Deduction Ledger

| Dimension | Deduction | Reason (quote) |
|-----------|-----------|----------------|
| Background & Goals | -2 | "基线运营指标（初估，P1 启动前以 alert/audit 历史数据核实）" |
| Background & Goals | -3 | "以「无需人工跨系统切换」为定性目标" |
| Flow Diagrams | -10 | `Guide --> Persist` + `Persist --> RiskCenter` vs "告警主动触发产生的诊断条目" |
| Functional Specs | -15 | "历史诊断回溯" secondary page with no UI Function spec; UF-1 flow happy-path only |
| Functional Specs | -10 | "处理状态 \| 枚举 \| 本地标记"; no list pagination/volume spec |
| Functional Specs | -5 | No filter-input validation rules |
| User Stories | -15 | No AC for storm protection / batch marking / boundary values |
| Scenario Completeness | -10 | Storm-overflow and history-retrieval scenarios truncated |
| Scenario Completeness | -15 | Retention, LLM provisioning, role permissions unstated |
| Scenario Completeness | -30 | "已读" (Story 1/UF-2) vs "已查看" (state machine/UF-2 table) |
| Scenario Completeness | -20 | Tenant filter forced ("强制注入当前登录租户") vs user-facing "按租户…筛选" |
| Edge Case Coverage | -10 | Intent low-confidence + prompt injection missing |
| Edge Case Coverage | -10 | Empty results + unbounded time windows |
| Edge Case Coverage | -8 | Persistence failure + partial source failure unhandled |
| Scope Clarity | -10 | UF-2 "支持批量标记已读/已处理" not in scope/stories; history page undescribed |
| **Total deducted** | **-173** | |
