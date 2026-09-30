// @vitest-environment happy-dom
/**
 * 工作台（UF-3）单测（task 3.3）。
 *
 * 覆盖 AC：
 * - 欢迎横幅 + 我的信息四字段（用户名/昵称/所属租户/角色）只读展示
 * - 应用快捷导航卡片：v1 仅「云管」一项（本地穷举），点击新标签跳转（window.open noopener）
 * - 受限视图（零租户 E3）：仅欢迎+我的信息，卡片禁用，tenant.none 提示；平台管理员豁免
 * - eiam 不可用（E12）：静态内容仍渲染 + 顶部降级提示（eiam.unavailable），卡片跳转禁用
 *
 * 注：2 列/3 列断点为 CSS media query（1280–1599px / ≥1600px），happy-dom 不解析布局，
 * 断点行为由 Playwright E2E 承接（tech-design §Testing：页面级交互统一 E2E）；
 * 本单测覆盖卡片网格结构存在性 + 穷举项 + 点击跳转 + 禁用态。
 */
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { mount } from "@vue/test-utils";
import Workbench from "./Workbench.vue";
import { useUserStore } from "@/stores/user";
import { useTenantStore } from "@/stores/tenant";

const freshPinia = () => {
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  createApp({ render: () => null }).use(pinia);
  setActivePinia(pinia);
  return pinia;
};

beforeEach(() => {
  localStorage.clear();
  freshPinia();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 置 store 为「已加载 profile + 单租户」的默认态（非 admin） */
function seedDefaultState(): void {
  const userStore = useUserStore();
  const tenantStore = useTenantStore();
  userStore.isAdmin = false;
  userStore.tenants = [{ id: 10, name: "Acme 租户", code: "acme", domain: "" }];
  tenantStore.setCurrentTenantId(10);
  // 直接写 profile（store 暴露的 ref，绕过 fetchProfile）
  (userStore as unknown as { profile: unknown }).profile = {
    id: 1,
    username: "alice",
    displayName: "爱丽丝",
  };
}

function mountWorkbench() {
  return mount(Workbench);
}

describe("工作台 Default 视图（UF-3）", () => {
  it("渲染欢迎横幅 + 我的信息四字段只读", () => {
    seedDefaultState();
    const wrapper = mountWorkbench();
    expect(wrapper.find('[data-testid="workbench"]').exists()).toBe(true);
    // 欢迎横幅含昵称
    expect(wrapper.text()).toContain("欢迎，爱丽丝");
    // 四字段只读展示（值 + label）
    expect(wrapper.find('[data-testid="profile-username"]').text()).toBe(
      "alice",
    );
    expect(wrapper.find('[data-testid="profile-nickname"]').text()).toBe(
      "爱丽丝",
    );
    expect(wrapper.find('[data-testid="profile-tenant"]').text()).toBe(
      "Acme 租户",
    );
    expect(wrapper.find('[data-testid="profile-role"]').text()).toBe(
      "只读/审计",
    );
    // profile 字段为 dd（只读，无 input）
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("应用卡片：v1 仅「云管」一项本地穷举", () => {
    seedDefaultState();
    const wrapper = mountWorkbench();
    const cards = wrapper.findAll('[data-testid^="app-card-"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.text()).toContain("云管");
  });

  it("应用卡片点击 → window.open(url, _blank, noopener) SSO 共享 cookie", async () => {
    seedDefaultState();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const wrapper = mountWorkbench();
    await wrapper.find('[data-testid="app-card-cam"]').trigger("click");
    expect(openSpy).toHaveBeenCalledWith("/cam/", "_blank", "noopener");
  });

  it("平台管理员（零租户豁免）：非受限态，角色=平台管理员，卡片可跳转", async () => {
    const userStore = useUserStore();
    const tenantStore = useTenantStore();
    userStore.isAdmin = true;
    userStore.tenants = [{ id: 1, name: "系统租户", code: "sys", domain: "" }];
    tenantStore.setCurrentTenantId(1);
    (userStore as unknown as { profile: unknown }).profile = {
      id: 2,
      username: "rootadmin",
      displayName: "平台管理员",
    };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const wrapper = mountWorkbench();
    expect(wrapper.find('[data-testid="profile-role"]').text()).toBe(
      "平台管理员",
    );
    expect(
      wrapper.find('[data-testid="workbench-restricted-notice"]').exists(),
    ).toBe(false);
    await wrapper.find('[data-testid="app-card-cam"]').trigger("click");
    expect(openSpy).toHaveBeenCalledWith("/cam/", "_blank", "noopener");
  });
});

describe("工作台受限视图（零租户 E3）", () => {
  it("非 admin + 零租户：仅欢迎+我的信息，卡片禁用，tenant.none 提示", async () => {
    const userStore = useUserStore();
    userStore.isAdmin = false;
    userStore.tenants = [];
    (userStore as unknown as { profile: unknown }).profile = {
      id: 3,
      username: "lonely",
      displayName: "无租户用户",
    };
    // currentTenantId 经 tenant store 默认 0（零租户）
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const wrapper = mountWorkbench();
    // 静态内容仍渲染
    expect(wrapper.find('[data-testid="workbench"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("欢迎，无租户用户");
    expect(wrapper.find('[data-testid="profile-username"]').text()).toBe(
      "lonely",
    );
    // 所属租户字段显示 tenant.none 契约文案 + 受限标记
    const tenantField = wrapper.find('[data-testid="profile-tenant"]');
    expect(tenantField.text()).toBe("无所属租户");
    expect(tenantField.attributes("data-restricted")).toBe("true");
    // 角色派生为普通用户（零租户 → normal 档位）
    expect(wrapper.find('[data-testid="profile-role"]').text()).toBe(
      "普通用户",
    );
    // 卡片禁用
    const card = wrapper.find('[data-testid="app-card-cam"]');
    expect(card.attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-testid="workbench-apps"]').classes()).toContain(
      "is-disabled",
    );
    // tenant.notice 提示渲染（契约逐字文案）
    expect(
      wrapper.find('[data-testid="workbench-restricted-notice"]').text(),
    ).toBe("无所属租户");
    // 点击不触发跳转
    await card.trigger("click");
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe("工作台 eiam 不可用（E12）", () => {
  it("error 置位：顶部降级提示渲染 + 静态内容仍渲染 + 卡片禁用", async () => {
    const userStore = useUserStore();
    const tenantStore = useTenantStore();
    userStore.isAdmin = false;
    userStore.tenants = [{ id: 10, name: "Acme", code: "acme", domain: "" }];
    tenantStore.setCurrentTenantId(10);
    (userStore as unknown as { profile: unknown }).profile = {
      id: 1,
      username: "alice",
      displayName: "爱丽丝",
    };
    // 模拟 eiam 不可用：profile 已加载但 error 置位（陈旧 profile 仍可渲染静态内容）
    (userStore as unknown as { error: string | null }).error =
      "身份服务暂不可用，请稍后重试";
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const wrapper = mountWorkbench();
    // 顶部降级提示（eiam.unavailable 契约文案逐字）
    expect(wrapper.find('[data-testid="workbench-degradation"]').text()).toBe(
      "身份服务暂不可用，请稍后重试",
    );
    // 静态内容仍渲染（欢迎 + 我的信息四字段）
    expect(wrapper.text()).toContain("欢迎，爱丽丝");
    expect(wrapper.find('[data-testid="profile-username"]').text()).toBe(
      "alice",
    );
    // 卡片禁用，点击不跳转
    const card = wrapper.find('[data-testid="app-card-cam"]');
    expect(card.attributes("disabled")).toBeDefined();
    await card.trigger("click");
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe("工作台卡片网格断点（结构断言）", () => {
  it("卡片网格容器存在 + 默认 2 列 CSS（断点行为由 E2E 承接）", () => {
    seedDefaultState();
    const wrapper = mountWorkbench();
    const grid = wrapper.find(".workbench-app-cards");
    expect(grid.exists()).toBe(true);
    // happy-dom 不解析 CSS 布局，仅断言结构 + 穷举项数；
    // 2 列/3 列 media query 断点行为由 Playwright E2E 承接（tech-design §Testing）。
    expect(grid.findAll(".workbench-app-card-wrap")).toHaveLength(1);
  });
});
