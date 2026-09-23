# Proposal Evaluation — Iteration 3

- **Document**: `F:\AiOpsAagent\docs\proposals\haven-opsagent\proposal.md`（Haven 运维 Agent 垂直编排层）
- **Rubric**: `proposal.md` rubric, 1000-point scale, target 900
- **Stance**: Adversarial. Score reflects only what is on the page right now; no credit for effort or improvement.
- **Scorer date**: 2026-09-23

---

## Step 2: Reasoning Audit

**Problem → Solution trace**: Problem = OpsAgent 空壳、与 Haven 底座零对接（本轮附基线运营指标：月均约 3000 条告警、20–40 分钟/次人工串联、MTTR 1–2 小时、重复告警 ≥ 30%）。Solution = 纯编排层子模块接入 logquery/alert/audit/topology/资产/MCP/eiam。问题定义与方案闭环成立。✅

**Solution → Evidence trace**: 底座能力逐包列举 + 接口契约表 + 契约冻结/契约测试 + 语义检索依赖条款（Constraints「语义检索依赖（P2，支撑 SC-4）」）——iteration-2 的 embedding 孤儿依赖已闭合：SC-4 改为「检索实现技术不在此预设（embedding 向量检索 / 关键词·结构化检索均为候选）」，Constraints 给出两条候选路径与回退条款，Feasibility 补 readiness 论证。告警风暴从 NFR（指纹聚合/并发上限/LLM 预算）、S2、风险表三处落地。剩余断裂：意图理解主通道第 4 轮仍只被 S6「退化为模板/正则意图匹配」反向暗示，从未正面陈述正常路径由谁完成。❌ 轻微断裂。

**Evidence → Success Criteria trace**: SC-1/2/5/6/7→P1、SC-4→P2、SC-3→P3。SC 编号已重排为连续序列（SC-1→SC-7），iteration-2 的乱序瑕疵消除。残留：P2 的 #8（audit 接入）、#9（工单/拓扑接入）仍无任何 SC；新增的风暴防护三机制同样零 SC 挂钩且 SC-2 主动把聚合排除出测试（见 Attack 1）。❌ 部分闭合。

**SC Consistency Deep-Dive（按受影响域聚类）**:
- 时效域：SC-1（端到端 ≤1 分钟，NFR 性能②口径）↔ NFR 性能①（规则引擎 <秒级）分口径无矛盾。残留：SC-1 未说明 S6 三级降级状态下 1 分钟口径是否仍适用（第 3 轮未动）。
- 触发域：SC-2「标准告警」定义、N ≥ 100、每类型 ≥ 10、99% 允许 1 失败——样本数学复算自洽（≥10 × ≥10 = ≥100 ✓）。「条条指纹互异」的测试设计与 NFR 聚合机制无矛盾，但产生新歧义：NFR「队列溢出时丢弃低级别（P3 以下）告警的自动排查」与 SC-2「即 100 次独立排查均须落库」在队列容量未定义的情况下可同时成立也可冲突——若测试集含 P3 级告警且队列溢出，两条款互斥（ambiguous — requires author clarification）。
- 执行域：SC-3（P3）↔ Out of Scope「全自动无人值守」可调和。✅
- 记忆域：SC-4 命中判定（Top-1 候选 + 人工标注确认 + ≥20 条测试集 + 命中率 ≥ 80% + 5 秒）已去除技术预设，与 Constraints 回退条款双向可满足。✅
- 隔离域：SC-5 ↔ SC-6 ↔ #5/#6 一致。✅
- 覆盖域：SC-7 ↔ P1 三模块一致；#8/#9 仍无 SC。
- SC↔InScope：无新增硬矛盾。

**自相矛盾检查**：
- Iteration-1/2 修复保持完好：S2 P1/P3 确认交互分期归属、#10 前置条件 + 降级条款、S6 零 LLM 告警链路均未回退。✅
- 本轮新增内容未引入硬矛盾。轻微张力维持：Feasibility「P2/P3 依赖 Haven 侧接口铺开，可并行推进」与 #10「若 P2 评估结束时该数据面仍未到位……」的顺序依赖相抵触（不判硬矛盾）。
- 命名歧义（非矛盾）：NFR 风暴防护的告警级别「P3 以下」「P1/P2 级」与分期代号 P1/P2/P3 撞名，同段内两种语义并存（见 Attack 3）。

---

## Step 3: Rubric Scoring

### 1. Problem Definition — 100/110

- **Problem stated clearly: 37/40**。「只是一套脱离真实运维平台的『空壳』……与 `D:\Haven` 运维平台的真实数据与能力零对接」——单句可复述。扣 3：标题段仍混用「空壳已失效」与「底座已成熟」两个叙事层次，需读者自行拼接（三轮未动的表面瑕疵）。
- **Evidence provided: 37/40**。**iteration-2 最大缺口已补**：基线运营指标齐备（「月均告警约 3000 条量级」「平均 20–40 分钟/次」「每月 60–100 人时」「MTTR 约 1–2 小时」「同类告警重复出现占比粗估 ≥ 30%」），且诚实标注「初估口径，P1 启动前以 alert / audit 历史数据核实后替换为实测值」。代码级证据继续扎实。扣 3：全部运营数字为自估初值，无一实测；且下界算术不符——150 次 × 20 分钟 = 50 人时，文中却写「每月 60–100 人时」，估算区间与自身前提不自洽（见 Attack 6）。
- **Urgency justified: 26/30**。不作为成本已量化（「每月 60–100 人时的机械串联、MTTR 维持 1–2 小时」），并给出成本上升机制（「每新增一个模块，人工串联就多一跳，编排接入成本随时间上升」）。扣 4：上升机制为定性断言，无每模块接入成本增幅数据；仍无外部压力来源（客户/事故/竞品），urgency 全部由内部定位推导。

### 2. Solution Clarity — 113/120

- **Approach is concrete: 38/40**。六条核心行为 + 三期递进 + 接口契约表 + 契约冻结机制高度可复述。扣 2：编排层物理形态仍未说明——`internal/agent` 包名、模块划分、规划循环驱动方式均缺失，Next Steps 仅「新建 Agent 子模块（编排层，复用现有栈与模块装配先例）」。
- **User-facing behavior described: 43/45**。S1–S6 全覆盖；S2 本轮进一步明确预案呈现形态（「只呈现预案内容与所需操作清单」）与聚合告警的展示承诺（「聚合后的告警流仍全部展示于风险中心」）。扣 2：「重复故障秒回」（核心行为 #5、S4）仍是营销措辞，量化口径（5 秒）只存在于 SC-4。
- **Technical direction clear: 32/35**。同仓、Go + Vue3、装配先例、LLM 降级模式、契约机制、语义检索两条候选路径均为明确方向。扣 3：意图理解主通道第 4 轮未正面陈述（S6 仅以「意图识别/参数抽取退化为模板/正则意图匹配」反向暗示）；诊断上下文组装（日志片段取多少、资产信息带多细）未说明；LLM 调用预算无默认数值（窗口 10 分钟、并发 5 均有默认值，唯独预算次数没有——见 Attack 4）。

### 3. Industry Benchmarking — 111/120

- **Industry solutions referenced: 38/40**。K8sGPT、Datadog Bits AI、PagerDuty AI、AWS CloudOps/DevOps Guru，真实且对口。
- **At least 3 meaningful alternatives: 27/30**。K8sGPT 完整对比行 pros/cons 均实质；Do nothing 具名。扣 3：「重写独立全新项目」「通用大模型直连外部云源」仍是旧 opsagent 路线的两个侧面，属 easy-reject，未引入第三个真正异构的替代（如基于开源 AIOps 编排框架自建）。
- **Honest trade-off comparison: 23/25**。选中方案唯一缺点「依赖 Haven 内部接口稳定性」如实写出且配套契约机制。扣 2：对 K8sGPT 的关键判据「适配成本高于直接基于 logquery 自建」仍是断言，无适配工作量估算支撑（三轮未动）。
- **Chosen approach justified against benchmarks: 23/25**。K8sGPT、Datadog、AWS 排除理由具体。扣 2：「采纳……成熟范式」的借鉴边界（哪些设计参考 K8sGPT 分析器/降级设计）仍仅一句带过。

### 4. Requirements Completeness — 104/110

- **Scenario coverage: 37/40**。iteration-2 缺口之一已闭：告警风暴场景现由 S2（「告警风暴下不逐条放大排查……同指纹窗口内仅触发一次自动排查」）+ NFR 三机制覆盖。扣 3：仍缺三类场景——诊断进行中用户取消；语义含糊但可解析的提问（S6 三级降级只覆盖识别失败，不覆盖识别成功但含糊）；同租户内权限不足用户发起查询的交互（NFR 只覆盖确认入口权限：「风险中心不向无权限用户暴露确认按钮」，查询侧未覆盖）。
- **Non-functional requirements: 38/40**。安全三道防线 + 输出侧引用校验对称完整；性能双口径清晰；**本轮新增「告警风暴防护」一节质量高**：指纹归并键（租户+服务名+指标+级别）、窗口默认值、并发上限默认值、预算耗尽降级路径全部落地。扣 2：Agent 自身可用性/SLA 缺失；诊断数据保留期限与清理策略缺失（第 3 轮未动）。
- **Constraints & dependencies: 29/30**。**embedding 孤儿依赖已闭合**：「故障库检索的实现技术在 P2 启动时评估选定——优先复用现有 LLM 封装栈自带的 embedding 能力……索引/存储用 Go 生态内嵌组件……若评估结论为 embedding 方案成本不匹配，SC-4 的判定回退为关键词 + 结构化字段检索」。扣 1：eiam 租户谓词对编排层新增组合查询的覆盖语义仍未确认（第 3 轮未动）。

### 5. Solution Creativity — 82/100

- **Novelty over industry baseline: 30/40**。差异化陈述从「自认非创新」升级为机制级主张：「编排层钉进已有平台底座、全链路可审计、写操作风险分级可控——现有独立 AIOps 工具（K8sGPT 类诊断器、SaaS Copilot）均不与既有平台的租户体系、审计链路、风险闸门做这种深度的机制级融合」；「风险分级」下沉为「确定性的查表判定（工具元数据注册表）」是实质增量。扣 10：差异化仍是对竞品能力边界的断言，未引用 K8sGPT/Datadog 任何具体机制证据支撑「均不做」；本质仍是集成层方案，算法层零新意（文档亦不主张）。
- **Cross-domain inspiration: 28/35**。**iteration-2 的零跨域缺口已闭**：SOAR playbook 分级自动化、金融风控分级放行（「白名单即授信额度」）、SRE error budget（「把 AI 调用成本当作预算化管理，耗尽即降级」）、alert grouping/incident management 去重前移到排查侧——四处引用均给出与方案的映射关系而非名词堆砌。扣 7：引用停留在单句映射，未说明借用机制被改造适配的具体细节（如 error budget 的预算粒度如何按租户/服务切分），深度不足。
- **Simplicity of insight: 24/25**。「瘦编排层钉在已有底座」优雅克制，Assumptions Challenged 表印证 Occam 收敛。扣 1：跨域机制三件套（聚合/并发/预算）与风险分级并存，机制数量有轻微堆叠倾向。

### 6. Feasibility — 93/100

- **Technical feasibility: 38/40**。底座能力到包路径、LLM 降级封装有现成先例；**语义检索可行性本轮补齐**：「两条候选路径（embedding / 关键词结构化）均不违反同栈约束」。扣 2：意图理解链路（P1 第一入口）可行性论证仍缺位；LLM 预算机制的可行性数值（每小时多少次调用）未给出。
- **Resource & timeline feasibility: 26/30**。排期框架（P1 6–8 周、P2 4–6 周、P3 约 6 周、2BE+1FE、M1/M2/M3）延续 iteration-2，可评估。扣 4：P1 六个交付面对 2BE+1FE 的 6–8 周偏紧且无缓冲说明；前端两条全新 UI（对话窗口 + 风险中心）工作量未单独论证；本轮新增的风暴防护三机制未被计入 P1 工作量——NFR 硬性要求与排期估算之间出现新的工作量缺口。
- **Dependency readiness: 29/30**。P1 就绪 / P2 半成品 / P3 空白分级诚实，P3 有降级出口；P2 语义检索 readiness 论证完整。扣 1：eiam 组合查询谓词语义未确认。

### 7. Scope Definition — 77/80

- **In-scope items are concrete: 29/30**。能力总清单 × 分期矩阵使每项交付物具名带期数；契约文档 + 契约测试为 P1 显式交付物。
- **Out of scope explicitly listed: 25/25**。五条具名排除并引用清单行号。
- **Scope is bounded: 23/25**。P3 #10 前置条件 + 降级出口完好。扣 2：「P2/P3 依赖 Haven 侧接口铺开，可并行推进」与 #10 依赖 P2 评估结果的顺序性相抵触（第 3 轮未动）；P2/P3 无时间外边界以外的范围护栏。

### 8. Risk Assessment — 84/90

- **Risks identified: 28/30**。六条均实质；**告警风暴风险第 3 轮补入风险表**：「告警风暴放大为排查风暴 / LLM 成本风暴 | M | M」，与 NFR 交叉引用闭合了 iteration-2 持续恶化的暴露面。扣 2：冷启动风险的回填量仍无定义；「白名单最小化」仍无最小化判定标准（何谓最小：按操作数？按影响面？）。
- **Likelihood + impact rated: 28/30**。分布诚实（M/H、M/M、L/H、H/M），冷启动 H/M 与 SC-4 命中率挂钩。扣 2：告警风暴 M/M 偏乐观——SC-2 要注入 100 条告警，高峰时段单日数百条告警是 Evidence 给出的现实，触发概率评为 M 与自身证据存在张力。
- **Mitigations are actionable: 28/30**。风暴缓解（指纹聚合 + 并发上限 + 预算降级）三步均可执行且参数有默认值；「P1 先做纯只读」「高危 100% 人工确认」「加跨租户隔离测试」可执行；白名单「可审计」现可由 NFR 执行链路（audit 记录确认人）支撑。扣 2：冷启动缓解「用 Haven 现有 audit/告警历史回填种子数据」仍无产出物定义——回填多少条、覆盖哪些故障类型、由谁沉淀均未定义（第 4 轮未动，见 Attack 5）。

### 9. Success Criteria — 72/80

- **Criteria are measurable and testable: 27/30**。SC-2 样本数学自洽；SC-4 已去除技术预设且判定可操作化（Top-1 候选 + 人工标注 + ≥20 条测试集 + ≥80% + 5 秒）；SC-5/6/7 均可断言。扣 3：(a) **新增风暴防护三机制零验收挂钩**——指纹聚合、并发上限、LLM 预算无任何 SC 验证，且 SC-2 明确将聚合排除出测试（「注入告警条条指纹互异，不因风暴聚合被归并」），NFR 硬性要求成为纯声明（见 Attack 1）；(b) SC-1 在 S6 三级降级状态下是否仍按 1 分钟口径验收未说明；(c) SC-4「人工标注确认为同一根因类」的标注者与一致性流程未定义。
- **Coverage is complete: 22/25**。#1–#7 全部有 SC 映射。扣 3：P2 的 #8（audit 接入）、#9（工单/拓扑接入）无任何 SC（第 4 轮未动，P2 交付物近半数验收标准缺失）；NFR 告警风暴防护亦无 SC。
- **SC internal consistency: 23/25**。七域聚类（时效/触发/执行/记忆/隔离/回溯/覆盖）无 SC↔SC 硬矛盾；SC-2 与 NFR 聚合机制经「条条指纹互异」设计逻辑上可调和。扣 2：触发域残留歧义——SC-2「即 100 次独立排查均须落库」与 NFR「队列溢出时丢弃低级别（P3 以下）告警的自动排查」在队列容量未定义时可同时成立也可互斥（ambiguous — requires author clarification）；时效域 SC-1 降级态口径未声明。

### 10. Logical Consistency — 84/90

- **Solution addresses the stated problem: 32/35**。编排层直击「空壳零对接」，Evidence 数字（60–100 人时/月、MTTR、30% 重复）与方案三大收益（编排省串联、故障库治重复、主动触发降 MTTR）逐项对应。扣 3：「垂直领域运维 Agent 定位」兑现到什么程度算兑现（P1 之后是否仍是「空壳 + 一点点」）仍无中间定义。
- **Scope ↔ Solution ↔ Success Criteria aligned: 28/30**。历史硬伤（P3 CI/CD 三角、S2 前向引用）修复保持完好，本轮新增内容未引入新矛盾。扣 2：「可并行推进」与 #10 对 P2 评估的顺序依赖相抵触；#8/#9 缺 SC 锚点（与 D9 coverage 同源）。
- **Requirements ↔ Solution coherent: 24/25**。S2 风暴语义、语义检索依赖、契约机制均闭合了先前缝隙。扣 1：S6 三级降级只覆盖「识别失败」，不覆盖「识别成功但含糊」——需求承诺的降级完备性与方案能力之间的细缝仍在。

---

## Step 4: Blindspot Hunt

1. **[blindspot] [Success Criteria / Requirements] 风暴防护三机制零验收挂钩，且 SC-2 主动把聚合机制排除出测试。** NFR：「指纹聚合去重……并发与排队上限……LLM 调用预算」三条均为「必须具备」的硬性要求，但 SC-1–SC-7 无一验证聚合去重是否生效、并发上限是否被遵守、预算耗尽是否正确降级；SC-2 更是以「注入告警条条指纹互异，不因风暴聚合被归并，即 100 次独立排查均须落库」的测试设计**刻意绕开**聚合路径。结果是：全文最重要的新防御机制在验收层不可证伪。必须：新增风暴场景 SC（注入同指纹告警簇，验证窗口内仅 1 次排查触发、聚合计数正确、预算耗尽后降级链路不中断）。
2. **[blindspot] [Logical Consistency] SC-2 与 NFR 丢弃条款存在条件性互斥，队列容量未定义。** SC-2：「即 100 次独立排查均须落库」；NFR：「队列溢出时丢弃低级别（P3 以下）告警的自动排查」。并发上限 5 + 排队队列，但队列容量全文未给——若测试注入含 P3 级告警且队列容量 < 95，NFR 要求丢弃、SC-2 要求全部落库，两条款直接冲突。必须：给出队列容量默认值，或在 SC-2 中声明测试前提（容量充足）。
3. **[blindspot] [Solution Clarity] 告警级别「P3 以下 / P1/P2 级」与分期代号 P1/P2/P3 撞名，同段双语义。** NFR：「丢弃低级别（P3 以下）告警的自动排查，仅保留告警原文与去重结论到风险中心，P1/P2 级告警排查不丢弃」——此处 P1/P2/P3 是告警优先级；而全文其余处 P1/P2/P3 是交付分期。验收与排期文档中同一符号双语义，且「P3 以下」是否含 P3 本级依赖中文「以下」的含糊惯例。必须：改用「P3 级及以下告警」或 SEV-x 等独立命名。
4. **[blindspot] [Feasibility] LLM 调用预算无默认数值，机制不可落地。** 「每滚动 1 小时对 LLM 解读调用设次数上限（预算化管理）」——同节窗口给了默认值（「默认 10 分钟」）、并发给了默认值（「默认 5」），唯独预算次数既无默认值也无估算依据（按 SC-2 的 100 次排查量级反推应有基数）。预算化管理缺了「预算」这个数字。
5. **[blindspot] [Solution Clarity] 意图理解主通道第 4 轮仍未正面陈述。** S6：「① 意图识别/参数抽取退化为模板/正则意图匹配（覆盖预置问法）」——「退化为」反向暗示 LLM 是主通道，但模型选型、prompt 策略、意图识别失败判定从未正面写出。P1 第一入口的关键设计仍是读者推断。
6. **[blindspot] [Problem Definition] 运营数字自相算术不符且全部未核实。** 「一次典型『告警 → 定位』需人工串联……平均 20–40 分钟/次；按月均约 150 次人工排查估算，每月 60–100 人时」——150 × 20min = 50 人时，下界应为 50 而非 60；且所有数字冠以「初估口径……核实后替换为实测值」，即提案自身承认在验收前不构成证据。

**Bias Detection Report**:
- Annotated regions（带 pre-revised 标记）: 7 处（接口契约 high、S6 medium、NFR 安全 high、NFR 性能 medium、能力矩阵 medium、SC-1 medium、SC-2 medium）
- Annotated regions 命中 attack: Attack 1/2 触及 SC-2 标注段（2/7, density 0.29）
- Unannotated regions: Attack 3/4/5/6 命中（4/~45, density 0.09）
- Ratio ≈ 1.15：攻击分布基本均匀，未见对标注区放水。本轮全部 pre-revision 修订（契约、S6 双链路、安全三防线、性能双口径、能力矩阵、SC-1/SC-2 口径）经复核均保持有效，无 conflict-with-pre-revision 判定。

---

## Previous Attack Points — Resolved vs Open

| # | Iteration-2 Attack | Status |
|---|--------------------|--------|
| 1 | SC-4 独自引入 embedding 依赖，方案/约束层零承接 | **RESOLVED** — Constraints「语义检索依赖」条款 + SC-4 去技术预设 + Feasibility readiness 论证，含回退路径 |
| 2 | 告警风暴防护三轮缺席 | **RESOLVED** — NFR 三机制（指纹聚合/并发上限/LLM 预算）+ S2 风暴语义 + 风险表新增行（但衍生 Attack 1：机制零 SC 验收） |
| 3 | Evidence/Urgency 零运营数字（第 3 轮） | **RESOLVED** — 基线运营指标四项数字 + 不作为成本量化（但衍生 Attack 6：数字自估且下界算术不符） |
| 4 | SC 编号乱序 | **RESOLVED** — SC-1→SC-7 连续编号 |
| 5 | 意图理解主通道未正面陈述（第 3 轮） | **OPEN**（第 4 轮）— 仍仅由 S6「退化为模板/正则」反向暗示 |
| 6 | 冷启动缓解无产出物定义 | **OPEN**（第 2 轮）— SC-4 挂钩命中率，但回填条数/覆盖率/沉淀责任仍无定义 |
| 7 | Creativity 双维度（新颖性自认 + 零跨域，-31 分） | **RESOLVED** — 差异化升级为机制级主张 + 四处跨域引用带映射（但深度有限，本轮仍扣 17） |
| 持续 | P2 #8/#9 无 SC（第 3 轮） | **OPEN**（第 4 轮） |
| 持续 | 「可并行推进」与 #10 顺序依赖张力（第 3 轮） | **OPEN**（第 4 轮） |
| 持续 | SC-1 降级态口径未声明（第 3 轮） | **OPEN**（第 4 轮） |
| 持续 | K8sGPT「适配成本高于自建」无估算支撑（第 3 轮） | **OPEN**（第 4 轮） |

---

## Score Summary

| Dimension | Score | Max |
|-----------|-------|-----|
| Problem Definition | 100 | 110 |
| Solution Clarity | 113 | 120 |
| Industry Benchmarking | 111 | 120 |
| Requirements Completeness | 104 | 110 |
| Solution Creativity | 82 | 100 |
| Feasibility | 93 | 100 |
| Scope Definition | 77 | 80 |
| Risk Assessment | 84 | 90 |
| Success Criteria | 72 | 80 |
| Logical Consistency | 84 | 90 |
| **Total** | **920** | **1000** |

## Verdict

Iteration-3 修复了 iteration-2 全部 7 个 attack point，且均为实质修复而非补丁：embedding 依赖以「评估选定 + 回退条款」闭合且 SC-4 去技术预设；告警风暴从 NFR/S2/风险表三处落地且参数有默认值；Problem 侧补齐四项运营指标并诚实标注初估口径；跨域引用（SOAR/金融风控/error budget/alert grouping）带机制映射；SC 编号重排。距 900 分线已过线（920）。剩余失分集中在三类：(1) 新增防御机制与验收层的脱节——风暴三机制零 SC 且 SC-2 刻意绕开聚合路径、队列容量未定义引发 SC-2 与 NFR 的条件性互斥（D9/D10 主要压分点，合计 -8）；(2) 四轮未动的低分位——意图主通道反向暗示、#8/#9 无 SC、冷启动回填量无定义、「可并行」顺序张力（各 -1~-3，分散）；(3) Creativity 深度——跨域引用有映射无改造细节，差异化是对竞品边界的断言。若继续迭代，最高杠杆是给风暴机制补一个场景 SC 并定义队列容量（可回收 D9/D10 约 8 分），其次是 Creativity 两子项的深度（约 17 分空间）。
