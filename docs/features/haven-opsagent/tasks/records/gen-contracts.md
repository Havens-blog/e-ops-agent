---
status: "completed"
started: "2026-10-08 16:03"
completed: "2026-10-08 16:05"
time_spent: "~2m"
---

# Task Record: T-test-gen-contracts Generate Test Contracts

## Summary
为 haven-opsagent 3 条 Journey 生成 5 份测试 Contract（六维声明），并写回 Fact Table。① alert-to-risk-center/contracts/risk-center-query.md（GET /risk-center 列表+筛选+stats）；② alert-to-risk-center/contracts/risk-status-cas.md（单条/批量 CAS 标记）；③ chat-diagnosis/contracts/chat-submit.md（POST /chat 编排+降级+异步）；④ chat-diagnosis/contracts/intent-correct.md（correct 重路由）；⑤ diagnosis-history/contracts/history-retrieval.md（history + diagnosis 详情 + 自动已读）。每份含 Preconditions/Input/Output/State/Side-effect/Invariants 六维语义声明（无 regex）。风险驱动 Outcome 密度：High-risk 2 contract/journey、Medium 1。Fact Table 写 .forge/fact-table.json（5 条 fact 映射 contract→endpoint→源码文件）。eval-gate（Breakdown）已满足：3 条 journey 的 .eval-report.md 均存在且 ≥850。

## Changes

### Files Created
- docs/features/haven-opsagent/testing/alert-to-risk-center/contracts/risk-center-query.md
- docs/features/haven-opsagent/testing/alert-to-risk-center/contracts/risk-status-cas.md
- docs/features/haven-opsagent/testing/chat-diagnosis/contracts/chat-submit.md
- docs/features/haven-opsagent/testing/chat-diagnosis/contracts/intent-correct.md
- docs/features/haven-opsagent/testing/diagnosis-history/contracts/history-retrieval.md
- .forge/fact-table.json

### Files Modified
无

### Key Decisions
- Breakdown 模式 eval-gate：3 journey .eval-report.md 均 ≥850，通过后生成 contract
- Contract 六维（Preconditions/Input/Output/State/Side-effect/Invariants）语义化声明，Outcome 覆盖成功/冲突/not_found/越界等变体（风险驱动：High-risk 含更多 outcome 变体）
- Fact Table 记录 contract↔endpoint↔源码文件（internal/web/risk.go/chat.go/diagnosis.go）映射，支撑后续 eval-contract 的 Fact Alignment 核分
- 语言/接口：Go 后端（gin）为 contract 主承载面（surface=api），前端 web 交互由 journey 的 surface=web 覆盖

## Cases Generated
N/A

## Cases Evaluated
N/A

## Scripts Created
无

## Test Results
N/A

## Acceptance Criteria
- [x] All acceptance criteria met
- [x] At least 1 Contract file generated per Journey
- [x] Each Contract has six-dimension declarations with semantic descriptors (no regex)
- [x] Risk-driven Outcome density targets met per Journey risk level
- [x] Fact Table written to .forge/fact-table.json
- [x] All Contracts passed schema validation

## Notes
test.gen-contracts 任务：无 feature code 改动。5 contract（High-risk 各 2、Medium 1）六维声明齐全；Outcome 变体依 risk 密度展开（High-risk 单 contract 覆盖冲突/异态 outcome ≥3 项）。.forge/fact-table.json 为简版 Fact Table（5 fact），surface=api（后端契约承载）。schema validation 为结构完整性核对（六维标题齐备 + 语义描述无 regex），重试一次后通过。
