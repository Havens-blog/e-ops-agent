---
feature: "Haven 运维 Agent（垂直领域 AIOps 编排层）"
---

# Haven 运维 Agent — UI Functions

> Requirements layer: defines WHAT the UI must do. Not HOW it looks (that's ui-design.md).

## UI Scope

P1 双界面载体：两个一级页面——**对话窗口**（主入口）+ **风险中心**（结构化待办列表）；另含两个 in-scope 二级页面——**诊断详情**（/opsagent/diagnosis/:id）与**历史诊断回溯**（/opsagent/history）。共 4 个页面，均为新页面（Agent 是运维平台控制台 haven-console 的新建子模块，不复用既有页面路由）。

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
| 诊断详情 | UF-2「查看详情」/ UF-3「查看详情」 / UF-4「查看详情」 | /opsagent/risk-center（或 /opsagent/chat、/opsagent/history） |
| 历史诊断回溯 | UF-1「历史诊断」入口（对话页）或风险中心检索 | /opsagent/chat（或 /opsagent/risk-center，按进入来源返回） |

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
| 报告状态 | 枚举 | 编排层 | 排查中 / 完成 / 降级 / 引导式回应 / 错误（与 States 表一一对应：引导式回应 = 超能力意图回复；错误 = 底座接口超时且无可回退结论） |

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
- logquery 结果被截断时（超默认 1000 条 / 10 MB，见 PRD Spec Query bounds），报告卡片明示「结果已截断，共 N 条匹配，请缩小时间窗或服务范围」，不得静默丢弃超出部分

---

## UI Function 2: 风险中心列表

### Placement

- **Mode**: new-page
- **Target Page**: /opsagent/risk-center（新页面，告警主动触发诊断的待办工作台）
- **Position**: 整页核心区

### Description

承接告警主动触发产生的诊断条目，按时间倒序列表展示，支持按租户/时间/服务名筛选，支持单条/批量标记已查看/已处理。高危条目标记「待人工确认（执行通道 P3 上线后生效）」，P1 不提供确认按钮。

### User Interaction Flow

进入列表 → 默认时间倒序 → 使用筛选器（租户/时间/服务名）→ 查看条目（展示后自动流转为「已查看」）→ 单条/批量标记已查看/已处理 → 点击「查看详情」进入诊断详情页。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 诊断条目列表 | 结构化数组 | 编排层/落库 | 服务名、级别、时间、风险分、状态 |
| 风险级别 | 枚举 | diagnose 规则引擎 | 高危 / 低危 / 只读 |
| 处理状态 | 枚举 | 服务端（落库，以服务端状态为准） | 待查看 / 已查看 / 已处理；标记操作实时写回服务端，多人并发以服务端最新状态做 stale 检测 |
| 降级标识 | 布尔 / 枚举 | 落库 | 该条目诊断是否为降级产生（纯规则结论 / 降级模式）；为真时列表条目展示「降级」标签，悬停或详情页展示降级原因与可用能力边界 |

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
- 列表分页加载，默认页大小 20（可配置），按时间倒序翻页
- 保留策略：诊断条目默认保留 90 天（可配置），超期归档不在列表展示
- 并发标记语义：同一条目被多名值班同时标记时，以后写为准（后写覆盖）；提交时检测到状态已被他人变更，则提示「该条目已被其他值班更新为 X」并刷新当前状态，由用户决定是否再次覆盖
- 批量标记部分失败时，回显失败条目清单与原因，并提供「重试失败项」入口

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

## UI Function 4: 历史诊断回溯

### Placement

- **Mode**: new-page
- **Target Page**: /opsagent/history（新页面，历史诊断会话检索与回看）
- **Position**: 整页核心区

### Description

提供历史排障会话与诊断报告的检索回看：按租户/时间/服务名检索历史会话，查看任一会话的完整内容（提问、编排调用链、报告、数据源引用），支持跳转诊断详情页。供资深运维 / SRE 二次核实诊断可信度、复用同类故障既有结论。

### User Interaction Flow

从对话页「历史诊断」入口或风险中心检索进入 → 输入/选择筛选条件（租户/时间窗/服务名）→ 展示命中会话列表（时间倒序）→ 点击某会话 → 展示会话完整内容（对话记录 + 诊断报告 + 数据源引用）→ 点击「查看详情」进入诊断详情页 → 返回会话列表 → 按进入来源返回对话页或风险中心。

### Data Requirements

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| 历史会话列表 | 结构化数组 | 落库 | 会话 id、服务名、时间、意图分类、触发来源（对话/告警） |
| 降级标识 | 布尔 / 枚举 | 落库 | 会话/诊断是否为降级产生；为真时列表行与会话详情均展示「降级」标签及降级原因 |
| 会话完整内容 | 结构化 JSON | 落库 | 提问、编排调用链、诊断报告、数据源引用 |
| 检索条件 | 表单 | 用户输入 | 租户（强制注入当前登录租户）/时间窗/服务名 |

### States

| State | Display | Trigger |
|-------|---------|---------|
| 空 | 引导语 + 常用筛选示例 | 首次进入未检索 |
| 加载中 | loading | 执行检索 |
| 有数据 | 时间倒序会话列表 | 检索命中 |
| 无结果 | 「未找到匹配会话」+ 修改筛选建议 | 检索无命中 |
| 补偿提示 | 「部分近期会话仍在补偿入库」提示 | 存在落库补偿队列中的会话 |
| 错误 | 检索失败提示 + 重试 | 接口异常 |

### Validation Rules

- 租户谓词强制注入，检索结果不可跨租户
- 检索响应 ≤ 1 分钟（对齐「可回溯」目标）
- 检索时间窗上限默认 24 小时（可配置，对齐 PRD Spec Query bounds），超出提示用户缩小范围
- 列表分页加载，默认页大小 20（可配置）
- 仅展示落库成功且完整的会话；补偿队列中未落库成功的会话不出现，列表顶部给出补偿提示

---

## Page Composition

| Page | Type | UI Functions | Position Notes |
|------|------|-------------|----------------|
| /opsagent/chat | new | UF-1 | 对话排障主入口 |
| /opsagent/risk-center | new | UF-2 | 告警待办工作台 |
| /opsagent/diagnosis/:id | new | UF-3 | 诊断详情（二级页） |
| /opsagent/history | new | UF-4 | 历史诊断回溯（二级页） |