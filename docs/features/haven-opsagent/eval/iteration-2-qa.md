# Iteration 2 — QA Eval Report

**Mode**: A (prd-ui-functions.md present)
**Score**: 885/1000 (Target: 900)
**Scorer**: QA (adversarial)

## Iteration-1 Attack Fix Verification

| # | Iteration-1 Attack | Verdict | Evidence |
|---|--------------------|---------|----------|
| 1 | 历史诊断回溯无 UI Function | FIXED | UF-4 now has Placement/Flow/Data/States/Validation; Navigation Secondary Pages lists `/opsagent/history` |
| 2 | 报告状态枚举与状态表不一致 | FIXED | UF-1 enum 「排查中 / 完成 / 降级 / 引导式回应 / 错误」+ mapping note「与 States 表一一对应」 |
| 3 | 外部推送在指标中但范围外 | FIXED | In Scope「并经外部通知渠道（IM/邮件等）推送告警提醒」+ DF007 + Related Changes #3 |
| 4 | 「已读」vs「已查看」命名冲突 | FIXED | spec「『已读』统一称为『已查看』」，三处文档统一 |
| 5 | 已查看/批量语义无 AC | FIXED | Story 1: 自动流转 AC + 批量部分失败回显失败清单 AC |
| 6 | 误分类无恢复路径 | FIXED | 「追问澄清 / 提供候选意图选项供一键纠正」+ Story 2 AC |
| 7 | 分页/保留/并发标记未定义 | FIXED | UF-2: 页大小 20、保留 90 天、后写覆盖 + 冲突提示 |
| 8 | 风暴防护零 AC | FIXED | Story 1: 去重 / 并发上限排队 / 预算耗尽降级 三条 AC |
| 9 | 落库失败/空结果/低置信/prompt injection | FIXED | 重试 2 次+补偿队列+口径澄清；空结果明示；低置信追问；注入过滤 |
| 10 | 图流向混淆（对话结果进风险中心） | FIXED | `Source{触发来源}` 分流：告警触发→RiskCenter，对话触发→ChatOnly |

## Dimension Scores

### 1. Background & Goals: 95/100
- Three elements present and specific (Reason: 空壳 skill + 底座能力清单; Target: P1 排障核心闭环; Users: 值班运维 + SRE). 30/30
- Quantified: ≤1 分钟、≥99%、N≥100、100% 完整率、1 分钟检索. 30/30
- Consistency: goals follow from problem. Deduct 5: baseline metrics are self-declared unverified — 「基线运营指标（初估，P1 启动前以 alert/audit 历史数据核实）」. Targets (≥99%, 20–40 分钟→1 分钟) rest on a baseline that may shift; the PRD defers verification past the point where goal values were already fixed. 35/40

### 2. Flow Diagrams: 130/150
- Mermaid exists. 50/50
- Main path complete: DEDUCT 15 — the dialog happy path dead-ends. `Source -->|对话触发| ChatOnly[仅对话窗口展示·可回溯]` has no outgoing edge to `End([结束])`. Primary users (对话排障) never reach the diagram's terminal node; only the alarm path terminates. 35/50
- Decision points + error branches: diamonds abundant (Trigger/StormCheck/Intent/LLM/Source/HighRisk/Ack), error branches present (Fallback, RuleOnly, Merge). Deduct 5: `Intent -->|LLM 不可用| Fallback` conflates intent routing with LLM availability — LLM availability is already a downstream decision (`LLM{LLM 可用?}`), and modeling it as an intent-classification outcome is semantically wrong; the same failure appears in two nodes with different behaviors. 45/50

### 3. Functional Specs (prd-ui-functions.md): 175/200
- Placement & Interaction (65/70): all 4 UFs have Mode/Target/Position; navigation rules met; flows cover entry→action→return. Deduct 5: UF-2's interaction flow omits the high-risk branch and error state that its own States/Validation tables define — flow says only 「查看条目 → 单条/批量标记 → 查看详情」.
- Data Requirements & States (60/70): field tables sourced, states have triggers, UF-1 enum mapping note present. Deduct 10: the degraded-conclusion flag is missing from UF-2 list data. Story 1 AC: 「降级输出纯规则结论（带降级标识）」，but UF-2 list fields are only 「服务名、级别、时间、风险分、状态」— no degraded-flag field, so a tester cannot verify the AC at the risk-center surface where the story says it must be visible.
- Validation Rules (50/60): mostly actionable (500 字符、页大小 20、90 天保留、后写覆盖、≤1 分钟检索). Deduct 10: UF-1's >500 rule 「输入超长（> 500 字符）提示精简」does not state whether sending is blocked or the input is truncated — two implementations pass one and fail the other; UF-4 has no time-window bounds on 「时间窗」filter (see Edge Cases).

### 4. User Stories: 185/200
- Coverage: 值班运维 (S1, S2), SRE (S3). 50/50
- Format: As a/I want/So that correct; actions concrete (无 "manage/handle" 式动词). 50/50
- AC per story: every story has multiple GWT ACs. 50/50
- Verifiability & boundaries (35/50): Deduct 15 for three untested behaviors:
  1. Concurrent-marking conflict exists only as a UI validation rule — 「提示『该条目已被其他值班更新为 X』并刷新当前状态」— but no story AC exercises two operators marking the same entry.
  2. High-risk display 「高危项标记『待人工确认（执行通道 P3 上线后生效）』，P1 仅展示不出确认按钮」has no AC anywhere; a regression that renders a confirm button would pass all current ACs.
  3. The 资源查询 intent category has no happy-path AC — it appears only inside a misclassification example (「如被误判为资源查询」), so the second intent class of the router is untested.

### 5. Scenario Completeness: 130/150
- E2E coverage (55/60): Flows A/B/C each go trigger→final state, incl. 落库 and 引导会话落库. Deduct 5: the 资源查询 scenario (a first-class intent class per Scope 「排障与资源查询走编排处理」) has no end-to-end lifecycle description — what 底座 are called, what the report looks like, whether it reaches 落库/风险中心.
- Implicit assumptions (30/40): baseline caveat surfaced; dependencies on existing 底座 stated. Deduct 10: 「LLM 不可用」is never operationally defined — no threshold (timeout seconds? error rate? quota?), yet three degradation behaviors and two ACs key off it. A tester cannot decide when 三级降级 must trigger. Similarly, the LLM provider/route and 落库存储 target are unstated environmental dependencies.
- Business-rules consistency (45/50): 「已查看」unification and SC-5 口径澄清 are internally consistent. Deduct 5: DF003 attributes 「diagnose 风险分」to the logquery return payload (`logquery → Agent 编排层 | 联邦日志结果 + diagnose 风险分`) while Flow A presents diagnose as a separate 编排层-invoked step after logquery — contract tests built off DF003 would bind the wrong interface.

### 6. Edge Case Coverage: 80/100
- Error paths (35/40): LLM 不可用、底座超时、空结果、落库失败、推送失败、队列溢出、详情不存在、降级 — all explicit. Deduct 5: only timeout is handled for 底座 calls; a hard error/exception response (non-timeout failure, malformed payload) from logquery/资产 has no defined branch — 「底座接口超时 → 返回确定性规则引擎结论」covers one failure mode only.
- Boundary conditions (20/35): covered — 并发上限 5、队列溢出、页大小、500 字符、90 天保留、LLM 预算. Deduct 15 for unbounded inputs: no max 时间窗 for chat queries or UF-4 检索 (「最近一年」? 全量?); no max batch size for 「批量标记」; no cap/截断 on logquery result volume feeding the LLM (large datasets listed in rubric, absent here).
- Failure recovery (25/25): 重试 2 次→补偿队列→告警 + 用户提示；批量重试失败项；推送失败重试与单独统计 — recovery actors and post-failure steps are named.

### 7. Scope Clarity: 90/100
- In-scope concrete (35/35): each checkbox is a deliverable with explicit boundary clauses (e.g., 「仅展示+状态标记，无确认执行」).
- Out-of-scope named (30/30): P2/P3 items enumerated, not implied.
- Consistency (25/35): Deduct 10 — Scope declares 「双界面载体：对话窗口（主入口）+ 风险中心（结构化待办列表）」 while prd-ui-functions.md ships four new pages (`/opsagent/chat`, `/opsagent/risk-center`, `/opsagent/diagnosis/:id`, `/opsagent/history`). 诊断详情 and 历史回溯 are full deliverables with no in-scope enumeration; a downstream planner reading Scope alone would under-scope by two pages.

## [blindspot] Attacks

1. [Flow Diagrams] Dialog path never terminates: `Source -->|对话触发| ChatOnly[仅对话窗口展示·可回溯]` — no edge to `End([结束])`. Fix: add `ChatOnly --> End` (and a post-report user action node if the interaction continues).
2. [Functional Specs] Story 1 requires 「降级输出纯规则结论（带降级标识）」 to be visible, but UF-2 list fields are 「服务名、级别、时间、风险分、状态」 — the 降级标识 has no data field or display spec. Fix: add 降级标识 field to UF-2 (and UF-4) data tables with display rule.
3. [User Stories] Concurrent-mark conflict is a UI rule with no AC: 「提交时检测到状态已被他人变更，则提示『该条目已被其他值班更新为 X』」. Fix: add a two-actor GWT AC (operator A marks, operator B marks stale, B sees conflict prompt and must re-confirm).
4. [Edge Cases] Time-window is unbounded everywhere: UF-4 「检索条件 | 表单 | 用户输入 | …时间窗/服务名」 and chat queries 「某服务最近一小时」 have no max range or result-volume cap. Fix: define max query window and logresult truncation behavior.
5. [Scenario Completeness] 「LLM 不可用」 gates 三级降级 and two ACs but is never defined (threshold/scope: per-request timeout? provider outage? budget separately handled). Fix: state the availability predicate.
6. [User Stories] High-risk 「P1 仅展示不出确认按钮」 has no AC; a confirm-button regression passes all stories. Fix: add negative AC asserting absence of confirm/execute controls for 高危 entries.
7. [Scope Clarity] 「双界面载体：对话窗口（主入口）+ 风险中心」 under-enumerates the four pages the UI doc delivers. Fix: list 诊断详情/历史回溯 as in-scope carriers (or restate as 2 primary + 2 secondary pages).

## Verdict

All 10 iteration-1 attacks verifiably fixed — the revision is genuinely responsive, not cosmetic. Remaining 115 points are concentrated in: one dead-end in the flow diagram, three untested behaviors (concurrent conflict, high-risk display, 资源查询 intent), missing data field for the degraded flag, unbounded time-window boundaries, and the 双界面/4-page scope mismatch. None are structural; all are locally fixable in one revision pass.
