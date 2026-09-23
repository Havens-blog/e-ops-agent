# UI Design Evaluation — Iteration 6

- **Doc**: `docs/features/haven-opsagent/ui/ui-design.md`
- **Requirement source**: `docs/features/haven-opsagent/prd/prd-ui-functions.md`
- **Rubric**: `ui-web.md` (1000 pts, 4 × 250)
- **Stance**: Adversarial. Every deduction cites the document. Scored independently on current content only; iteration-5 findings verified for resolution status.
- **Date**: 2026-09-23

## Score Summary

| Dimension | Score | Δ vs Iteration 5 |
|-----------|-------|------------------|
| Requirement Coverage | 245 / 250 | +10 |
| User Experience | 236 / 250 | 0 |
| Design Integrity | 233 / 250 | +12 |
| Implementability | 236 / 250 | +16 |
| **Total** | **950 / 1000** | **+38** |

### Iteration-5 issue resolution audit

| Iteration-5 issue | Status |
|---|---|
| Dark-mode blue collision (排查中 = conflict token, byte-identical) | **FIXED** — 排查中 dark 字色 staggered to "`#bfdbfe`（blue-200，对比度 ≈10.2:1）", explicit rule "dark 侧同样字色错开（`#bfdbfe` vs `#93c5fd`）" |
| Session view drops PRD-mandated 编排调用链 | **FIXED** — wireframe adds "编排调用链 Card（可折叠）", binding adds "会话完整内容.orchestrationTrace（调用链步骤有序数组：工具/节点名 + 输入摘要 + 输出摘要）" |
| Session sub-view coexist-vs-replace contradiction | **FIXED** — resolved to replace: "`?session=:id` 存在即渲染子视图、列表不渲染——两者互斥，非同页共存"; browser-back defined ("浏览器后退等价面包屑返回列表"); sub-view return clears `?session` |
| Risk-center wireframe rows vs 8-column header | **FIXED** — rows now parse: "│ │ ☑\|order-svc\|高危\|85\|09:45\|待查看\|—\|查看详情 ⋯│" (8 values incl. ☑ and 降级 cell) |
| History wireframe 降级 renders "否" | **FIXED** — now "—", matching binding "为假时展示「—」" |
| Binding rows: chips / session 查看详情 / detail header meta / 共 N 条 | **FIXED** — all four added ("suggestedQuestions[]", "会话完整内容.report.diagnosisId", "标题行元数据…服务名 / 风险级别枚举 / 风险分 / 诊断创建时间", "totalCount" ×2) |
| Success toast has no live-region announcement | **FIXED** — "成功类轻提示全站统一用 `role=\"status\"`（polite 播报一次，与错误的 alert 语义区分），覆盖「已标记已查看」轻提示、批量标记全部成功 toast、重试全部成功 toast" |
| 90-day retention unmodeled | **NOT FIXED** — empty state still "空态插画 + 「暂无诊断条目」"; no archive-aware copy or surface anywhere |
| History table 768–1279px band undefined | **NOT FIXED** — still "历史会话表格（6 列）同策略：<768px 折叠为卡片"; middle band unstated |
| Nav icon keywords (PRD: chat / alert) | **NOT FIXED** — top bar spec still "品牌名 + 两个一级导航项 + …" with no icon mention |
| Diagnosis-detail information hierarchy | **NOT FIXED** — still "三条 Card 垂直堆叠" + undifferentiated header |
| 排查中 badge position "气泡旁" | **NOT FIXED** — wording unchanged |
| List/detail state transition choreography | **NOT FIXED** — 加载中→空 vs 有数据, 错误重试 re-entry, auto-flip in-flight rendering all still undefined |

**New issues found this iteration**: Dialog spec hardcodes light-only values ("内容白底") against the dark token system; the blue pair's own "两端错开" claim is false (底端 identical in both modes); session-view header meta is an orphan element; Component 2 filter bar lacks the 检索条件 binding row its sibling Component 4 has; chat wireframe files 错误 under "状态徽标" contradicting the 提示条 state.

---

## 1. Requirement Coverage — 245/250 (PM perspective)

### UI function coverage: 80/80

All 4 UI functions have components. Iteration-5's PRD-narrowing is repaired: the session view now renders "提问 + 系统回复" plus 诊断报告, 编排调用链, and 引用, with an explicit binding ("会话完整内容.orchestrationTrace"). Async progression ("① 意图识别中 → ② 查询日志/资产/告警中 → ③ 诊断计算中 → ④ 生成报告中"), validation rules (empty input, 500-char, truncation on three surfaces with exact PRD copy "结果已截断，共 N 条匹配，请缩小时间窗或服务范围"), P1 restrictions ("[仅展示·P3 可执行]", "「待人工确认（P3）」标签"), both history entries, and the full concurrency loop (stale detection → Dialog → 覆盖提交/放弃 → repeat-conflict) are all modeled.

### Navigation Architecture coverage: 38/40

Both primary nav items render on all 4 pages ("Top navigation bar…在全部 4 个页面渲染，含二级页"); both history entries carry source params (`?from=chat`, `?from=risk-center`); diagnosis-detail breadcrumbs are source-aware (`?from=risk-center|chat|history`); every navigation target is a defined page. Remaining:

- **-2** — PRD's primary navigation table specifies icon keywords ("chat", "alert"); the design's top bar spec ("品牌名 + 两个一级导航项 + 右侧「历史诊断」ghost 入口按钮 + 明暗切换") still never mentions icons. Third iteration with this gap.

### State requirement coverage: 80/80

All PRD states present across all four components plus the session sub-view (加载中/完成/降级/不存在-未落库); the PRD 报告状态 enum maps 1:1 to the chat States table; 部分失败, 结果截断, 补偿提示 are justified additions.

### Edge case handling: 47/50

Whitespace-only input blocked ("输入为空（含仅空白字符）"), 500-char hard stop with `maxLength` truncation + red counter + `role="status"` + send disable, time-window overflow blocked before request with inline error and clamp, truncation disclosed on three surfaces, concurrency Dialog with repeat loop and 放弃 semantics, partial-failure retry with second-failure and termination ("全部成功则 toast 自动关闭"), single-item rollback ("失败则行状态回滚并弹错误提示"), mobile tap-to-expand for degradation reasons. Remaining:

- **-3** — PRD UF-2: "诊断条目默认保留 90 天（可配置），超期归档不在列表展示". The design's only empty state is "空态插画 + 「暂无诊断条目」" — indistinguishable between "no entries ever" and "entries aged out after 90 days". An SRE looking for a 4-month-old incident gets first-run guidance instead of an archive explanation. The rule has no representation in any state, copy, or binding. Second iteration.

---

## 2. User Experience — 236/250 (End-user perspective)

### Information hierarchy: 70/80

Risk center reads well (filters → batch bar → table with clear action column); the session view correctly separates 对话记录 from 诊断报告; the conflict Dialog's 覆盖提交（destructive）/放弃（secondary）pairing assigns correct affordance weight. Unchanged third-iteration deduction (-10): diagnosis detail remains three equal-weight stacked Cards ("三条 Card 垂直堆叠") with no visual-weight guidance, and the header packs four signals into one undifferentiated line ("标题：order-service · 高危 · 85分 · 09:45"). Under incident pressure nothing marks 根因结论 as the primary object; 风险分/时间 compete with 级别 for attention at the same size.

### Interaction intuitiveness: 78/80

Conventional patterns throughout: chips fill the input, truncation copy says what to do ("请缩小时间窗或服务范围"), the time-window error states its exact position ("时间范围控件下方内联报错"), the session sub-view is a standard drill-down with browser-back parity. Remaining (-2): the 排查中 badge position is still "（气泡旁固定状态徽标「排查中…」）" — "旁" does not resolve above/below/side, nor whether the badge scrolls with the bubble or pins during a long conversation. Third iteration.

### Accessibility: 88/90

The a11y layer is now near-complete: contrast math stated for every token pair including dark flips; visible labels on all inputs ("筛选条不允许仅 placeholder 承载语义"); keyboard parity for hover content ("「悬停 + 聚焦」双触发（元素 `tabindex=0`，focus / Enter / Space 打开，Esc / 失焦关闭）") with touch tap-to-expand; Dialog focus trap + focus return; `aria-live` for step changes, `aria-busy` on skeletons, `role="alert"` for errors, and — new this iteration — `role="status"` for the full success-toast family. Remaining:

- **-2** — Clickable table rows have no keyboard spec. Risk-center 有数据 state: "点击行查看详情"; the a11y keyboard list ("结论行、折叠调用链、示例 chip 均实现为 `<button>`") does not include table rows, so the row-click affordance is mouse-only. The per-row 「查看详情」 link is a keyboard-usable fallback, but the primary scanning affordance silently fails Tab users — the same class of gap the doc just closed for tooltips.

---

## 3. Design Integrity — 233/250 (Designer perspective)

### Design system adherence: 73/80

Iteration-5's dark-mode blue collision is closed with explicit staggering rules and contrast math. But two new token-discipline defects:

- **-4** — The blue pair's stagger claim is factually false on the 底端. The doc asserts the 排查中 badge is "与冲突提示 token 同族但**两端错开**", then lists only 字色 stagger: "light 侧字色错开（`#1d4ed8` vs `#1e40af`）,dark 侧同样字色错开（`#bfdbfe` vs `#93c5fd`）". Both 底 values are identical in both modes (light `#dbeafe`/`#dbeafe`; dark `#172554`/`#172554`). The amber precedent it cites actually staggers both ends (降级 `#fffbeb`/`#78350f` vs 低危 `#fef3c7`/`#92400e`). The document's own distinguishing test — "避免两种语义同色" — is met only by a single adjacent-shade step on one end (blue-700 vs blue-800), which is not reliably distinguishable; the claim of equivalence with the amber treatment is not supported by the tokens themselves.
- **-3** — The Dialog spec hardcodes light-only values: "Dialog：遮罩黑 80% + backdrop-blur，内容白底 rounded-lg max-w-lg". The dark palette declares "与 Light 同名变量整体切换…全站换肤" — a literal 白底 Dialog renders white in dark mode. Every other component spec is token-based; the Dialog is the one surface with baked-in light colors, a guaranteed dark-mode visual break.

### Visual coherence: 88/90

Both chronic wireframe defects are repaired — risk-center rows parse against their 8-column header with ☑ and 降级 cells, and history's "—" now matches its binding. Shared top bar identical across all pages, source-aware breadcrumbs consistent, badge family shares pill shape and text-xs, 降级 token enumerated at exactly its five surfaces. Remaining:

- **-2** — The chat wireframe files the error state under the badge family: "状态徽标：降级/引导式回应/错误". The States table defines 错误 as "红 tinted 提示条 + 重试按钮" — a banner, not a badge — and the palette section separately mandates "「红 tinted 提示条」…不再使用无 token 的裸红色". The diagram contradicts the state definition it illustrates; same defect class as the wireframe bugs just fixed elsewhere.

### State completeness: 72/80

No happy-path-only violation; chat flow fully choreographed (step order, skeleton handoff at ④, degradation short-circuit "在 ② 之前即被识别，跳过 ③④", 超能力 short-circuit after ①); retry lifecycle closed with termination; single-item rollback defined. Remaining (-8): the list and detail surfaces still lack transition choreography — nothing defines how 加载中 resolves to 空 vs 有数据, what the 错误 state's 重试 re-enters (full reload vs retained filters — decisive on a filtered workbench), or how "打开条目 | 状态自动「待查看→已查看」" renders in flight (optimistic flip vs server-confirm, and what the row shows while the write is pending or fails, unlike the menu path which has explicit rollback). Fourth iteration on this gap.

---

## 4. Implementability — 236/250 (Developer perspective)

### Layout specificity: 72/80

Responsive story is buildable for the risk center (explicit three-band spec with column folding and in-column compensation: "风险分并入级别徽标 tooltip、降级标签内联渲染在服务名下方小字") and the fixed input has a concrete offset rule ("预留 padding-bottom = 输入区实际高度（含字数/模式小字行）"). Remaining:

- **-4** — Ellipsis cells still specify "max-width + `text-overflow: ellipsis`" with no width values for any column; a developer must guess which columns truncate and at what width. Third iteration.
- **-2** — "页大小 20 可配置" (both lists) is never resolved to a mechanism — config file, per-user control, or query param; the pagination UI ("分页：< 1 2 3 > · 共 N 条") has no page-size affordance.
- **-2** — History table's middle band is still undefined: "历史会话表格（6 列）同策略：<768px 折叠为卡片" borrows only the <768px rule; which columns (if any) fold at 768–1279px is unstated, unlike the risk center's explicit middle band. Third iteration.

### Data binding explicit: 74/80

Iteration-5's four orphans are all closed. Two same-class orphans remain, both newly surfaced:

- **-4** — The session view's header line "标题：order-svc · 排障 · 触发来源:告警 · 09:45" has no binding row. Component 3's analogous header just received one ("服务名 / 风险级别枚举 / 风险分 / 诊断创建时间"), proving the authors' own standard; the session view's four header fields (服务名/意图/触发来源/时间) are covered by no row (对话记录 binds only `.messages[]`).
- **-2** — Component 2's filter bar (租户/时间/服务名) has no 检索条件 binding row, while sibling Component 4 binds the identical control ("检索条件 | 租户/时间窗/服务名 | 用户输入 + 租户注入"). One filter bar is bound, its twin is not — an inconsistency a developer resolves by guessing.

### Interaction unambiguity: 90/90

Every trigger → action → feedback chain is explicit. The conflict chain is fully coded (field-mapped message "该条目已被其他值班更新为 {X}" with `conflict.conflictStatus`, both buttons, repeat loop "再次冲突则重新弹出 Dialog", 放弃 semantics). 重试失败项 has scope, in-flight state, second-failure behavior, and termination. Single-item 标记已查看 has rollback. The session sub-view now has one coherent model: route-driven replacement (`?session`), browser-back parity, breadcrumb return with `?session` cleared.

---

## Blindspot Hunt

1. `[blindspot]` **[Design Integrity]** — The Dialog spec hardcodes light-only values against the theme system: "Dialog：遮罩黑 80% + backdrop-blur，内容白底 rounded-lg max-w-lg" vs dark mode's "与 Light 同名变量整体切换…全站换肤". Must re-express Dialog in tokens (`--card`, overlay token) or explicitly state dark overrides.
2. `[blindspot]` **[Design Integrity]** — The blue stagger claim is internally false: "同族但两端错开" is followed by stagger evidence for 字色 only ("light 侧字色错开…dark 侧同样字色错开"), while 底 is byte-identical in both modes (`#dbeafe`; `#172554`). Must either stagger the 底 (as amber does: `#fffbeb` vs `#fef3c7`) or weaken the claim and justify why a one-step 字色 delta suffices for two different semantics.
3. `[blindspot]` **[Implementability]** — Session-view header "标题：order-svc · 排障 · 触发来源:告警 · 09:45" is an orphan element: no binding row covers 服务名/意图/触发来源/时间, while Component 3's equivalent header is bound. Must add the row (source: 落库会话记录头部字段).
4. `[blindspot]` **[Implementability]** — Component 2's filter bar is unbound while Component 4 binds the same control ("检索条件 | 租户/时间窗/服务名 | 用户输入 + 租户注入"). Must add the 检索条件 row to Component 2.
5. `[blindspot]` **[Requirement Coverage]** — The 90-day retention rule remains unrepresented: PRD "诊断条目默认保留 90 天（可配置），超期归档不在列表展示" vs the design's only empty state "空态插画 + 「暂无诊断条目」". Must differentiate the empty state (e.g., "近 90 天暂无条目，更早条目已归档") or add an archive hint.
6. `[blindspot]` **[Visual coherence]** — Chat wireframe "状态徽标：降级/引导式回应/错误" contradicts the States table where 错误 is "红 tinted 提示条 + 重试按钮", not a badge. Must redraw the wireframe to show the 提示条 for the error state.
7. `[blindspot]` **[Accessibility]** — "点击行查看详情" (risk center 有数据) is a mouse-only affordance; the keyboard inventory ("结论行、折叠调用链、示例 chip 均实现为 `<button>`") omits table rows. Must make rows keyboard-activatable (or document the 查看详情 link as the sole path and remove row-click ambiguity for assistive tech).
8. `[blindspot]` **[Requirement Coverage]** — Nav icon keywords from the PRD ("chat", "alert") remain unadopted after three iterations; the top bar spec lists no icons. Must specify icon usage per PRD or record a deviation.
9. `[blindspot]` **[Implementability]** — The history table's 768–1279px band is still undefined ("历史会话表格（6 列）同策略：<768px 折叠为卡片"). Must state which of the 6 columns fold in the middle band or that none do.

---

## Verdict

Iteration 6 closed all seven fixable priority items from iteration 5, including both chronic wireframe defects (fixed on their fourth attempt) and all four missing binding rows. Requirement Coverage regains the session 调用链 points; Implementability gains most (+16) as the data-binding table reaches near-orphan-free state. The two surviving blockers are behavioral, not structural: the diagnosis-detail page still has no information hierarchy (third iteration), and list/detail state-transition choreography is still undefined (fourth iteration). Two fresh token defects were introduced alongside the fixes — a Dialog spec hardcoded to light mode, and a blue-pair stagger claim its own hex values refute. Priority fixes for iteration 7: (1) token-rebase the Dialog for dark mode, (2) stagger the blue 底 or weaken the "两端错开" claim, (3) bind the session-view header and Component 2 filter bar, (4) add a retention-aware empty state, (5) define 加载中→空/有数据 resolution and the auto-flip in-flight rendering, (6) give the diagnosis-detail header and 根因结论 Card visual weight, (7) fix the chat wireframe's 错误 badge, (8) keyboard-enable table rows, (9) state nav icons and the history middle band.
