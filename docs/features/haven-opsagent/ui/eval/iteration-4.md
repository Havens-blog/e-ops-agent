# UI Design Evaluation — Iteration 4

- **Doc**: `docs/features/haven-opsagent/ui/ui-design.md`
- **Requirement source**: `docs/features/haven-opsagent/prd/prd-ui-functions.md`
- **Rubric**: `ui-web.md` (1000 pts, 4 × 250)
- **Stance**: Adversarial. Every deduction cites the document. Scored independently on current content only; iteration-3 findings verified for resolution status.
- **Date**: 2026-09-23

## Score Summary

| Dimension | Score | Δ vs Iteration 3 |
|-----------|-------|------------------|
| Requirement Coverage | 240 / 250 | +17 |
| User Experience | 234 / 250 | +4 |
| Design Integrity | 207 / 250 | +7 |
| Implementability | 222 / 250 | +7 |
| **Total** | **903 / 1000** | **+35** |

### Iteration-3 issue resolution audit

| Iteration-3 issue | Status |
|---|---|
| Risk-badge dual color spec | **FIXED** — "风险级别徽标（唯一规范）：统一按「浅底深字」token 配对，全站仅此一种徽标配色", raw hues demoted "不作徽标填充（既不作底色也不作徽标文字色）" |
| 降级 tag style undefined | **FIXED** — dedicated token "light 底 `#fffbeb`（amber-50）+ 字 `#78350f`（amber-900），对比度 ≈10.9:1；dark 底 `#422006`（amber-950）+ 字 `#fde68a`（amber-300）" + Badge 降级标签变体 |
| 空输入禁发 | **FIXED** — "空输入时「发送」Button 置为 disabled（`disabled` 属性 + `aria-disabled`…）" + interaction row "输入为空（含仅空白字符）" |
| 时间窗超限提示 | **FIXED** — "阻止检索（不发起请求），在时间范围控件下方内联报错…并 clamp 时间选择器可选最大跨度为 24h" |
| 排查中 step enumeration | **FIXED** — "① 意图识别中 → ② 查询日志/资产/告警中 → ③ 诊断计算中 → ④ 生成报告中" + 异步阶段流转 section with failure/degradation shortcuts |
| `?from=chat` phantom source | **FIXED** — "诊断报告 Card 右下角固定「查看详情 →」outline 小按钮：点击跳转 /opsagent/diagnosis/:id?from=chat" + interaction row + binding `diagnosisId` |
| Risk-center wireframe row misalignment | **NOT FIXED** — sample rows still show 6 values against the 8-column header (no ☑, no 降级 cell) |
| History wireframe 降级 renders "否" | **NOT FIXED** — "│ │order-svc|排障|告警|09:45|否|查看" |
| State transition choreography | **PARTIALLY FIXED** — chat flow now choreographed (异步阶段流转); list/detail surfaces still unchoreographed |
| 排查中 badge position | **PARTIALLY FIXED** — "右侧显示" → "气泡旁固定状态徽标" — "旁" still vague |
| chips / header meta / pagination-total bindings | **NOT FIXED** — still no binding rows |

---

## 1. Requirement Coverage — 240/250 (PM perspective)

### UI function coverage: 80/80

All 4 UI functions have complete components; UF-4's two-step flow is intact. The last iteration-3 function gap is closed: the async progression is now fully enumerated ("① 意图识别中 → ② 查询日志/资产/告警中 → ③ 诊断计算中 → ④ 生成报告中"), step ④ explicitly maps to the PRD's second stage ("④「生成报告中」即 PRD 第二阶段，报告 Card 以 skeleton 占位出现"), and failure/degradation/超能力 shortcuts are choreographed ("降级路径在 ② 之前即被识别，跳过 ③④"). P1 restrictions honored: "[仅展示·P3 可执行]", "「待人工确认（P3）」标签". The single-item 标记已查看 gap is charged under Implementability (§4), not double-charged here.

### Navigation Architecture coverage: 38/40

Both primary nav items render on all 4 pages ("在全部 4 个页面渲染，含二级页"); both history entry doors are wired with source params ("跳转 /opsagent/history?from=chat" / "?from=risk-center"); breadcrumb sources are now all producible — the `?from=chat` phantom is closed by the report-card 查看详情 button. Remaining:

- **-2** — PRD's navigation table specifies icon keywords ("chat", "alert") for both primary nav items; the design's top bar spec ("品牌名 + 两个一级导航项 + 右侧「历史诊断」ghost 入口按钮 + 明暗切换") never mentions icons. A developer cannot know whether nav items carry icons or text only.

### State requirement coverage: 80/80

All PRD states present with matching names across all four components plus the session sub-view (including "不存在/未落库"). The PRD 报告状态 enum maps 1:1; the design adds justified bonus states (结果截断, 部分失败, 补偿提示). The PRD second stage 生成报告 is now a named step (④), not an unmodeled transition.

### Edge case handling: 42/50

Strong coverage now: empty input (including whitespace-only, "输入为空（含仅空白字符）"), time-window overflow with block + inline error + clamp, truncation disclosure on three surfaces, concurrency Dialog with repeat-conflict loop, batch partial failure with 失败清单 binding, long-text ellipsis + `break-words`, responsive card fallback. Remaining:

- **-5** — PRD UF-1 validation "输入超长（> 500 字符）提示精简" is modeled only as a passive counter: "小字提示：x/500 · 当前模式（正常/降级）". No interaction row defines what happens at >500: is sending blocked? Is a 提示精简 message shown? Does the counter change color / announce? A user typing character 501 gets no defined feedback.
- **-3** — The 降级 reason is hover-only and is lost on mobile: risk-center specifies "悬停 tooltip 展示降级原因与可用能力边界", but the <768px fallback only says "降级标签内联渲染在服务名下方小字" — the reason and capability boundary have no touch/keyboard-accessible surface.

---

## 2. User Experience — 234/250 (End-user perspective)

### Information hierarchy: 70/80

The risk-center table reads cleanly and the session view correctly separates 对话记录 from 诊断报告. Unchanged deduction (-10): diagnosis detail remains three equal-weight stacked Cards ("三条 Card 垂直堆叠") with no visual-weight guidance, and the detail header packs four semantic signals into one undifferentiated line ("标题：order-service · 高危 · 85分 · 09:45") — for a SRE scanning under incident pressure, nothing tells them the 根因结论 Card matters most.

### Interaction intuitiveness: 78/80

The conflict flow is conventional and fully labeled; chips fill the input; truncation copy tells the user what to do; the time-window error states exact copy and position ("时间范围控件下方内联报错"). Remaining (-2): the 排查中 badge position is still fuzzy — "系统气泡内 spinner + 当前步骤文字（气泡旁固定状态徽标「排查中…」）" — "气泡旁" does not resolve whether the badge sits above, below, or to the side of the streaming bubble, or whether it floats during scroll.

### Accessibility: 86/90

The a11y section is now fully consistent with the collapsed badge palette ("全站仅此一种徽标配色", all pairings carry contrast math, dark flips specified). New gains: `aria-disabled` on the disabled send button, `role="alert"` on the inline time-window error, aria-live on step-text changes. Remaining (-4): interactive disclosures that reveal essential content rely on hover with no keyboard/focus path — "悬停 tooltip 展示降级原因与可用能力边界" and "悬停 tooltip 展示全文" (long-text cells). Keyboard-only and touch users cannot reach the 降级原因 or full cell text; the a11y section's keyboard guarantee ("全站可 Tab 到达") is contradicted by hover-gated content.

---

## 3. Design Integrity — 207/250 (Designer perspective)

### Design system adherence: 62/80

The two iteration-3 token defects are closed: risk badges have one canonical 浅底深字 pairing with raw hues explicitly demoted ("原始饱和色…**不作徽标填充**…仅降级为装饰性边框/图形色"), and the 降级 tag has a full light+dark token with deliberate hue separation from 低危. New issues:

- **-8** — The conflict Dialog violates the document's own amber anti-collision principle. The palette declares: "与低危徽标（`#fef3c7`/`#92400e`）同属 amber 族但色值错开，避免两种语义同色" — yet the conflict tint is specified as "amber 浅底深字 token（底 `#fef3c7` + 字 `#92400e`）", which is byte-for-byte the 低危 badge pairing. A third amber semantic (concurrency warning) now shares exact colors with a second (low risk), differentiated only by shape ("非徽标造型") — the stated principle is contradicted by the design's own interaction table.
- **-4** — The 降级 token's reuse enumeration does not match its surfaces. Badge spec: "全站四处复用统一样式——风险中心「降级」列、诊断详情头部 badge、历史会话「降级」列、会话视图顶部 badge" — but Component 1 adds a fifth degraded-semantic surface: "降级 | Card 顶部「降级模式」badge". Whether the chat 降级模式 badge uses the 降级 token or a different style is undefined; a fifth instance will be styled ad hoc.
- **-6** — Four badge-styled elements have no palette definition at all: the 截断徽标 (three surfaces), the 「排查中…」徽标, the 「超能力意图」badge, and the 「降级模式」badge. The Badge spec covers only "风险徽标见色板语义" and the 降级 variant; every other badge in the product is untokenized.

### Visual coherence: 77/90

Shared top bar and source-aware breadcrumbs are identical across all four pages — cross-page navigation coherence holds. Remaining wireframe defects:

- **-8** — Component 2's sample rows still do not parse against their own 8-column header (`☑|服务名|级别徽标|风险分|时间|状态|降级|操作`): "│ │order-svc|高危|85|09:45|待查看|查看详情" shows 6 values with no checkbox and no 降级 cell. The primary work surface's diagram remains internally inconsistent with its column definition and the 降级 column binding.
- **-5** — Component 4's 降级 column still renders a boolean where the binding promises a tag: "│ │order-svc|排障|告警|09:45|否|查看" vs binding "为真时该行展示「降级」标签". Two representations of the same field in one component, unchanged for three iterations.

### State completeness: 68/80

No happy-path-only violation; the chat flow is now genuinely choreographed (异步阶段流转 defines step order, skeleton handoff, and shortcut paths to 降级/引导式/错误). Remaining (-12): the list and detail surfaces still have no transition choreography — nothing defines how 加载中 resolves to 空 vs 有数据, what the 错误 state's 重试 re-enters (full reload vs retained filters), how a row visually flips "待查看→已查看" after "打开条目" (optimistic vs server-confirm), or how the 部分失败 toast's "重试失败项" terminates (all retried succeed → does the toast clear, does the row update?). For a multi-user workbench where state is the core object, these handoffs are the states that matter most.

---

## 4. Implementability — 222/250 (Developer perspective)

### Layout specificity: 75/80

The responsive story is buildable: breakpoints with column folding ("≥1280px 全部 8 列…768–1279px 隐藏「风险分」「降级」两列…<768px 表格降级为卡片列表"), sticky batch bar, filter collapse to Dialog, and the fixed input disambiguated with a concrete offset rule ("预留 padding-bottom = 输入区实际高度（含字数/模式小字行）"). Remaining (-5): no column-width or max-width values for the ellipsis cells (rule stated, values not), and pagination remains "分页：< 1 2 3 > · 共 N 条" with no page-size control despite both lists declaring "页大小 20（可配置）".

### Data binding explicit: 66/80

Iteration-2/3 orphans (conflict fields, failedItems[], pendingCompensationCount, truncated/totalMatched, static history button) remain closed, and the report-card 查看详情 now has a binding ("diagnosisId…拼入 /opsagent/diagnosis/:id?from=chat"). Remaining:

- **-4** — Component 1's empty state ("居中引导语 + 3 个示例问题 chip") has no binding row. The design set its own precedent by binding the history button as "无数据字段（静态导航控件）"; the chips — the first thing a new user clicks — get nothing.
- **-4** — The session view's "「查看详情 → 诊断详情页」" button has no binding row. Component 1 binds the identical button to `diagnosisId`; the session view omits it, leaving the id source (会话完整内容.report? session record?) unstated.
- **-4** — Component 3's header meta "标题：order-service · 高危 · 85分 · 09:45" has no binding row (inferable but not explicit — the rubric demands explicit mapping).
- **-2** — "共 N 条" pagination totals (Components 2 and 4) have no binding row.

### Interaction unambiguity: 81/90

The conflict chain is fully coded (message text with field mapping, both buttons, repeat-conflict loop, 放弃 semantics); the async progression is now enumerable. Remaining:

- **-5** — PRD UF-2: "支持单条/批量标记已查看/已处理". The design covers batch 标记已查看 (batch bar), auto-flip on open ("状态自动「待查看→已查看」"), and 单条/批量 标记已处理 — but an explicit single-item 标记已查看 action (without opening the item) exists on no surface. Half of a PRD-mandated action pair is missing.
- **-4** — 「重试失败项」appears in the States table ("顶部 toast 回显失败清单 + 「重试失败项」") and in Data Binding (`failedItems[]`), but has no row in Component 2's Interactions table. Trigger → action → feedback for the retry (scope: only failed items? which endpoint? what feedback on second failure?) is undefined — an element that exists in two tables but not the one that governs its behavior.

---

## Blindspot Hunt

1. `[blindspot]` **[Design Integrity]** — The conflict Dialog reuses the 低危 badge's exact colors after the palette explicitly forbids amber semantic color-collisions. Palette: "与低危徽标（`#fef3c7`/`#92400e`）同属 amber 族但色值错开，避免两种语义同色"; conflict row: "amber 浅底深字 token（底 `#fef3c7` + 字 `#92400e`）". Must assign the conflict tint its own hue pair (as was done for the 降级 tag) or explicitly amend the principle to permit shape-based disambiguation.
2. `[blindspot]` **[Design Integrity]** — Four badge types ship untokenized. The palette defines risk badges, the 降级 tag, red tinted bars, and the conflict amber — but the 截断徽标 ("报告卡片顶部截断徽标"), the 「排查中…」徽标 ("气泡旁固定状态徽标"), the 「超能力意图」badge, and the 「降级模式」badge ("Card 顶部「降级模式」badge") appear in state tables and wireframes with zero color/style specification. Must add tokens or a default-badge rule to the Badge spec.
3. `[blindspot]` **[Implementability]** — 「重试失败项」is bound and displayed but not interactive in spec. It exists in the States row ("顶部 toast 回显失败清单 + 「重试失败项」") and Data Binding (`failedItems[]`), yet Component 2's Interactions table — the table that defines "every trigger → action → feedback chain" — contains no retry row. Must add a retry interaction row including second-failure behavior and toast termination.
4. `[blindspot]` **[Accessibility]** — Hover-gated content breaks the keyboard guarantee. The a11y section promises "全站可 Tab 到达", while 降级原因 ("悬停 tooltip 展示降级原因与可用能力边界") and long-text full content ("悬停 tooltip 展示全文") are reachable only by mouse hover. Must specify focus-triggered tooltips or an alternative disclosure (expandable cell, details element) for keyboard/touch.
5. `[blindspot]` **[Requirement Coverage]** — The >500 character rule has a display but no behavior. PRD: "输入超长（> 500 字符）提示精简"; design's only artifact is "小字提示：x/500". No maxlength, no block, no 提示精简 message, no aria announcement at the limit. Must add an interaction/validation row (e.g., block send + inline prompt at >500).
6. `[blindspot]` **[Visual coherence]** — Two wireframes still contradict their own tables after three iterations. Risk-center: header "☑|服务名|级别徽标|风险分|时间|状态|降级|操作" vs row "order-svc|高危|85|09:45|待查看|查看详情" (6 values, no ☑/降级); history: "否" in the 降级 column vs binding "为真时该行展示「降级」标签". Must redraw both wireframes to parse literally.

---

## Verdict

Iteration 4 closed all six priority items from iteration 3: the risk badge now has exactly one token pairing with raw hues demoted to decorative use, the 降级 tag has a full light/dark token with deliberate hue separation, 空输入禁发 and 时间窗超限 are real validation behaviors (block + inline error + clamp), the async progression is step-enumerated with failure shortcuts, and the `?from=chat` source is produced by a bound 查看详情 button. Requirement Coverage and UX are now near-complete; the defect frontier has moved to token hygiene and interaction-table completeness: the conflict Dialog violates the document's own amber anti-collision principle by reusing the 低危 pairing, four badge types remain untokenized, 「重试失败项」lives in two tables but not the Interactions table, and the single-item 标记已查看 half of a PRD-mandated action pair is still missing. The two wireframe defects (misaligned risk-center rows, 否 in the history 降级 column) have survived three iterations unchanged. Priority fixes for iteration 5: (1) give the conflict tint its own hue pair or amend the anti-collision principle, (2) tokenize 截断/排查中/超能力意图/降级模式 badges, (3) add 重试失败项 interaction row + second-failure behavior, (4) add single-item 标记已查看, (5) add >500 提示精简 behavior, (6) fix the two wireframes and the four missing binding rows.
