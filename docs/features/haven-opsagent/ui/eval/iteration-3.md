# UI Design Evaluation — Iteration 3

- **Doc**: `docs/features/haven-opsagent/ui/ui-design.md`
- **Requirement source**: `docs/features/haven-opsagent/prd/prd-ui-functions.md`
- **Rubric**: `ui-web.md` (1000 pts, 4 × 250)
- **Stance**: Adversarial. Every deduction cites the document. Scored independently on current content only; iteration-2 findings verified for resolution status.
- **Date**: 2026-09-23

## Score Summary

| Dimension | Score | Δ vs Iteration 2 |
|-----------|-------|------------------|
| Requirement Coverage | 223 / 250 | +33 |
| User Experience | 230 / 250 | +17 |
| Design Integrity | 200 / 250 | +5 |
| Implementability | 215 / 250 | +37 |
| **Total** | **868 / 1000** | **+92** |

### Iteration-2 issue resolution audit

| Iteration-2 issue | Status |
|---|---|
| Risk-center → history entry missing | **FIXED** — "筛选条右侧固定「历史诊断」outline 按钮…点击跳转 /opsagent/history?from=risk-center" |
| Dark palette tokens missing | **FIXED** — full "### Color Palette (Dark)" table + dark semantic flips |
| Concurrency override dialog + binding | **FIXED** — conflict Dialog with "覆盖提交"/"放弃", binding `conflict.conflictStatus`, amber token defined |
| Destructive color AA violation | **FIXED** — "destructive 填充色采用 red-700 `#b91c1c`（白字对比度 ≈6.5:1）", `#ef4444` demoted to decorative |
| 空输入禁发 / 时间窗超限提示 | **NOT FIXED** |
| Responsive / fixed-input ambiguity | **FIXED** — breakpoint section + `position: fixed` 相对 viewport + padding-bottom spec |
| Chat history entry phantom control | **FIXED** — "右侧「历史诊断」ghost 入口按钮" placed in layout + binding row |
| 红tinted/黄色 colors undocumented | **FIXED** — tinted 提示条 token (`#fee2e2`/`#991b1b`), conflict amber (`#fef3c7`/`#92400e`) |
| Wireframe row misalignment (risk-center) | **PARTIALLY FIXED** — header now has ☑/8 columns, but sample rows still show only 6 values |
| History wireframe 降级 renders "否" | **NOT FIXED** |
| State transition choreography | **NOT FIXED** |
| 降级 tag style undefined | **NOT FIXED** |
| 排查中→生成报告 step enumeration | **NOT FIXED** |
| chips / header meta / pagination-total bindings | **NOT FIXED** |

---

## 1. Requirement Coverage — 223/250 (PM perspective)

### UI function coverage: 75/80

All 4 UI functions have real components, UF-4's two-step flow exists, and the PRD's concurrency decision point is now a coded interaction: "冲突 Dialog：提示条文案「该条目已被其他值班更新为 {X}」…按钮「覆盖提交」（destructive）+「放弃」（secondary）" with the PRD-mandated post-write-overwrite semantics ("再次冲突则重新弹出 Dialog"). The P1 restriction is honored: "处置建议（操作清单仅展示）" and "[仅展示·P3 可执行]". Remaining:

- **-5** — PRD UF-1: "支持流式/异步展示报告生成状态（排查中 → 生成报告）". The design's 排查中 state is "系统气泡内 spinner + 当前步骤文字" — the step text values and the 排查中→生成报告 transition remain unenumerated, so the async progression cannot be verified as modeled.

### Navigation Architecture coverage: 35/40

Both primary nav items render on all 4 pages ("在全部 4 个页面渲染"); both PRD history entry points are now wired ("UF-1「历史诊断」入口" as a top-bar ghost button; "风险中心检索" as a filter-bar outline button with `?from=risk-center`); breadcrumbs return per source with `?from=risk-center|chat|history`.

- **-5** — Component 3 claims a navigation source that no component produces: "对话排障（UF-1 结论跳转）" — but Component 1's wireframe, bullets, interactions, and bindings contain no control that navigates to /opsagent/diagnosis/:id. (PRD only requires UF-2/3/4 as diagnosis-detail entries, so this is an over-claimed source rather than a missing required door — but as written it is a `?from=chat` value no interaction can ever emit, and a developer implementing the breadcrumb from this spec will hunt for a chat jump that does not exist.)

### State requirement coverage: 78/80

All PRD states present with matching names: UF-1's 6 states + bonus 结果截断; UF-2's 4 + bonus 部分失败; UF-3's 3 + bonus 结果截断; UF-4's 6; session-view adds "不存在/未落库". The PRD 报告状态 enum (排查中/完成/降级/引导式回应/错误) maps 1:1 onto the design's state tables. -2 for the unmodeled 排查中→生成报告 intermediate (same root cause as above, not double-charged).

### Edge case handling: 35/50

Substantial new edge coverage: truncation disclosure on all three report surfaces, conflict Dialog with stale-detection loop, batch partial failure + "重试失败项", 降级 tooltip with capability boundary, long-text ellipsis/tooltip + `break-words`, responsive column folding with card fallback. Remaining:

- **-8** — PRD UF-1 validation "空输入不可发送" is still nowhere. The input area is "Input + 「发送」Button" with a counter "小字提示：x/500 · 当前模式（正常/降级）" for the over-length case, but no disabled-send rule for empty input; the send button is implicitly always clickable.
- **-7** — PRD UF-4 validation "检索时间窗上限默认 24 小时…超出提示用户缩小范围". The design renders only "时间窗(≤24h)" in the wireframe. What happens when a user requests a 7-day window is unspecified — no error, no clamp, no hint.

---

## 2. User Experience — 230/250 (End-user perspective)

### Information hierarchy: 70/80

The risk-center table reads cleanly (badge, score, status, 降级 tag, action), and the session view correctly separates 对话记录 from 诊断报告 with an explicit rationale ("与诊断详情页…区分：本视图渲染完整对话记录…诊断详情页仅渲染单条诊断的根因/建议/调用链"). Remaining (-10): diagnosis detail is still three equal-weight stacked Cards — "三条 Card 垂直堆叠" — with no visual-weight guidance, and the detail header "标题：order-service · 高危 · 85分 · 09:45" packs four semantic signals into one line with no prominence spec.

### Interaction intuitiveness: 75/80

The conflict flow is now a conventional pattern (Dialog, trap focus, two clearly-labelled buttons, amber styling explicitly "非徽标造型、与风险级别徽标视觉区分"); the history view switch is explained; chips fill the input; truncation copy tells the user exactly what to do. Remaining (-5): the 排查中 feedback is still positionally ambiguous — "系统气泡内 spinner + 当前步骤文字 | 右侧显示「排查中…」" — "右侧" of which element remains unstated.

### Accessibility: 85/90

The a11y section is now self-consistent with the palette: destructive is red-700 at ≈6.5:1, 低危 uses 浅底深字 ≈6.3:1, dark flips are specified "对比度均 ≥ 4.5:1", muted-foreground is usage-constrained ("仅用于 ≥13px 辅助文字"). Keyboard, focus trap/return, aria-live/aria-busy/role="alert", and spinner text alternatives are all specified. Remaining (-5): the palette itself leaves the primary risk badge pairing ambiguous — the section opens with "高危 `#dc2626`（red-600）、低危 `#b45309`（amber-700…）…用于风险级别徽标", then later overrides with "高危/低危徽标同样按「浅底深字」处理：高危底 `#fee2e2` + 字 `#991b1b`". Whether red-600 text or 浅底深字 pairs ship is a guess, and the AA claim is only verifiable for one of the two readings.

---

## 3. Design Integrity — 200/250 (Designer perspective)

### Design system adherence: 60/80

Dark mode is now fully tokenized (same-name variable override under `html.dark`, with dark badge/tinted pairs and the amber rule carried into dark). Destructive is a documented red-700 with hover. Remaining:

- **-10** — The risk-badge definition contradicts itself within one section: "高危 `#dc2626`（red-600）…用于风险级别徽标" vs "高危徽标同样按「浅底深字」处理：高危底 `#fee2e2` + 字 `#991b1b`". If the first reading wins, the badge violates the section's own 浅底深字 system; if the second wins, #dc2626 and #b45309 are listed for a role they never fill. The 强调色 list is never explicitly demoted to decorative-only (unlike amber-500, which is).
- **-10** — The 降级 tag still has no color/style definition anywhere. It appears in the risk-center column, the detail header badge, the history column, and the session-view badge — four surfaces — yet the Badge spec covers only risk levels ("风险徽标见色板语义"). Four instances of the same tag will be styled ad hoc.

### Visual coherence: 75/90

Shared top bar and source-aware breadcrumbs are now identical across all four pages — the cross-page inconsistency class is closed. Remaining:

- **-10** — Component 4's wireframe still contradicts its own binding: the history table row renders "│ │order-svc|排障|告警|09:45|否|查看" — a boolean 否 in the 降级 column — while the binding says "为真时该行展示「降级」标签". Two representations of the same field in one component.
- **-5** — Component 2's sample rows remain misaligned with their own 8-column header (`☑|服务名|级别徽标|风险分|时间|状态|降级|操作`): "│ │order-svc|高危|85|09:45|待查看|查看详情" shows 6 values with no checkbox and no 降级 cell. The primary work surface's diagram still does not parse literally.

### State completeness: 65/80

Every component covers Empty/Loading/Error — no happy-path-only violation — and the new conflict/部分失败/不存在/未落库 states are genuine. Remaining (unchanged from iteration 2, -15): transitions are enumerated but never choreographed — nothing defines how 加载中 resolves to 空 vs 有数据, how 错误's 重试 re-enters the flow, how a risk-center row visually flips "待查看→已查看" after "打开条目", or how the 部分失败 toast's "重试失败项" terminates (all retried items succeed → which state, which toast?).

---

## 4. Implementability — 215/250 (Developer perspective)

### Layout specificity: 75/80

A real responsive story now exists: breakpoints with column folding ("≥1280px 全部 8 列…768–1279px 隐藏「风险分」「降级」两列…<768px 表格降级为卡片列表"), batch-bar sticky behavior, filter collapse to Dialog, and the fixed input is disambiguated with a concrete offset rule ("预留 padding-bottom = 输入区实际高度（含字数/模式小字行）"). Remaining (-5): no explicit column widths or max-width values for the ellipsis cells (rule is stated, values are not), and pagination is still "分页：< 1 2 3 > · 共 N 条" with no page-size control despite both lists being "页大小 20（可配置）".

### Data binding explicit: 70/80

The iteration-2 orphans are closed: `conflict.conflictStatus` + `conflict.itemId`, `failedItems[]`, `pendingCompensationCount`, `truncated`/`totalMatched`, and the history-entry button has an explicit "无数据字段（静态导航控件）" row. Remaining:

- **-5** — Component 1's empty state ("居中引导语 + 3 个示例问题 chip") has no binding row: static copy or served? Unstated.
- **-3** — Component 3's header meta "标题：order-service · 高危 · 85分 · 09:45" has no explicit binding row (inferable from the list binding, but the rubric demands explicit mapping).
- **-2** — "共 N 条" pagination totals (Components 2 and 4) have no binding row.

### Interaction unambiguity: 70/90

The chat history entry is now a placed, bound control with a parameterized target ("/opsagent/history?from=chat"); the conflict chain is fully coded (message text, both buttons, repeat-conflict loop, 放弃 semantics). Remaining:

- **-8** — The 排查中→生成报告 progression cannot be coded: "系统气泡内 spinner + 当前步骤文字" never lists the step texts, and the PRD's second stage ("生成报告") appears in no state row.
- **-7** — The `?from=chat` breadcrumb source on Component 3 has no producing interaction anywhere (see §1) — a trigger→action→feedback chain that exists only as a return path.
- **-5** — PRD UF-2: "支持单条/批量标记已查看/已处理". The design covers batch 标记已查看, auto-flip on open ("状态自动「待查看→已查看」"), and 单条/批量 标记已处理 — but a single-item explicit 标记已查看 action (without opening the item) exists on no surface.

---

## Blindspot Hunt

1. `[blindspot]` **[Design Integrity]** — The palette defines the high-risk badge twice with different colors. Opening claim: "高危 `#dc2626`（red-600）…用于风险级别徽标"; closing override: "高危底 `#fee2e2` + 字 `#991b1b`". The #dc2626/#b45309 entries are never explicitly demoted the way amber-500 is ("仅允许作装饰性边框/图形"). Must collapse to one token pairing per risk level and reassign the raw hues to borders/icons only.
2. `[blindspot]` **[Requirement Coverage]** — The PRD's empty-input rule is silently absent. PRD: "空输入不可发送". Design: "小字提示：x/500 · 当前模式（正常/降级）" is the only input-validation artifact. Must add a disabled-send state (button disabled + aria-disabled) to Component 1's interaction table.
3. `[blindspot]` **[Requirement Coverage]** — Time-window overflow is rendered as a hint, not a behavior. PRD: "超出提示用户缩小范围". Design: "时间窗(≤24h)" is wireframe annotation only — no state, interaction, or validation row handles a 7-day request. Must add a validation row (block submit + inline error) or an auto-clamp behavior to Component 4.
4. `[blindspot]` **[Implementability]** — A breadcrumb source no interaction can emit. Component 3: "对话排障（UF-1 结论跳转）" — Component 1 contains no control navigating to /opsagent/diagnosis/:id (its only report navigation is the history entry). Either add the UF-1 report-card jump interaction or remove `chat` from the from-enum.
5. `[blindspot]` **[Implementability]** — The async progression is still a black box. PRD: "支持流式/异步展示报告生成状态（排查中 → 生成报告）"; design: "系统气泡内 spinner + 当前步骤文字". Step texts, the second stage, and spinner-to-card handoff are undefined — the single most user-visible moment of the product cannot be coded without invention.
6. `[blindspot]` **[Design Integrity]** — The 降级 tag is rendered on four surfaces with zero style spec ("「降级」标签" appears in Comp 2 column, Comp 3 header, Comp 4 column and session badge; Badge spec covers only "风险徽标见色板语义"). Must assign it a token (e.g., zinc outline or a dedicated muted pair) in the palette.

---

## Verdict

Iteration 3 closed every one of iteration 2's six priority items: both history entry doors exist, dark tokens ship with contrast math, the conflict flow is a real Dialog with the PRD's user-decision step and a data binding, destructive is AA-compliant red-700, empty-input… no — five of six: 空输入禁发 and 时间窗超限 remain the last two unimplemented PRD validation rules. The remaining defect pattern has shifted from "committed-but-unfinished" to "defined-twice-and-unresolved": the risk badge has two color specs, the 降级 tag has none, the history wireframe shows 否 where its binding promises a tag, and sample rows still misalign with their own headers. Priority fixes for iteration 4: (1) collapse risk-badge color to one 浅底深字 pairing, (2) 降级 tag token, (3) 空输入禁发 + 时间窗超限 validation rows, (4) 排查中 step-text enumeration, (5) resolve the `?from=chat` phantom source, (6) fix wireframe rows (☑/降级 cells, 否→标签).
