---
created: "2026-09-23"
related: design/tech-design.md
---

# Page Map: Haven 运维 Agent（前端 /opsagent 路由组）

## Page Overview

在**运维平台控制台 haven-console**（Vue3 + Vue Router，base `/console/`）内新增 `/opsagent` 路由组（最终 URL `/console/opsagent/*`），采用批准原型的 **cyan 深色设计系统**（`--background: 222 47% 11%`、`--primary: 199 89% 48%` 等 CSS tokens，作用域 `.opsagent-page` 容器，不污染控制台既有令牌）。侧边菜单经 `menuConfig.ts` 挂「运维 Agent」组。

> 归属变更（2026-10-09）：原宿主为云管 e-cam-web（`/opsagent` 路由组），已按「接入运维平台、不要接入云管」迁入 haven-console，见 records/6.1-console-relocation.md。

**P1 页面（4 核心 + 2 运维支撑）**：

| 路由 | 页面 | 分组 | P1 |
|------|------|------|----|
| `/opsagent/chat` | 对话排障 | 核心 | ✅ |
| `/opsagent/risk-center` | 风险中心 | 核心 | ✅ |
| `/opsagent/diagnosis/:id` | 诊断详情 | 核心 | ✅ |
| `/opsagent/history` | 历史回溯 | 数据视图 | ✅ |
| `/opsagent/settings` | 系统配置 | 管理 | ✅（运维支撑） |
| `/opsagent/agents` | Agent 管理 | 管理 | ✅（运维支撑） |

**P2 预留**（不在 P1 交付范围，prototype 已备视觉稿）：`/opsagent/topology`（拓扑视图）、`/opsagent/rca`（RCA 分析列表）。

---

## Pages

### 对话排障（/opsagent/chat）

**Route**: `/opsagent/chat`
**Layout**: `haven-console/src/layouts/MainLayout.vue`（控制台壳自动承接非公开路由，页面内容区背景改用 cyan 深色 tokens）
**Auth**: 登录用户
**Navigation**: 侧边导航「核心 > 对话排障」；「新建诊断」按钮

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 对话流 | `ChatPanel` | `POST /opsagent/chat` | 用户提问 + 报告正文（降级/截断徽标） |
| 思考过程 | `ThinkingBlock` | `Diagnosis.trace` | 4 步编排进度（意图识别→查询→诊断→报告） |
| 证据卡 | `EvidenceCard` | `Diagnosis.citations` | 数据源引用（时间相关/错误频率/指标/拓扑/变更/Trace） |
| 意图纠正 | `IntentCorrection` | `POST /opsagent/chat/:sessionId/correct`（会话内纠正重路由，见 api-handbook §2） | 澄清候选意图一键纠正（targetIntent+params），或自然语言纠正（message）；无需重新完整提问 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 值班运维 / SRE | 读写 |

### 风险中心（/opsagent/risk-center）

**Route**: `/opsagent/risk-center`
**Layout**: `layouts/default`
**Auth**: 登录用户
**Navigation**: 侧边导航「核心 > 风险中心」

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 统计卡 | `StatCards` | `GET /risk-center`（聚合） | 待处理 / 今日新增 / 高危 等 |
| 筛选栏 | `FilterBar` | `GET /risk-center?serviceName&status&severity&time` | 租户/时间/服务名筛选（服务端强制租户） |
| 待办表 | `RiskTable` | `GET /risk-center`（含 stats 聚合） | 条目列表 + 单条/批量标记；点击条目跳转诊断详情并携带 `riskEntryId`（触发自动「已查看」，api-handbook §6） |
| 状态标记 | `StatusMark` | `POST /risk-center/:id/status` · `batch-status` | 已查看/已处理；并发冲突 409 刷新 |
| 高危标记 | `HighRiskTag` | 无（纯展示） | 高危仅展示「待人工确认」，不渲染确认控件 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 值班运维 / SRE | 查看 + 标记 |

### 诊断详情（/opsagent/diagnosis/:id）

**Route**: `/opsagent/diagnosis/:id`
**Layout**: `layouts/default`
**Auth**: 登录用户
**Navigation**: 风险中心点击条目 / 对话报告「查看详情」

#### Route Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | 是 | 诊断 ID |

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 根因结论 | `RootCauseCard` | `GET /diagnosis/:id` | 主视觉根因 + 置信度 |
| 证据清单 | `EvidenceList` | `Diagnosis.citations` | 六类证据（时间/错误频率/指标/拓扑/变更/Trace） |
| 编排调用链 | `TraceView` | `Diagnosis.trace` | 各步骤调用底座与耗时 |
| 处置预案 | `DispositionList` | `Diagnosis.disposition` | 只读预案 + 风险档徽标 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 值班运维 / SRE | 查看 |

### 历史回溯（/opsagent/history）

**Route**: `/opsagent/history`
**Layout**: `layouts/default`
**Auth**: 登录用户
**Navigation**: 侧边导航「数据视图 > 历史回溯」

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| serviceName | string | — | 服务名 |
| startTime | string | now-24h | 时间窗起点 |
| endTime | string | now | 时间窗终点 |
| page | int | 1 | 页码 |

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 检索栏 | `SearchBar` | `GET /history?*` | 租户/时间/服务名检索（≤24h） |
| 会话列表 | `SessionList` | `GET /history` | 会话摘要列表 |
| 会话详情 | `SessionView` | `GET /history?sessionId` | 提问 + 编排调用链 + 报告 + 引用 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 值班运维 / SRE | 查看（跨租户不可见） |

### 系统配置（/opsagent/settings）

**Route**: `/opsagent/settings`
**Layout**: `layouts/default`
**Auth**: 管理员写 / 运维读
**Navigation**: 侧边导航「管理 > 系统配置」

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| 数据源配置 | `DatasourceTab` | `GET/PUT /settings` | 5 数据源连接状态 |
| LLM 模型 | `LLMTab` | `GET/PUT /settings` | 3 提供商选择 + API Key |
| 通知渠道 | `NotifyTab` | `GET/PUT /settings` | 4 渠道开关 |
| 预置查询目录 | `PresetTab` | `GET/PUT /settings`（presetQueries） | L2 降级预置查询条目管理（label + 预填参数，整表替换） |
| 安全与租户 | `SecurityTab` | `GET/PUT /settings` | 租户注入开关 + 风险白名单表 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 管理员 | 读写 |
| 运维 | 只读 |

### Agent 管理（/opsagent/agents）

**Route**: `/opsagent/agents`
**Layout**: `layouts/default`
**Auth**: 登录用户（只读观测）
**Navigation**: 侧边导航「管理 > Agent 管理」

#### Page Sections

| Section | Component | Data Source | Description |
|---------|-----------|-------------|-------------|
| Agent 卡片 | `AgentCard` | `GET /opsagent/agents/observability`（agents） | 4 逻辑 Agent 状态/负载/指标 |
| 任务队列 | `TaskQueue` | `GET /opsagent/agents/observability`（queue） | 排查队列长度/并发/溢出 |
| 负载历史 | `LoadChart` | `GET /opsagent/agents/observability`（loadHistory） | 负载时间序列 |
| 预算用量 | `BudgetGauge` | `GET /opsagent/agents/observability`（llmBudget） | LLM 滚动预算消耗 |

#### Permissions

| Role | Access Level |
|------|-------------|
| 运维 / 管理员 | 查看 |

---

## Shared Components

| Component | Used In | Description |
|-----------|---------|-------------|
| `sidebar`（分组导航） | 全部 /opsagent 页 | 核心/数据视图/管理 三组，lucide 线框图标 |
| `EvidenceCard` | chat / diagnosis | 六类证据卡（点色区分 agent 角色） |
| `ThinkingBlock` | chat | 4 步编排思考进度 |
| `SeverityBadge` | risk-center / diagnosis | P0/P1/P2/P3 徽标 |
| `RiskLevelBadge` | 多页 | 只读/低危/高危 风险档徽标 |
| `TraceView` | diagnosis / history | 编排调用链展示 |

## Route Guard Configuration

| Route Pattern | Guard | Redirect |
|---------------|-------|----------|
| `/opsagent/*` | `requireAuth`（复用 eiam 登录态） | `/login` |
| `/opsagent/settings`（写） | `requireAdmin` | `/opsagent/settings`（只读态） |