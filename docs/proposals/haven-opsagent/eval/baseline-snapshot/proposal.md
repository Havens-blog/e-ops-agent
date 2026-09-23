---
created: "2026-09-23"
author: "Haven"
status: Draft
intent: "new-feature"
---

# Proposal: Haven 运维 Agent（垂直领域 AIOps 编排层）

## Problem

现有的 OpsAgent 只是一套脱离真实运维平台的「空壳」：6 个 markdown skill 指向外部通用数据源（Prometheus / SLS / ARMS / GitHub），与 `D:\Haven` 运维平台的真实数据与能力零对接，无法兑现「垂直领域运维 Agent」的定位。

### Evidence

- `~/.claude/skills/opsagent*.md` 全部为纯 markdown 提示词，无任何实现代码；配置段引用的 `ALIYUN_SLS_*`、`PROMETHEUS_ENDPOINT`、`ARMS_PID`、`GITHUB_TOKEN` 均为通用云源，与 Haven 无关联。
- `opsagent/skill.md` 的仓库链接指向 `github.com/Havens-blog/OpsAgent` 与 `f:\OpsAgent\docs`（非 Haven、已失效）。
- Haven 平台本身已具备成熟的底层底座，但无统一智能编排层，运维仍需在各模块间人工切换、人工串联排障：
  - `e-cam-service/internal/logquery` —— 多云 CDN/WAF/LB 日志联邦查询 + 刷量诊断规则引擎 + LLM(qwen) 解读；
  - `e-cam-service/internal/alert` —— 钉钉/飞书/企微/邮件多渠道告警 + 变更检测；
  - `e-cam-service/internal/audit` —— 审计留痕 + 变更单审计；
  - `e-cam-service/internal/topology` —— dns/k8s 采集 + 图模型；
  - `e-cam-service/internal/mcp` —— 已暴露资产查询 MCP Tools；
  - `e-cam-service/internal/cam` —— 多云资产同步（ECS/RDS/Redis/EIP/NAS/OSS 等）+ ecmdb CMDB；`eiam` —— IAM 鉴权（casbin + OIDC + LDAP）。

### Urgency

- 底座已经存在，Agent 是「编排」而非「新建数据面」，现在做边际成本低、复用面大；越晚做，各模块越各自演化，编排接入面越复杂。
- 不落地则「监控告警 → 自动处置」「故障排查」持续依赖人工跨系统串联，AIOps 定位长期落空。

## Proposed Solution

在 `D:\Haven` 内新增一个「运维 Agent」子模块，定位为**纯编排层**：复用 Haven 已有底座（日志/告警/审计/拓扑/资产/MCP/IAM），不新建数据面。核心用户可感知行为：

1. **对话式排障助手**：自然语言提问（如「最近 CDN 有没有被刷」）→ 自动调用日志查询 + 资产 + 告警 → 输出只读诊断结论与处置预案。
2. **主动触发**：被告警 / 工单 / 定时巡检唤醒后，自动跑排查，把「结论 + 处置预案」推送到人；高危操作等待人工确认。
3. **可控执行（风险分级 + 白名单）**：只读操作自动执行；预定义白名单内低危操作自动执行；高危操作（重启/回滚/封禁/删除等）一律人工确认后执行。
4. **双界面载体**：对话窗口为主入口 + 风险中心（结构化待办列表承接主动触发的告警）。
5. **长期记忆**：历史故障库（历次根因 + 处置）+ 运维 SOP/runbook，重复故障秒回。
6. **团队多用户**：复用 eiam 鉴权 + 租户隔离。

分期递进（整体蓝图含三期）：

- **P1 排障核心闭环**：串起日志 + 资产/服务器 + 告警三个底座最厚的模块，实现「告警/提问 → 排查 → 只读诊断 + 给预案」。
- **P2 变更/审计/工单/拓扑接入 + 故障库沉淀**：接入 `audit`（变更/审计）、ecmdb order（工单）、topology，上线历史故障库 + SOP 记忆检索。
- **P3 CI/CD 接入 + 自动执行完整闭环**：预留/接入 CI/CD 数据源，落地「风险分级 + 白名单」的可控写操作执行。

### Innovation Highlights

- **瘦编排层而非重底座**：不做通用大模型，也不重复造日志/告警/审计数据面，而是钉在 Haven 现有底座之上做统一编排——这是与「重写一个全新项目」最本质的差异点。
- **风险分级 + 白名单而非一刀切审批**：对写操作按风险分级（只读自动 / 低危白名单自动 / 高危人工确认），在「自动执行」与「可控」之间取得折中，业界 AIOps 常用能力封装粒度，这里下沉为明确语义。
- **长期记忆（历史故障库 + SOP）**：使「重复故障秒回」成为可能，是垂直 Agent 区别于通用大模型现场分析的关键。
- 思路直接采纳 AIOps 编排（K8sGPT、Datadog Bits AI、PagerDuty AI 的「可观测数据 + LLM 编排」）成熟范式，创新点不在算法而在「把编排层扎进已有平台底座」的落地方式。

## Requirements Analysis

### Key Scenarios

- **S1 对话排障（happy path）**：用户问「order-service 最近一小时错误率上升，帮我看看」→ Agent 判定需查日志，调用 logquery 拉取错误日志 → 算风险分 → LLM 解读 → 返回根因 + 处置建议。
- **S2 告警主动触发（happy path）**：告警到达 → Agent 被唤醒 → 自动跑排查 → 推送「结论 + 分级处置预案」到风险中心 → 高危项标记「待人工确认」。
- **S3 多租户隔离**：A 租户查询仅能命中本租户的日志/资产/告警，跨租户数据不可见。
- **S4 重复故障秒回**：用户问「CDN 流量突增」→ 历史故障库命中同类事件 → 秒回既往根因 + SOP。
- **S5 边界**：用户问「帮我重启这台 ECS」→ 判定为高危写操作 → 不执行，回执「需人工确认」并给出操作预案。
- **S6 失败降级**：LLM 不可用 / 底座接口超时 → Agent 返回确定性规则引擎结论（diagnose 引擎本身零 LLM 依赖），不因 AI 失效而中断主路径。

### Non-Functional Requirements

- **安全**：写操作必须经过风险分级判定；高危 100% 需人工确认；鉴权复用 eiam，租户数据严格隔离。
- **性能**：对话排障核心链路（规则诊断部分）应与现有 logquery 诊断接口同量级（秒级）；LLM 解读超时须降级为空串，不阻塞主流程。
- **可回溯**：会话与诊断结果落库，团队成员可回溯历史排障记录。
- **兼容**：复用 Haven 现有栈（Go + Vue3/Element Plus），与 e-cam-service / e-cam-web 同仓体系保持一致。

### Constraints & Dependencies

- 依赖 Haven 已有模块对外接口：logquery（日志+诊断）、alert（告警）、audit（变更/审计）、topology、资产/MCP、eiam（鉴权）。
- 纯编排层定位：本期**不新建** CI/CD 系统、日志存储、工单系统等数据面；CI/CD 与工单闭环在 Haven 侧属空白，P2/P3 仅做接入或预留接口。
- 技术栈约束：与 Haven 同栈（Go 后端 + Vue3 前端），不入场新语言/框架，控制团队维护成本。

## Alternatives & Industry Benchmarking

### Industry Solutions

- **K8sGPT**：开源，用 LLM 解读 Kubernetes 可观测数据，定位为「诊断分析器」而非编排层。
- **Datadog Bits AI / PagerDuty AI**：成熟商业产品，在监控平台上叠加 LLM 对话与自动处置建议；体量大，不可直接采用。
- **AWS CloudOps / DevOps Guru**：云厂商托管，绑定 AWS 生态，不跨多云。

### Comparison Table

| Approach | Source | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| Do nothing | — | 零成本 | 告警/排障持续靠人工跨系统串联，「自动执行可控」定位永远落空 | Rejected: 与平台定位相悖 |
| 重写独立全新项目（自带数据面） | 旧 opsagent 思路 | 完全解耦、可对外交付 | 重复建设日志/告警/资产底座，周期长，与 Haven 能力重叠 | Rejected: 重复造轮子，偏离「接入平台」诉求 |
| 用通用大模型直连外部云源 | 旧 opsagent 壳的配置 | 快 | 脱节 Haven 真实数据，无鉴权/租户隔离，无「可控执行」 | Rejected: 正是要解决的问题 |
| **编排层接入 Haven 底座** | 本提案 | 复用最大化、风险最低、近期即有价值、与平台定位一致 | 依赖 Haven 内部接口稳定性 | **Selected: 纯编排层 + 三期递进，最小代价兑现定位** |

## Feasibility Assessment

### Technical Feasibility

- 底座能力（日志联邦查询、diagnose 规则引擎、LLM 解读、告警多渠道、审计、拓扑、eiam、资产 MCP）已在 Haven 内实现并运行，编排层只需「串」而非「造」。
- LLM 已有可复用的降级安全封装（`e-cam-service/internal/logquery/llm`：未配置即 Disabled、超时/解析失败返回空串），可直接参考其模式。
- 无 showstopper 技术依赖；纯编排层定位绕开了 CI/CD/工单数据面空白的阻塞。

### Resource & Timeline

- 团队已维护整套 Haven（Go + Vue3），技能在位；编排层可复用现有模块装配模式（`internal/cert`、`internal/logquery` 均为先例）。
- 三期递进使 P1 范围可控、近期可交付；P2/P3 依赖 Haven 侧接口铺开，可并行推进。

### Dependency Readiness

- P1 依赖的 logquery / alert / 资产 / eiam 接口均已就绪；P2 的 audit / topology / order 模块已存在（工单闭环为半成品，接入时需确认其 API 成熟度）；P3 的 CI/CD 数据面当前空白，需在 P2 阶段评估接入或预留。

## Assumptions Challenged

| Assumption | Challenge Tool | Finding |
|------------|---------------|---------|
| 「应该重新写一个全新项目，AI 会很快」 | XY Problem Detection | Refined: 真实诉求不是「重写」，而是「让 Agent 接入 Haven 真实能力」。故不是新建数据面，而是编排层接入。 |
| 「独立 OpsAgent 应用」 | 5 Whys / 底座边界追问 | Refined: 最终定位收敛为「作为 Haven 子模块」，物理上与平台同仓，避免两套栈。 |
| 「自动执行」应是全自动 | Stress Test（高危写操作风险） | Refined: 拆分为「风险分级 + 白名单」——只读自动 / 低危白名单自动 / 高危人工确认。 |
| 「一次性覆盖全部能力」 | Occam's Razor / 分期 | Refined: 10 项能力三期递进，P1 先交付排障核心闭环。 |

## Scope

### In Scope

- **P1 排障核心闭环**：对话式排障助手 + 主动触发（告警/定时唤醒）+ 双界面（对话 + 风险中心）+ 只读诊断与处置预案（串日志 + 资产 + 告警）+ 会话/诊断落库 + eiam 鉴权 + 租户隔离。
- **P2 变更/审计/工单/拓扑接入**：接入 audit（变更/审计）、ecmdb order（工单）、topology 到编排层；上线历史故障库 + SOP 记忆检索。
- **P3 CI/CD 接入 + 可控执行闭环**：接入/预留 CI/CD 数据源；落地风险分级 + 白名单的写操作执行。

### Out of Scope

- 新建数据面（CI/CD 系统本身、日志存储、工单系统本身）——仅接入或预留接口。
- 全自动无人值守执行（无任何人工确认环节）。
- 替换/重写 Haven 现有各模块（logquery / alert / audit / ecmdb / eiam 等）——编排层只调用，不改其实现。
- 对外交付的独立 SaaS 产品形态（多租户对外售卖、计费等）。
- P2/P3 之外的 6~10 项能力（服务器、云资源、变更流程、合规审计等）的深度数据面建设。

## Key Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 高危写操作误执行导致生产事故 | M | H | 风险分级 + 白名单硬约束：高危 100% 人工确认；白名单最小化且可审计；P1 先做纯只读，写执行留到 P3 |
| 编排层依赖的 Haven 内部接口不稳定/漂移 | M | M | 复用现有模块装配模式为契约；接入前盘点各模块 API 成熟度，接口契约化并加集成测试 |
| LLM 解读质量不稳 / 不可用拖垮排障 | M | M | 沿用既有降级模式：规则引擎（diagnose）零 LLM 依赖，LLM 失效降级为空串，不阻塞主链路 |
| 多租户数据串库 | L | H | 复用 eiam 租户谓词语义，编排层所有查询强制注入 tenant 上下文；加跨租户隔离测试 |
| 历史故障库 / SOP 冷启动（初期无数据可命中） | H | M | P2 上线检索前，用 Haven 现有 audit/告警历史回填种子数据；先提供人工沉淀 SOP 的入口 |

## Success Criteria

- [ ] SC-1 自然语言排障：以「最近 CDN 是否被刷 / 某服务错误率上升」类提问发起，Agent 能在 1 分钟内返回含根因 + 处置建议的只读诊断报告（P1 交付时验证）。
- [ ] SC-2 主动触发：告警到达后，Agent 自动产出诊断并推送到风险中心，端到端（告警→诊断→推送）成功率达到 100%（排除底座接口自身故障），P1 交付时验证。
- [ ] SC-3 可控执行：所有写操作 100% 经过风险分级判定；高危操作 100% 需人工确认后才执行（P3 交付时验证）。
- [ ] SC-4 重复故障秒回：历史故障库命中同类问句时，Agent 在 5 秒内返回既往根因 + SOP 参考（P2 交付时验证）。
- [ ] SC-5 多租户隔离：任意租户发起的排障查询，通过自动化测试验证其无法命中其他租户的日志/资产/告警数据（P1 交付时验证）。
- [ ] SC-6 模块接入覆盖：P1 底座的日志/资产/告警三模块，各自至少 1 条真实可跑的端到端诊断场景通过集成测试（P1 交付时验证）。

## Next Steps

- 物理落地：在 `D:\Haven` 下新建 Agent 子模块（编排层，复用现有栈与模块装配先例）。
- Proceed to `/write-prd` 将本整体蓝图细化为 P1 的可执行需求；P2/P3 保留为本蓝图的后续分期。