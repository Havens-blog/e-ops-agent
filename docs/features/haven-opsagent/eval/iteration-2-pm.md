# Iteration 2 — PM Eval Report (Adversarial)

**Score**: 900/1000 (Target: 900)
**Mode**: A (UI present) | **Scorer**: Senior PM (adversarial)

## Prior Iteration Check (iteration-1-merged.md → current state)

| # | Iter-1 Attack | Status in Iter-2 |
|---|---------------|------------------|
| 1 | 历史诊断回溯无 UI Function | FIXED — UF-4 fully specified (Placement/Flow/Data/States/Validation) |
| 2 | 报告状态枚举与状态表不一致 | FIXED — UF-1 枚举补齐「降级/引导式回应/错误」并给出映射注释 |
| 3 | 外部推送指标计算范围外内容 | FIXED — 外部推送入 In Scope，新增 DF007 + Related Changes #3 |
| 4 | 「已读」vs「已查看」命名冲突 | FIXED — 三处统一为「已查看」，spec 显式声明映射 |
| 5 | 已查看状态/批量标记无 AC | FIXED — Story 1 补自动流转 AC 与批量部分失败 AC |
| 6 | 意图误分类无恢复路径 | FIXED — spec 流程 A + Story 2 AC（追问/候选/纠正重路由） |
| 7 | 分页/保留/并发标记未定义 | FIXED — UF-2 补页大小 20、保留 90 天、后写覆盖+冲突提示 |
| 8 | 告警风暴防护零 AC | FIXED — Story 1 补去重/并发上限/LLM 预算三条 AC |
| 9 | 落库失败/空结果/低置信/prompt injection 未处理 | PARTIAL — 前三者已补；prompt injection 仍无任何 AC |
| 10 | 流程图产物混淆 + 批量标记缺范围 | FIXED — Persist→Source 分流对话/告警；批量标记入 Scope 与 Story 1 |

## Dimension Scores & Justifications

### 1. Background & Goals — 95/100
- Reason/Target/Users 三要素齐全且具体（30/30）。
- 量化目标充分：≤ 1 分钟、≥ 99%、100%、N≥100（30/30）。
- 一致性（35/40）：扣 5 — 关键指标口径外包给 PRD 外部文档：「指标口径：端到端含报告组装（proposal SC-1）」「（proposal SC-5）」。评审者在本 PRD 内无法核验 SC-1/SC-2/SC-5 的实际定义，口径本身构成未在页面上的隐藏依赖。另「基线运营指标（初估，P1 启动前以 alert/audit 历史数据核实）」已诚实标注，不另扣分。

### 2. Flow Diagrams — 130/150
- Mermaid 存在（50/50）。
- 主路径完整（30/50）：扣 20 — 对话分支（产品主入口）在图中无终点：`Source -->|对话触发| ChatOnly[仅对话窗口展示·可回溯]` — ChatOnly 节点没有任何出边连接到 `End([结束])`，主入口 happy path 在图上悬空。
- 决策点与异常分支（50/50）：StormCheck/LLM 可用?/分级? 等菱形节点与多条异常分支齐备。

### 3. Functional Specs — 185/200（评估 prd-ui-functions.md）
- Placement & Interaction（70/70）：4 个 UF 均有 Placement 与完整交互流；导航规则「每个导航目标必须对应定义页」满足，4 页均在 Page Composition 定义。
- Data & States（60/70）：扣 10 — UF-2 数据表内自相矛盾：`处理状态 | 枚举 | 本地标记`，但同页 Validation Rules 要求「同一条目被多名值班同时标记时，以后写为准（后写覆盖）；提交时检测到状态已被他人变更」——「本地标记」无法感知他人变更，状态源必须是服务端落库。来源标注与并发语义直接冲突。
- Validation Rules（55/60）：扣 5 — 规则普遍可执行（空输入、500 字符、租户注入、分页、保留期），但 spec Security 要求「用户输入与告警原文进入 LLM 前做 prompt injection 过滤与指令白名单校验」，UF-1 的 Validation Rules 未定义输入被过滤/拦截时的 UI 反馈规则。

### 4. User Stories — 190/200
- 用户覆盖（50/50）：一线值班运维（S1/S2）、资深运维/SRE（S3）均有 story。
- 格式（50/50）：As a / I want / So that 齐全，动作具体。
- AC GWT（50/50）：每条 story 多条 Given/When/Then。
- 可验证性与边界（40/50）：扣 10 — (a) `队列溢出时才丢弃低级别排查`：队列容量从未定义，溢出条件不可测试；(b) 外部渠道推送是 In Scope 交付物，但三条 story 无任何 AC 覆盖「值班收到 IM/邮件提醒」这一用户可见行为；(c) prompt injection 过滤/越权输出丢弃仅有 Security 描述，零 AC。

### 5. Scenario Completeness — 130/150
- E2E 覆盖（50/60）：扣 10 — DF007 `告警提醒（告警摘要 + 诊断入口链接）` 未定义链接落点：点开 IM/邮件链接进入哪个页面（/opsagent/diagnosis/:id？风险中心？）、未登录/eiam 会话过期时深度链接行为均未描述，推送→查看链路最后一公里缺失。
- 隐含假设（30/40）：扣 10 — 指纹去重「滚动窗口」的窗口时长从未给出，但该参数贯穿流程 B、流程图 StormCheck、Story 1 AC（「窗口内仅触发一次自动排查」）——AC 依赖一个未声明的阈值，无法执行。
- 业务规则一致性（50/50）：命名、状态机、「已读=已查看」映射、P1 只读边界跨文档一致。

### 6. Edge Case Coverage — 90/100
- 错误路径（40/40）：LLM 不可用三级降级、底座超时回退规则结论、落库失败重试 2 次+补偿队列+告警、logquery 空结果明示、低置信追问、队列溢出保原文、推送失败重试，均有具体分支。
- 边界条件（25/35）：扣 10 — 已定义 500 字符、页大小 20、保留 90 天、并发 5、LLM 每小时预算；但去重滚动窗口时长与排查队列容量两个阈值缺失（同上），「> 500 字符提示精简」截断后行为（拒绝还是截断发送）未说明。
- 失败恢复（25/25）：重试、补偿、「重试失败项」入口、用户侧提示齐备。

### 7. Scope Clarity — 80/100
- In-scope 具体（35/35）：9 条均为可交付的具体能力，含契约文档与契约测试。
- Out-of-scope（30/30）：P2/P3 逐项点名。
- 一致性（15/35）：扣 20 — (a) -10：In Scope 措辞「经外部通知渠道（IM/邮件等）推送告警提醒」——「等」属模糊语言，P1 实际启用哪些渠道（企微？钉钉？邮件？）不可判定；(b) -10：该 In Scope 项在 user stories 与 AC 中零覆盖（见维度 4），范围声明与下游文档脱节。

## [blindspot] Attacks (each citing a quote)

1. [Flow Diagrams] 对话分支无终止节点 — `Source -->|对话触发| ChatOnly[仅对话窗口展示·可回溯]`（后无任何出边）— 主入口流程在图上永远走不到 End，必须补 ChatOnly → End 边。
2. [Functional Specs] UF-2 状态来源与并发规则互斥 — `处理状态 | 枚举 | 本地标记` vs `提交时检测到状态已被他人变更，则提示「该条目已被其他值班更新为 X」` — 必须把状态来源改为服务端/落库，否则并发语义不可实现。
3. [Scenario Completeness] 去重窗口是无值参数 — `编排层按指纹聚合去重（滚动窗口内同指纹仅一次排查）` — 窗口时长缺失，流程 B、StormCheck 节点、Story 1 AC 全部依赖它；必须给出默认值（如 30 分钟）与可配置说明。
4. [Edge Case Coverage] 队列容量未定义即谈溢出 — `队列溢出时才丢弃低级别排查、保留告警原文与去重结论` — 无容量上限则「溢出」不可触发、AC 不可测试；必须定义队列长度阈值。
5. [Scope Clarity] 外部推送渠道用「等」收尾 — `并经外部通知渠道（IM/邮件等）推送告警提醒` — P1 范围内渠道清单必须枚举闭合，或显式声明「渠道清单由 XX 配置决定」。
6. [User Stories] 安全行为零验收覆盖 — `LLM 输出仅允许引用工具返回的数据源引用，含越权指令或越租户内容的输出整段丢弃并降级为规则结论` — 该可测行为没有任何 GWT AC，安全需求停留在不可验证的声明层。
7. [Scenario Completeness] 外部推送链接落点未定义 — `告警提醒（告警摘要 + 诊断入口链接）`（DF007）— 必须指定链接目标页与未登录/会话失效时的着陆行为，否则推送→查看场景断链。

## Verdict

Iteration 1 的 10 个攻击点中 9 个已实质修复（1 个部分修复），文档一致性显著提升。剩余扣分集中在：流程图对话分支无终点、UF-2 状态来源矛盾、去重窗口/队列容量两个无值阈值、外部推送的渠道模糊与 AC 缺失。达到 900 目标线，可进入下游 tech-design / ui-design；建议下游前先修复 blindspot 1–4（均为低成本修复）。
