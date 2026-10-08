// @vitest-environment happy-dom
/**
 * 租户选择页（UF-11）单测（task 3.2）。
 *
 * 覆盖 AC：
 * - 分流 0/1/≥2：0 → 受限工作台（router.replace /workbench）；1 → toast + 自动选定 → 工作台；
 *   ≥2 → 渲染 3.1 TenantSelector 组件（单选列表）
 * - 平台管理员豁免零租户：admin + 0 租户 → 仍进 /workbench（不阻断；受限态由 3.3 工作台自处理）
 * - 选租户 → 走 tenant/switch（3.1 组件契约，由 TenantSelector 内部触发）
 * - 查询失败 → 错误提示 + 重试（返回 Loading 态）；列表仅来自 eiam 所属租户
 *
 * TenantSelector 组件本身（切换动作/三态/契约文案）由 3.1 单测覆盖；本测试用 stub 隔离
 * 页面分流逻辑，仅断言页面按租户数条件渲染 TenantSelector（≥2）或自动跳转（0/1）。
 */
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { flushPromises, mount } from "@vue/test-utils";
import TenantSelect from "./TenantSelect.vue";
import { useUserStore } from "@/stores/user";
import { useTenantStore } from "@/stores/tenant";

// ElMessage stub（避免全局挂载副作用；success 调用经 vi.hoisted 暴露以便断言）
const { elMessageSuccess } = vi.hoisted(() => ({ elMessageSuccess: vi.fn() }));
vi.mock("element-plus", async (orig) => {
  const real = (await orig()) as typeof import("element-plus");
  return {
    ...real,
    ElMessage: Object.assign(vi.fn(), {
      error: vi.fn(),
      success: elMessageSuccess,
      warning: vi.fn(),
    }),
  };
});

// TenantSelector stub：仅证明页面按 ≥2 条件渲染该组件（切换动作由 3.1 单测覆盖）
const TenantSelectorStub = defineComponent({
  name: "TenantSelector",
  render: () =>
    h("div", { class: "ts-embedded-stub", "data-testid": "ts-embedded" }),
});

const freshPinia = () => {
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  createApp({ render: () => null }).use(pinia);
  setActivePinia(pinia);
  return pinia;
};

async function makeRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/tenant-select", component: TenantSelect },
      {
        path: "/workbench",
        component: defineComponent({ name: "Wb", render: () => null }),
      },
    ],
  });
  await router.push("/tenant-select");
  await router.isReady();
  return router;
}

interface SeedOpts {
  tenantsCount?: number;
  isAdmin?: boolean;
  currentTenantId?: number;
  error?: string | null;
  loading?: boolean;
  withProfile?: boolean;
}

async function mountPage(opts: SeedOpts = {}) {
  freshPinia();
  const userStore = useUserStore();
  const tenantStore = useTenantStore();
  userStore.isAdmin = opts.isAdmin ?? false;
  const tenants = Array.from({ length: opts.tenantsCount ?? 0 }, (_, i) => ({
    id: i + 1,
    name: `租户${i + 1}`,
    code: `c${i + 1}`,
    domain: "",
  }));
  (userStore as unknown as { tenants: typeof tenants }).tenants = tenants;
  if (opts.currentTenantId !== undefined) {
    tenantStore.setCurrentTenantId(opts.currentTenantId);
  }
  if (opts.error !== undefined) {
    (userStore as unknown as { error: string | null }).error = opts.error;
  }
  if (opts.loading !== undefined) {
    (userStore as unknown as { loading: boolean }).loading = opts.loading;
  }
  if (opts.withProfile ?? true) {
    (userStore as unknown as { profile: unknown }).profile = {
      id: 1,
      username: "tester",
      displayName: "测试者",
    };
  } else {
    (userStore as unknown as { profile: unknown }).profile = null;
  }
  // 防御：onMounted 在 profile 缺失时会调 fetchProfile；默认 spy 返回 true 避免覆盖 seed
  const fetchSpy = vi.spyOn(userStore, "fetchProfile").mockResolvedValue(true);
  const switchSpy = vi
    .spyOn(tenantStore, "switchTenant")
    .mockResolvedValue(true);

  const router = await makeRouter();
  const wrapper = mount(TenantSelect, {
    global: {
      plugins: [router],
      stubs: { TenantSelector: TenantSelectorStub },
    },
  });
  await nextTick();
  await flushPromises();
  await nextTick();
  return { wrapper, router, userStore, tenantStore, fetchSpy, switchSpy };
}

beforeEach(() => {
  localStorage.clear();
  elMessageSuccess.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("分流 0/1/≥2（AC-1）", () => {
  it("0 租户 → router.replace /workbench（受限工作台，3.3 自处理受限态）", async () => {
    const { router, switchSpy } = await mountPage({ tenantsCount: 0 });
    expect(router.currentRoute.value.path).toBe("/workbench");
    // 零租户不触发切换
    expect(switchSpy).not.toHaveBeenCalled();
  });

  it("1 租户 + currentTenantId 已定 → toast 提示 + router.replace /workbench", async () => {
    const { router, switchSpy } = await mountPage({
      tenantsCount: 1,
      currentTenantId: 1,
    });
    expect(elMessageSuccess).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe("/workbench");
    // 已是当前租户，不重复切换
    expect(switchSpy).not.toHaveBeenCalled();
  });

  it("1 租户 + currentTenantId===0 → toast + switchTenant(t.id) 写 session tenant_id", async () => {
    const { switchSpy } = await mountPage({
      tenantsCount: 1,
      currentTenantId: 0,
    });
    expect(elMessageSuccess).toHaveBeenCalledTimes(1);
    expect(switchSpy).toHaveBeenCalledWith(1);
  });

  it("≥2 租户 → 渲染 3.1 TenantSelector 组件（单选列表），不自动跳转", async () => {
    const { router, wrapper, switchSpy } = await mountPage({
      tenantsCount: 3,
      currentTenantId: 0,
    });
    expect(wrapper.findComponent(TenantSelectorStub).exists()).toBe(true);
    expect(wrapper.find('[data-testid="ts-embedded"]').exists()).toBe(true);
    // 未选租户前不进入工作台（Hard Rule）
    expect(router.currentRoute.value.path).toBe("/tenant-select");
    expect(switchSpy).not.toHaveBeenCalled();
  });

  it("≥2 租户 + currentTenantId 已定（switch+reload）→ 直达工作台", async () => {
    // 回归：选完租户后 switchTenant 整页 reload 回本页，currentTenantId 已非 0，
    // mustSelectTenant（tenants.length>1）仍为真——早前漏判此条件导致死循环在选租户页。
    const { router, switchSpy } = await mountPage({
      tenantsCount: 3,
      currentTenantId: 3,
    });
    expect(router.currentRoute.value.path).toBe("/workbench");
    expect(switchSpy).not.toHaveBeenCalled();
  });
});

describe("平台管理员豁免零租户（AC-2）", () => {
  it("admin + 0 租户 → 仍进 /workbench（不阻断；受限态由 3.3 工作台豁免）", async () => {
    const { router, switchSpy } = await mountPage({
      tenantsCount: 0,
      isAdmin: true,
    });
    expect(router.currentRoute.value.path).toBe("/workbench");
    expect(switchSpy).not.toHaveBeenCalled();
  });
});

describe("查询失败 → 错误提示 + 重试（AC-4）", () => {
  it("error 置位 → 渲染错误文案 + 重试按钮；重试调 fetchProfile", async () => {
    const { wrapper, fetchSpy } = await mountPage({
      tenantsCount: 0,
      error: "身份服务暂不可用，请稍后重试",
      withProfile: false,
    });
    // fetchProfile spy 默认返回 true 会清空 error？不会——spy 不动 store 字段，error 保持
    // 但 onMounted dispatch 在 fetchProfile 后 loading 仍 false、error 仍 seeded → 不分流
    expect(wrapper.find('[data-testid="ts-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ts-error"]').text()).toContain(
      "身份服务暂不可用，请稍后重试",
    );
    const retryBtn = wrapper.find('[data-testid="ts-retry"]');
    expect(retryBtn.exists()).toBe(true);
    const before = fetchSpy.mock.calls.length;
    await retryBtn.trigger("click");
    await flushPromises();
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(before);
  });

  it("loading 态 → 渲染 skeleton，不分流", async () => {
    const { router, wrapper, switchSpy } = await mountPage({
      tenantsCount: 2,
      loading: true,
    });
    expect(wrapper.find('[data-testid="ts-loading"]').exists()).toBe(true);
    // loading 期间不跳转、不切换
    expect(router.currentRoute.value.path).toBe("/tenant-select");
    expect(switchSpy).not.toHaveBeenCalled();
  });
});
