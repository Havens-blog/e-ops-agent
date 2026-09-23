# UI Design Evaluation — Iteration 5

- **Doc**: `docs/features/haven-opsagent/ui/ui-design.md`
- **Requirement source**: `docs/features/haven-opsagent/prd/prd-ui-functions.md`
- **Rubric**: `ui-web.md` (1000 pts, 4 × 250)
- **Stance**: Adversarial. Every deduction cites the document. Scored independently on current content only; iteration-4 findings verified for resolution status.
- **Date**: 2026-09-23

## Score Summary

| Dimension | Score | Δ vs Iteration 4 |
|-----------|-------|------------------|
| Requirement Coverage | 235 / 250 | -5 |
| User Experience | 236 / 250 | +2 |
| Design Integrity | 221 / 250 | +14 |
| Implementability | 220 / 250 | -2 |
| **Total** | **912 / 1000** | **+9** |

### Iteration-4 issue resolution audit

| Iteration-4 issue | Status |
|---|---|
| Conflict Dialog amber collision (reused 低危 pairing) | **FIXED** — "冲突语义为第三种警示色调，**独立成蓝、整体移出 amber 族**，不得复用低危徽标…的任何一端色值" — now blue `#dbeafe`/`#1e40af` |
| Four untokenized badges (截断/排查中/超能力意图/降级模式) | **FIXED** — Badge spec now defines all four with light+dark tokens ("其余徽标变体（全站仅以下 4 种…）"), and 降级模式 "直接复用「降级」标签 token" |
| 降级 token reuse count (4 listed, 5th surface undefined) | **FIXED** — "全站五处复用统一样式——风险中心「降级」列、诊断详情头部 badge、历史会话「降级」列、会话视图顶部 badge、对话页「降级模式」badge" |
| 重试失败项 missing from Interactions table | **FIXED** — dedicated row with scope ("仅对 failedItems[] 中的条目"), second-failure behavior ("toast 刷新为剩余失败清单"), and termination ("全部成功则 toast 自动关闭") |
| Hover-gated content unreachable by keyboard/touch | **FIXED** — "悬停类内容均有键盘等价路径：…一律为「悬停 + 聚焦」双触发（元素 `tabindex=0`，focus / Enter / Space 打开，Esc / 失焦关闭）"; mobile gets "点击标签展开/收起降级原因与能力边界" |
| >500 char rule passive | **FIXED** — interaction row "`maxLength=500` 硬截断…计数红显「500/500 · 已达上限，请精简描述」（红 tinted 文字 `#991b1b`，`role="status"` 播报一次）" + send disabled at limit |
| Single-item 标记已查看 missing | **FIXED** — "点行内「标记已查看」（操作列动作菜单，不打开条目）| 单条状态流转「待查看→已查看」…失败则行状态回滚并弹错误提示" |
| Risk-center wireframe rows vs 8-column header | **NOT FIXED** — rows still show 6 values, no ☑, no 降级 cell |
| History wireframe 降级 renders "否" | **NOT FIXED** — "│ │order-svc|排障|告警|09:45|否|查看" |
| Binding rows: chips / session 查看详情 / detail header meta / 共 N 条 | **NOT FIXED** — all four still absent from their Data Binding tables |
| Nav icon keywords (PRD: chat / alert) | **NOT FIXED** — top bar spec still silent on icons |
| Diagnosis-detail information hierarchy | **NOT FIXED** — still "三条 Card 垂直堆叠" + undifferentiated header |
| 排查中 badge position "气泡旁" | **NOT FIXED** — wording unchanged |
| List/detail state transition choreography | **PARTIALLY FIXED** — retry termination and single-item rollback now defined; 加载中→空 vs 有数据, 错误重试 re-entry, auto-flip confirmation mode still undefined |

**New issues found this iteration**: dark-mode blue color collision (排查中 badge = conflict token, byte-identical in dark); session view drops PRD-mandated 编排调用链; session sub-view placement contradiction (list coexistence vs replaced view); success toast has no live-region announcement; 90-day retention unmodeled; history table 768–1279px band undefined.

---

## 1. Requirement Coverage — 235/250 (PM perspective)

### UI function coverage: 70/80

All 4 UI functions have components; the async progression, validation rules, P1 restrictions ("[仅展示·P3 可执行]", "「待人工确认（P3）」标签"), both history entry doors, and the concurrency loop are all modeled. But a PRD-mandated content element is dropped from UF-4:

- **-10** — PRD defines the session content as "查看任一会话的完整内容（提问、**编排调用链**、报告、数据源引用）" and its Data Requirements repeat "会话完整内容 | 结构化 JSON | 落库 | 提问、编排调用链、诊断报告、数据源引用". The design's session view explicitly excludes it: "本视图渲染完整对话记录（提问 + 系统回复）+ 诊断报告 + 数据源引用；诊断详情页仅渲染单条诊断的根因/建议/调用链，不含对话记录". The session view's Data Binding has no 调用链 field either (only `.messages[]` and `.report`). PRD states UF-4's purpose is "供资深运维 / SRE 二次核实诊断可信度" — the 调用链 is the artifact that serves that purpose, and it is unreachable from the history surface except by first clicking through to 诊断详情. The design silently narrowed PRD scope.

### Navigation Architecture coverage: 38/40

Both primary nav items render on all 4 pages; both history entries carry source params; breadcrumb sources are all producible (`?from=chat|risk-center|history`); every navigation target is a defined page. Remaining:

- **-2** — PRD's primary navigation table specifies icon keywords ("chat", "alert"); the design's top bar spec ("品牌名 + 两个一级导航项 + 右侧「历史诊断」ghost 入口按钮 + 明暗切换") still never mentions icons. Second iteration with this gap.

### State requirement coverage: 80/80

All PRD states present across all four components plus the session sub-view (including "不存在/未落库"); the PRD 报告状态 enum maps 1:1 to the design's States table; bonus states (结果截断, 部分失败, 补偿提示, 会话内容视图加载中) are justified additions.

### Edge case handling: 47/50

This is now the strongest area: whitespace-only input blocked, 500-char hard stop with red counter + `role="status"` announcement + send disable, time-window overflow blocked with inline error + clamp, truncation disclosed on three surfaces with exact copy, concurrency Dialog with repeat-conflict loop and 放弃 semantics, partial-failure retry with second-failure and termination behavior, single-item failure rollback ("失败则行状态回滚并弹错误提示"), mobile tap-to-expand for degradation reasons. Remaining:

- **-3** — PRD UF-2: "诊断条目默认保留 90 天（可配置），超期归档不在列表展示". The design models 空态 ("空态插画 + 「暂无诊断条目」") but has no surface distinguishing "no entries exist" from "entries exist but were aged out and archived". An SRE looking for a 4-month-old incident sees the same empty state as a first-time user — the PRD rule is unrepresented in any state, copy, or binding.

---

## 2. User Experience — 236/250 (End-user perspective)

### Information hierarchy: 70/80

Risk-center reads well; session view correctly separates 对话记录 from 诊断报告; the conflict Dialog's 覆盖提交/放弃 pairing gives clear affordance weight. Unchanged third-iteration deduction (-10): diagnosis detail remains three equal-weight stacked Cards ("三条 Card 垂直堆叠") with no visual-weight guidance, and the header packs four signals into one undifferentiated line ("标题：order-service · 高危 · 85分 · 09:45"). For an SRE scanning under incident pressure, nothing marks the 根因结论 Card as the primary object.

### Interaction intuitiveness: 78/80

Conventional patterns throughout: chips fill the input, conflict buttons are plainly labeled, truncation copy says what to do, time-window error states exact position ("时间范围控件下方内联报错"). Remaining (-2): the 排查中 badge position is still "（气泡旁固定状态徽标「排查中…」）" — "旁" does not resolve above/below/side, nor behavior during scroll.

### Accessibility: 88/90

Major gain this iteration: the keyboard guarantee now holds — tooltips are "「悬停 + 聚焦」双触发（元素 `tabindex=0`，focus / Enter / Space 打开，Esc / 失焦关闭）" with touch tap-to-expand, closing the iteration-4 contradiction with "全站可 Tab 到达". Contrast math is stated for every token pair including dark flips; Dialog focus trap + focus return specified; step changes, truncation badges, and conflict tips all announced. Remaining (-2): success feedback is silent to screen readers — the a11y section scopes announcements to "错误提示与部分失败 toast 用 `role=\"alert\"`", but the single-item success path "轻提示「已标记已查看」" has no `role="status"`/aria-live spec, so a keyboard user marking an item gets no non-visual confirmation.

---

## 3. Design Integrity — 221/250 (Designer perspective)

### Design system adherence: 72/80

Iteration-4's token defects are all closed: conflict tint moved to a dedicated blue pair explicitly outside amber, four badge variants tokenized with light+dark values and contrast math, and the 降级 token's reuse enumerated at exactly five surfaces. But the same collision class the document just eradicated from amber has been reintroduced in blue's dark mode:

- **-8** — The 排查中 badge dark token and the conflict tip dark token are byte-identical. Conflict: "dark 底 `#172554`（blue-950）+ 字 `#93c5fd`（blue-300）". 排查中: "dark 底 `#172554` + 字 `#93c5fd`". The design explicitly staggered the light variants ("与冲突提示 token（`#dbeafe`/`#1e40af`）同族但字色错开") and declares for blue what it declared for amber — "避免两种语义同色" — yet in dark mode an in-progress status badge and a concurrency warning are visually indistinguishable. Two different semantics, one color pair, in the mode the palette claims is "等价翻转（对比度均 ≥ 4.5:1）" with no equivalence-of-distinction guarantee.

### Visual coherence: 77/90

Shared top bar identical across all 4 pages; source-aware breadcrumbs consistent; badge family shares pill shape and text-xs per spec. The two wireframe defects are now in their fourth iteration:

- **-8** — Component 2's sample rows still do not parse against their own 8-column header (`☑|服务名|级别徽标|风险分|时间|状态|降级|操作`): "│ │order-svc|高危|85|09:45|待查看|查看详情" is 6 values with no checkbox and no 降级 cell. The primary work surface's diagram contradicts its column definition and the 降级 column binding.
- **-5** — Component 4's 降级 column still renders a literal "否" ("│ │order-svc|排障|告警|09:45|否|查看") where the binding promises "为真时该行展示「降级」标签". Two representations of one field in one component, untouched for four iterations.

### State completeness: 72/80

No happy-path-only violation; chat flow fully choreographed (异步阶段流转 with step order, skeleton handoff, degradation/超能力/error shortcuts); the 部分失败 retry now has full lifecycle behavior including termination ("全部成功则 toast 自动关闭，对应行状态即时刷新"); single-item marking has rollback semantics. Remaining (-8): the list and detail surfaces still lack transition choreography — nothing defines how 加载中 resolves to 空 vs 有数据, what the 错误 state's 重试 re-enters (full reload vs retained filters — decisive on a filtered workbench), or how "打开条目 | 状态自动「待查看→已查看」" flips the row (optimistic render vs server-confirm, and what the row shows while the write is in flight).

---

## 4. Implementability — 220/250 (Developer perspective)

### Layout specificity: 72/80

Responsive story is buildable for the risk center ("≥1280px 全部 8 列…768–1279px 隐藏「风险分」「降级」两列…<768px 表格降级为卡片列表") and the fixed input has a concrete offset rule ("预留 padding-bottom = 输入区实际高度（含字数/模式小字行）"). Remaining:

- **-4** — Ellipsis cells still specify "max-width + `text-overflow: ellipsis`" with no width values for any column; a developer must guess which columns truncate and at what width.
- **-2** — Pagination is "分页：< 1 2 3 > · 共 N 条" with no page-size control even though both lists declare "页大小 20 可配置" — 可配置 for whom is never resolved (config file? per-user control?).
- **-2** — History table responsive band is incomplete: "历史会话表格（6 列）同策略：<768px 折叠为卡片" defines only the <768px behavior; which columns (if any) fold in the 768–1279px band is unspecified, unlike the risk center's explicit middle band.

### Data binding explicit: 66/80

Unchanged from iteration 4 — the same four elements lack rows, and the design's own precedent ("历史诊断」入口按钮 | 无数据字段（静态导航控件）") proves the authors know static elements deserve rows:

- **-4** — Component 1's empty-state "居中引导语 + 3 个示例问题 chip" has no binding row; the chips are the first thing a new user clicks.
- **-4** — Session view's "「查看详情 → 诊断详情页」" has no binding row; Component 1 binds the identical button to `diagnosisId`, the session view leaves the id source unstated.
- **-4** — Component 3's header meta "标题：order-service · 高危 · 85分 · 09:45" has no binding row (服务名/级别/风险分/时间 are not covered by the "诊断完整内容" row's 根因/建议/引用/调用链 fields).
- **-2** — "共 N 条" pagination totals (Components 2 and 4) have no binding row.

### Interaction unambiguity: 82/90

Iteration-4's two gaps are closed: 重试失败项 now has a full row ("仅对 failedItems[] 中的条目重新提交标记请求（同一批量标记接口，已成功条目不重复提交）" + disabled-with-spinner + second-failure + auto-close), and single-item 标记已查看 exists as a first-class action with rollback. The conflict chain remains fully coded (field-mapped message, both buttons, repeat loop, 放弃 semantics). Remaining:

- **-8** — The session view's mode of appearance is self-contradictory. Component 4's Placement says "整页：顶导航 + 检索条 + 会话列表 + 会话内容视图（页内子视图）" — implying list and content coexist on one page — and the interaction says "打开会话内容视图（/opsagent/history?session=:id）| 页内切换". But the sub-view's own wireframe is a standalone page with breadcrumb "面包屑：历史诊断回溯 / 会话 <session-id>" and its interaction "面包屑「历史诊断回溯」| 返回会话列表" — implying the list is replaced. A developer cannot tell whether the list remains rendered (scroll-to? collapsible? hidden?), whether ?session=:id is a distinct route or a state flag, or what back/browser-back does. One trigger, two incompatible layout models.

---

## Blindspot Hunt

1. `[blindspot]` **[Design Integrity]** — The dark-mode blue collision recreates the exact defect iteration 4 flagged for amber, one token over. Conflict tip: "dark 底 `#172554`（blue-950）+ 字 `#93c5fd`（blue-300）"; 排查中 badge: "dark 底 `#172554` + 字 `#93c5fd`". Identical pair, two semantics (in-progress status vs concurrency warning), while the document's own rule for this family is "避免两种语义同色" and the light variants were deliberately staggered ("同族但字色错开"). Must stagger the dark 字色 (as light was) or merge the two elements' semantics explicitly.
2. `[blindspot]` **[Requirement Coverage]** — The session view silently drops PRD-mandated 编排调用链. PRD: "查看任一会话的完整内容（提问、编排调用链、报告、数据源引用）"; design: "本视图渲染完整对话记录（提问 + 系统回复）+ 诊断报告 + 数据源引用" — no 调用链 Card, no binding field. Must add the 调用链 to the session view (or cite an explicit PRD amendment).
3. `[blindspot]` **[Implementability]** — The session view has two mutually exclusive appearance models inside one component: "会话列表 + 会话内容视图（页内子视图）" + "页内切换" (coexist) vs the sub-view wireframe's "面包屑：历史诊断回溯 / 会话 <session-id>" and "返回会话列表" (replace). Must pick one model and align Placement, wireframe, and interaction rows.
4. `[blindspot]` **[Visual coherence]** — Both wireframe defects have now survived four consecutive evaluations: risk-center rows "order-svc|高危|85|09:45|待查看|查看详情" against an 8-column header with ☑ and 降级, and history's "否" against binding "为真时该行展示「降级」标签". Must redraw both wireframes to parse literally.
5. `[blindspot]` **[Accessibility]** — Success toasts are unannounced. The a11y spec covers only "错误提示与部分失败 toast 用 `role=\"alert\"`"; the success path "轻提示「已标记已查看」" has no live region, so non-visual users cannot confirm the state change. Must add `role="status"` (or aria-live) to success/light toasts site-wide.
6. `[blindspot]` **[Requirement Coverage]** — The 90-day retention rule has no UI representation. PRD: "诊断条目默认保留 90 天（可配置），超期归档不在列表展示"; the design's only empty state is "空态插画 + 「暂无诊断条目」", indistinguishable for a user whose entries were archived. Must differentiate the empty state (e.g., "暂无近期条目，历史条目保留 90 天") or add a hint surface.
7. `[blindspot]` **[Implementability]** — The history table's 768–1279px behavior is undefined: "历史会话表格（6 列）同策略：<768px 折叠为卡片" borrows only the small-screen rule; the risk center's explicit middle band ("768–1279px 隐藏「风险分」「降级」两列") has no 6-column counterpart. Must state which columns fold (or that none do) in the middle band.

---

## Verdict

Iteration 5 closed seven of the nine priority items: the conflict tint got its own blue family with an explicit anti-reuse rule, all four badge types are tokenized with light+dark values, 降级 has five enumerated surfaces, 重试失败项 and single-item 标记已查看 are first-class interaction rows with failure/termination semantics, keyboard/touch parity for hover content is specified, and the 500-character limit is a real blocking behavior. Requirement Coverage slipped for a newly-caught PRD gap (session view omits 编排调用链), and Design Integrity's gains are tempered by a fresh instance of the document's own anti-pattern — the 排查中 and conflict tokens are byte-identical in dark mode. The durable debt is unchanged: two wireframes that contradict their own tables (four iterations), four missing binding rows (three iterations), undifferentiated diagnosis-detail hierarchy, and "气泡旁". Priority fixes for iteration 6: (1) stagger the dark-mode blue pair or merge the two blue semantics, (2) add 编排调用链 to the session view, (3) resolve the session sub-view coexist-vs-replace contradiction, (4) redraw both wireframes, (5) add the four binding rows, (6) add success-toast live regions and a retention-aware empty state.
