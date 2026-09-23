# PRD Evaluation Report — Haven 运维 Agent (Iteration 1)

- **Mode**: A (prd-ui-functions.md present)
- **Scorer**: Adversarial PM review
- **Date**: 2026-09-23
- **Total: 820/1000** (rubric target: 900)

| Dimension | Score | Max |
|-----------|-------|-----|
| 1. Background & Goals | 90 | 100 |
| 2. Flow Diagrams | 140 | 150 |
| 3. Functional Specs | 135 | 200 |
| 4. User Stories | 180 | 200 |
| 5. Scenario Completeness | 125 | 150 |
| 6. Edge Case Coverage | 80 | 100 |
| 7. Scope Clarity | 70 | 100 |
| **Total** | **820** | **1000** |

---

## 1. Background & Goals — 90/100

### Criterion: Background has three elements (0-30) → 30

Reason (Why), Target (What), Users (Who) all present and specific. The Why grounds the problem in a concrete deficiency: "现有 OpsAgent 只是一套脱离真实运维平台的「空壳」". Users are split into two concrete roles. Full marks.

### Criterion: Goals are quantified (0-30) → 25

Three of four goals carry numeric targets (≤1 min, ≥99%, 100% retrieval). **-5**: the third goal is explicitly unquantified — "减少人工机械串联 … 以「无需人工跨系统切换」为定性目标". Declaring it qualitative does not make it verifiable; a PM cannot fail this goal objectively. Additionally the baseline it would be measured against is admitted to be unverified: "基线运营指标（初估，P1 启动前以 alert/audit 历史数据核实）" — every goal is calibrated against a baseline that does not yet exist.

### Criterion: Background and goals logically consistent (0-40) → 35

Goals follow from the stated problem (manual cross-system switching → orchestration; MTTR → 1-min end-to-end). **-5**: goal definitions are not self-contained — metric 口径 is delegated to an external document: "指标口径：端到端含报告组装（proposal SC-1）", "成功率 ≥ 99%（proposal SC-2）", "落库完整率 100%（proposal SC-5）". A PRD whose acceptance numbers are defined in another file cannot be scored or tested standalone; the external doc is outside this evaluation set and may drift.

## 2. Flow Diagrams — 140/150

### Criterion: Mermaid diagram exists (0-50) → 50

Valid `flowchart TD` present with labeled branches.

### Criterion: Main path complete (0-50) → 45

Happy path runs 开始 → 触发 → 编排 → 诊断 → 报告 → 落库 → 风险中心 → 结束 for both trigger modes. **-5**: the timeout branch described in text is absent from the diagram — "底座接口超时 → 返回确定性规则引擎结论" has no corresponding edge (the only failure edge into `RuleOnly` is `LLM -->|不可用|`); likewise Main Flow B's "队列溢出 → 丢弃低级别告警排查" and "LLM 预算耗尽 → 降级纯规则结论" appear nowhere in the diagram. The diagram does not fully cover the flows the text commits to.

### Criterion: Decision points + error branches (0-50) → 45

Diamonds (`Trigger`, `StormCheck`, `Intent`, `LLM 可用?`, `HighRisk`, `Ack`) and error branches (Fallback, RuleOnly) exist. **-5**: the edge `Intent -->|LLM 不可用| Fallback` is semantically wrong — LLM availability is not an intent-classification outcome; it is a runtime condition. As drawn, intent recognition determines LLM availability, which contradicts Flow A where degradation happens after orchestration. Misleading model that an implementer could follow literally.

## 3. Functional Specs (prd-ui-functions.md) — 135/200

### Criterion: Placement & Interaction completeness (0-70) → 40

All three UI Functions have Placement blocks. **-30 (cross-section inconsistency)**: the Navigation Architecture declares a page the document never defines — Secondary Pages table lists "历史诊断回溯" with entry "UF-1「历史诊断」入口（对话页）或风险中心检索", and UF-1's interaction flow says "用户可跳转「历史诊断」回溯" — but there is no UI Function, no States table, no Data Requirements, and no Page Composition row for it. This violates the document's own Navigation Rule: "Every navigation target must correspond to a page defined in this document". A developer cannot build this page from this spec. Further, UF-1's generation-mode is left undecided: "支持流式/异步展示报告生成状态" — streaming or async polling is an either/or the PRD leaves open (-implicit ambiguity, accounted here).

### Criterion: Data Requirements & States clarity (0-70) → 45

Field tables have sources. **-30 (cross-section inconsistency)**: UF-1's status enum is "排查中 / 完成 / 降级" but the States table adds two more display states — "引导式回应" and "错误（底座接口超时且无可回退结论）" — which have no corresponding value in the data model that drives the UI. The rendering logic has no defined input for two of its five states. **-15 additional**: types are unactionably loose — "会话消息列表: 文本流", "诊断报告: 结构化 JSON" with no field list beyond "根因、处置建议、数据源引用数组"; UF-2's "诊断条目列表" lists six attributes but the risk score semantics (scale? thresholds? who maps 风险分 → 高危/低危/只读?) are never defined.

### Criterion: Validation Rules explicit (0-60) → 50

UF-1 rules are actionable and quantified ("输入超长（> 500 字符）提示精简"). **-10**: UF-2 and UF-3 "validation rules" are access constraints, not validations — "筛选按租户强制注入当前登录租户" and "数据源引用不可跨租户回显" describe authorization behavior; neither function defines input validation (e.g., filter time-range limits, invalid `:id` handling is only a State, not a rule). UF-2's interaction flow also never exercises its own error state.

## 4. User Stories — 180/200

### Criterion: Coverage — one story per target user (0-50) → 50

Background roles 一线值班运维 (Stories 1, 2) and 资深运维/SRE (Story 3) both covered.

### Criterion: Format correct (0-50) → 50

All three stories follow As a / I want / So that with concrete verbs (查看、筛选、标记、回溯).

### Criterion: AC per story in Given/When/Then (0-50) → 50

Every story has multiple GWT ACs.

### Criterion: AC verifiability & boundary coverage (0-50) → 30

"1 分钟内" and "不触发任何写操作" are testable. **-10**: the intermediate state is untested — the state machine in prd-spec.md defines "`待查看` → `已查看` → `已处理`" and UF-2 offers "支持批量标记已读/已处理", yet Story 1's only marking AC is "When 我标记「已处理」Then 该条目状态流转为「已处理」"; neither 已查看 nor batch semantics has an AC. **-10**: no boundary/error ACs for input ambiguity — Story 2 only covers well-formed questions ("含服务名 + 时间范围 + 现象"); nothing defines behavior when intent classification is ambiguous or low-confidence, which is the single most failure-prone step in the chain. Story 3 has no failure ACs (no results found, missing citations in a degraded-mode report).

## 5. Scenario Completeness — 125/150

### Criterion: End-to-end scenario coverage (0-60) → 50

Flows A/B/C each run trigger → final state, including persistence and rollback-to-rule behavior. **-10**: the alert-push scenario stops at "推送风险中心" and never describes the on-duty user's experience between trigger and appearance — no visibility SLA ("排查中" entries in 风险中心 are not a defined state, only "有数据/空"), and Story 1's Given already presumes 排查完成.

### Criterion: Implicit assumptions surfaced (0-40) → 25

**-20**: significant unstated prerequisites: (a) LLM deployment model — ops/tenant data is fed to an LLM ("LLM 解读并组装报告"), yet Security Requirements only address the return path ("LLM 回复引用校验越界丢弃"); whether the LLM is internal, which vendor, and what data may leave the boundary are absent. (b) Authorization model — pages /opsagent/* have no role/permission definition; tenant scoping is specified but nothing says whether 一线 and SRE see identical data. (c) Intent misclassification recovery — the system routes on "意图分类识别为「超能力意图」" with no correction path when a legitimate troubleshooting question is misrouted.

### Criterion: Business-rules consistency (0-50) → 50

No contradiction found with stated constraints: topology/audit/order are Out of Scope (P2) and consistently answered with 引导式回应 instead of integration; P1 "仅展示+状态标记，无确认执行" is honored across scope, diagram, UI functions, and stories.

## 6. Edge Case Coverage — 80/100

### Criterion: Error paths documented (0-40) → 35

Strong: LLM 三级降级, 底座超时 fallback, "队列溢出 → 丢弃低级别告警排查、保留告警原文与去重结论", 跨租户 → "不存在" state. **-5**: intent-recognition failure/low-confidence path entirely missing, and permission-denied on /opsagent pages is unaddressed.

### Criterion: Boundary conditions covered (0-35) → 25

Good: 并发上限默认 5, LLM 每滚动 1 小时预算, >500 字符输入, 指纹聚合去重. **-10**: dataset boundaries ignored — 风险中心 "按时间倒序列表展示" has no pagination, page size, or retention window, so unbounded growth is unspecified; concurrent marking of the same entry by two on-duty users is unaddressed.

### Criterion: Failure recovery described (0-25) → 20

Retry affordances exist ("错误提示 + 重试"), degraded modes are themselves recovery paths. **-5**: discarded low-level alert investigations have no later recovery — "保留告警原文与去重结论" but nothing ever re-runs them after the storm subsides or the budget resets.

## 7. Scope Clarity — 70/100

### Criterion: In-scope items are concrete deliverables (0-35) → 35

Each item is a specific capability with boundaries (e.g., "风险中心 P1 交互：查看详情、标记已读/已处理…仅展示+状态标记，无确认执行").

### Criterion: Out-of-scope explicitly listed (0-30) → 30

Six named exclusions with phase tags (P2/P3).

### Criterion: Scope consistent with specs and stories (0-35) → 5

**-30 (cross-section inconsistency)**: Goal 2's metric implies a delivery channel that appears nowhere in scope: "外部渠道推送成功率单独统计 ≥ 99%（proposal SC-2）". In Scope only commits "推送「结论 + 分级处置预案」到风险中心"; no UI function, flow, or story covers any external-channel push (IM/email/webhook). Either the metric counts something out of scope, or a scope item is missing. **(-5 additionally)**: the 历史诊断回溯 page is used by stories and navigation but is not an In-Scope line item.

---

## Blindspot Hunt

1. `[blindspot]` [Functional Specs / Navigation] The document violates its own navigation rule. Quote: "Every navigation target must correspond to a page defined in this document" — yet "历史诊断回溯" is a Secondary Page with no UI Function and no Page Composition row. **Fix**: define UF-4 (placement, states, data, validation) for 历史诊断回溯 and add it to Page Composition.

2. `[blindspot]` [User Stories] The 已查看 state is unreachable in acceptance terms. Quote: prd-spec defines "`待查看` → `已查看` → `已处理`" but Story 1 only asserts "该条目状态流转为「已处理」". **Fix**: add GWT ACs for marking 已读 (single and batch) and for partial batch failure.

3. `[blindspot]` [Scenario Completeness] Intent misclassification has no recovery loop. Quote: "When 意图识别判定为「超能力意图」Then 系统返回引导式回应" — no AC or state covers a user correcting a wrong routing. **Fix**: specify a feedback/correction affordance and the AC for reclassification.

4. `[blindspot]` [Edge Cases] Unbounded list growth. Quote: "按时间倒序列表展示" — no pagination, retention, or max-entries behavior for 风险中心. **Fix**: define page size, ordering tiebreakers, and retention/archival rule.

5. `[blindspot]` [Security/Scenario] LLM data-boundary half-defined. Quote: "Display masking: 跨租户数据不可见，LLM 回复引用校验越界丢弃" — only the outbound (LLM→user) path is governed; the inbound (tenant ops data → LLM provider) path has no data-classification rule. **Fix**: state LLM deployment model and an allowlist of fields sent to the LLM.

6. `[blindspot]` [Background & Goals] All baselines are unverified estimates. Quote: "基线运营指标（初估，P1 启动前以 alert/audit 历史数据核实）：月均告警约 3000 条…" — every improvement claim (20–40 min → 1 min; 60–100 人时) is measured against numbers the PRD admits are guesses. **Fix**: gate P1 exit criteria on measured baselines, or mark the metrics as provisional explicitly in the Goals table, not the Background prose.

---

## Verdict

820/1000 — below the 900 target. The PRD is unusually strong on flow decomposition, degradation paths, and P1 boundary discipline, but fails on: (1) a referenced-but-undefined 历史诊断 page, (2) a status enum that cannot drive its own UI states, (3) a goal metric (外部渠道推送 ≥99%) with no matching scope item, and (4) acceptance criteria that never exercise the 已查看 state, batch operations, or intent misclassification. These are all fixable in one revision pass.
