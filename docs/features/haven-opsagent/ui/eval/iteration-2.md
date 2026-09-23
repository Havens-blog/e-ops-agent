# UI Design Evaluation — Iteration 2

- **Doc**: `docs/features/haven-opsagent/ui/ui-design.md`
- **Requirement source**: `docs/features/haven-opsagent/prd/prd-ui-functions.md`
- **Rubric**: `ui-web.md` (1000 pts, 4 × 250)
- **Stance**: Adversarial. Every deduction cites the document. Scored independently on current content only; iteration-1 findings verified for resolution status.
- **Date**: 2026-09-23

## Score Summary

| Dimension | Score | Δ vs Iteration 1 |
|-----------|-------|------------------|
| Requirement Coverage | 190 / 250 | +45 |
| User Experience | 213 / 250 | +58 |
| Design Integrity | 195 / 250 | +20 |
| Implementability | 178 / 250 | +8 |
| **Total** | **776 / 1000** | **+131** |

### Iteration-1 issue resolution audit

| Iteration-1 issue | Status |
|---|---|
| UF-4 flattened into UF-3 (no session-content view) | **FIXED** — "会话内容视图（UF-4 第二步）… 渲染完整对话记录" |
| Hardcoded breadcrumb parent on diagnosis detail | **FIXED** — "`?from=risk-center|chat|history`，返回目标 = 对应来源页" |
| Shared top bar missing on secondary pages | **FIXED** — "在全部 4 个页面渲染…二级页不隐藏" |
| 降级 label missing from risk-center rows | **FIXED** — "「降级」列在降级标识为真时展示「降级」标签，悬停 tooltip" |
| Truncation disclosure string missing | **FIXED** — exact PRD string on all three report surfaces |
| Zero accessibility | **FIXED** — dedicated section: contrast math, labels, keyboard, aria-live, focus trap |
| Orphan bindings (补偿提示, 失败清单) | **FIXED** — `pendingCompensationCount`, `failedItems[]` rows added |
| Dark mode tokens missing | **NOT FIXED** |
| Risk-center → history entry missing | **NOT FIXED** |
| 空输入不可发送 / time-window overflow | **NOT FIXED** |
| Undocumented 红tinted/黄色 colors | **NOT FIXED** |
| "fixed 底部" ambiguity / no responsive | **NOT FIXED** |

---

## 1. Requirement Coverage — 190/250 (PM perspective)

### UI function coverage: 70/80

All 4 UI functions map to components, and UF-4's two-step flow now exists as a real surface: "本视图渲染完整对话记录（提问 + 系统回复）+ 诊断报告 + 数据源引用". Remaining gaps:

- **-5** — PRD UF-2 concurrency semantics mandate a user decision point: "由用户决定是否再次覆盖". The design only writes "并发冲突 | 他人已改 → 提示并刷新 | 黄色提示条" — the conflict ends at refresh; there is no overwrite/override affordance, so the mandated "后写覆盖" path is unreachable from the UI.
- **-5** — PRD UF-1 specifies a two-stage progression "支持流式/异步展示报告生成状态（排查中 → 生成报告）"; the design's states jump from "排查中 | 系统气泡内 spinner + 当前步骤文字" straight to 完成. The "当前步骤文字" values and the 排查中→生成报告 transition are never enumerated, so the async progression cannot be verified as covered.

### Navigation Architecture coverage: 20/40

- **-20 (navigation gap)** — 历史诊断回溯's second PRD entry point is still unreachable. PRD: "历史诊断回溯 | UF-1「历史诊断」入口（对话页）或风险中心检索". Component 2's layout contains only 筛选条 / 批量操作条 / 表格 / 分页 — no control navigates to /opsagent/history. Yet Component 4 asserts the breadcrumb "按进入来源渲染：对话排障（UF-1「历史诊断」入口）或风险中心" — the design claims a source it never provides a door to. A user on 风险中心 cannot reach 历史诊断回溯 at all.

### State requirement coverage: 75/80

Strong. All PRD states present with matching names: UF-1's 6 states (+bonus 结果截断), UF-2's 4 (+bonus 部分失败), UF-3's 3 (+bonus 结果截断), UF-4's 6, plus the new session-view states including "不存在/未落库". -5: the "排查中 → 生成报告" intermediate state remains unmodeled (see above).

### Edge case handling: 25/50

- **-8** — "空输入不可发送" is still nowhere: Component 1's input area is "Input + 「发送」Button" with a char counter "小字提示：x/500" for the over-length case, but no disabled-send state for empty input. The send button is implicitly always clickable.
- **-7** — Time-window overflow behavior still missing. PRD: "检索时间窗上限默认 24 小时…超出提示用户缩小范围". Design renders only "时间窗(≤24h)" — what happens when the user requests a 7-day window is unspecified.
- **-5** — No long-text overflow rules anywhere: long service names, long 根因结论, long 处置建议 have no ellipsis/wrap spec for table cells or cards.
- **-5** — The mandated conflict message content is not specified: PRD quotes "提示「该条目已被其他值班更新为 X」并刷新当前状态"; the design's interaction row says only "他人已改 → 提示并刷新".

---

## 2. User Experience — 213/250 (End-user perspective)

### Information hierarchy: 65/80

The risk-center table now has a clean columnar hierarchy (badge, score, status, 降级 tag, action), and the session view separates 对话记录 from 诊断报告. Remaining: diagnosis detail is three equal-weight cards — "三条 Card 垂直堆叠：根因结论（含可展开引用）、处置建议（操作清单仅展示）、编排调用链（折叠，供 SRE）" — with no visual-weight guidance on which conclusion dominates; and the detail header "标题：order-service · 高危 · 85分 · 09:45" packs four semantic signals into one line with no prominence spec.

### Interaction intuitiveness: 70/80

The history bait-and-switch is fixed ("点「查看」进入下方会话内容视图…不直接跳诊断详情页"). Remaining:

- **-10** — Concurrency feedback is still an uncommitted, undefined pattern: "黄色提示条". Yellow is not a palette token, and the palette restricts amber-family color to risk semantics ("仅在级别语义处使用") — a data-conflict warning will be visually conflated with a 低危 row. Banner vs toast is still not chosen.

### Accessibility: 78/90

A real a11y section now exists: "全站可 Tab 到达、可见 focus ring"、"Dialog 打开时 focus 移入并 trap，Esc 关闭、关闭后 focus 归还触发元素"、aria-live on 排查中/skeleton/alerts. The 低危 contrast failure was properly fixed with "浅底深字：底 `#fef3c7` + 字 `#92400e`，对比度 ≈6.3:1". Remaining:

- **-12** — The design fails its own AA claim on its own Button spec: "destructive 红底白字" uses `--destructive #ef4444`, and white text on #ef4444 is ≈3.8:1 — below the section's claim "正文、徽标文字、placeholder 均满足 WCAG AA ≥ 4.5:1". Every 重试 destructive button and every 错误 state CTA is non-conforming as specced. Additionally "红 tinted 提示条" never states the text color on the tinted ground.

---

## 3. Design Integrity — 195/250 (Designer perspective)

### Design system adherence: 55/80

- **-15** — Dark mode is still committed but unimplementable: "light 默认 / dark 可切" plus the interaction "明暗切换 | 切换 CSS 变量 | 全站换肤" — yet the document defines only "### Color Palette (Light)". Zero dark token values exist; a developer cannot ship the advertised toggle.
- **-10** — Undocumented colors persist across three components: "红 tinted 提示条" (Comp 1/2/4 错误 states — which red, what opacity?) and "黄色提示条" (Comp 2). Neither is a palette token, and the palette's own rule "仅在级别语义处使用" forbids amber outside risk badges.

### Visual coherence: 75/90

Shared top bar and source-aware breadcrumbs now appear on all four pages — the iteration-1 cross-page inconsistency is resolved. Remaining:

- **-10** — Component 2's wireframe contradicts its own binding spec: the 降级 column renders a boolean value ("│ │order-svc|排障|告警|09:45|否|查看" pattern; risk-center header `…|状态|降级|操作`) while the Data Binding says "为真时该行展示「降级」标签" — a label, not a 是/否 value. Two representations of the same field in one component.
- **-5** — Component 2's wireframe rows are still misaligned with their 8-column header (`☑|服务名|级别徽标|风险分|时间|状态|降级|操作`): the sample rows show 6 values with no ☑ and no 降级 cell. In a spec meant to be built from literally, the primary work surface's own diagram doesn't parse.
- Also noted: the 降级 tag has no color/style definition anywhere (Badge spec only covers risk levels) — it will be styled ad hoc.

### State completeness: 65/80

Every component's state table includes Error/Empty — no happy-path-only violation, and the new 结果截断/部分失败/补偿提示 states are genuine edge states. Remaining: transitions are still enumerated, not choreographed — nothing defines how 加载中 resolves to 空 vs 有数据, how 错误's 重试 re-enters the flow, how a risk-center row visually flips "待查看→已查看" (in-place re-render? badge animation? row reorder?), or how the 部分失败 toast's "重试失败项" terminates (all succeed → what state?).

---

## 4. Implementability — 178/250 (Developer perspective)

### Layout specificity: 60/80

- **-10** — Responsive behavior is still entirely absent: "无强制 max-width，fluid" is the only viewport statement. No breakpoints, no minimum widths, no table-collapse strategy for the 8-column risk-center table on narrow screens. A developer must invent the entire responsive story.
- **-6** — "输入区：fixed 底部，Input + 「发送」Button" remains ambiguous — fixed relative to the viewport or the page's flex container? The wireframe draws it inside the page flow below the scroll area. These produce different implementations.
- **-4** — Table column widths/ellipsis rules still unspecified for an 8-column table; pagination remains "分页：< 1 2 3 > · 共 N 条" with no page-size control despite "页大小 20 可配置".

### Data binding explicit: 58/80

Iteration-1 orphans are fixed (`pendingCompensationCount`, `failedItems[]`). Remaining unmapped elements:

- **-10** — The concurrency-conflict prompt has no data binding: "并发冲突 | 他人已改 → 提示并刷新" needs the conflicting status value ("该条目已被其他值班更新为 X") from the write response — no field/source row exists for it (failedItems[] covers only batch failures).
- **-8** — Component 1's empty-state "3 个示例问题 chip" and 引导语 have no Data Binding row — are they static copy or served? Unstated.
- **-4** — Component 3's header meta "标题：order-service · 高危 · 85分 · 09:45" and Component 2's "共 N 条" pagination total are not explicit binding rows (inferable, but the rubric demands explicit mapping).

### Interaction unambiguity: 60/90

- **-15** — The chat's history entry is still a phantom control: Interactions says "点「历史诊断」入口 | 跳转 /opsagent/history" but Component 1's Layout Structure contains only 导航 / 对话流 / 输入区 — the entry button appears in no wireframe, no bullet, no binding. A developer cannot place it.
- **-10** — The conflict interaction chain is incomplete: "他人已改 → 提示并刷新" omits both the quoted message text and the mandated "由用户决定是否再次覆盖" decision step, so the trigger→action→feedback chain cannot be coded as the PRD requires.
- **-5** — "排查中 | 系统气泡内 spinner + 当前步骤文字 | 右侧显示「排查中…」" — "右侧" of what element is still unspecified, and the step texts themselves are undefined.

---

## Blindspot Hunt

1. `[blindspot]` **[Requirement Coverage]** — The design claims a navigation source it never wires up. Component 4: "面包屑 `{来源页}` 按进入来源渲染：对话排障（UF-1「历史诊断」入口）或风险中心" — yet Component 2's layout (筛选条/批量操作条/表格/分页) contains zero controls leading to /opsagent/history. PRD requires "或风险中心检索" as an entry. Must add a history entry (e.g., a toolbar button or filter link) to Component 2.
2. `[blindspot]` **[Design Integrity]** — The theme toggle is a broken promise baked into the spec. "明暗切换 | 切换 CSS 变量 | 全站换肤" + "light 默认 / dark 可切", but only "### Color Palette (Light)" exists. Must ship a full dark token table or cut the toggle from scope.
3. `[blindspot]` **[User Experience]** — The a11y section's own claim is violated by the Button spec. Claim: "正文、徽标文字、placeholder 均满足 WCAG AA ≥ 4.5:1". Spec: "destructive 红底白字" on `--destructive #ef4444` ≈ 3.8:1. Must darken destructive (e.g., red-600/700 for text-bearing fills) or specify a compliant pairing.
4. `[blindspot]` **[Implementability]** — An interaction trigger with no rendered source. "点「历史诊断」入口 | 跳转 /opsagent/history" — the 入口 appears in no layout, wireframe, or bullet of Component 1. Must place the control in the layout (and bind it).
5. `[blindspot]` **[Requirement Coverage]** — The PRD's concurrency decision point is silently dropped. PRD: "提交时检测到状态已被他人变更，则提示…由用户决定是否再次覆盖". Design: "他人已改 → 提示并刷新". The overwrite path must become an explicit interaction (e.g., conflict dialog with 覆盖/放弃) with the quoted message text and a data binding for the conflicting status.
6. `[blindspot]` **[Implementability]** — Zero responsive specification for a data-dense admin surface. "无强制 max-width，fluid" is the entire viewport story while the risk-center table declares 8 columns. Must add at least one breakpoint strategy (column priority/hide rules, chat input fixed-positioning clarification).

---

## Verdict

Iteration 2 fixed the flow-level failures that sank iteration 1: UF-4 is now a real two-step flow with a dedicated session-content view, navigation is source-aware on both secondary pages, the shared top bar is on all four pages, the mandated truncation and 降级 disclosures exist with data bindings, and the a11y section is substantive. What remains is a consistent pattern of *committed-but-unfinished* claims: a dark theme with no dark tokens, a conflict flow that stops short of the PRD's user-decision step, a history entry claimed as a source but present on only one of its two entry pages, and an AA claim its own destructive button violates. Priority fixes for iteration 3: (1) risk-center → history entry control, (2) dark palette tokens, (3) concurrency override dialog + binding, (4) destructive color compliance, (5) 空输入禁发 + 时间窗超限提示, (6) responsive/breakpoint pass.
