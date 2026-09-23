# Iteration 3 — QA Eval Report

**Scorer**: QA (adversarial)
**Mode**: A (UI present) — 7 dimensions, 1000 pts
**Score**: 905/1000 (Target 900)

## Verification of Iteration-2 Attack Points (all resolved)

All 11 merged attacks from iteration-2 are verifiably fixed in the current text:

| # | Prior attack | Evidence of fix |
|---|--------------|-----------------|
| 1 | ChatOnly 无出边 | `ChatOnly --> End([结束])` (prd-spec.md:105) |
| 2 | UF-2 处理状态来源「本地标记」 | 「服务端（落库，以服务端状态为准）」+ stale 检测 (prd-ui-functions.md:103) |
| 3 | 去重窗口未定义 | 「窗口默认 10 分钟，可配置」(prd-spec.md:69) |
| 4 | 队列容量未定义 | 「默认上限 100 条（可配置）」(prd-spec.md:145) |
| 5 | 渠道清单用「等」收尾 | 「P1 渠道清单闭合为：钉钉 / 飞书 / 企业微信 / 邮件」+ Story 1 推送 AC (prd-spec.md:42, prd-user-stories.md:42-43) |
| 6 | 降级标识无字段 | UF-2 / UF-4 Data Requirements 均含「降级标识」字段及展示规则 |
| 7 | 并发标记无 story AC | Story 1 新增双人 stale 检测 GWT AC (prd-user-stories.md:47-49) |
| 8 | 高危无负向 AC | 「页面不渲染任何『确认 / 执行 / 立即处置』类控件」(prd-user-stories.md:44-46) |
| 9 | 时间窗/结果量无界 | 24h 窗口、50 条批量上限、1000 条/10MB 截断均有定义 (prd-spec.md:146) |
| 10 | LLM 不可用无操作性定义 | 「超时 > 12 秒，或连接失败 / 连续 2 次调用失败」(prd-spec.md:144) |
| 11 | 双界面 vs 4 页不一致 | 「另含两个 in-scope 二级页」枚举 (prd-spec.md:43) |

## [blindspot] Attacks (new, iteration 3)

1. **[blindspot][Flow Diagrams] 图缺失文档化的错误分支，且 LLM 分支挂在错误的判定节点上。** 文本定义了三条异常路径——队列溢出（「队列满后溢出丢弃低级别告警排查」prd-spec.md:145）、落库失败补偿（「自动重试 2 次，仍失败进入补偿队列」prd-spec.md:65）、外推失败重试（「外部渠道推送失败 → 重试」prd-spec.md:69）——但 Mermaid 图中一个都没有。且 `Intent -->|LLM 不可用| Fallback`（prd-spec.md:91）：LLM 可用性不是意图分类的输出，「LLM 不可用」作为 Intent 菱形的分支语义错误。必须补齐三条错误分支边、将 LLM 判定从 Intent 节点解耦为独立判定菱形，并展开三级降级为链式节点（当前折叠为单节点，三级间触发次序不可见）。

2. **[blindspot][Flow Diagrams / Scenario Completeness] 三条降级路径语义重叠且边界未定义。** 主流程 A「LLM 不可用 → 三级降级（模板意图匹配 / 预置查询入口 / 明示降级）」、主流程 A 另一分支「底座接口超时 → 返回确定性规则引擎结论」、主流程 B「LLM 预算耗尽 → 降级纯规则结论」（prd-spec.md:65, 69）——三条路径产出物是否相同、能否叠加（如 LLM 不可用时走「预置查询入口」后底座又超时，最终输出是什么？）、三级降级内部从一级滑到二级的触发条件，均未定义。必须给出降级路径的互斥/叠加矩阵与每级触发谓词。

3. **[blindspot][User Stories] 高危告警「不因队列溢出被丢弃」无实现机制。** Story 1 AC 断言「高危告警不因队列溢出被丢弃」（prd-user-stories.md:37），但队列已满（默认 100 条）时高危告警的归宿未定义：超容量排队？绕过队列（并发上限 5 如何维持）？抢占？AC 声明了结果却没有任何路径可达。必须定义高危告警在队列满时的准入机制（如高危独立队列/抢占位）。

4. **[blindspot][Edge Case Coverage] LLM 预算阈值无默认值，不可测。** 「LLM 解读调用每滚动 1 小时设次数上限（预算化）」（prd-spec.md:145）——同段所有其他旋钮（并发 5、队列 100、窗口 10 分钟、时间窗 24 小时、批量 50、截断 1000 条/10MB）均有默认值，唯独预算次数上限没有。Story 1 AC「Given LLM 调用预算耗尽」无法构造测试用例。必须给默认值（如默认 N=50 次/小时，可配置）。

5. **[blindspot][Edge Case Coverage] 外部推送重试次数/间隔未定义。** 「外部渠道推送失败 → 重试，仍失败计入推送失败率」（prd-spec.md:69）——对比落库重试明确「自动重试 2 次」，推送重试次数、间隔、退避策略全空。测试无法判定「重试 3 次后失败」是符合还是违例。必须定义重试次数与间隔。

6. **[blindspot][Functional Specs] 批量标记 50 条上限未落到 UI 校验规则，UF-3 缺降级字段。** 「单次批量标记上限默认 50 条（可配置）」（prd-spec.md:146）在 UF-2 Validation Rules（prd-ui-functions.md:115-122）中完全缺席——UI 层无从拦截超限操作，也无 AC 验证 >50 条时的拒绝行为。另外 UF-2 降级标识注释「悬停或详情页展示降级原因与可用能力边界」（prd-ui-functions.md:104），但 UF-3 诊断详情的 Data Requirements（prd-ui-functions.md:142-148）没有降级标识/降级原因字段，承诺的展示位置无数据支撑。UF-3「处置预案操作清单」来源标「编排层」与其余字段来源「落库」也不一致（详情页数据应统一来自落库）。

7. **[blindspot][User Stories / Edge Case Coverage] 已定义的校验规则多数无 AC 覆盖。** 「输入超长（> 500 字符）提示精简」（prd-ui-functions.md:75，且未说明是阻断发送还是仅提示）、检索时间窗超 24h 拒绝（prd-ui-functions.md:205）、批量超 50 条拒绝（prd-spec.md:146）均无任何 Given/When/Then AC。负向路径在 UI 规则层定义、在验收层失守——实现者可以只做提示不做阻断而 AC 全绿。

8. **[blindspot][Edge Case Coverage] 补偿队列的持久性与重试间隔未定义。** 「落库失败 → 自动重试 2 次，仍失败进入补偿队列并触发监控告警」（prd-spec.md:65）——补偿队列是否持久化（服务重启后是否还在）？补偿重试的间隔与次数上限？UF-4「补偿提示」状态依赖此机制，但机制本身半空白。另外「重试 2 次」也未给间隔。

9. **[blindspot][Background & Goals] 目标基线自我声明未核实。** 「基线运营指标（初估，P1 启动前以 alert/audit 历史数据核实）：月均告警约 3000 条、单次『告警→定位』人工串联 20–40 分钟」（prd-spec.md:16）——核心目标「20–40 分钟 → ≤ 1 分钟」建立在一组标注「初估」的数字上。透明度尚可，但验收时若真实基线为 15 分钟，目标口径需要重算。应将基线核实列为 P1 验收前置条件或给出核实时间点。

10. **[blindspot][Scenario Completeness] 「后写覆盖」与「stale 检测需重新确认」语义张力。** UF-2「以后写为准（后写覆盖）；提交时检测到状态已被他人变更，则提示…由用户决定是否再次覆盖」（prd-ui-functions.md:121）与 Story 1 AC「未经确认不发生覆盖」（prd-user-stories.md:49）——两者可调和（stale 写被拒→确认后成最后一次写），但「后写为准」的字面表述会诱导实现者直接覆盖而跳过 stale 检测。应改写为「最终以确认后的后写为准；stale 提交一律拒绝」。

## Dimension Scores

### 1. Background & Goals — 95/100
- 三要素齐全且具体（Reason/Target/Users 各有实名角色与场景）。
- 目标量化充分：≤ 1 分钟、≥ 99%、100% 完整率、1 分钟可检索。
- 扣 5：基线数字自我标注「初估，P1 启动前以 alert/audit 历史数据核实」未核实即作为目标基线（attack 9）。

### 2. Flow Diagrams — 135/150
- Mermaid 存在：50/50。
- 主路径完整（开始→结束，双触发源均闭合，ChatOnly→End 已补）：45/50。
- 判定与错误分支：40/50。图内已有 StormCheck/Intent/LLM/Source/HighRisk/Ack 六个菱形与 LLM 不可用→RuleOnly/Fallback 错误分支，但队列溢出、落库失败补偿、推送失败三条已文档化错误路径无图示（attack 1），LLM 不可用挂在 Intent 菱形语义错误（attack 1），三级降级折叠为单节点。

### 3. Functional Specs — 175/200
- Placement & Interaction：65/70。4 个 UF 均有 Mode/Target Page/Position；导航架构完整含二级页回跳。扣 5：UF-1「错误」态有「错误提示 + 重试」但 Interaction Flow 未包含错误/重试路径（重试后走向未定义）。
- Data & States：60/70。字段/状态表完整、来源与触发显式、降级标识已补。扣 10：UF-3 缺降级标识/原因字段却承载 UF-2 承诺的展示位（attack 6）；UF-3 操作清单来源「编排层」与页面其余数据「落库」不一致。
- Validation Rules：50/60。规则总体可执行（租户强制注入、截断明示、分页、保留期）。扣 10：50 条批量上限未落到 UF-2 校验规则（attack 6）；UF-1 500 字符「提示精简」未定义阻断语义。

### 4. User Stories — 190/200
- 覆盖度：50/50。Background 两类用户各有 ≥1 story。
- 格式：50/50。全部符合 As a / I want / So that，动作具体（无 manage/handle 类空词）。
- AC 格式：50/50。每条 story 均有多条 GWT AC。
- AC 可验证性与边界：40/50。多数 Then 可客观验证（1 分钟、不渲染控件、失败清单回显、仅显示本租户）。扣 10：三级降级 AC「系统按三级降级（…）响应」无法逐级验证（各级触发谓词未定义，attack 2）；高危队列满 AC 无可达机制（attack 3）；500 字符/24h/50 条三个已定义边界均无 AC（attack 7）。

### 5. Scenario Completeness — 130/150
- 端到端覆盖：55/60。流程 A/B/C 均从触发到终态，含状态机与补偿终态。扣 5：降级三路径叠加组合的终态未穷尽（attack 2）。
- 隐含假设：30/40。扣 10：补偿队列持久性、重试间隔未定义（attack 8）；LLM 预算无默认值使「预算耗尽」场景不可构造（attack 4）。
- 业务规则一致性：45/50。扣 5：「后写覆盖」字面与 stale 拒绝机制张力（attack 10）。

### 6. Edge Case Coverage — 85/100
- 错误路径：36/40。LLM 不可用、底座超时、空结果不编造、落库失败、并发冲突、跨租户越界丢弃均有显式描述。扣 4：推送失败重试策略空白（attack 5）。
- 边界条件：30/35。并发 5/队列 100/窗口 10 分钟/24h/50 条/1000 条-10MB/500 字符/90 天保留/12 秒超时覆盖面极佳。扣 5：LLM 预算阈值无默认值（attack 4）；高危队列满归宿未定义（attack 3）。
- 失败恢复：19/25。「重试失败项」入口、补偿队列+告警、重试后计失败率均有恢复动作。扣 6：补偿队列重启持久性与补偿重试次数/间隔未定义（attack 8）；推送重试次数未定义（attack 5）。

### 7. Scope Clarity — 95/100
- In-scope 全部为具体交付物（含 4 页路由、渠道枚举、契约测试交付物）。
- Out-of-scope 逐项命名并标注阶段（P2/P3）。
- 与功能规格/用户故事一致（4 页 = UI 文档 4 页；角色一致；渠道一致）。
- 扣 5：「具体启用的渠道随 Haven 通知中心配置」将渠道启用态外包给未在本文档定义的配置来源，「已配置的渠道」（Story 1 AC）在零配置时的行为（全不发？默认全发？）未定义。

## Verdict

905/1000，达标（Target 900）。Iteration-2 全部 11 项攻击已验证修复。剩余扣分集中在：图未覆盖全部已文档化错误分支（-10）、降级三路径语义未收敛（多处）、以及「规格层已定义但 AC/UI 校验层未承接」的三处边界（500 字符 / 24h / 50 条）与两处重试策略空白（推送 / 补偿）。这些是迭代 4 应优先收敛的残差点。

**Priority fixes for iteration 4:**
1. 补图：队列溢出、落库补偿、推送失败三条错误分支 + LLM 判定节点解耦 + 三级降级链式展开（attack 1）
2. 降级路径矩阵：三条降级路径的触发谓词、互斥/叠加关系、最终输出物（attack 2）
3. 高危告警队列满准入机制（attack 3）+ LLM 预算默认值（attack 4）
4. 补 AC：500 字符阻断、>24h 拒绝、>50 条拒绝（attack 7）；推送与补偿重试次数/间隔（attack 5/8）
