// ============================================================
// Mongo Schema: Haven 运维 Agent（编排层）
// 存储引擎: MongoDB（go.mongodb.org/mongo-driver v1.17.4）
// 数据库:   opsagent（独立库，与 e-cam-service 的 ecam 库分离）
// 用途:     mongosh 初始化脚本 — 创建集合 + 索引
// 运行:     mongosh <dsn>/opsagent --file schema.mongo.js
// 说明:     Haven 采用 Mongo 而非 SQL，故本「schema」以集合+索引落地。
// ============================================================

db = db.getSiblingDB("opsagent");

// ---- 集合创建 ----
// sessions — 排障会话（提问/意图/编排调用链/状态）
db.createCollection("sessions");
// diagnoses — 诊断报告（根因/结论/处置预案/评分）
db.createCollection("diagnoses");
// citations — 数据源引用（结论回指日志/指标/资产/告警）
db.createCollection("citations");
// alerts — 告警记账（按指纹窗口：首条建文档 new/count=1，后续同指纹 $inc count + merged；
//          队列溢出丢弃的低级别告警亦各写一条 overflow_dropped——均保留 raw_payload）
db.createCollection("alerts");
// risk_entries — 风险中心条目（状态机: 待查看/已查看/已处理）
db.createCollection("risk_entries");
// llm_usage — LLM 预算账本（滚动 1h）
db.createCollection("llm_usage");
// settings — 系统配置（数据源/LLM/通知渠道/低危白名单/预置查询目录/引导话术 guided_templates）
db.createCollection("settings");
// compensations — 落库补偿队列（Mongo 持久化；Redis 仅作触发信号，不作存储）
db.createCollection("compensations");

// ============================================================
// 索引（多租户隔离硬约束：所有索引以 tenant_id 为前缀）
// ============================================================

db.sessions.createIndex({ tenant_id: 1, created_at: -1 }, { name: "idx_sessions_tenant_time" });
// sessions.query 为自然语言提问原文（string）；服务名检索走顶层 service_name 字段
db.sessions.createIndex({ tenant_id: 1, service_name: 1 }, { name: "idx_sessions_tenant_service" });
db.sessions.createIndex({ tenant_id: 1, type: 1 }, { name: "idx_sessions_tenant_type" });

db.diagnoses.createIndex({ session_id: 1 }, { name: "idx_dx_session" });
db.diagnoses.createIndex({ tenant_id: 1, service_name: 1 }, { name: "idx_dx_tenant_service" });
db.diagnoses.createIndex({ tenant_id: 1, created_at: -1 }, { name: "idx_dx_tenant_time" });

db.citations.createIndex({ diagnosis_id: 1 }, { name: "idx_cit_dx" });
db.citations.createIndex({ tenant_id: 1 }, { name: "idx_cit_tenant" });

db.alerts.createIndex(
  { tenant_id: 1, fingerprint: 1, window_start: 1 },
  { name: "idx_alerts_fingerprint_window" }
);
db.alerts.createIndex({ tenant_id: 1, created_at: -1 }, { name: "idx_alerts_tenant_time" });

// risk_entries 状态更新为 CAS：findAndModify 过滤 {_id, tenant_id, version}，$inc version——
// 防并发覆盖（对应 API expectedVersion；不匹配返回 409）
db.risk_entries.createIndex({ tenant_id: 1, status: 1 }, { name: "idx_re_tenant_status" });
db.risk_entries.createIndex({ tenant_id: 1, service_name: 1 }, { name: "idx_re_tenant_service" });
db.risk_entries.createIndex({ tenant_id: 1, fingerprint: 1 }, { name: "idx_re_tenant_fingerprint" });
db.risk_entries.createIndex({ diagnosis_id: 1 }, { name: "idx_re_dx" });

db.llm_usage.createIndex({ tenant_id: 1, window_start: 1 }, { name: "idx_llm_tenant_window" });

db.compensations.createIndex({ status: 1, next_retry_at: 1 }, { name: "idx_comp_retry" });

// settings: 全局配置文档 tenant_id 存空串 ""（哨兵值），与租户文档共用唯一索引
db.settings.createIndex({ scope: 1, tenant_id: 1 }, { name: "idx_settings_scope_tenant", unique: true });

// ============================================================
// 字段约束（应用层 + 可选 JSON Schema 校验）
// 说明: 状态机/枚举合法性由 Go 领域层校验；此处 schema 仅作文档参考。
// ============================================================
// sessions:  type ∈ {chat, alert};  status ∈ {running, done, failed}
// diagnoses: severity ∈ {P0,P1,P2,P3}; risk_level ∈ {read,low,high}
// risk_entries: status ∈ {pending_view, viewed, done}; version ≥ 1（CAS 乐观锁，每次更新 $inc +1）
// risk_entries.status_history: [{ from, to, by, at }]
// alerts: dedup_conclusion ∈ {new, merged, overflow_dropped}
//         （new=窗口首条建文档 count=1；merged=同指纹归并 $inc count；overflow_dropped=队列溢出丢弃留档）
// settings: scope ∈ {datasource, llm, notify, risk_whitelist, preset_queries, guided_templates}
// llm_usage: calls ≥ 0; budget_exceeded boolean