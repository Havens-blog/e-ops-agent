# Iteration 2 — Merged Eval Report (PM + QA)

**Averaged Score**: 892/1000 (PM 900, QA 885)
**Target**: 900

## Merged Attack Points

1. [Flow Diagrams] 对话主路径悬空：ChatOnly 节点无出边，主入口路径不闭合 — Source-->|对话触发| ChatOnly[仅对话窗口展示·可回溯] 后无任何出边 — 补 ChatOnly → End 边
2. [Functional Specs] UF-2 处理状态来源「本地标记」与并发标记规则互斥（本地状态无法感知他人变更）— 处理状态来源必须改为服务端/落库
3. [Scenario Completeness] 指纹去重滚动窗口时长从未定义（流程 B / StormCheck / Story 1 AC 都依赖它）— 给默认值 + 可配置说明（如默认 10 分钟）
4. [Edge Case Coverage] 排查队列容量未定义即讨论溢出丢弃 — 定义队列长度阈值
5. [Scope Clarity] 通知渠道清单用「等」收尾、P1 实际渠道不可判定，且推送接收无 AC — 枚举闭合渠道清单（或声明配置来源），补推送接收 AC
6. [Functional Specs] 「降级标识」无数据字段/展示规则：Story AC 要「带降级标识」但 UF-2/UF-4 列表字段没有 — 加降级标识字段
7. [User Stories] 并发标记冲突仅 UI 规则、无 story AC — 补双人 stale 检测 + 重新确认的 GWT AC
8. [User Stories] 高危「P1 仅展示不出确认按钮」无负向 AC（渲染出确认按钮也能过）— 补断言「无确认/执行控件」的负向 AC
9. [Edge Case Coverage] 时间窗/结果量无界：UF-4 检索时间窗无 max range、查询无 batch cap、logquery 结果无 volume 截断 — 定义最大时间窗、最大批量、结果截断行为
10. [Scenario Completeness] 「LLM 不可用」无操作性定义（无超时阈值/失败谓词），降级不可测 — 声明可用性谓词（超时阈值 + 判定条件）
11. [Scope Clarity] Scope 声明「双界面」但 UI doc 有 4 页（chat/risk-center/diagnosis/history）— 枚举诊断详情/历史回溯为 in-scope 二级页

## Dimension Breakdown (averaged)

| Dimension | PM | QA | Avg | Max |
|-----------|----|----|-----|-----|
| Background & Goals | 95 | 95 | 95 | 100 |
| Flow Diagrams | 130 | 130 | 130 | 150 |
| Functional Specs | 185 | 175 | 180 | 200 |
| User Stories | 190 | 185 | 187.5 | 200 |
| Scenario Completeness | 130 | 130 | 130 | 150 |
| Edge Case Coverage | 90 | 80 | 85 | 100 |
| Scope Clarity | 80 | 90 | 85 | 100 |