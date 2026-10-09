---
feature: "haven-opsagent"
created: "2026-09-23"
status: completed
---

# Feature: haven-opsagent

<!-- Status flow: prd → design → tasks → in-progress → completed -->

## Documents

| Document | Path | Summary |
|----------|------|---------|
| PRD Spec | prd/prd-spec.md | P1 排障核心闭环：对话式排障 + 告警主动触发 + 双界面 + 只读诊断 + 落库回溯 + eiam 鉴权与租户隔离 |
| User Stories | prd/prd-user-stories.md | 3 stories 覆盖一线值班（告警跟进、对话定位）与资深运维/SRE（深度排障回溯） |
| UI Functions | prd/prd-ui-functions.md | 4 个 UI 功能：对话面板、风险中心列表、诊断详情、历史诊断回溯（4 新页面） |
| UI Design | ui/ui-design.md | cyan 深色设计系统，8 页面原型（对话/风险中心/诊断详情/RCA/拓扑/历史/Agent 管理/系统配置） |
| Tech Design | design/tech-design.md | 独立 Go 编排层服务（opsagent）+ 独立前端子项目 opsagent-web（/opsagent/ nginx 同域托管，2026-10-09 两段归属调整终态 6.2）；MongoDB 落库 + Redis 去重 + 4 逻辑 Agent + 契约冻结（904/1000） |
| API Handbook | design/api-handbook.md | opsagent 自身 9 端点 + 底座 4 组契约（logquery/资产/eiam/通知） |
| ER Diagram | design/er-diagram.md | 8 Mongo 集合（sessions/diagnoses/citations/alerts/risk_entries/llm_usage/settings/compensations）关系与索引 |
| Mongo Schema | design/schema.mongo.js | mongosh 集合 + 索引初始化脚本（Haven 用 MongoDB 而非 SQL） |
| Page Map | design/page-map.md | /opsagent 6 P1 页面（4 核心 + 2 运维支撑）+ 2 P2 预留 |
| Biz Specs (Extracted) | specs/biz-specs.md | 跨功能业务规则提取：多租户隔离、CAS 乐观锁、幂等去重（→ docs/business-rules/） |
| Tech Specs (Extracted) | specs/tech-specs.md | 跨功能技术约定提取：错误码语义、前端 Vue 工程约定（→ docs/conventions/） |

## Traceability

| PRD Section | Design Section | UI Component | Placement | Tasks |
|-------------|----------------|--------------|-----------|-------|
| UI Functions > 对话面板 | UI Design > Component 1 + tech-design §Interfaces | 对话排障 (ui-design §1) | new-page:/opsagent/chat | 4.4, 5.1, 5.2 |
| UI Functions > 风险中心列表 | UI Design > Component 2 + tech-design §Data Models(risk_entries) | 风险中心 (ui-design §2) | new-page:/opsagent/risk-center | 4.5, 5.1, 5.3 |
| UI Functions > 诊断详情 | UI Design > Component 3 + tech-design §Interfaces(Diagnosis) | 诊断详情 (ui-design §3) | new-page:/opsagent/diagnosis/:id | 4.6, 5.1, 5.4 |
| UI Functions > 历史诊断回溯 | UI Design > Component 4 + tech-design §Data Models(sessions) | 历史回溯 (ui-design §4) | new-page:/opsagent/history | 4.6, 5.1, 5.5 |
| PRD Spec > 意图识别与能力路由 | tech-design §Interfaces(IntentClassifier) + 三级降级 | 对话排障 | — | 3.1, 2.4, 3.3 |
| PRD Spec > 告警主动触发 + 风暴防护 | tech-design §Architecture(worker) + §Interfaces(RunAlert) | 风险中心 | — | 4.1, 4.8, 3.2 |
| PRD Spec > 底座接口契约 + 契约测试 | tech-design §Interfaces(BaseModuleClient) + api-handbook B | 系统配置 | — | 1.4, 2.6 |
| PRD Spec > 会话与诊断落库回溯 | tech-design §Data Models(sessions/diagnoses/citations) | 多页 | — | 2.1, 4.2, 4.6 |
| PRD Spec > 风险中心状态机 + 并发冲突 | tech-design §Data Models(risk_entries CAS) | 风险中心 | — | 2.2, 4.5 |
| PRD Spec > eiam 鉴权 + 租户隔离 | tech-design §Security（tenant 强制注入 + LLM 三道防线） | 全部 | — | 4.3, 1.1, 3.4 |
| PRD Spec > 系统配置 + Agent 观测 | tech-design §Shared Types(settings) + api-handbook §8/§9 | 系统配置/Agent 管理 | new-page:/opsagent/settings,/opsagent/agents | 4.7, 5.6 |
| PRD Spec > 领域类型/枚举/指纹 | tech-design §Shared Types | — | — | 1.2 |
| PRD Spec > MongoDB 存储 | tech-design §Data Models + er-diagram + schema.mongo.js | — | — | 1.3 |
| PRD Spec > 风险分级确定性代码 | tech-design §Interface 5(RiskRegistry) | — | — | 2.5 |
| PRD Spec > 通知渠道发送 | tech-design §Interfaces(notify) | — | — | 2.3, 3.5 |

## Phases

| Phase | Gate | Scope | Tasks |
|-------|------|-------|-------|
| 1 骨架与契约 | 1.gate | 服务骨架 + 类型 + Mongo schema + 契约冻结 | 1.1–1.4 |
| 2 底座组件 | 2.gate | DAO + LLM + 风险注册表 + 底座客户端 | 2.1–2.6 |
| 3 编排核心 | 3.gate | 意图 + 流水线 + 三级降级 + LLM 安全 + 通知 | 3.1–3.5 |
| 4 worker 与 web | 4.gate | 告警 worker + 补偿 + 中间件 + 8 组 handler | 4.1–4.8 |
| 5 前端 | 5.gate | 主题/路由/导航 + 6 页面 | 5.1–5.6 |
| 6 集成补全 | — | 组合根装配 + eiam/底座令牌透传 + 平台配置对齐 + e2e 验证 | 6.0 |
| 6.1 归属迁移 | — | 前端自云管 e-cam-web 迁入运维平台控制台 haven-console（子模块） | 6.1 |
| 6.2 前端独立化 | — | 前端自平台控制台迁出为独立仓库 opsagent-web（nginx /opsagent/ 同域托管；控制台仅留工作台入口卡片） | 6.2 |