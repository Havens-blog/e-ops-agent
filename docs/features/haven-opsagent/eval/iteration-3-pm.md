# Iteration 3 — PM Eval Report (Adversarial, Mode A)

**Score**: 930/1000 (Target: 900) | Previous merged: 892/1000
**Scorer stance**: Adversarial PM — score only what is on the page.

## Regression Check — Iteration 2 Attack Points (all verified fixed)

| # | Prev attack | Status | Evidence |
|---|---|---|---|
| 1 | ChatOnly dead-end | FIXED | `ChatOnly --> End([结束])` (prd-spec.md L105) |
| 2 | 处理状态本地来源矛盾 | FIXED | 「服务端（落库，以服务端状态为准）…多人并发以服务端最新状态做 stale 检测」(prd-ui-functions.md L103) |
| 3 | 去重窗口未定义 | FIXED | 「窗口默认 10 分钟，可配置」(prd-spec.md L69, L147) |
| 4 | 队列容量未定义 | FIXED | 「排查等待队列长度默认上限 100 条（可配置）」(prd-spec.md L145) |
| 5 | 渠道清单「等」未闭合、无推送 AC | FIXED | 「钉钉 / 飞书 / 企业微信 / 邮件」枚举闭合 + Story 1 推送 AC (prd-user-stories.md L43) |
| 6 | 降级标识无字段 | FIXED | UF-2 / UF-4 均有「降级标识」字段及展示规则 (prd-ui-functions.md L104, L186) |
| 7 | 并发标记无 AC | FIXED | Story 1 stale 检测 GWT AC (prd-user-stories.md L47-49) |
| 8 | 高危无负向 AC | FIXED | 「页面不渲染任何『确认 / 执行 / 立即处置』类控件」(prd-user-stories.md L46) |
| 9 | 时间窗/批量/结果量无界 | FIXED | 24h 窗口 / 批量 50 条 / logquery 1000 条·10MB 截断 (prd-spec.md L146) |
| 10 | LLM 不可用无谓词 | FIXED | 「超时 > 12 秒，或连接失败 / 连续 2 次调用失败」(prd-spec.md L144) |
| 11 | Scope 双界面 vs 4 页面 | FIXED | 「另含两个 in-scope 二级页：诊断详情页…与历史诊断回溯页」(prd-spec.md L43) |

## Dimension Scores

### 1. Background & Goals — 92/100
- Three elements (30/30): Reason（空壳对接零、无编排层）、Target、Users（一线值班 / 资深 SRE）均具体。
- Quantified (25/30): 三项指标量化（≤1 分钟、≥99%、100% 落库完整率、1 分钟检索），但 Goal 3 自认非量化——「以『无需人工跨系统切换』为定性目标」(prd-spec.md L33)。一个 Goal 无 metric。
- Consistency (37/40): 基线数据自认未核实——「基线运营指标（初估，P1 启动前以 alert/audit 历史数据核实）」(prd-spec.md L16)。Goal 1 的「20–40 分钟 → ≤1 分钟」建立在此未核实基线上，核实失败则目标口径漂移；有核实计划，故轻扣。

### 2. Flow Diagrams — 145/150
- Mermaid exists (50/50)。
- Main path (45/50): 主路径已闭合（含上轮 ChatOnly 修复），但 Intent 菱形把系统可用性混入意图分支——「Intent -->|LLM 不可用| Fallback[三级降级：模板匹配→预置入口→明示]」(prd-spec.md L91)。意图分类的合法输出是意图类别，「LLM 不可用」不是意图；且下游另有 `LLM{LLM 可用?}` 菱形（L94），同一条对话链上出现两个 LLM 失效出口（Fallback vs RuleOnly），图上无法判断对话流最终走哪一个。
- Decision + error branches (50/50): 7 个菱形、Fallback/RuleOnly/降级纯规则等异常分支齐全。

### 3. Functional Specs (prd-ui-functions.md) — 188/200
- Placement & Interaction (68/70): 4 个 UF 均有 Placement/Target Page，导航架构含返回规则。轻扣：UF-3 交互流未含降级条目在详情页的呈现步骤（降级标识仅定义在列表，L104）。
- Data & States (62/70): 字段表来源明确、States 表触发器完整。扣分：
  - UF-3 States 只有「加载中/完成/不存在」，无「错误」态——加载失败但 id 有效、非跨租户的场景无显示定义 (prd-ui-functions.md L151-156)。
  - 归档与回溯矛盾：UF-2 规定「诊断条目默认保留 90 天（可配置），超期归档不在列表展示」(L120)，但 UF-4 历史回溯页未说明归档条目能否检索——「任一诊断会话完整落库，1 分钟内可按租户/时间/服务名检索」(prd-spec.md L34) 的「可回溯」目标与 90 天归档是否互斥未回答。
- Validation Rules (58/60): 规则均量化可执行（500 字符、1000 条/10MB 截断、租户强制注入）。轻扣：批量标记上限 50 条（prd-spec.md L146）在 UF-2 Validation Rules 中无对应——用户勾选 >50 条时 UI 行为（禁用、报错、截断）未定义 (prd-ui-functions.md L115-122)。

### 4. User Stories — 190/200
- Coverage (50/50): Background 两个用户角色均有 story。
- Format (50/50): As a / I want / So that 齐全，动作具体（查看/筛选/标记/提问/回指），无「manage/handle」类空动词。
- AC per story GWT (50/50): 三个 story 均有 GWT。
- AC verifiability & boundary (40/50): Story 1 边界覆盖优秀（去重、队列溢出、并发冲突、批量部分失败、负向 AC）。扣分：
  - Story 3 仅 2 条 AC 且全为 happy path——检索无命中（UF-4 States 明明定义了「未找到匹配会话」态，L197，却无 story AC）、检索接口失败、跨租户检索被拒均无 GWT 覆盖。
  - 批量标记 50 条上限无 AC（Story 1 批量 AC 只测部分失败，prd-user-stories.md L26-28）。

### 5. Scenario Completeness — 125/150
- E2E coverage (55/60): 流程 A/B/C 均从触发到终态含落库；风险中心状态机闭合。轻扣：对话用户在「结果暂未能保存」后的后续动作路径（是否可手动重试保存）未描述 (prd-spec.md L65)。
- Implicit assumptions (30/40): eiam 鉴权失败/会话过期路径全文缺失——所有页面与 API 依赖 eiam（DF005「强制注入 tenant 谓词」），但鉴权失败时各界面显示什么、会话是否保留均未定义；这是每个场景的隐式前置。
- Business-rules consistency (40/50): 「已查看」命名统一、无渠道矛盾。扣分：「可回溯」目标（1 分钟可检索、落库完整率 100%，L34）与 90 天归档不在列表展示（prd-ui-functions.md L120）之间存在未调和的口径——归档后会话是否仍算「可检索」。

### 6. Edge Case Coverage — 92/100
- Error paths (36/40): LLM 不可用、底座超时、空日志结果、落库失败补偿、推送失败重试、队列溢出、stale 冲突、跨租户丢弃——覆盖密度高。扣：鉴权失败路径缺失；外部渠道「未配置任何渠道」时的行为未定义（AC 说「经已配置的渠道」，prd-user-stories.md L43）。
- Boundary (33/35): 500 字、24h、50 条、1000 条/10MB、队列 100、页大小 20、90 天。扣：>50 条勾选的 UI 处理未定义。
- Failure recovery (23/25): 重试 2 次 + 补偿队列 + 监控告警 + 用户提示 + 「重试失败项」入口。扣：补偿成功后的用户通知机制未描述（用户只被告知「暂未能保存」，何时可见无定义）。

### 7. Scope Clarity — 98/100
- In-scope concrete (33/35): 每项均为可交付的具体能力（含路由边界、渠道闭合清单、契约测试）。轻扣：「对话链路 LLM 降级三级」未枚举三级各自的具体交互产物（模板意图匹配输出什么形态）。
- Out-of-scope explicit (30/30): P2/P3 逐项点名，含「数据面新建」「全自动无人值守」。
- Consistency (35/35): Scope 4 页面与 UI doc 4 页一一对应；「仅展示+状态标记，无确认执行」与 UF-2/Story 1 负向 AC 一致。

## Blindspot Attacks

1. [blindspot][Scenario Completeness] 鉴权失败盲区：「eiam | Agent 编排层 | 鉴权结论 + 租户上下文 | 中间件 | 每次请求」(prd-spec.md L123) ——每次请求都过 eiam，但全文没有任何一处描述鉴权失败（未登录、token 过期、租户解析失败）时对话/风险中心的行为。所有场景隐含「已成功鉴权」。
2. [blindspot][Business-rules consistency] 归档 vs 可回溯矛盾：「诊断条目默认保留 90 天（可配置），超期归档不在列表展示」(prd-ui-functions.md L120) vs 「任一诊断会话完整落库，1 分钟内可按租户/时间/服务名检索」(prd-spec.md L34)——第 91 天的诊断是否满足「可回溯」目标，两个文档给出不同暗示，必须显式调和。
3. [blindspot][User Stories] Story 3 无边界 AC：Story 3 仅覆盖「检索命中」与「点击结论回指」，而 UF-4 自己定义的「未找到匹配会话」「检索失败提示 + 重试」「补偿提示」三个状态 (prd-ui-functions.md L197-199) 均无对应 GWT AC——UI 状态无故事级验收护栏。
4. [blindspot][Flow Diagrams] 意图菱形语义混杂：「Intent -->|LLM 不可用| Fallback[三级降级…]」(prd-spec.md L91)——「LLM 不可用」不是意图分类结果，与下游 `LLM{LLM 可用?}` 菱形构成两个重叠失效出口，图上无法唯一确定对话流的降级路径。

## Next Iteration Priorities

1. 补 eiam 鉴权失败的场景与各 UF 错误态定义。
2. 显式调和 90 天归档与「1 分钟可检索」目标的口径（归档是否可检索、检索入口在哪）。
3. Story 3 补齐无命中/失败/跨租户拒绝/补偿提示的 GWT AC。
4. 修正 Mermaid Intent 菱形：将 LLM 可用性判断从意图分支中分离为独立判定节点。
5. 补批量 >50 条勾选的 UI 行为与 AC；补「未配置通知渠道」与补偿成功通知的定义。
