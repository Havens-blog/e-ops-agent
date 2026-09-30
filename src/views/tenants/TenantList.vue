<script setup lang="ts">
/**
 * 租户管理列表页（UF-6，task 4.4）。
 *
 * 参照：ui-design UF-6（Layout/States/Interactions/Data Binding）+ tech-design §Interfaces
 * A/C 档 + parity-checklist §3.2（G-4 降级）。
 *
 * 布局：页面头（标题 + 新增）→ 表格 → 分页。仅平台管理员可见（route meta.requiresAdmin）。
 * - 列：租户名 / 状态（启用/禁用 StatusBadge）/ 活跃会话数 / 操作
 * - 分页边界 E7（page 超界回落 / 末页空回退 / 切过滤重置 1）由 tenantList store 承载
 * - 文案出口用 CopyContractText（2.5）；状态徽章用 StatusBadge（4.1）
 *
 * 禁用前置 G-4 降级（Hard Rule + tech-design Data Models 注释 + parity §3.2 line 324）：
 * - eiam 无会话计数端点 → 活跃会话数列无 list 数据源，降级展示 '—'；
 * - 禁用直接提交 update(status=disable)，被 eiam 拒绝时从拒绝消息提取 active_session_count，
 *   渲染 tenant.disable_blocked 契约（{n}=active_session_count，与列同源）。
 *
 * 新增/编辑（AC-4）：租户名 1–64 字符 + 全局唯一（冲突提示 validation.name_exists）。
 * 删除：依赖删除由 eiam 服务端拒绝（msg 透传）。
 */
import { computed, onMounted, ref } from "vue";
import { useTenantListStore } from "@/stores/tenantList";
import { ApiError } from "@/api/types";
import { contractText, formatContractText } from "@/utils/copyContract";
import CopyContractText from "@/components/CopyContractText.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const store = useTenantListStore();

// ---- 搜索（切过滤重置 page=1，E7）----
const keywordInput = ref("");

function applySearch(): void {
  store.setKeyword(keywordInput.value.trim());
  void store.fetch();
}

function resetSearch(): void {
  keywordInput.value = "";
  store.setKeyword("");
  void store.fetch();
}

// ---- 分页 ----
const totalPages = computed(() =>
  store.total <= 0 ? 1 : Math.ceil(store.total / store.pageSize),
);

function changePage(p: number): void {
  store.setPage(p);
  void store.fetch();
}

// ---- 列表加载 ----
async function reload(): Promise<void> {
  await store.fetch();
}

onMounted(async () => {
  await store.fetch();
});

// ---- 活跃会话数列（G-4：无 list 数据源，降级 '—'）----
const sessionPlaceholder = "—";

// ---- 新增/编辑 Dialog（AC-4）----
const showForm = ref(false);
const formMode = ref<"create" | "edit">("create");
const formLoading = ref(false);
const formError = ref<string>("");
const formFieldErrors = ref<Record<string, string>>({});
const formId = ref<number>(0);
const formName = ref("");
const formCode = ref("");
const formDomain = ref("");
const formStatus = ref<"active" | "disable">("active");

const TENANT_NAME_MAX = 64;
const TENANT_CODE_MAX = 32;

function validateName(value: string): string | null {
  if (!value) return "请输入租户名";
  if (value.length < 1 || value.length > TENANT_NAME_MAX)
    return `租户名长度 1–${TENANT_NAME_MAX} 字符`;
  return null;
}

function validateCode(value: string): string | null {
  if (!value) return "请输入租户 code";
  if (value.length > TENANT_CODE_MAX) return `code 长度 ≤${TENANT_CODE_MAX}`;
  return null;
}

function openCreate(): void {
  formMode.value = "create";
  formId.value = 0;
  formName.value = "";
  formCode.value = "";
  formDomain.value = "";
  formStatus.value = "active";
  formError.value = "";
  formFieldErrors.value = {};
  store.clearDisableBlocked();
  showForm.value = true;
}

function openEdit(
  id: number,
  name: string,
  code: string,
  domain: string,
  status: string,
): void {
  formMode.value = "edit";
  formId.value = id;
  formName.value = name;
  formCode.value = code;
  formDomain.value = domain;
  formStatus.value = status === "disable" ? "disable" : "active";
  formError.value = "";
  formFieldErrors.value = {};
  store.clearDisableBlocked();
  showForm.value = true;
}

async function submitForm(): Promise<void> {
  formError.value = "";
  formFieldErrors.value = {};
  const nameErr = validateName(formName.value);
  if (nameErr) {
    formFieldErrors.value = { name: nameErr };
    return;
  }
  const codeErr = validateCode(formCode.value);
  if (codeErr) {
    formFieldErrors.value = { code: codeErr };
    return;
  }
  formLoading.value = true;
  try {
    if (formMode.value === "create") {
      const id = await store.create({
        name: formName.value,
        code: formCode.value,
        domain: formDomain.value || undefined,
      });
      if (id === null) {
        formError.value = store.error ?? "新增租户失败";
        return;
      }
    } else {
      const ok = await store.update({
        id: formId.value,
        name: formName.value,
        code: formCode.value,
        domain: formDomain.value || undefined,
        status: formStatus.value,
      });
      if (!ok) {
        formError.value = store.error ?? "保存失败";
        return;
      }
    }
    showForm.value = false;
  } catch (err) {
    formError.value = errorMessage(err);
  } finally {
    formLoading.value = false;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code !== null) {
      const text = contractText(String(err.code));
      if (text) return text;
    }
    return err.message;
  }
  return typeof err === "object" && err !== null && "message" in err
    ? String((err as { message: unknown }).message)
    : "操作失败";
}

function closeForm(): void {
  showForm.value = false;
}

// ---- 禁用确认（AC-3，G-4 降级）----
const disableTarget = ref<{ id: number; name: string } | null>(null);
const disableLoading = ref(false);

function openDisable(id: number, name: string): void {
  disableTarget.value = { id, name };
  store.clearDisableBlocked();
  disableLoading.value = false;
}

async function confirmDisable(): Promise<void> {
  if (!disableTarget.value) return;
  disableLoading.value = true;
  try {
    const ok = await store.disable(disableTarget.value.id);
    if (ok) {
      disableTarget.value = null;
    }
    // 失败：disableBlocked 已由 store 写入，模板渲染 tenant.disable_blocked
  } finally {
    disableLoading.value = false;
  }
}

function closeDisable(): void {
  disableTarget.value = null;
  store.clearDisableBlocked();
}

/** 禁用被拒文案：tenant.disable_blocked 契约 + {n}=活跃会话数（提取到时），否则 eiam 原文 */
const disableBlockedText = computed(() => {
  const blocked = store.disableBlocked;
  if (!blocked) return "";
  const template = contractText("tenant.disable_blocked");
  if (template && blocked.count > 0) {
    return formatContractText(template, { n: blocked.count });
  }
  // 提取不到计数 → 渲染 eiam 拒绝原文（不伪造计数）
  return blocked.message;
});

// ---- 启用（无前置校验，直接提交）----
async function enableTenant(id: number): Promise<void> {
  await store.enable(id);
}

// ---- 删除确认（依赖删除由 eiam 拒绝，msg 透传）----
const deleteTarget = ref<{ id: number; name: string } | null>(null);
const deleteLoading = ref(false);
const deleteBlocked = ref<string>("");

function openDelete(id: number, name: string): void {
  deleteTarget.value = { id, name };
  deleteBlocked.value = "";
  deleteLoading.value = false;
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  if (deleteBlocked.value) return;
  deleteLoading.value = true;
  try {
    const ok = await store.remove(deleteTarget.value.id);
    if (ok) {
      deleteTarget.value = null;
    }
  } catch (err) {
    deleteBlocked.value = errorMessage(err);
  } finally {
    deleteLoading.value = false;
  }
}

function closeDelete(): void {
  deleteTarget.value = null;
  deleteBlocked.value = "";
}

// ---- 状态迁移渲染辅助 ----
const isError = computed(
  () => store.error !== null && store.items.length === 0,
);
const isEmpty = computed(
  () => !store.loading && store.items.length === 0 && store.error === null,
);
</script>

<template>
  <section class="page-tenant-list" :aria-busy="store.loading">
    <header class="page-head">
      <h2 class="page-title">租户管理</h2>
      <button type="button" class="btn btn--primary" @click="openCreate">
        新增租户
      </button>
    </header>

    <!-- 搜索栏：关键词 -->
    <div class="toolbar">
      <input
        v-model="keywordInput"
        type="text"
        class="input toolbar__search"
        placeholder="搜索租户名"
        data-testid="tenant-search"
        @keyup.enter="applySearch"
      />
      <button type="button" class="btn btn--ghost" @click="applySearch">
        搜索
      </button>
      <button type="button" class="btn btn--text" @click="resetSearch">
        重置
      </button>
    </div>

    <!-- 错误态（重试） -->
    <p v-if="isError" class="state-error" role="alert">
      <CopyContractText code="eiam.unavailable" tag="span" />
      <button type="button" class="btn btn--text" @click="reload">重试</button>
    </p>

    <!-- 表格 -->
    <div class="table-wrap">
      <table v-if="store.items.length > 0" class="data-table">
        <thead>
          <tr>
            <th>租户名</th>
            <th>状态</th>
            <th>活跃会话数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in store.items" :key="t.id">
            <td>{{ t.name }}</td>
            <td>
              <StatusBadge :status="t.status ?? 'unknown'" size="sm" />
            </td>
            <!-- G-4：无 list 数据源，活跃会话数列降级 '—'；计数仅在禁用被拒时从拒绝消息提取展示 -->
            <td class="muted">{{ sessionPlaceholder }}</td>
            <td>
              <button
                type="button"
                class="btn btn--text"
                data-testid="edit-tenant"
                @click="
                  openEdit(t.id, t.name, t.code, t.domain, t.status ?? 'active')
                "
              >
                编辑
              </button>
              <button
                v-if="(t.status ?? 'unknown') === 'active'"
                type="button"
                class="btn btn--text btn--danger"
                data-testid="disable-tenant"
                @click="openDisable(t.id, t.name)"
              >
                禁用
              </button>
              <button
                v-else
                type="button"
                class="btn btn--text"
                data-testid="enable-tenant"
                @click="enableTenant(t.id)"
              >
                启用
              </button>
              <button
                type="button"
                class="btn btn--text btn--danger"
                data-testid="delete-tenant"
                @click="openDelete(t.id, t.name)"
              >
                删除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 空态 -->
      <p v-else-if="isEmpty" class="state-empty">暂无租户数据</p>

      <!-- 加载骨架 -->
      <div v-else-if="store.loading" class="skeleton" aria-hidden="true">
        <div v-for="i in 5" :key="i" class="skeleton__row" />
      </div>
    </div>

    <!-- 分页 -->
    <nav v-if="store.total > 0" class="pagination" aria-label="分页">
      <button
        type="button"
        class="btn btn--text"
        :disabled="store.page <= 1"
        @click="changePage(store.page - 1)"
      >
        上一页
      </button>
      <span class="pagination__info"
        >第 {{ store.page }} / {{ totalPages }} 页（共
        {{ store.total }} 条）</span
      >
      <button
        type="button"
        class="btn btn--text"
        :disabled="store.page >= totalPages"
        @click="changePage(store.page + 1)"
      >
        下一页
      </button>
      <select
        :value="store.pageSize"
        class="input pagination__size"
        @change="
          store.setPageSize(Number(($event.target as HTMLSelectElement).value))
        "
      >
        <option :value="20">20 条/页</option>
        <option :value="50">50 条/页</option>
        <option :value="100">100 条/页</option>
      </select>
    </nav>

    <!-- 新增/编辑 Dialog（AC-4）-->
    <div v-if="showForm" class="dialog-overlay" @click.self="closeForm">
      <div
        class="dialog"
        role="dialog"
        :aria-label="formMode === 'create' ? '新增租户' : '编辑租户'"
      >
        <header class="dialog__head">
          <h3>{{ formMode === "create" ? "新增租户" : "编辑租户" }}</h3>
          <button type="button" class="btn btn--text" @click="closeForm">
            ✕
          </button>
        </header>
        <form class="dialog__body" @submit.prevent="submitForm">
          <p v-if="formError" class="form-error" role="alert">
            <CopyContractText :code="formError" tag="span" />
          </p>
          <label class="field">
            <span class="field__label"
              >租户名<span class="required">*</span></span
            >
            <input
              v-model="formName"
              type="text"
              class="input"
              data-testid="form-name"
              :maxlength="TENANT_NAME_MAX"
              :aria-describedby="
                formFieldErrors.name ? 'form-name-error' : undefined
              "
              :aria-invalid="!!formFieldErrors.name"
            />
            <span
              v-if="formFieldErrors.name"
              id="form-name-error"
              class="field__error"
              role="alert"
              >{{ formFieldErrors.name }}</span
            >
          </label>
          <label class="field">
            <span class="field__label"
              >租户 Code<span class="required">*</span></span
            >
            <input
              v-model="formCode"
              type="text"
              class="input"
              data-testid="form-code"
              :maxlength="TENANT_CODE_MAX"
              :aria-describedby="
                formFieldErrors.code ? 'form-code-error' : undefined
              "
              :aria-invalid="!!formFieldErrors.code"
            />
            <span
              v-if="formFieldErrors.code"
              id="form-code-error"
              class="field__error"
              role="alert"
              >{{ formFieldErrors.code }}</span
            >
            <span class="muted">eiam 必填，max {{ TENANT_CODE_MAX }} 字符</span>
          </label>
          <label class="field">
            <span class="field__label">域名</span>
            <input v-model="formDomain" type="text" class="input" />
          </label>
          <label v-if="formMode === 'edit'" class="field">
            <span class="field__label">状态</span>
            <select v-model="formStatus" class="input">
              <option value="active">启用</option>
              <option value="disable">禁用</option>
            </select>
          </label>
          <div class="dialog__actions">
            <button type="button" class="btn btn--ghost" @click="closeForm">
              取消
            </button>
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="formLoading"
              data-testid="form-submit"
            >
              {{ formLoading ? "提交中…" : "保存" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 禁用确认 Dialog（AC-3，G-4 降级：被拒显示活跃会话数）-->
    <div v-if="disableTarget" class="dialog-overlay" @click.self="closeDisable">
      <div
        class="dialog dialog--sm"
        role="alertdialog"
        :aria-label="`禁用租户 ${disableTarget.name}`"
      >
        <header class="dialog__head">
          <h3>禁用租户</h3>
          <button type="button" class="btn btn--text" @click="closeDisable">
            ✕
          </button>
        </header>
        <div class="dialog__body">
          <p>
            确认禁用租户 <strong>{{ disableTarget.name }}</strong
            >？禁用后该租户用户将无法登录。
          </p>
          <!-- G-4 降级：被 eiam 拒绝时从拒绝消息提取活跃会话数，渲染 tenant.disable_blocked 契约 -->
          <p
            v-if="store.disableBlocked"
            class="delete-blocked"
            role="alert"
            data-testid="disable-blocked"
          >
            {{ disableBlockedText }}
          </p>
          <p
            v-if="store.disableBlocked && store.disableBlocked.count === 0"
            class="muted"
          >
            （eiam
            拒绝消息未携带结构化计数，已展示原文；活跃会话数列无列表数据源）
          </p>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" @click="closeDisable">
            取消
          </button>
          <button
            type="button"
            class="btn btn--danger"
            :disabled="disableLoading || !!store.disableBlocked"
            data-testid="disable-confirm"
            @click="confirmDisable"
          >
            {{ disableLoading ? "禁用中…" : "确认禁用" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认 Dialog（依赖删除由 eiam 拒绝，msg 透传）-->
    <div v-if="deleteTarget" class="dialog-overlay" @click.self="closeDelete">
      <div
        class="dialog dialog--sm"
        role="alertdialog"
        :aria-label="`删除租户 ${deleteTarget.name}`"
      >
        <header class="dialog__head">
          <h3>删除租户</h3>
          <button type="button" class="btn btn--text" @click="closeDelete">
            ✕
          </button>
        </header>
        <div class="dialog__body">
          <p>
            确认删除租户 <strong>{{ deleteTarget.name }}</strong
            >？此操作不可撤销。
          </p>
          <p v-if="deleteBlocked" class="delete-blocked" role="alert">
            {{ deleteBlocked }}
          </p>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" @click="closeDelete">
            取消
          </button>
          <button
            type="button"
            class="btn btn--danger"
            :disabled="deleteLoading || !!deleteBlocked"
            data-testid="delete-confirm"
            @click="confirmDelete"
          >
            {{ deleteLoading ? "删除中…" : "确认删除" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.page-tenant-list {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text-primary);
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;

  &__search {
    min-width: 220px;
  }
}

.input {
  height: 36px;
  padding: 0 10px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
}

.input:focus {
  outline: none;
  border-color: var(--input-border-focus);
}

.btn {
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &--primary {
    background: var(--accent-primary);
    color: #fff;
  }
  &--ghost {
    background: transparent;
    border: 1px solid var(--border-subtle);
    color: var(--text-regular);
  }
  &--text {
    background: transparent;
    color: var(--accent-blue);
    height: auto;
    padding: 4px 8px;
  }
  &--danger {
    background: var(--color-danger);
    color: #fff;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn--text.btn--danger {
  color: var(--color-danger);
  background: transparent;
}

.table-wrap {
  overflow-x: auto;
  background: var(--bg-elevated);
  border-radius: 8px;
  min-height: 120px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border-subtle);
  }
  th {
    color: var(--text-secondary);
    font-weight: 500;
  }
  td {
    color: var(--text-regular);
  }
}

.muted {
  color: var(--text-secondary);
  font-size: 12px;
}

.state-empty,
.state-error {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
}

.skeleton__row {
  height: 40px;
  margin: 8px 12px;
  background: var(--tag-bg);
  border-radius: 6px;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  &__info {
    color: var(--text-regular);
    font-size: 13px;
  }
  &__size {
    width: auto;
    height: 32px;
  }
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--bg-elevated);
  border-radius: 8px;
  box-shadow: var(--shadow-base);

  &--sm {
    max-width: 400px;
  }
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-subtle);
    h3 {
      margin: 0;
      font-size: 16px;
    }
  }
  &__body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;

  &__label {
    font-size: 13px;
    color: var(--text-regular);
  }
  &__error {
    font-size: 12px;
    color: var(--color-danger);
  }
}

.required {
  color: var(--color-danger);
  margin-left: 2px;
}

.form-error,
.delete-blocked {
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
  font-size: 13px;
}
</style>
