# Iteration 1 — Merged Eval Report (PM + QA)

**Averaged Score**: 823/1000 (PM 820, QA 827)
**Target**: 900

## Merged Attack Points

1. [Functional Specs] 「历史诊断回溯」声明为二级页但没有任何 UI Function 定义（无 Placement/Flow/Data/Validation），违反文档自身导航规则「每个导航目标必须对应定义页」，下游 ui-design 无法执行 — 必须补完整的历史诊断 UI Function
2. [Functional Specs] 报告状态枚举与状态表不一致：UF-1 数据表枚举「排查中/完成/降级」，但状态表额外增「引导式回应」「错误」无对应数据值 — 必须扩展状态枚举覆盖所有显示状态
3. [Scope Clarity] 目标指标「外部渠道推送成功率单独统计 ≥ 99%」计算的是范围外内容：In Scope 仅承诺「推送…到风险中心」，无任何流程/UI/story 提外部渠道推送 — 必须将外部推送加入 In Scope 或删除该指标
4. [User Stories/Consistency] 状态命名跨文档冲突：spec 状态机「待查看→已查看→已处理」vs story「标记已读/已处理」vs UF-2「已读/已处理」，'已读' 与 '已查看' 从不映射 — 必须统一三处命名
5. [User Stories] 状态机「已查看」状态无 AC；「批量标记已读/已处理」语义（含部分失败）无 AC — 必须为已查看状态和批量语义补 GWT AC
6. [Scenario Completeness] 意图识别偏差/误分类无恢复路径 — 必须指定纠错/重分类的交互方式与 AC
7. [Edge Case Coverage] 风险中心列表无分页/保留策略；同一条目多值班并发标记语义未定义 — 必须定义页大小、保留策略、并发标记语义
8. [User Stories] 告警风暴防护（指纹聚合去重/并发上限5/LLM预算耗尽降级）零 AC — 必须为风暴防护补可验证 AC
9. [Edge Case Coverage] 未处理失败路径：落库失败（与「落库完整率100%」冲突）、logquery 空结果、意图低置信、输入侧 prompt injection — 必须逐一记录分支与恢复
10. [Flow Diagrams] 流程图产物混淆：Guide→Persist 与 Persist→RiskCenter 把对话/引导回复也路由进风险中心，与 UF-2「告警主动触发产生的诊断条目」矛盾；批量标记功能不在 Scope 也不在 story — 必须修正流向并统一范围

## Dimension Breakdown (averaged)

| Dimension | PM | QA | Avg | Max |
|-----------|----|----|-----|-----|
| Background & Goals | 90 | 95 | 92.5 | 100 |
| Flow Diagrams | 140 | 140 | 140 | 150 |
| Functional Specs | 135 | 170 | 152.5 | 200 |
| User Stories | 180 | 185 | 182.5 | 200 |
| Scenario Completeness | 125 | 75 | 100 | 150 |
| Edge Case Coverage | 80 | 72 | 76 | 100 |
| Scope Clarity | 70 | 90 | 80 | 100 |