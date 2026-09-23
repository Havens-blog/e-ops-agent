# Proposal Evaluation — Baseline Score (Iteration 1)

- **Document**: `F:\AiOpsAagent\docs\proposals\haven-opsagent\proposal.md`（Haven 运维 Agent 垂直编排层）
- **Rubric**: `proposal.md` rubric, 1000-point scale
- **Stance**: Adversarial. Every assertion treated as unverified until the document supports it.
- **Scorer date**: 2026-09-23

---

## Reasoning Audit (Step 2)

**Problem → Solution trace**: Problem = "OpsAgent 空壳，与 Haven 底座零对接，无法兑现垂直运维 Agent 定位". Solution = 在 Haven 内新建纯编排层子模块，串接 logquery/alert/audit/topology/资产/MCP/eiam。Trace 成立：编排层直接消除"零对接"。✅

**Solution → Evidence trace**: 底座能力清单给出了具体包路径（`e-cam-service/internal/logquery` 等），支撑"只需串不需造"。但缺两类证据：(a) 编排层自身的意图理解链路——S1/S2 要求自然语言理解，这必然依赖 LLM，而 S6 的降级方案只覆盖"解读"，不覆盖"意图解析"（见 Attack 1）；(b) 无任何工时/时间估算支撑"P1 范围可控、近期可交付"。❌ 部分断裂。

**Evidence → Success Criteria trace**: SC-1/2/5/6 ↔ P1 对应良好；SC-4 ↔ P2 故障库对应；SC-3 ↔ P3 可控执行对应。缺口：In-Scope P1 中的"会话/诊断落库"（可回溯 NFR）没有任何 SC 覆盖。❌

**SC Consistency Deep-Dive（按受影响域聚类）**:
- 诊断质量域：SC-1（1 分钟出根因报告）与 SC-2（100% 端到端成功）内部可同时满足，无矛盾。
- 降级域：S6 规定 LLM 不可用时返回规则引擎结论——SC-1 仍可达成（报告可不含 LLM 解读），SC-2 也可达成，无 SC↔SC 矛盾；但与 S1 的隐含 LLM 依赖存在 Solution 层矛盾（归入 D10）。
- 隔离域：SC-5（跨租户不可见）与 SC-1/SC-2 无冲突。
- 执行域：SC-3（100% 风险分级 + 高危 100% 人工确认）与 Out of Scope"全自动无人值守"双向一致。✅
- 歧义标记：SC-4 的"历史故障库**命中同类问句**"——命中判定标准（相似度阈值？关键词匹配？）未定义，标记为 **ambiguous — requires author clarification**。
- 量化疑点：SC-2 的"100% 成功率（排除底座接口自身故障）"——排除条款无判定主体与判定标准，实际不可证伪（见 Attack 2）。

**自相矛盾检查**: Core 行为列表把"可控执行（低危白名单自动执行）"列为"核心用户可感知行为"，但 P1 明确"P1 先做纯只读"、写执行在 P3——解决方案章节把蓝图能力与 P1 交付物混排，未逐项标注期数（见 Blindspot 3）。Out of Scope"全自动无人值守"与核心行为 3 的"低危白名单自动执行"表面张力实际可调和（白名单执行仍在确认体系内），不判矛盾。

---

## Rubric Scoring (Step 3)

### 1. Problem Definition — 88/110

- **Problem stated clearly: 36/40**。核心问题一句话说清："只是一套脱离真实运维平台的「空壳」……与 `D:\Haven` 运维平台的真实数据与能力零对接"。两个读者不会解读出不同问题。
- **Evidence provided: 30/40**。证据是具体的（skill 文件为纯 markdown、失效链接 `github.com/Havens-blog/OpsAgent`、底座模块包路径逐一列举），但全部是**代码静态检查证据**，没有任何运行时/运营数据：人工跨系统排障每月耗时多少？告警平均处置时长？"运维仍需在各模块间人工切换、人工串联排障"没有任何量化代价。作为提案，缺运营侧证据扣分。
- **Urgency justified: 22/30**。"越晚做，各模块越各自演化，编排接入面越复杂"是纯断言，无成本量化；"不落地则……AIOps 定位长期落空"属于自我设定的定位，不是外部压力（竞品、客户需求、事故）。Urgency 一节没有出现任何数字。

### 2. Solution Clarity — 104/120

- **Approach is concrete: 36/40**。6 条核心行为 + 三期递进，读者可以复述要建什么。扣分点：编排层内部的形态未说明——是一个新的 `internal/agent` 包？对话入口是 e-cam-web 里新页面？Agent 的规划循环（intent → tool 选择 → 组合 → 汇总）由什么引擎驱动？全文没有一张架构图或模块划分。
- **User-facing behavior described: 40/45**。S1–S6 场景给出了可感知行为（提问→诊断报告、告警→风险中心待办、高危→"需人工确认"回执），这是本文档最强部分。扣分："重复故障秒回"是营销语言（秒回的定义？SC-4 定义为 5 秒，正文却用"秒"制造期望）；风险中心里"处置预案"的具体呈现形态（一篇文章？结构化步骤？可一键执行？）未描述。
- **Technical direction clear: 28/35**。方向有：纯编排、同仓、Go + Vue3、复用 `internal/cert`/`logquery` 装配先例、LLM 降级模式参考 `logquery/llm`。但关键技术空白：**意图理解用什么实现**（LLM？规则路由？）全文未提，而它是编排层的第一环；诊断上下文如何组装（日志片段取多少、资产信息带多细）无说明。

### 3. Industry Benchmarking — 104/120

- **Industry solutions referenced: 38/40**。K8sGPT、Datadog Bits AI、PagerDuty AI、AWS DevOps Guru，均为真实存在且对口的方案，非自造选项。
- **At least 3 meaningful alternatives: 22/30**。对比表含"Do nothing" + 两个 rejected 方案 + 选中方案，数量达标。但两个 rejected 方案（"重写独立全新项目""通用大模型直连外部云源"）本质都是旧 opsagent 的两个侧面，且三个被拒项全部 Easy-Reject——最该认真评估的替代项缺席：**直接采用/嵌入 K8sGPT 式开源诊断器再叠加 Haven 适配层**在 Industry Solutions 里被列举，却从未进入 Comparison Table 被认真权衡（K8sGPT 被一句话定性为"诊断分析器而非编排层"就打发掉了）。存在"备选清单只为衬托选中项"的结构性倾向。
- **Honest trade-off comparison: 22/25**。选中方案的缺点"依赖 Haven 内部接口稳定性"如实写出，未粉饰。
- **Chosen approach justified against benchmarks: 22/25**。"采纳 AIOps 编排……成熟范式，创新点不在算法而在落地方式"是清醒的定位声明；对"为何不用 Datadog 类产品"（体量大不可直接采用）与"为何不绑 AWS"（不跨多云）有具体理由。

### 4. Requirements Completeness — 92/110

- **Scenario coverage: 34/40**。S1–S6 覆盖 happy path（S1/S2）、边界（S5）、失败降级（S6）、隔离（S3）、命中（S4），结构完整。缺失场景：用户**无权限**发起排障（eiam 拒绝后交互是什么）；多用户**并发**同时触发告警排查（编排层是否去重/限流）；模糊提问（"系统是不是有问题"这类无法映射到工具的问题）如何处理；诊断进行中用户取消。
- **Non-functional requirements: 32/40**。安全（风险分级、100% 高危确认、租户隔离）、性能（秒级同量级）、可回溯（落库）、兼容（同栈）四项明确。缺失：可用性/SLA 目标（Agent 自身挂了告警排查是否中断？）；LLM 调用成本/频率上限（告警风暴下每条告警都触发 LLM 排查的成本无约束）；诊断数据保留期限与清理策略；Agent 自身的可观测性。
- **Constraints & dependencies: 26/30**。依赖模块逐一列名，"不新建数据面"边界清晰，技术栈约束明确。扣分：依赖的接口以"模块名"为单位（"依赖 logquery（日志+诊断）"），没有任何接口契约描述——编排层需要的是稳定的 API/函数签名，文档承认要"接口契约化"却放在风险缓解里而非依赖定义里。

### 5. Solution Creativity — 68/100

- **Novelty over industry baseline: 26/40**。文档自我坦白："创新点不在算法而在「把编排层扎进已有平台底座」的落地方式"；且"风险分级 + 白名单"被自己承认是"业界 AIOps 常用能力封装粒度"。即：四条 Innovation Highlights 中两条自认非创新。诚实，但作为创新性评分，差异化只有"嵌在已有平台"这一条成立。
- **Cross-domain inspiration: 20/35**。借鉴来源（K8sGPT/Datadog/PagerDuty）全部是**同领域**AIOps 产品，没有来自其他域的迁移（例如金融风控的分级放行、SRE 中的 error budget、安全运营 SOAR 的 playbook 机制——都与风险分级执行高度同构，未被引用）。
- **Simplicity of insight: 22/25**。"瘦编排层钉在已有底座"是优雅且克制的洞见，符合 Occam（Assumptions Challenged 表也印证了收敛过程）。不扣大分。

### 6. Feasibility — 80/100

- **Technical feasibility: 36/40**。底座能力清单具体到包路径，LLM 降级封装有现成先例（`internal/logquery/llm`），"无 showstopper 技术依赖"可信。扣分：意图理解链路的可行性（前述空白）未论证，而它是 P1 的第一入口。
- **Resource & timeline feasibility: 18/30**。**Resource & Timeline 一节没有一个时间单位、没有人日/人周估算、没有团队人数**。"三期递进使 P1 范围可控、近期可交付"——"近期"是多近？这是本维度最重的扣分项：无法评估排期现实性的提案，timeline 可行性接近未评估。
- **Dependency readiness: 26/30**。P1 依赖"均已就绪"、P2 order 模块"半成品，接入时需确认其 API 成熟度"、P3 CI/CD "当前空白"——诚实且分级清楚。扣分：eiam 租户谓词是否覆盖编排层新增的查询组合（组合查询的隔离语义）未确认，只说"复用"。

### 7. Scope Definition — 71/80

- **In-scope items are concrete: 27/30**。P1/P2/P3 各期交付物逐条列名（对话助手、主动触发、双界面、落库、eiam、租户隔离）。扣分："串日志 + 资产 + 告警"中的"串"没有验收口径（SC-6 补了"至少 1 条端到端场景"，算是部分弥补）。
- **Out of scope explicitly listed: 24/25**。五条 out-of-scope 明确具名，且预先挡掉了最危险的蔓延（新建数据面、全自动无人值守、改写现有模块、对外 SaaS）。
- **Scope is bounded: 20/25**。P1 边界清晰但**无时间边界**；"P2/P3 依赖 Haven 侧接口铺开，可并行推进"是开放式承诺，P3 更是"接入**或预留**"二选一未定，整体蓝图三期无任何锚点日期。

### 8. Risk Assessment — 80/90

- **Risks identified: 28/30**。5 条风险均实质（误执行事故、接口漂移、LLM 不稳、租户串库、故障库冷启动），无凑数项。
- **Likelihood + impact rated: 27/30**。评级分布诚实（M/H、M/M、L/H、H/M 混合，非全部"低概率高影响"）。扣分：冷启动风险定为 H/M 却没有对应到任何 SC 或验收项，缓解措施"回填种子数据"后命中效果如何验证无标准。
- **Mitigations are actionable: 25/30**。"P1 先做纯只读，写执行留到 P3""高危 100% 人工确认""加跨租户隔离测试"可执行。扣分："复用现有模块装配模式为契约"——装配模式不是接口契约，此缓解不可直接行动；"接入前盘点各模块 API 成熟度"无盘点产出物定义。

### 9. Success Criteria — 67/80

- **Criteria are measurable and testable: 27/30**。SC-1（1 分钟）、SC-3（100%/100%）、SC-4（5 秒）、SC-5（自动化测试）、SC-6（各模块 ≥1 条集成测试）均可写成测试。扣分：SC-2 的"100% 成功率（**排除底座接口自身故障**）"——排除条款无判定主体与判定方法，测试无法客观判定某次失败是否属于"底座自身故障"，该条款实际不可证伪。
- **Coverage is complete: 20/25**。P1/P2/P3 主要交付物均有 SC 映射。缺口：In-Scope P1 的"**会话/诊断落库**"与 NFR"可回溯：团队成员可回溯历史排障记录"没有任何 SC 覆盖——交付了也没人验收。
- **SC internal consistency: 20/25**。聚类检查未发现 SC↔SC 或 SC↔InScope 硬矛盾（SC-3 与"全自动无人值守"out-of-scope 双向可满足）。一处歧义：SC-4"历史故障库**命中同类问句**时"——"命中"判定标准未定义（相似度阈值？人工标注？），标记为 **ambiguous — requires author clarification**；命中标准不定，5 秒 SLA 的达成率无法统计。

### 10. Logical Consistency — 77/90

- **Solution addresses the stated problem: 31/35**。编排层直击"空壳零对接"，问题→方案闭环成立。扣分：问题定义里"无法兑现垂直领域运维 Agent 的定位"，而 P1 交付的是"排障核心闭环"，定位兑现到什么程度算兑现（P1 之后是否仍是"空壳+一点点"）无中间验收定义。
- **Scope ↔ Solution ↔ SC aligned: 26/30**。分期与 SC 标注期数一致（SC-1/2/5/6→P1、SC-4→P2、SC-3→P3）。扣分：核心行为 3"可控执行（预定义白名单内低危操作**自动执行**）"与 P1"P1 先做纯只读"存在呈现层冲突——解决方案章节将 P3 能力当作现行核心行为描述，未逐项标注归属期，读者第一遍读会误以为 P1 即含写执行。
- **Requirements ↔ Solution coherent: 20/25**。S1–S6 均映射到方案能力，无孤儿需求；但存在一条未闭合链路：**S6 降级路径覆盖不了 S1/S2 的意图理解**。"LLM 不可用……Agent 返回确定性规则引擎结论"——若意图解析本身依赖 LLM，LLM 挂掉时 Agent 如何"判定需查日志"？降级设计只保护了解读环节，未保护入口环节，这是需求（S6 主路径不中断）与方案（降级范围）之间的真实缝隙。

---

## Blindspot Hunt (Step 4)

1. **[blindspot] [Risk Assessment] Prompt injection 经由日志内容进入 LLM，全程未评估。** 方案链路"调用 logquery 拉取错误日志 → 算风险分 → LLM 解读"意味着攻击者可控的日志内容（HTTP 路径、UA、自定义字段）会被直接拼入 LLM 上下文，其输出又形成"处置预案"供高危确认人阅读——诱导生成误导性预案是现实攻击面。风险表 5 条中无一条涉及 LLM 输入安全。需补充：日志内容进 LLM 前的清洗/围栏策略，以及"预案仅供参考"的强约束。
2. **[blindspot] [Feasibility] 全文零时间估算，Feasibility 的 Timeline 子项形同虚设。** "三期递进使 P1 范围可控、近期可交付"是唯一的排期陈述，无日期、无人力、无里程碑。CTO 无法据此判断 P1 是两周还是两个月。
3. **[blindspot] [Logical Consistency] 解决方案章节把三期蓝图当作单一方案描述，期数归属未标注。** 六条"核心用户可感知行为"中，#3 可控执行、#5 长期记忆、#6 团队多用户分别要到 P3、P2、P1 才兑现，但列表未标注，直到"分期递进"小节才部分澄清。这将导致按方案章节直接写 PRD 时范围放大。
4. **[blindspot] [Scope Definition] "6~10 项能力"指向一个从未出现的能力清单。** Out of Scope 写"P2/P3 之外的 6~10 项能力（服务器、云资源、变更流程、合规审计等）的深度数据面建设"——这个"6~10 项"清单在文档任何地方都没有被定义或列出，读者无法核对该排除项的边界，疑似引用了未纳入本文档的上游材料。
5. **[blindspot] [Success Criteria] SC-2 的 100% 目标 + 排除条款使其不可证伪。** "端到端（告警→诊断→推送）成功率达到 100%（排除底座接口自身故障）"：没有定义由谁、依据什么判定某次失败归因于"底座接口自身故障"。100% 本身也是不现实的验收目标（应给定样本量与观测窗口）。
6. **[blindspot] [Solution Clarity] 告警风暴场景下编排层的自我保护缺失。** "被告警……唤醒后，自动跑排查"——当告警批量到达（任何一次网络抖动都可能产生数十条告警），是否去重、聚合、限流？每个排查都要拉日志 + 调 LLM，风暴下的成本与日志查询压力未在方案或风险中出现。
7. **[blindspot] [Industry Benchmarking] K8sGPT 作为唯一开源可落地选项未被认真权衡。** 对比表中三个 rejected 项均为"旧路线"，而 Industry Solutions 里唯一可实际引入的开源方案 K8sGPT 从未作为第四个备选进入表格（例如"引入 K8sGPT 做 K8s 域诊断 + 自研编排"），替代分析存在明显的"为选中项铺路"结构。

---

## Score Summary

| Dimension | Score | Max |
|-----------|-------|-----|
| Problem Definition | 88 | 110 |
| Solution Clarity | 104 | 120 |
| Industry Benchmarking | 104 | 120 |
| Requirements Completeness | 92 | 110 |
| Solution Creativity | 68 | 100 |
| Feasibility | 80 | 100 |
| Scope Definition | 71 | 80 |
| Risk Assessment | 80 | 90 |
| Success Criteria | 67 | 80 |
| Logical Consistency | 77 | 90 |
| **Total** | **831** | **1000** |

## Verdict

结构完整、底座证据扎实、分期与风险分级成熟，是高于平均水准的提案。但要越过 900 分线，必须补齐五件事：(1) P1 排期与人日估算；(2) 意图理解链路及其 LLM 降级闭环；(3) 日志内容进 LLM 的注入防护；(4) SC-2 排除条款的客观判定标准 + SC-4"命中"定义；(5) K8sGPT 类开源方案作为第四备选的认真权衡。
