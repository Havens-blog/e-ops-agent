# Proposal Evaluation — Iteration 2

- **Document**: `F:\AiOpsAagent\docs\proposals\haven-opsagent\proposal.md`（Haven 运维 Agent 垂直编排层）
- **Rubric**: `proposal.md` rubric, 1000-point scale, target 900
- **Stance**: Adversarial. Score reflects only what is on the page right now; no credit for effort or improvement.
- **Scorer date**: 2026-09-23

---

## Step 2: Reasoning Audit

**Problem → Solution trace**: Problem = OpsAgent 空壳、与 Haven 底座零对接。Solution = 纯编排层子模块接入 logquery/alert/audit/topology/资产/MCP/eiam。闭环成立。✅

**Solution → Evidence trace**: 底座能力落到包路径，契约表 + 契约冻结机制 + 契约测试闭合了接口漂移证据链。剩余断裂：(a) 意图理解主通道仍只被 S6 降级条款反向暗示（「意图识别/参数抽取退化为模板/正则意图匹配」），从未正面陈述正常路径由谁完成；(b) SC-4 新引入 embedding 检索，但该技术依赖在 Constraints/Feasibility/Solution 中零出现（见 Attack 1）。❌ 部分断裂。

**Evidence → Success Criteria trace**: SC-1/2/5/6/7→P1、SC-4→P2、SC-3→P3。Iteration-1 缺口已闭合：新增 SC-7 覆盖 In-Scope #6 与 NFR「可回溯」。残留：P2 的 #8（audit 接入）、#9（工单/拓扑接入）仍无任何 SC——交付了无人验收。❌ 部分闭合。

**SC Consistency Deep-Dive（按受影响域聚类）**:
- 时效域：SC-1（端到端 ≤1 分钟，NFR 性能②口径）↔ NFR 性能①（规则引擎 <秒级）分口径无矛盾。残留：SC-1 未说明 S6 三级降级状态下 1 分钟口径是否仍适用。
- 触发域：SC-2「标准告警」已定义（类型数 ≥ 10、每条三类结构化字段）；样本数学自洽（≥10 类型 × ≥10 条 = ≥100 ✓；99% 允许 1 条失败，N≥100 下统计有效 ✓，iteration-1 的统计退化缺陷已修复）。SC-2 ↔ In-Scope #2 双向可满足。✅
- 执行域：SC-3（P3）↔ Out of Scope「全自动无人值守」可调和。✅
- 记忆域：SC-4 命中判定已定义（Top-1 余弦 ≥ 0.85 + 人工标注确认 + ≥20 条测试集 + 命中率 ≥ 80%），iteration-1 的「命中无标准」歧义已消除。✅（但引入新依赖，见 Attack 1）
- 隔离域：SC-5 ↔ #5 一致。✅
- 回溯域：SC-7 ↔ #6 ↔ NFR「可回溯」三方对齐，落库完整率 100% 可断言。✅
- 覆盖域：SC-6 ↔ P1 三模块一致。✅
- SC↔InScope 残留缺口：#8/#9（P2）无 SC（归 D9 coverage）。

**自相矛盾检查**：
- Iteration-1 的 S2「待人工确认」前向引用矛盾已修复：S2 现明确「P1 仅展示……**不提供确认按钮**（P1 纯只读、无执行后端）；P3 写执行闭环落地后，才启用完整确认流」。✅
- Iteration-1 的 P3 CI/CD 三角已闭合：Scope 现写明「#10 接入有明确前置条件……若 P2 评估结束时该数据面仍未到位，#10 降级为『仅预留事件订阅接口』，P3 交付定义相应收窄」，与 Constraints「属空白」、Out of Scope「不新建」不再冲突。✅
- 新增轻微张力：Feasibility「P2/P3 依赖 Haven 侧接口铺开，可并行推进」与 Scope P3「#10……若 P2 评估结束时……」的顺序依赖相抵触（#10 的去留要等 P2 评估，无法完全并行）。不判硬矛盾（P3 主体 #7 确实可并行）。
- 核心行为 #3「低危白名单自动执行」↔ Out of Scope「全自动无人值守」：维持 iteration-1 判定（白名单执行在风险分级体系内），不判矛盾。✅

---

## Step 3: Rubric Scoring

### 1. Problem Definition — 88/110

- **Problem stated clearly: 37/40**。「只是一套脱离真实运维平台的『空壳』……与 `D:\Haven` 运维平台的真实数据与能力零对接」——单句可复述，两位读者不会解读出不同问题。扣 3：标题混用「空壳已失效」与「底座已成熟」两个叙事层次，需读者自行拼接。
- **Evidence provided: 30/40**。代码级证据扎实（skill 纯 markdown、失效链接 `github.com/Havens-blog/OpsAgent`、底座逐包列举），但零运营量化：「运维仍需在各模块间人工切换、人工串联排障」——每月人工串联耗时多少？MTTR？告警平均处置时长？一个数字都没有。此缺口自 iteration-0 起三轮未动。
- **Urgency justified: 21/30**。「越晚做，各模块越各自演化，编排接入面越复杂」是纯断言，无成本曲线或流失风险；「AIOps 定位长期落空」是自我设定定位，非客户/事故/竞品压力。Urgency 一节至今无一个数字。

### 2. Solution Clarity — 112/120

- **Approach is concrete: 38/40**。六条核心行为 + 三期递进 + 接口契约表（调用形态/契约要点/契约冻结机制/契约测试）高度可复述。扣 2：编排层物理形态仍未说明——`internal/agent` 包？e-cam-web 新页面？规划循环由什么驱动？无模块划分。
- **User-facing behavior described: 42/45**。S1–S6 全覆盖，且 S2 现明确 P1/P3 确认交互分期归属（「P1 仅展示……不提供确认按钮」），消除了上一轮最强的用户行为歧义。扣 3：「重复故障秒回」仍是营销措辞（SC-4 实为 5 秒）；「处置预案」在风险中心的呈现形态（结构化步骤？可带出执行入口？）未描述。
- **Technical direction clear: 32/35**。同仓、Go + Vue3、复用装配先例、LLM 降级模式、契约机制均为明确方向。扣 3：意图理解主通道从未正面陈述（S6 仅以「退化为模板/正则意图匹配」反向暗示 LLM 是主通道）；诊断上下文组装（日志片段取多少、资产信息带多细）未说明。

### 3. Industry Benchmarking — 111/120

- **Industry solutions referenced: 38/40**。K8sGPT、Datadog Bits AI、PagerDuty AI、AWS CloudOps/DevOps Guru，真实且对口。
- **At least 3 meaningful alternatives: 27/30**。K8sGPT 本轮以完整对比行进入 Comparison Table（第 4 行），pros/cons 均实质：「K8s 域诊断开箱即用……无 license 成本」vs「数据源适配面窄……对 Haven 主场景（多云 CDN/WAF/LB 日志联邦、ecmdb 资产、钉钉/飞书告警链路）需自写后端连接器」——不再是稻草人。Do nothing 具名。扣 3：其余两个 rejected 项（「重写独立全新项目」「通用大模型直连外部云源」）仍是旧 opsagent 路线的两个侧面，属 easy-reject。
- **Honest trade-off comparison: 23/25**。选中方案唯一缺点「依赖 Haven 内部接口稳定性」如实写出且已配套契约机制。扣 2：对 K8sGPT 的关键判据「适配成本高于直接基于 logquery 自建」是断言，无任何适配工作量估算支撑。
- **Chosen approach justified against benchmarks: 23/25**。「为何不基于 K8sGPT 二次开发」本轮有答案；Datadog（体量大）、AWS（不跨多云）排除理由具体。扣 2：「采纳……成熟范式」的借鉴边界（哪些设计参考 K8sGPT 分析器/降级设计）仅一句带过。

### 4. Requirements Completeness — 97/110

- **Scenario coverage: 35/40**。S1/S2 happy、S3 隔离、S4 记忆、S5 高危边界、S6 双链路降级，结构完整且 S2 分期归属清晰。扣 5：仍缺四类场景——告警风暴/并发触发（无去重、聚合、限流，见 Attack 2）；同租户内**权限不足**用户发起查询的交互（NFR 只覆盖了确认入口的权限，未覆盖查询权限）；诊断进行中用户取消；语义含糊但可解析的提问（S6 三级降级只覆盖识别失败，不覆盖识别成功但含糊）。
- **Non-functional requirements: 36/40**。安全维度本轮补齐输入侧防线：「①清洗……②结构化包裹……③围栏」与输出侧「引用校验，越界引用一律丢弃」对称，iteration-1 的「只有断言没有机制」已修复。性能双口径清晰。扣 4：Agent 自身可用性/SLA 缺失；告警风暴下 LLM 调用成本/频率上限缺失；诊断数据保留期限与清理策略缺失。
- **Constraints & dependencies: 26/30**。依赖模块逐名列出，「不新建数据面」边界清晰。扣 4：SC-4 硬编码「embedding 相似度检索」，但 embedding 模型选型、中文支持、向量索引/存储在 Constraints/Dependencies 与 Feasibility 中零出现（见 Attack 1）；eiam 租户谓词对编排层新增组合查询的覆盖语义仍未确认。

### 5. Solution Creativity — 68/100

- **Novelty over industry baseline: 26/40**。文档自认：「创新点不在算法而在『把编排层扎进已有平台底座』的落地方式」；「风险分级 + 白名单」亦自认是「业界 AIOps 常用能力封装粒度」。诚实，但差异化仅剩「嵌入已有平台」一条成立。
- **Cross-domain inspiration: 18/35**。借鉴来源仍全部为同领域 AIOps 产品。风险分级放行与 SOAR playbook、SRE error budget、金融风控分级放行同构，三轮均无任何跨域引用。
- **Simplicity of insight: 24/25**。「瘦编排层钉在已有底座」优雅克制，Assumptions Challenged 表印证 Occam 收敛。

### 6. Feasibility — 91/100

- **Technical feasibility: 37/40**。底座能力到包路径，LLM 降级封装有现成先例，「无 showstopper」可信。扣 3：意图理解链路（P1 第一入口）的可行性论证仍缺位；embedding 检索可行性未论证（模型、索引、存储成本）。
- **Resource & timeline feasibility: 26/30**。**本轮补齐了 iteration-1 最大的空洞**：P1「6–8 周」、P2「4–6 周」、P3「约 6 周」，2 后端 + 1 前端，M1（第 2 周末契约冻结 + 链路跑通）/M2（第 4–5 周末风险中心）/M3（第 6–8 周末验收）——排期可评估了。扣 4：P1 六个交付面（契约文档+测试、对话排障、主动触发、双界面、多租户、落库回溯）对 2BE+1FE 的 6–8 周偏紧且无缓冲说明；前端两条全新 UI（对话窗口 + 风险中心）的工作量未单独论证。
- **Dependency readiness: 28/30**。分级诚实（P1 就绪 / P2 order 半成品 / P3 空白），且 P3 现有降级出口。扣 2：eiam 组合查询隔离语义未确认；embedding 依赖 readiness 未评估。

### 7. Scope Definition — 77/80

- **In-scope items are concrete: 29/30**。「能力总清单 × 分期」矩阵使每项交付物具名带期数，契约文档 + 契约测试为 P1 显式交付物。
- **Out of scope explicitly listed: 25/25**。五条具名排除并引用清单行号，预先挡住最危险蔓延。
- **Scope is bounded: 23/25**。P3 #10 本轮获得明确前置条件与降级出口（「若 P2 评估结束时该数据面仍未到位，#10 降级为『仅预留事件订阅接口』」），开放式承诺已闭合。扣 2：「P2/P3 依赖 Haven 侧接口铺开，可并行推进」与 #10 依赖 P2 评估结果的顺序性相抵触；P2/P3 无任何时间外边界以外的范围护栏。

### 8. Risk Assessment — 82/90

- **Risks identified: 27/30**。五条均实质。扣 3：**告警风暴风险持续缺席**——S2 承诺「被告警……唤醒后，自动跑排查」，SC-2 要注入 100 条告警，而风险表、NFR、方案中均无风暴下的去重/聚合/限流/成本控制（见 Attack 2）。一条高概率运营风险消失于视野。
- **Likelihood + impact rated: 28/30**。分布诚实（M/H、M/M、L/H、H/M）。冷启动 H/M 现与 SC-4 命中率 ≥ 80% 挂钩，iteration-1 的「缓解效果无验收挂钩」已修复。扣 2：「白名单最小化」仍无最小化判定标准。
- **Mitigations are actionable: 27/30**。「P1 先做纯只读，写执行留到 P3」「高危 100% 人工确认」「加跨租户隔离测试」可执行。扣 3：冷启动缓解「用 Haven 现有 audit/告警历史回填种子数据」仍无产出物定义（回填多少条？覆盖率多少？SC-4 只验收命中率，不验收回填量）；「白名单最小化且可审计」的审计机制未描述。

### 9. Success Criteria — 75/80

- **Criteria are measurable and testable: 28/30**。SC-2 全面可测（「标准告警」三类结构化字段定义、N ≥ 100、每类型 ≥ 10、99% 允许 1 失败——样本数学自洽）；SC-4 命中判定可操作化（Top-1 余弦 ≥ 0.85 + 人工标注 + ≥ 20 条测试集 + 命中率 ≥ 80% + 5 秒）；SC-7 落库完整率 100% 可断言。扣 2：SC-4 的「人工标注确认为同一根因类」引入标注主观性（标注者、标注一致性流程未定义）；SC-1 在 S6 三级降级状态下是否仍按 1 分钟口径验收未说明。
- **Coverage is complete: 23/25**。SC-7 新增闭合了 #6 与 NFR「可回溯」缺口；#1–#7 全部有 SC 映射。扣 2：P2 的 #8（audit 接入）、#9（工单/拓扑接入）无任何 SC——P2 交付物中近半数验收标准缺失。
- **SC internal consistency: 24/25**。七域聚类（时效/触发/执行/记忆/隔离/回溯/覆盖）无 SC↔SC、SC↔InScope 硬矛盾；触发域样本数学经复算自洽；记忆域歧义已消除。扣 1：时效域残留——SC-1 与 S6 降级态的口径关系未声明。
- **表面瑕疵（计入本维度）**：SC 编号在列表中乱序出现（…SC-4 → SC-7 → SC-5 → SC-6），系插入 SC-7 后未重排，验收文档出现编号跳跃易引发引用歧义（见 Attack 4），已在 measurable 扣分内一并体现。

### 10. Logical Consistency — 82/90

- **Solution addresses the stated problem: 32/35**。编排层直击「空壳零对接」。扣 3：「垂直领域运维 Agent 定位」兑现到什么程度算兑现（P1 之后是否仍是「空壳 + 一点点」）仍无中间定义。
- **Scope ↔ Solution ↔ Success Criteria aligned: 27/30**。Iteration-1 两处硬伤（P3 CI/CD 三角、S2 前向引用）本轮均已修复且未引入新矛盾。扣 3：「可并行推进」与 #10 对 P2 评估的顺序依赖相抵触；P2/P3 各交付项仍缺各自的 SC 锚点（与 D9 coverage 缺口同源）。
- **Requirements ↔ Solution coherent: 23/25**。S6 三级降级、S2 分期归属、契约机制均闭合了先前缝隙。扣 2：S2 承诺「被告警唤醒后自动跑排查」而方案/NFR/风险表均无风暴下的去重/聚合/限流机制——需求承诺与方案能力之间的缝隙三轮未闭（见 Attack 2）。

---

## Step 4: Blindspot Hunt

1. **[blindspot] [Feasibility / Constraints] SC-4 独自引入了全文唯一的 embedding 技术依赖，方案与约束层零承接。** SC-4：「对故障库条目按问句语义做 embedding 相似度检索，Top-1 余弦相似度 ≥ 0.85」——embedding 模型选型（中文问句）、向量化成本、向量索引/存储方案、与「复用 Haven 现有栈，不入场新语言/框架」约束的相容性，在 Proposed Solution、Constraints & Dependencies、Feasibility 中均无一处出现。一条 P2 验收标准硬编码了方案层从未承诺的技术。必须：在方案或依赖清单中落 embedding 供给方式（本地模型/服务），或在 SC-4 中改为不预设实现技术的等价判定。
2. **[blindspot] [Logical Consistency / Requirements] 告警风暴防护三轮缺席，而 S2 与 SC-2 都在放大该暴露面。** S2：「被告警 / 工单 / 定时巡检唤醒后，自动跑排查」；SC-2：「注入 N ≥ 100 条标准告警」——100 条告警意味着 100 次自动排查（每次拉日志 + LLM 调用 + 落库）。去重、聚合、限流、LLM 调用上限、排查排队策略在全文（方案、NFR、风险表）零出现。一次网络抖动即可将此缝隙变成真实故障。必须：在 S2/NFR/风险表至少一处落地风暴语义（按指纹聚合、并发上限、LLM 预算）。
3. **[blindspot] [Problem Definition] Evidence 与 Urgency 三轮零运营数字。** 「运维仍需在各模块间人工切换、人工串联排障」「越晚做，各模块越各自演化，编排接入面越复杂」——无 MTTR、无人工耗时、无告警量、无事故案例。代码级证据充分但业务侧价值论证全靠断言。
4. **[blindspot] [Success Criteria] SC 编号乱序（…SC-4 → SC-7 → SC-5 → SC-6），插入 SC-7 后未重排。** 验收文档的编号跳跃会造成「SC-6 是什么」的引用歧义，也暗示曾有条目被删除。必须重排为连续编号并全文同步引用。
5. **[blindspot] [Solution Clarity] 意图理解主通道仍靠反向暗示。** S6：「① 意图识别/参数抽取退化为模板/正则意图匹配（覆盖预置问法）」——读者只能推出「正常路径大概不是正则」，但 LLM 承担意图识别这一 P1 关键设计从未被正面写明（模型选型、prompt 策略、失败判定）。
6. **[blindspot] [Risk Assessment] 冷启动缓解仍无产出物定义。** 「用 Haven 现有 audit/告警历史回填种子数据；先提供人工沉淀 SOP 的入口」——回填多少条、覆盖哪些故障类型、由谁沉淀，均未定义；SC-4 的 ≥ 20 条测试集与回填量之间无衔接关系。

**Bias Detection Report**:
- Annotated regions（带 pre-revised 标记）: 8 处（接口契约 high、S6 medium、NFR 安全 high、NFR 性能 medium、能力矩阵 medium、SC-1 medium、SC-2 medium）
- Annotated regions 命中 attack: Attack 5 触及 S6 标注段边缘（1/8, density 0.13）
- Unannotated regions: Attack 1/2/3/4/6 命中（5/~40, density 0.13）
- Ratio ≈ 1.0：攻击分布均匀，未见对标注区放水或过度苛责。本轮所有 pre-revision 修订方向均被验证有效（CI/CD 降级条款、S2 分期归属、SC-2/SC-4 定义、SC-7 新增均为实质修复），无 conflict-with-pre-revision 判定。

---

## Previous Attack Points — Resolved vs Open

| # | Iteration-1 Attack | Status |
|---|--------------------|--------|
| 1 | P3 CI/CD 接入与「不新建 CI/CD」未闭合三角 | **RESOLVED** — Scope 新增前置条件 + 降级条款 |
| 2 | Feasibility 零时间估算 | **RESOLVED** — 6–8/4–6/约 6 周、2BE+1FE、M1–M3 里程碑 |
| 3 | S2「待人工确认」P1 无执行后端 | **RESOLVED** — S2 明确 P1 仅展示、不提供确认按钮 |
| 4 | 告警风暴无防护 | **OPEN**（第 2 轮）— 全文仍零去重/聚合/限流 |
| 5 | SC-4 命中标准未定义 | **RESOLVED** — 0.85 余弦 + 人工标注 + 测试集 + 命中率（但衍生出 Attack 1 依赖缺口） |
| 6 | 输入侧 prompt injection 无机制 | **RESOLVED** — 清洗/结构化包裹/围栏三道防线 |
| 7 | K8sGPT 未进对比表 | **RESOLVED** — 第 4 行完整对比行 |
| 附 | SC-2「标准告警」未定义、渠道推送统计退化 | **RESOLVED** — 定义补齐、N ≥ 100 样本数学有效 |
| 附 | In-Scope #6 无 SC 覆盖 | **RESOLVED** — 新增 SC-7（衍生出编号乱序瑕疵） |
| 持续 | Problem Evidence/Urgency 零量化 | **OPEN**（第 3 轮） |
| 持续 | 意图理解主通道未正面陈述 | **OPEN**（第 3 轮） |
| 持续 | Creativity 双维度（新颖性自认、零跨域） | **OPEN**（第 3 轮） |

---

## Score Summary

| Dimension | Score | Max |
|-----------|-------|-----|
| Problem Definition | 88 | 110 |
| Solution Clarity | 112 | 120 |
| Industry Benchmarking | 111 | 120 |
| Requirements Completeness | 97 | 110 |
| Solution Creativity | 68 | 100 |
| Feasibility | 91 | 100 |
| Scope Definition | 77 | 80 |
| Risk Assessment | 82 | 90 |
| Success Criteria | 75 | 80 |
| Logical Consistency | 82 | 90 |
| **Total** | **883** | **1000** |

## Verdict

Iteration-2 修复了 iteration-1 的 7 个 attack point 中的 6 个，且修复质量高（非打补丁式）：CI/CD 三角以降级条款闭合、S2 分期归属消除前向引用、timeline 落到周/人/里程碑、K8sGPT 成为真实对比行、SC-2/SC-4 完全可操作化、SC-7 补上回溯验收。距 900 分线差 17 分。剩余压分点高度集中且三轮未动：(1) 告警风暴防护缺席（唯一持续恶化的暴露面，SC-2 的 100 条注入测试反而放大它）；(2) SC-4 独自引入的 embedding 依赖无方案层承接；(3) Problem 侧零运营数字；(4) Creativity 两子项三轮未动（自认非创新 + 零跨域引用，合计 -31 分，是最大单一失分区）；(5) SC 编号乱序与 P2 交付物（#8/#9）无 SC。下一轮若要过线，最高杠杆是 Creativity（+31 可得空间）与告警风暴 + embedding 依赖两处闭环，而非继续打磨已修复区域。
