# UI Design Evaluation — Iteration 1

- **Doc**: `docs/features/haven-opsagent/ui/ui-design.md`
- **Requirement source**: `docs/features/haven-opsagent/prd/prd-ui-functions.md`
- **Rubric**: `ui-web.md` (1000 pts, 4 × 250)
- **Stance**: Adversarial. Every deduction cites the document.
- **Date**: 2026-09-23

## Score Summary

| Dimension | Score |
|-----------|-------|
| Requirement Coverage | 145 / 250 |
| User Experience | 155 / 250 |
| Design Integrity | 175 / 250 |
| Implementability | 170 / 250 |
| **Total** | **645 / 1000** |

---

## 1. Requirement Coverage — 145/250 (PM perspective)

### UI function coverage: 40/80

All 4 UI functions map to components (1↔UF-1, 2↔UF-2, 3↔UF-3, 4↔UF-4), so the top-level mapping holds. But the mapping is shallow:

- **-30 (UI function gap)** — UF-4's core deliverable is the session-content view. PRD: "点击某会话 → 展示会话完整内容（对话记录 + 诊断报告 + 数据源引用）→ 点击「查看详情」进入诊断详情页". The design collapses this to a single hop: `点「查看」 | 进入 /opsagent/diagnosis/:id`. There is no surface anywhere in the design that renders 对话记录 (conversation transcript). A developer implementing from this doc cannot satisfy UF-4.
- **-10** — UF-2 requires a visible 降级 label on list rows: "为真时列表条目展示「降级」标签，悬停或详情页展示降级原因与可用能力边界". The design's risk-center Data Binding has a 降级标识 row, but the layout column list `☑|服务名|级别徽标|风险分|时间|状态|操作详情` contains no such column/label — the data is bound to nothing visible.

### Navigation Architecture coverage: 0/40

- **-20** — 诊断详情's return target is source-dependent per PRD: "Return Target: /opsagent/risk-center（或 /opsagent/chat、/opsagent/history）". The design hardcodes one parent: `面包屑：风险中心 / 诊断详情`. Entry from chat or history breaks the mandated back-navigation.
- **-20** — 历史诊断回溯 has two PRD entry points: "UF-1「历史诊断」入口（对话页）或风险中心检索". The design's risk-center component contains no entry to /opsagent/history, and its history breadcrumb `对话排障 / 历史诊断回溯` hardcodes the chat parent, contradicting "按进入来源返回".

### State requirement coverage: 75/80

Strong. All 6 UF-1 states, 4 UF-2 states (+1 bonus 部分失败), 3 UF-3 states, 6 UF-4 states appear in the design's state tables with matching names. Minor deduction: PRD UF-1 states include the transition semantics 排查中 → 生成报告 ("支持流式/异步展示报告生成状态（排查中 → 生成报告）"); the design only renders a spinner + "当前步骤文字" without defining what "当前步骤" values exist or how 状态 advances.

### Edge case handling: 30/50

- **-10** — logquery truncation disclosure is a mandated, quoted-string rule: "报告卡片明示「结果已截断，共 N 条匹配，请缩小时间窗或服务范围」，不得静默丢弃超出部分". Zero occurrences of 截断 in the design.
- **-5** — 空输入不可发送 is not addressed: no disabled state, no send-gate behavior. The input area spec (`Input + 「发送」Button`) implies send is always clickable.
- **-5** — History time-window overflow: PRD "超出提示用户缩小范围"; design only writes `时间窗(≤24h)` with no overflow behavior.
- No long-text overflow rules (table cells, long conclusions, long service names), no slow-network handling on chat beyond the single 错误 state.

---

## 2. User Experience — 155/250 (End-user perspective)

### Information hierarchy: 60/80

Risk badges and risk score give the risk-center list a scannable hierarchy, and the chat's bubble-vs-card split separates user from system. But the wireframes give no relative weight guidance inside the diagnosis report (根因结论 / 处置建议 / 引用 are three equal Cards), and "高危行级别徽标红底、「待人工确认（P3）」标签" stacks semantic signals without specifying which dominates.

### Interaction intuitiveness: 60/80

- **-10** — The history flow bait-and-switch: a user clicking 「查看」 on a *session* row expects the session content they were promised; instead they land on a single diagnosis detail page (`进入 /opsagent/diagnosis/:id`) that shows neither the question nor the conversation. The PRD's two-step flow exists precisely to avoid this.
- **-10** — Concurrency feedback uses an undefined color: "并发冲突 … 黄色提示条". Users will read "yellow" as amber = 低危 semantics defined in the palette ("低危 `#f59e0b`"), conflating a data-conflict warning with a risk level. No conventional pattern (toast vs banner) is committed.

### Accessibility: 35/90

- **-40** — Zero accessibility statements in the entire document. No form labels for the filter inputs (服务名/时间范围), no keyboard navigation spec (batch-select checkboxes, expandable 结论行, 折叠调用链), no focus management for Dialog ("遮罩黑 80% + backdrop-blur" with no focus-trap/return), no aria-live for the purely visual spinner state or skeleton states.
- **-15** — Contrast failure baked into the palette: 低危 `#f59e0b`（amber-500）as badge text/fill on white card surfaces is ≈2.2:1, well under WCAG 4.5:1. The doc's own rule "仅在级别语义处使用" makes it unavoidable on every 低危 row.

---

## 3. Design Integrity — 175/250 (Designer perspective)

### Design system adherence: 55/80

- **-15** — Dark mode is committed ("light 默认 / dark 可切", 明暗切换 interaction "全站换肤") but only the Light palette table exists. No dark token values, so the switch is unimplementable as specified.
- **-10** — Undocumented colors: "红 tinted 提示条" (which red? --destructive at what opacity?) and "黄色提示条" — neither is a defined token; the palette explicitly restricts semantic colors to risk levels.

### Visual coherence: 55/90

- **-30 (cross-page inconsistency)** — PRD: "Primary Navigation (shared across pages)". Components 1 and 2 render the shared top bar; Components 3 and 4 wireframes show only a breadcrumb (`面包屑：风险中心 / 诊断详情`, `面包屑：对话排障 / 历史诊断回溯`) with no top navigation bar. A user navigating chat → history → diagnosis loses the primary nav mid-flow; the design contradicts its own 布局 claim of a shared bar.
- **-5** — Typos/placeholder-grade text in spec: "降级标识 badage（如有）" (badage), and the history wireframe row `order-svc|排障|告警|09:45|否|查看` misaligned with the 6-column header.

### State completeness: 65/80

Every component has a state table including Error/Empty — no happy-path-only violation. But state *transitions* are undefined: nothing says how 加载中 → 空 vs 加载中 → 有数据 is decided, how 错误 → retry re-enters the flow, or how the risk-center row moves 待查看 → 已查看 visually (does the row re-render in place? does the badge flip with animation?). States are enumerated, not choreographed.

---

## 4. Implementability — 170/250 (Developer perspective)

### Layout specificity: 60/80

Token-level specs (h-9, p-6, rounded-md/lg, max-w-lg dialog) are good. But: chat "输入区：fixed 底部" conflicts with the ASCII layout showing it inside the page flow (fixed relative to what — viewport or a scroll container?); table column widths/ellipsis rules unspecified; pagination component ("页大小 20 可配置") has no control spec; "无强制 max-width，fluid" gives no breakpoint behavior at all — responsive is entirely absent.

### Data binding explicit: 35/80

- **-30 (orphan element)** — History 补偿提示 ("顶部提示「部分会话补偿入库中」") has no row in Component 4's Data Binding table (only 历史会话列表/检索条件/降级标识). What field tells the UI a compensation queue exists?
- **-15 (orphan, softer)** — Risk-center 部分失败 state ("顶部 toast 回显失败清单 + 「重试失败项」") has no Data Binding row for the failure list or per-item failure reason.

### Interaction unambiguity: 75/90

- **-15** — `点「历史诊断」入口 | 跳转 /opsagent/history` references a control that appears nowhere in Component 1's Layout Structure (the wireframe shows only 导航 / 对话流 / 输入区). Where is this entry rendered? Also "排查中 … 右侧显示「排查中…」" — right side of what is unspecified; and "面包屑 | 返回来源页" has no mechanism (browser history? explicit state param?).

---

## Blindspot Hunt

1. `[blindspot]` **[Requirement Coverage]** — The design silently drops a quoted, non-negotiable disclosure string. PRD: "报告卡片明示「结果已截断，共 N 条匹配，请缩小时间窗或服务范围」，不得静默丢弃超出部分". ui-design.md contains no truncation mention on the chat card or the diagnosis detail. Must add: truncation badge + count + guidance on both report surfaces, bound to a data field.
2. `[blindspot]` **[Requirement Coverage]** — The history component is not UF-4, it is a shortcut to UF-3. PRD: "查看任一会话的完整内容（提问、编排调用链、报告、数据源引用）". Design: "点「查看」 | 进入 /opsagent/diagnosis/:id". Must add a session-content view (Component 5 or an expansion state) with its own states and data binding.
3. `[blindspot]` **[Design Integrity]** — Shared navigation silently vanishes on secondary pages. PRD: "Primary Navigation (shared across pages)"; design wireframes for Components 3/4 start at "面包屑：…". Must re-state the top bar on all four pages and make breadcrumbs source-aware.
4. `[blindspot]` **[User Experience]** — The chosen semantic color fails its own accessibility bar. Palette: "低危 `#f59e0b`（amber-500）". On #ffffff this is ≈2.2:1 contrast. Must darken (e.g. amber-600/700) or add a foreground/border pairing, and add an a11y section (labels, keyboard, aria-live, dialog focus).
5. `[blindspot]` **[Implementability]** — Two state-driven UI elements have no data source: "顶部提示「部分会话补偿入库中」" and "顶部 toast 回显失败清单 + 「重试失败项」". Both must get Data Binding rows (field + source) or they cannot be coded.
6. `[blindspot]` **[Requirement Coverage]** — The risk-center list never shows the 降级 label the PRD requires on rows: "为真时列表条目展示「降级」标签". The column list omits it. Must add the tag (column or inline badge) plus hover/detail 原因 disclosure.

---

## Verdict

The design system layer (tokens, typography, component specs) is the strongest part and is genuinely implementable. The document fails as a *flow* specification: it flattens UF-4 into UF-3, hardcodes back-navigation that the PRD defines as source-dependent, drops two mandated disclosure strings (truncation, 降级 row label), omits the shared nav on half the pages, and contains no accessibility work at all. Priority fixes for iteration 2: (1) session-content view, (2) source-aware breadcrumbs + top bar on all pages, (3) truncation + 降级标签 coverage, (4) a11y pass, (5) data-binding rows for 补偿提示 and 失败清单.
