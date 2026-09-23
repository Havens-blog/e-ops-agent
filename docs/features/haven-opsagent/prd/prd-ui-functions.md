---
feature: "Haven 运维 Agent（垂直领域 AIOps 编排层）"
---

# Haven 运维 Agent — UI Functions

> Requirements layer: defines WHAT the UI must do. Not HOW it looks (that's ui-design.md).

## UI Scope

P1 双界面载体：**对话窗口**（主入口）+ **风险中心**（结构化待办列表）。两个页面，均为新页面（Agent 是新建子模块，不复用 e-cam-web 现有页面路由）。

## Navigation Architecture

- **Platform**: web

### Primary Navigation (shared across pages)

| # | Label | Target Page | Icon Keyword |
|---|-------|-------------|-------------|
| 1 | 对话排障 | /opsagent/chat | chat |
| 2 | 风险中心 | /opsagent/risk-center | alert |

### Secondary Pages (navigated from a parent page)

| Page | Entry Point (UF# or action) | Return Target |
|------|-----------------------------|---------------|
| 诊断详情 | UF-2「查看详情」/ UF-3「查看详情」 | /opsagent/risk-center（或 /opsagent/chat） |
| 历史诊断回溯 | UF-1「历史诊断」入口（对话页）或风险中心检索 | /opsagent/risk-center |

### Navigation Rules

- Primary navigation is shared across pages
- Every secondary page must have back navigation targeting its entry point page
- Every navigation target must correspond to a page defined in this document

## UI Function 1: 对话面板

### Placement

- **Mode**: new-page
- **Target Page**: /opsagent/chat（新页面，对话式排障主入口）
- **Position**: 整页核心区

### Description

用户以自然语言输入排障问题，系统异步返回诊断报告（含根因 + 处置建议 + 数据源引用）。支持流式/异步展示报告生成状态（排查中 → 生成报告）。

### User Interaction Flow

用户输入问题 → 发送 → 系统显示「排查中」状态 → 编排层完成诊断 → 展示诊断报告卡片 → 用户点击结论行 → 展开该结论的数据源引用 → 用户可跳转「历史诊断」回溯。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 会话消息列表 | 文本流 | 编排层 | 用户提问 + 系统回复 |
| 诊断报告 | 结构化 JSON | 编排层 | 根因、处置建议、数据源引用数组 |
| 报告状态 | 枚举 | 编排层 | 排查中 / 完成 / 降级 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 空 | 引导语 + 示例问题 | 首次进入 |
| 排查中 | loading 指示 + 当前步骤 | 发送后 |
| 完成 | 诊断报告卡片 | 诊断完成 |
| 引导式回应 | 明示能力边界 + 正确渠道提示 | 识别为超能力意图（开发咨询/提单/拓扑/闲聊） |
| 降级 | 降级提示 + 预置查询入口 | LLM 不可用三级降级 |
| 错误 | 错误提示 + 重试 | 底座接口超时且无可回退结论 |

### Validation Rules

- 空输入不可发送
- 输入超长（> 500 字符）提示精简
- 降级模式下明确标注「当前处于降级模式」及可用能力边界

---

## UI Function 2: 风险中心列表

### Placement

- **Mode**: new-page
- **Target Page**: /opsagent/risk-center（新页面，告警主动触发诊断的待办工作台）
- **Position**: 整页核心区

### Description

承接告警主动触发产生的诊断条目，按时间倒序列表展示，支持按租户/时间/服务名筛选，支持批量标记已读/已处理。高危条目标记「待人工确认（执行通道 P3 上线后生效）」，P1 不提供确认按钮。

### User Interaction Flow

进入列表 → 默认时间倒序 → 使用筛选器（租户/时间/服务名）→ 查看条目 → 标记已读/已处理 → 点击「查看详情」进入诊断详情页。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 诊断条目列表 | 结构化数组 | 编排层/落库 | 服务名、级别、时间、风险分、状态 |
| 风险级别 | 枚举 | diagnose 规则引擎 | 高危 / 低危 / 只读 |
| 处理状态 | 枚举 | 本地标记 | 待查看 / 已查看 / 已处理 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 空 | 空态提示 | 无诊断条目 |
| 加载中 | loading | 拉取列表 |
| 有数据 | 时间倒序列表 | 有诊断条目 |
| 错误 | 拉取失败提示 + 重试 | 接口异常 |

### Validation Rules

- 筛选按租户强制注入当前登录租户，不可跨租户查询
- 高危条目在 P1 仅展示「待人工确认」标记，无确认/执行按钮

---

## UI Function 3: 诊断详情

### Placement

- **Mode**: new-page
- **Target Page**: /opsagent/diagnosis/:id（新页面，展示单条诊断的完整内容）
- **Position**: 整页

### Description

展示单条诊断的完整内容：根因结论、处置建议、每个结论的数据源引用、编排调用链（供 SRE 二次核实）、高危预案所需的操作清单。

### User Interaction Flow

从风险中心或对话面板进入 → 展示诊断详情 → 点击结论查看数据源引用 → 查看编排调用链 → 返回来源页。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 诊断完整内容 | 结构化 JSON | 落库 | 根因、建议、引用、调用链 |
| 数据源引用列表 | 数组 | 落库 | 每条结论 → 日志/指标/资产记录 |
| 处置预案操作清单 | 数组 | 编排层 | P1 仅展示，P3 才可执行 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 加载中 | loading | 进入详情 |
| 完成 | 完整诊断内容 | 数据加载成功 |
| 不存在 | 未找到提示 | 记录 id 无效或无权限（跨租户） |

### Validation Rules

- 数据源引用不可跨租户回显
- 无执行后端时，操作清单仅展示不可执行

---

## Page Composition

| Page | Type | UI Functions | Position Notes |
|------|------|-------------|----------------|
| /opsagent/chat | new | UF-1 | 对话排障主入口 |
| /opsagent/risk-center | new | UF-2 | 告警待办工作台 |
| /opsagent/diagnosis/:id | new | UF-3 | 诊断详情（二级页） |