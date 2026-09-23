# Proposal Evaluation — Iteration 1

- **Document**: `F:\AiOpsAagent\docs\proposals\haven-opsagent\proposal.md`（Haven 运维 Agent 垂直编排层，含 pre-revision 标注）
- **Rubric**: `proposal.md` rubric, 1000-point scale, target 900
- **Stance**: Adversarial. Every assertion treated as unverified until the document supports it. Score reflects only what is on the page right now.
- **Scorer date**: 2026-09-23

---

## Step 2: Reasoning Audit

**Problem → Solution trace**: Problem = OpsAgent 空壳、与 Haven 底座零对接。Solution = 纯编排层子模块接入 logquery/alert/audit/topology/资产/MCP/eiam。直击问题，闭环成立。✅

**Solution → Evidence trace**: 底座能力清单落到包路径（`e-cam-service/internal/logquery` 等），LLM 降级封装有现成先例（`internal/logquery/llm`）。新增的「编排层与底座的接口契约」表把调用形态落到模块级（service 接口 / MCP Tools / casbin API），方案→证据链路显著增强。剩余断裂：(a) 意图理解的主通道（正常模式下由谁完成）仍只是被 S6 降级条款反向暗示，从未正面陈述；(b) Resource & Timeline 依旧零时间单位。❌ 部分断裂。

**Evidence → Success Criteria trace**: SC-1/2/5/6→P1、SC-4→P2、SC-3→P3，期数对齐。缺口：In-Scope #6「会话/诊断落库回溯」（P1 ✅）与 NFR「可回溯」仍无任何 SC 覆盖。❌

**SC Consistency Deep-Dive（按受影响域聚类）**:
- 时效域：SC-1（端到端 ≤1 分钟，NFR 性能②口径）与 NFR 性能①（规则引擎 <秒级）已分口径，SC↔NFR 无矛盾。残留歧义：SC-1 未说明 LLM 降级（S6 三级降级）状态下 1 分钟口径是否仍适用。
- 触发域：SC-2（预置环境注入 N≥20 条标准告警 → 风险中心可见成功率 100%）与 In-Scope #2（P1 告警）可双向满足；但「标准告警」无定义——ambiguous — requires author clarification。渠道推送 ≥99% 在 ≥20 样本下统计退化（见 Attack 6，revision 引入）。
- 执行域：SC-3（P3）↔ Out of Scope「全自动无人值守」双向可满足。✅
- 记忆域：SC-4（P2，5 秒）↔ In-Scope #4 对齐期数；「历史故障库**命中同类问句**」命中判定标准（相似度阈值？关键词？人工标注？）未定义——**ambiguous — requires author clarification**，且该歧义自 iteration-0 起未修。
- 隔离域：SC-5 ↔ #5 一致。✅
- 覆盖域：SC-6 ↔ P1 三模块一致。✅
- 跨节张力（归 D10）：P3 In-Scope「#10 CI/CD 数据源**接入**」依赖一个被 Constraints 明言「属空白」、被 Out of Scope 明言「不新建」的数据面（见 Attack 3）。

**自相矛盾检查**：核心行为 #3「预定义白名单内低危操作自动执行」与 Out of Scope「全自动无人值守执行（无任何人工确认环节）」可调和（白名单执行仍处于风险分级体系内），不判矛盾。S2（P1 场景）「高危项标记『待人工确认』」与「P1 先做纯只读」存在前向引用张力（见 Attack 4）。

---

## Step 3: Rubric Scoring

### 1. Problem Definition — 88/110

- **Problem stated clearly: 36/40**。一句话说清：「只是一套脱离真实运维平台的『空壳』……与 `D:\Haven` 运维平台的真实数据与能力零对接」。两位读者不会解读出不同问题。
- **Evidence provided: 30/40**。代码级证据具体（skill 全为纯 markdown、失效链接 `github.com/Havens-blog/OpsAgent`、底座模块逐包列举），但全部为静态检查证据，无任何运营量化：「运维仍需在各模块间人工切换、人工串联排障」——每月耗多少小时？MTTR 多少？告警平均处置时长？零数字。
- **Urgency justified: 22/30**。「越晚做，各模块越各自演化，编排接入面越复杂」是纯断言，无成本曲线；「AIOps 定位长期落空」是自我设定定位，非外部压力（客户/竞品/事故）。Urgency 一节无一个数字。

### 2. Solution Clarity — 108/120

- **Approach is concrete: 38/40**。六条核心行为 + 三期递进 + 接口契约表（各模块调用形态、契约要点、契约冻结机制、契约测试）使方案高度可复述。残留：编排层代码物理形态未说明（`internal/agent` 包？e-cam-web 新页面？规划循环由什么驱动），无模块划分图。
- **User-facing behavior described: 40/45**。S1–S6 覆盖提问→报告、告警→风险中心、高危→「需人工确认」回执、降级告知，是全文最强部分。扣分：「重复故障秒回」是营销措辞（SC-4 实为 5 秒）；「处置预案」在风险中心的呈现形态（结构化步骤？可带出执行入口？）未描述。
- **Technical direction clear: 30/35**。同仓、Go + Vue3、复用 `internal/cert`/`logquery` 装配先例、LLM 降级模式、契约表均为明确技术方向。扣分：意图理解主通道未正面陈述（S6 只反向暗示 LLM 承担意图识别）；诊断上下文组装（日志片段取多少、资产信息带多细）未说明。

### 3. Industry Benchmarking — 101/120

- **Industry solutions referenced: 38/40**。K8sGPT、Datadog Bits AI、PagerDuty AI、AWS CloudOps/DevOps Guru，均真实存在且对口。
- **At least 3 meaningful alternatives: 21/30**。数量达标（Do nothing + 两个 rejected + selected）。但两个 rejected 项（「重写独立全新项目」「通用大模型直连外部云源」）是旧 opsagent 路线的两个侧面，均 easy-reject；Industry Solutions 中唯一可实际引入的开源方案 K8sGPT 以一句「定位为『诊断分析器』而非编排层」打发，**从未作为第四备选进入 Comparison Table**（如「引入 K8sGPT 做 K8s 域诊断 + 自研薄编排」）。备选结构存在为选中项铺路的倾向。
- **Honest trade-off comparison: 22/25**。选中方案缺点「依赖 Haven 内部接口稳定性」如实写出，且已配套契约机制。
- **Chosen approach justified against benchmarks: 20/25**。「采纳 AIOps 编排……成熟范式，创新点不在算法而在落地方式」是清醒定位；对 Datadog（体量大）、AWS（不跨多云）有具体排除理由。「为何不基于 K8sGPT 二次开发」无回答。

### 4. Requirements Completeness — 92/110

- **Scenario coverage: 34/40**。S1/S2 happy path、S3 隔离、S4 记忆命中、S5 边界、S6 双链路降级，结构完整。缺失：告警风暴/并发触发（去重、聚合、限流）；用户对目标数据**无权限**（非跨租户，而是同租户内权限不足）时的交互；诊断进行中用户取消；模糊提问「系统是不是有问题」的归属（S6 三级降级仅覆盖识别失败，未覆盖识别成功但语义含糊）。
- **Non-functional requirements: 33/40**。安全维度显著增强（确定性风险分级、确认权限链、LLM 两侧租户安全），性能双口径分开，可回溯、兼容明确。扣分：「进入 LLM 的日志/告警文本视为不可信输入（防 prompt injection）」只声明了要求，未给机制（输出引用校验有，输入侧围栏/清洗无一句）；Agent 自身可用性/SLA 缺失；告警风暴下 LLM 调用成本/频率上限缺失；诊断数据保留期限与清理策略缺失。
- **Constraints & dependencies: 25/30**。依赖模块逐名列出，「不新建数据面」边界清晰，技术栈约束明确。扣分：P3 的 #10「CI/CD 接入」依赖当前空白且被列为不新建的数据面，依赖链未闭合（见 Attack 3）；eiam 租户谓词对编排层新增组合查询的覆盖语义未确认。

### 5. Solution Creativity — 68/100

- **Novelty over industry baseline: 26/40**。文档自认：「创新点不在算法而在『把编排层扎进已有平台底座』的落地方式」；「风险分级 + 白名单」亦自认是「业界 AIOps 常用能力封装粒度」。四条 Innovation Highlights 中两条自我否定其新颖性。诚实，但差异化仅剩「嵌入已有平台」一条成立。
- **Cross-domain inspiration: 18/35**。借鉴来源全部为同领域 AIOps 产品。风险分级放行与 SOAR playbook、SRE error budget、金融风控的分级放行同构，无任何跨域引用。
- **Simplicity of insight: 24/25**。「瘦编排层钉在已有底座」优雅克制，Assumptions Challenged 表印证了 Occam 收敛过程。

### 6. Feasibility — 78/100

- **Technical feasibility: 36/40**。底座能力清单到包路径，LLM 降级封装有现成先例，「无 showstopper」可信。扣分：意图理解链路（P1 第一入口）的可行性论证仍缺位。
- **Resource & timeline feasibility: 16/30**。**Resource & Timeline 一节至今没有一个时间单位**。「三期递进使 P1 范围可控、近期可交付」——「近期」是多近？无人日、无人周、无团队人数、无里程碑。无法评估排期现实性，本子项接近未评估。
- **Dependency readiness: 26/30**。分级诚实：P1「均已就绪」、P2 order「半成品，接入时需确认其 API 成熟度」、P3 CI/CD「当前空白」。扣分：P3 依赖项是「空白 + 不新建」的组合，readiness 实为未知；eiam 组合查询隔离语义未确认。

### 7. Scope Definition — 72/80

- **In-scope items are concrete: 28/30**。「能力总清单 × 分期」矩阵（#1–#10）使每项交付物具名且带期数归属，契约文档 + 契约测试列为 P1 显式交付物。
- **Out of scope explicitly listed: 24/25**。五条具名排除，且直接引用清单行号（「对应总清单 #8/#9/#10 的『接入』而非『新建』」），预先挡住最危险的蔓延。
- **Scope is bounded: 20/25**。P1 边界清晰但无时间锚点；P3「#10 接入」在数据面空白 + 不新建的前提下是开放式承诺（接入谁？）；「P2/P3 依赖 Haven 侧接口铺开，可并行推进」无边界。

### 8. Risk Assessment — 82/90

- **Risks identified: 28/30**。五条均实质（误执行事故、接口漂移、LLM 不稳、租户串库、故障库冷启动），无凑数项。
- **Likelihood + impact rated: 27/30**。分布诚实（M/H、M/M、L/H、H/M），非全「低概率高影响」。扣分：冷启动 H/M 的缓解「回填种子数据」后，命中效果无任何验收挂钩（SC-4 只测命中后的延迟，不测命中率）。
- **Mitigations are actionable: 27/30**。「P1 先做纯只读，写执行留到 P3」「高危 100% 人工确认」「加跨租户隔离测试」可执行；接口漂移行现已落到「接口契约化并加集成测试」且有专节支撑。扣分：「白名单最小化」无最小化的判定标准；冷启动缓解无产出物定义（回填多少条？覆盖率多少？）。

### 9. Success Criteria — 68/80

- **Criteria are measurable and testable: 26/30**。SC-1（1 分钟 + 数据源引用）、SC-3（100%/100%）、SC-5（自动化测试）、SC-6（各模块 ≥1 条端到端集成测试）均可写成测试；SC-2 经重写后主体可测（风险中心可见为可断言状态）。扣分：SC-2「标准告警」未定义（注入什么算一条标准告警？）；「钉钉/飞书等外部渠道推送成功率 ≥ 99%」在 ≥20 样本下单次失败即 95%，该指标实际退化为 100% 要求（revision 引入的统计缺陷）；SC-4「命中同类问句」判定标准缺失——ambiguous — requires author clarification。
- **Coverage is complete: 20/25**。#1/#2/#5/#7(P1)/#4/#7(P3) 均有 SC 映射。缺口：In-Scope #6「会话/诊断落库回溯」（P1 ✅）与 NFR「可回溯」无任何 SC 覆盖——交付了也无人验收。
- **SC internal consistency: 22/25**。聚类检查无 SC↔SC、SC↔InScope 硬矛盾。两处歧义标记：SC-4 命中标准（见上）；SC-1 在 S6 三级降级状态下是否仍按 1 分钟口径验收未说明。

### 10. Logical Consistency — 78/90

- **Solution addresses the stated problem: 31/35**。编排层直击「空壳零对接」。「垂直领域运维 Agent 定位」兑现到什么程度算兑现（P1 之后是否仍是「空壳 + 一点点」）无中间定义。
- **Scope ↔ Solution ↔ Success Criteria aligned: 24/30**。能力矩阵使分期对齐显著改善。两处残留：(a) P3 In-Scope「#10 CI/CD 数据源接入」与 Constraints「CI/CD……属空白」+ Out of Scope「不新建 CI/CD 系统」构成未闭合三角——若 Haven 不建 CI/CD，P3 该项无对象可接；(b) S2（P1 场景）写「高危项标记『待人工确认』」，而「P1 先做纯只读」——P1 风险中心将出现无执行后端可承接的「待人工确认」项，期数归属未标注。
- **Requirements ↔ Solution coherent: 23/25**。S6 三级降级闭合了此前意图链路缝隙的主干。残留：S2 承诺「被告警唤醒后自动跑排查」而方案与 NFR 均无风暴下的去重/限流机制——需求承诺与方案能力之间存在缝隙（见 Attack 5）。

---

## Step 4: Blindspot Hunt

1. **[blindspot] [Logical Consistency] P3 的「CI/CD 接入」交付物与「不新建 CI/CD」的 Out-of-Scope 构成未闭合三角。** In Scope 写「P3 CI/CD 接入 + 可控执行闭环：上表 #10 接入」，Constraints 写「CI/CD 与工单闭环在 Haven 侧属空白，P2/P3 仅做接入或预留接口」，Dependency Readiness 写「P3 的 CI/CD 数据面当前空白」。若 Haven 侧最终不建 CI/CD，#10「接入」无对象，P3 标题承诺（「CI/CD 接入」）落空。必须写明：P3 #10 的前置条件（Haven 侧数据面到位才接入，否则降级为预留并调整 P3 交付定义）。
2. **[blindspot] [Feasibility] 全文零时间估算，timeline 子项形同虚设。** 「三期递进使 P1 范围可控、近期可交付」是唯一排期陈述，无日期、无人力、无里程碑。CTO 无法判断 P1 是两周还是一季度。
3. **[blindspot] [Logical Consistency] S2 的「高危项标记『待人工确认』」在 P1 无执行后端。** P1 承诺「P1 先做纯只读」（Key Risks 表），但 S2（P1 场景）已出现高危确认交互；确认链路（权限、代理执行、前提重验）全部定义在 NFR 安全条目下且服务于 P3 写执行。P1 的风险中心若照 S2 实现，是把没有执行后端的确认流焊进产品。
4. **[blindspot] [Solution Clarity] 告警风暴下的自我保护缺失。** 「被告警 / 工单 / 定时巡检唤醒后，自动跑排查」——一次网络抖动可产生数十条告警，是否去重、聚合、限流？每条排查拉日志 + 调 LLM 的成本与查询压力未在方案、NFR 或风险表中出现。
5. **[blindspot] [Success Criteria] SC-4 命中标准自 iteration-0 起未修。** 「历史故障库命中同类问句时，Agent 在 5 秒内返回」——「命中」由谁、按什么标准判定（相似度阈值？人工标注？）仍无定义，5 秒 SLA 的达成率不可统计。 ambiguous — requires author clarification。
6. **[blindspot] [Requirements Completeness] 输入侧 prompt injection 只有一句声明、没有机制。** 「进入 LLM 的日志/告警文本视为不可信输入（防 prompt injection）」——不可信之后做什么（清洗？围栏？结构化包裹？）零描述；对比输出侧有引用校验机制。NFR 安全条目在输入侧是断言而非需求。
7. **[blindspot] [Industry Benchmarking] K8sGPT 仍未进入 Comparison Table。** 「K8sGPT：开源，用 LLM 解读 Kubernetes 可观测数据，定位为『诊断分析器』而非编排层」——唯一开源可落地选项以一句定性排除，从未作为「引入 + 自研薄编排」的混合方案被权衡。

**Bias Detection Report**:
- Annotated regions: 2 attack points（Attack 6 输入侧注入机制属 NFR 安全标注段边缘；SC 相关统计缺陷不在此列）/ 7 annotated paragraphs = density 0.29
- Unannotated regions: 6 attack points（Attack 1/2/3/4/5/7）/ ~40 unannotated paragraphs = density 0.15
- Ratio (annotated/unannotated): 1.9
- 说明：annotated 区攻击密度略高，主因是 revision 新增文本自带可核验断言（可被检验的承诺面更大），未见对标注区的放水或过度苛责；本次无 conflict-with-pre-revision 判定（所有 pre-revision 修订方向均被评分认可，Attack 6 针对的是修订不彻底而非修订方向错误）。

---

## Score Summary

| Dimension | Score | Max |
|-----------|-------|-----|
| Problem Definition | 88 | 110 |
| Solution Clarity | 108 | 120 |
| Industry Benchmarking | 101 | 120 |
| Requirements Completeness | 92 | 110 |
| Solution Creativity | 68 | 100 |
| Feasibility | 78 | 100 |
| Scope Definition | 72 | 80 |
| Risk Assessment | 82 | 90 |
| Success Criteria | 68 | 80 |
| Logical Consistency | 78 | 90 |
| **Total** | **835** | **1000** |

## Verdict

本轮 pre-revision 有效闭合了 iteration-0 的全部 8 个 attack point：接口契约节、确定性风险分级不变量、确认权限链、LLM 两侧租户安全、S6 三级降级、SC-2 重写、性能双口径、能力矩阵均已落到纸面，方案骨架达到可进 PRD 的成熟度。但距离 900 分线仍有 65 分缺口，压分点集中在五处未动区域与两处 revision 自带缺陷：(1) Feasibility 依旧零时间估算（最重的单项扣分）；(2) K8sGPT 类开源方案仍未作为第四备选进入对比表；(3) P3「CI/CD 接入」依赖被 Out of Scope 排除的数据面，三角未闭合；(4) SC-4「命中」标准未定义、In-Scope #6 落库回溯仍无 SC；(5) S2 高危确认交互前向引用 P3 能力、告警风暴无防护。修订方向全部正确，下一轮应转向未动的维度而非继续打磨已修区域。
