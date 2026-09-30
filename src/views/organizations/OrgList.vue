<script setup lang="ts">
/**
 * 组织管理页（UF-5，task 4.3）。
 *
 * 参照：ui-design UF-5（Layout 2:3 双栏 / States / Interactions / Data Binding）+ tech-design §Interfaces
 * + parity-checklist §2.5/§3.2 分歧 D-1（组织=department）。
 *
 * 布局：左树 : 右侧（详情 + 成员）= 2:3，树最小宽 280px。
 * - 左：组织树（Card，层级渲染 + 选中加载右侧）；
 * - 右：选中组织详情（名称/下属组织数/关联用户数）+ 成员列表（Card）。
 *
 * 上限保护（Hard Rule：树 ≤1000 节点/深度 ≤8 前端硬拦截）：
 * - canAddChild 预检：深度达 8 或节点达 1000 →「新增子组织」禁用 + tooltip；
 *
 * 删除（E11，Hard Rule：删除校验通过前不得放行提交）：
 * - precheckDelete（child_count/user_count）阻断 → 弹窗列计数、确认置灰（不提交）；
 * - 预检通过 → 确认弹窗 → 提交；eiam 拒绝作后置兜底。
 *
 * 组织名 1–64 字符前端拦截；树节点名超宽单行截断 + title 全文；键盘 ↑↓←→/Enter 导航。
 *
 * 树渲染：扁平可见行（visibleRows = 展开节点的子孙按深度优先顺序），depth 驱动缩进，
 * 无递归组件 —— 更可测、键盘导航直接索引。
 */
import { computed, nextTick, onMounted, ref } from "vue";
import {
  MAX_ORG_DEPTH,
  MAX_ORG_NODES,
  ORG_NAME_MAX,
  ORG_NAME_MIN,
  useOrgListStore,
} from "@/stores/orgList";
import { ApiError, type OrganizationNode } from "@/api/types";
import { contractText, formatContractText } from "@/utils/copyContract";
import CopyContractText from "@/components/CopyContractText.vue";

const store = useOrgListStore();

// ---- 树展开态（id → expanded）----
const expanded = ref<Set<number>>(new Set());

/** 可见行 = 展开节点的子孙按深度优先顺序；{node, depth} 驱动缩进与键盘遍历 */
interface VisibleRow {
  node: OrganizationNode;
  depth: number;
}
const visibleRows = computed<VisibleRow[]>(() => {
  const out: VisibleRow[] = [];
  const walk = (list: OrganizationNode[], depth: number): void => {
    for (const n of list) {
      out.push({ node: n, depth });
      if (expanded.value.has(n.id) && n.children.length > 0) {
        walk(n.children, depth + 1);
      }
    }
  };
  walk(store.items, 1);
  return out;
});

/** 当前键盘焦点行索引（树导航焦点环） */
const focusIndex = ref<number>(0);

function toggleExpand(id: number): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function selectNode(id: number): void {
  void store.loadDetail(id);
}

/** 焦点节点 id（由 focusIndex 经 visibleRows 推导） */
const focusId = computed<number | null>(() => {
  const row = visibleRows.value[focusIndex.value];
  return row ? row.node.id : null;
});

// ---- 键盘树导航（ui-design Accessibility：↑↓ 移动、←→ 折叠/展开、Enter 选中）----
function onTreeKeydown(e: KeyboardEvent): void {
  const rows = visibleRows.value;
  if (rows.length === 0) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusIndex.value = Math.min(focusIndex.value + 1, rows.length - 1);
    void scrollFocusIntoView();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusIndex.value = Math.max(focusIndex.value - 1, 0);
    void scrollFocusIntoView();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    const row = rows[focusIndex.value];
    if (
      row &&
      row.node.children.length > 0 &&
      !expanded.value.has(row.node.id)
    ) {
      toggleExpand(row.node.id);
    }
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    const row = rows[focusIndex.value];
    if (row && expanded.value.has(row.node.id)) {
      toggleExpand(row.node.id);
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    const row = rows[focusIndex.value];
    if (row) selectNode(row.node.id);
  }
}

async function scrollFocusIntoView(): Promise<void> {
  await nextTick();
  const el = document.querySelector(`[data-node-id="${focusId.value}"]`);
  el?.scrollIntoView({ block: "nearest" });
}

/** 节点深度（沿 parentId 上溯；根=1）—— 详情面板深度展示用 */
function nodeDepth(node: OrganizationNode | null): number {
  if (!node) return 0;
  let depth = 1;
  let cur: OrganizationNode | undefined = node;
  const guard = new Set<number>();
  while (cur?.parentId !== undefined) {
    if (guard.has(cur.id)) break;
    guard.add(cur.id);
    const parent = store.nodeIndex.get(cur.parentId);
    if (!parent) break;
    cur = parent;
    depth++;
    if (depth > MAX_ORG_DEPTH + 2) break;
  }
  return depth;
}

// ---- 新增子组织 Dialog（AC-3 + 上限保护）----
const showCreate = ref(false);
const createLoading = ref(false);
const createError = ref<string>("");
const createFieldErrors = ref<Record<string, string>>({});
const createName = ref("");
/** 新增的目标父节点（null=根组织） */
const createParent = ref<OrganizationNode | null>(null);
/** 上限保护：是否禁建 + tooltip 原因 */
const createBlockedReason = ref<string>("");

function openCreateRoot(): void {
  createParent.value = null;
  prepareCreate();
}

function openCreateChild(parent: OrganizationNode): void {
  createParent.value = parent;
  prepareCreate();
}

function prepareCreate(): void {
  const check = store.canAddChild(createParent.value?.id ?? null);
  createBlockedReason.value = check.allowed ? "" : check.reason;
  createName.value = "";
  createError.value = "";
  createFieldErrors.value = {};
  showCreate.value = true;
}

function validateName(value: string): string | null {
  if (value.length < ORG_NAME_MIN || value.length > ORG_NAME_MAX) {
    return `组织名长度 ${ORG_NAME_MIN}–${ORG_NAME_MAX} 字符`;
  }
  return null;
}

async function submitCreate(): Promise<void> {
  if (createBlockedReason.value) return; // 上限保护硬拦截
  createError.value = "";
  createFieldErrors.value = {};
  const nameErr = validateName(createName.value);
  if (nameErr) {
    createFieldErrors.value = { name: nameErr };
    return;
  }
  createLoading.value = true;
  try {
    const id = await store.create({
      parentId: createParent.value?.id,
      name: createName.value,
    });
    if (id === null) {
      createError.value = store.error ?? "新增组织失败";
      return;
    }
    showCreate.value = false;
  } finally {
    createLoading.value = false;
  }
}

function closeCreate(): void {
  showCreate.value = false;
}

// ---- 编辑 Dialog ----
const showEdit = ref(false);
const editLoading = ref(false);
const editError = ref<string>("");
const editFieldErrors = ref<Record<string, string>>({});
const editName = ref("");
const editId = ref<number>(0);

function openEdit(node: OrganizationNode): void {
  editId.value = node.id;
  editName.value = node.name;
  editError.value = "";
  editFieldErrors.value = {};
  showEdit.value = true;
}

async function submitEdit(): Promise<void> {
  editError.value = "";
  editFieldErrors.value = {};
  const nameErr = validateName(editName.value);
  if (nameErr) {
    editFieldErrors.value = { name: nameErr };
    return;
  }
  editLoading.value = true;
  try {
    const node = store.nodeIndex.get(editId.value);
    const ok = await store.update({
      id: editId.value,
      name: editName.value,
      parentId: node?.parentId,
    });
    if (!ok) {
      editError.value = store.error ?? "更新组织失败";
      return;
    }
    showEdit.value = false;
  } finally {
    editLoading.value = false;
  }
}

function closeEdit(): void {
  showEdit.value = false;
}

// ---- 删除（E11，Hard Rule：删除校验通过前不得放行提交）----
const deleteTarget = ref<{ id: number; name: string } | null>(null);
const deleteLoading = ref(false);
/** 阻断计数（precheckDelete 结果）；null = 未阻断可提交 */
const deleteBlocked = ref<{ childCount: number; userCount: number } | null>(
  null,
);
/** eiam 后置拒绝消息（兜底，Phase-0-contingent） */
const deleteRejectMsg = ref<string>("");

function openDelete(node: OrganizationNode): void {
  // 选中目标节点加载详情/成员（确保 child_count/user_count 已就绪）
  void store.loadDetail(node.id).then(() => {
    deleteTarget.value = { id: node.id, name: node.name };
    deleteRejectMsg.value = "";
    deleteLoading.value = false;
    // 前端预检（Hard Rule：校验通过前不得放行提交）
    deleteBlocked.value = store.precheckDelete();
  });
}

async function confirmDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  if (deleteBlocked.value) return; // 阻断态确认置灰（不可确认）
  deleteLoading.value = true;
  try {
    const deletedId = deleteTarget.value.id;
    const ok = await store.remove(deletedId);
    if (ok) {
      // 删除后若选中节点被删，清空选中
      if (store.selectedId === deletedId) {
        store.clearSelection();
      }
      deleteTarget.value = null;
    }
  } catch (err) {
    // eiam 后置拒绝（code=4010703，Phase-0-contingent）：msg 透传文案回退
    deleteRejectMsg.value = errorMessage(err);
  } finally {
    deleteLoading.value = false;
  }
}

function closeDelete(): void {
  deleteTarget.value = null;
  deleteBlocked.value = null;
  deleteRejectMsg.value = "";
}

// ---- 成员分页 ----
const membersTotalPages = computed(() =>
  store.membersTotal <= 0
    ? 1
    : Math.ceil(store.membersTotal / store.membersPageSize),
);

function changeMembersPage(p: number): void {
  store.setMembersPage(p);
  if (store.selectedId !== null) {
    void store.fetchMembers(store.selectedId);
  }
}

const membersKeywordInput = ref("");

function applyMembersSearch(): void {
  store.setMembersKeyword(membersKeywordInput.value.trim());
  if (store.selectedId !== null) {
    void store.fetchMembers(store.selectedId);
  }
}

// ---- 详情面板派生 ----
const detailName = computed(() => {
  if (store.detail) return store.detail.name;
  return store.selectedNode?.name ?? "—";
});

/** 删除阻断文案（delete.blocked_org 契约插值，{n}=childCount/{m}=userCount） */
const deleteBlockedText = computed(() => {
  if (!deleteBlocked.value) return "";
  return formatContractText(contractText("delete.blocked_org") ?? "", {
    n: deleteBlocked.value.childCount,
    m: deleteBlocked.value.userCount,
  });
});

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

// ---- 状态迁移渲染辅助 ----
const isError = computed(
  () => store.error !== null && store.items.length === 0,
);
const isEmpty = computed(
  () => !store.loading && store.items.length === 0 && store.error === null,
);

onMounted(async () => {
  await store.fetch();
  // 默认展开首个根节点并选中
  const first = store.items[0];
  if (first) {
    expanded.value = new Set([first.id]);
    selectNode(first.id);
    focusIndex.value = 0;
  }
});
</script>

<template>
  <section class="page-org-list" :aria-busy="store.loading">
    <header class="page-head">
      <h2 class="page-title">组织管理</h2>
      <button type="button" class="btn btn--primary" @click="openCreateRoot">
        新增根组织
      </button>
    </header>

    <!-- 错误态（重试） -->
    <p v-if="isError" class="state-error" role="alert">
      <CopyContractText code="eiam.unavailable" tag="span" />
      <button type="button" class="btn btn--text" @click="store.fetch">
        重试
      </button>
    </p>

    <div v-if="!isError" class="org-layout">
      <!-- 左：组织树（2/5，最小 280px） -->
      <aside class="org-tree" aria-label="组织树">
        <div class="card">
          <div class="card__head">
            <span class="card__title">组织树</span>
            <span class="muted"
              >{{ store.total }} / {{ MAX_ORG_NODES }} 节点</span
            >
          </div>
          <div
            class="tree-body"
            role="tree"
            tabindex="0"
            aria-label="组织树，使用方向键导航"
            @keydown="onTreeKeydown"
          >
            <!-- 加载骨架 -->
            <div
              v-if="store.loading && store.items.length === 0"
              class="skeleton"
              aria-hidden="true"
            >
              <div v-for="i in 4" :key="i" class="skeleton__row" />
            </div>
            <!-- 空态 -->
            <p v-else-if="isEmpty" class="state-empty">暂无组织</p>
            <!-- 树（扁平可见行） -->
            <ul v-else class="tree-root" role="group">
              <li
                v-for="(row, idx) in visibleRows"
                :key="row.node.id"
                class="tree-node"
              >
                <div
                  class="tree__row"
                  :class="{ 'tree__row--focus': idx === focusIndex }"
                  :data-node-id="row.node.id"
                  role="treeitem"
                  :aria-selected="store.selectedId === row.node.id"
                  :aria-expanded="
                    row.node.children.length > 0
                      ? expanded.has(row.node.id)
                      : undefined
                  "
                  :aria-level="row.depth"
                  :tabindex="idx === focusIndex ? 0 : -1"
                  :style="{ paddingLeft: `${(row.depth - 1) * 16 + 8}px` }"
                  @click="selectNode(row.node.id)"
                >
                  <button
                    type="button"
                    class="tree__toggle"
                    :class="{
                      'tree__toggle--leaf': row.node.children.length === 0,
                    }"
                    :aria-label="
                      row.node.children.length === 0
                        ? ''
                        : expanded.has(row.node.id)
                          ? '折叠'
                          : '展开'
                    "
                    tabindex="-1"
                    @click.stop="toggleExpand(row.node.id)"
                  >
                    {{
                      row.node.children.length === 0
                        ? ""
                        : expanded.has(row.node.id)
                          ? "▾"
                          : "▸"
                    }}
                  </button>
                  <span
                    class="tree__label"
                    :class="{
                      'tree__label--selected': store.selectedId === row.node.id,
                    }"
                    :title="row.node.name"
                    >{{ row.node.name }}</span
                  >
                  <span class="tree__actions">
                    <button
                      type="button"
                      class="btn btn--text btn--sm"
                      :disabled="!store.canAddChild(row.node.id).allowed"
                      :title="
                        store.canAddChild(row.node.id).reason || '新增子组织'
                      "
                      tabindex="-1"
                      @click.stop="openCreateChild(row.node)"
                    >
                      ＋
                    </button>
                    <button
                      type="button"
                      class="btn btn--text btn--sm"
                      tabindex="-1"
                      @click.stop="openEdit(row.node)"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      class="btn btn--text btn--sm btn--danger"
                      tabindex="-1"
                      @click.stop="openDelete(row.node)"
                    >
                      删除
                    </button>
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      <!-- 右：详情 + 成员（3/5） -->
      <main class="org-detail">
        <!-- 详情卡片 -->
        <div class="card">
          <div class="card__head">
            <span class="card__title">组织详情</span>
            <span v-if="store.selectedNode" class="muted"
              >深度 {{ nodeDepth(store.selectedNode) }} /
              {{ MAX_ORG_DEPTH }}</span
            >
          </div>
          <div v-if="store.selectedNode" class="card__body">
            <dl class="detail-grid">
              <div class="detail-item">
                <dt>组织名称</dt>
                <dd>{{ detailName }}</dd>
              </div>
              <div class="detail-item">
                <dt>下属组织数</dt>
                <dd>{{ store.selectedChildCount }}</dd>
              </div>
              <div class="detail-item">
                <dt>关联用户数</dt>
                <dd>{{ store.membersTotal }}</dd>
              </div>
            </dl>
            <div class="detail-actions">
              <button
                type="button"
                class="btn btn--text"
                :disabled="!store.canAddChild(store.selectedId).allowed"
                :title="store.canAddChild(store.selectedId).reason"
                @click="openCreateChild(store.selectedNode)"
              >
                新增子组织
              </button>
              <button
                type="button"
                class="btn btn--text"
                @click="openEdit(store.selectedNode)"
              >
                编辑
              </button>
              <button
                type="button"
                class="btn btn--text btn--danger"
                @click="openDelete(store.selectedNode)"
              >
                删除
              </button>
            </div>
          </div>
          <div v-else class="card__body">
            <p class="muted">请在左侧选择一个组织节点。</p>
          </div>
        </div>

        <!-- 成员列表卡片 -->
        <div class="card">
          <div class="card__head">
            <span class="card__title">成员列表</span>
            <span v-if="store.selectedId !== null" class="muted"
              >共 {{ store.membersTotal }} 人</span
            >
          </div>
          <div class="card__body">
            <div v-if="store.selectedId !== null" class="members">
              <div class="toolbar">
                <input
                  v-model="membersKeywordInput"
                  type="text"
                  class="input toolbar__search"
                  placeholder="搜索成员"
                  data-testid="members-search"
                  @keyup.enter="applyMembersSearch"
                />
                <button
                  type="button"
                  class="btn btn--ghost"
                  @click="applyMembersSearch"
                >
                  搜索
                </button>
              </div>

              <p v-if="store.membersError" class="state-error" role="alert">
                <CopyContractText code="eiam.unavailable" tag="span" />
                <button
                  type="button"
                  class="btn btn--text"
                  @click="store.fetchMembers(store.selectedId ?? 0)"
                >
                  重试
                </button>
              </p>

              <div class="table-wrap">
                <table v-if="store.members.length > 0" class="data-table">
                  <thead>
                    <tr>
                      <th>用户名</th>
                      <th>昵称</th>
                      <th>邮箱</th>
                      <th>手机</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="m in store.members" :key="m.id">
                      <td>{{ m.username }}</td>
                      <td>{{ m.displayName }}</td>
                      <td class="truncate">{{ m.email || "—" }}</td>
                      <td class="truncate">{{ m.phone || "—" }}</td>
                    </tr>
                  </tbody>
                </table>
                <div
                  v-else-if="store.membersLoading"
                  class="skeleton"
                  aria-hidden="true"
                >
                  <div v-for="i in 3" :key="i" class="skeleton__row" />
                </div>
                <p v-else class="state-empty">该组织暂无成员</p>
              </div>

              <nav
                v-if="store.membersTotal > store.membersPageSize"
                class="pagination"
                aria-label="成员分页"
              >
                <button
                  type="button"
                  class="btn btn--text"
                  :disabled="store.membersPage <= 1"
                  @click="changeMembersPage(store.membersPage - 1)"
                >
                  上一页
                </button>
                <span class="pagination__info"
                  >第 {{ store.membersPage }} / {{ membersTotalPages }} 页</span
                >
                <button
                  type="button"
                  class="btn btn--text"
                  :disabled="store.membersPage >= membersTotalPages"
                  @click="changeMembersPage(store.membersPage + 1)"
                >
                  下一页
                </button>
              </nav>
            </div>
            <p v-else class="muted">请在左侧选择一个组织节点。</p>
          </div>
        </div>
      </main>
    </div>

    <!-- 新增子组织 Dialog -->
    <div v-if="showCreate" class="dialog-overlay" @click.self="closeCreate">
      <div class="dialog" role="dialog" aria-label="新增组织">
        <header class="dialog__head">
          <h3>
            {{
              createParent ? `新增子组织（${createParent.name}）` : "新增根组织"
            }}
          </h3>
          <button type="button" class="btn btn--text" @click="closeCreate">
            ✕
          </button>
        </header>
        <form class="dialog__body" @submit.prevent="submitCreate">
          <!-- 上限保护阻断提示 -->
          <p v-if="createBlockedReason" class="delete-blocked" role="alert">
            {{ createBlockedReason }}（不可再建子级）
          </p>
          <p v-if="createError" class="form-error" role="alert">
            <CopyContractText :code="createError" tag="span" />
          </p>
          <label class="field">
            <span class="field__label"
              >组织名<span class="required">*</span></span
            >
            <input
              v-model="createName"
              type="text"
              class="input"
              data-testid="create-org-name"
              :maxlength="ORG_NAME_MAX"
              :aria-describedby="
                createFieldErrors.name ? 'create-org-name-error' : undefined
              "
              :aria-invalid="!!createFieldErrors.name"
            />
            <span class="muted"
              >{{ ORG_NAME_MIN }}–{{ ORG_NAME_MAX }} 字符</span
            >
            <span
              v-if="createFieldErrors.name"
              id="create-org-name-error"
              class="field__error"
              role="alert"
              >{{ createFieldErrors.name }}</span
            >
          </label>
          <div class="dialog__actions">
            <button type="button" class="btn btn--ghost" @click="closeCreate">
              取消
            </button>
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="createLoading || !!createBlockedReason"
              data-testid="create-org-submit"
            >
              {{ createLoading ? "提交中…" : "保存" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 编辑 Dialog -->
    <div v-if="showEdit" class="dialog-overlay" @click.self="closeEdit">
      <div class="dialog" role="dialog" aria-label="编辑组织">
        <header class="dialog__head">
          <h3>编辑组织</h3>
          <button type="button" class="btn btn--text" @click="closeEdit">
            ✕
          </button>
        </header>
        <form class="dialog__body" @submit.prevent="submitEdit">
          <p v-if="editError" class="form-error" role="alert">
            <CopyContractText :code="editError" tag="span" />
          </p>
          <label class="field">
            <span class="field__label"
              >组织名<span class="required">*</span></span
            >
            <input
              v-model="editName"
              type="text"
              class="input"
              data-testid="edit-org-name"
              :maxlength="ORG_NAME_MAX"
              :aria-describedby="
                editFieldErrors.name ? 'edit-org-name-error' : undefined
              "
              :aria-invalid="!!editFieldErrors.name"
            />
            <span class="muted"
              >{{ ORG_NAME_MIN }}–{{ ORG_NAME_MAX }} 字符</span
            >
            <span
              v-if="editFieldErrors.name"
              id="edit-org-name-error"
              class="field__error"
              role="alert"
              >{{ editFieldErrors.name }}</span
            >
          </label>
          <div class="dialog__actions">
            <button type="button" class="btn btn--ghost" @click="closeEdit">
              取消
            </button>
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="editLoading"
              data-testid="edit-org-submit"
            >
              {{ editLoading ? "提交中…" : "保存" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 删除确认 Dialog（E11：阻断计数 + 确认置灰） -->
    <div v-if="deleteTarget" class="dialog-overlay" @click.self="closeDelete">
      <div
        class="dialog dialog--sm"
        role="alertdialog"
        :aria-label="`删除组织 ${deleteTarget.name}`"
      >
        <header class="dialog__head">
          <h3>删除组织</h3>
          <button type="button" class="btn btn--text" @click="closeDelete">
            ✕
          </button>
        </header>
        <div class="dialog__body">
          <p>
            确认删除组织 <strong>{{ deleteTarget.name }}</strong
            >？此操作不可撤销。
          </p>
          <!-- E11 前端预检阻断：弹窗列下属组织数/关联用户数、确认置灰 -->
          <p v-if="deleteBlocked" class="delete-blocked" role="alert">
            {{ deleteBlockedText }}
          </p>
          <!-- eiam 后置拒绝（兜底，Phase-0-contingent） -->
          <p v-if="deleteRejectMsg" class="delete-blocked" role="alert">
            {{ deleteRejectMsg }}
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
            data-testid="delete-org-confirm"
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
.page-org-list {
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

.org-layout {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: 16px;
  align-items: start;
}

.org-tree {
  min-width: 280px;
}

.org-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
  }
  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }
  &__body {
    padding: 16px;
  }
}

.tree-body {
  max-height: 70vh;
  overflow-y: auto;
  padding: 8px;
  outline: none;

  &:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent-blue);
  }
}

.tree-root {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree-node {
  list-style: none;
}

.tree__row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-regular);

  &:hover {
    background: var(--bg-hover);
  }
  &--focus {
    box-shadow: inset 0 0 0 2px var(--accent-blue);
  }
}

.tree__toggle {
  width: 16px;
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 10px;
  text-align: center;

  &--leaf {
    cursor: default;
  }
}

.tree__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--selected {
    color: var(--accent-blue);
    font-weight: 500;
  }
}

.tree__actions {
  display: none;
  gap: 2px;
  flex-shrink: 0;
}

.tree__row:hover .tree__actions {
  display: inline-flex;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin: 0 0 12px;
}

.detail-item {
  dt {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }
  dd {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-primary);
  }
}

.detail-actions {
  display: flex;
  gap: 8px;
}

.muted {
  color: var(--text-secondary);
  font-size: 12px;
}

.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;

  &__search {
    min-width: 200px;
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
  &--sm {
    height: 24px;
    padding: 0 6px;
    font-size: 11px;
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
  min-height: 80px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 8px 10px;
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

.truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-empty,
.state-error {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.skeleton__row {
  height: 32px;
  margin: 4px 0;
  background: var(--tag-bg);
  border-radius: 6px;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;

  &__info {
    color: var(--text-regular);
    font-size: 13px;
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
  max-width: 480px;
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
