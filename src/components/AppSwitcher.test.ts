// @vitest-environment happy-dom
/**
 * AppSwitcher 应用切换器单测（task 3.1）。
 *
 * 覆盖 AC：
 * - v1 仅「云管」一项，穷举本地枚举（APPS const）
 * - 新标签打开 e-cam-web（window.open，noopener，共享 cookie SSO）
 * - 零租户受限态（!isAdmin && tenants.length===0）隐藏；平台管理员豁免可见
 */
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import AppSwitcher from "./AppSwitcher.vue";
import { useUserStore } from "@/stores/user";

// ElDropdown stub：捕获 command 事件 + 渲染 trigger + 内联渲染 #dropdown slot（便于断言枚举项）
const ElDropdownStub = defineComponent({
  name: "ElDropdown",
  emits: ["command"],
  setup(_, { slots, emit }) {
    return () =>
      h("div", { class: "el-dropdown-stub" }, [
        h("button", {
          class: "stub-trigger",
          onClick: () => emit("command", slots.default?.()),
        }),
        h("div", { class: "stub-menu" }, slots.dropdown?.()),
      ]);
  },
});

const ElDropdownMenuStub = defineComponent({
  name: "ElDropdownMenu",
  setup:
    (_, { slots }) =>
    () =>
      h("div", { class: "stub-menu" }, slots.default?.()),
});

const ElDropdownItemStub = defineComponent({
  name: "ElDropdownItem",
  props: { command: { type: [Object, String, Number], default: null } },
  setup:
    (_, { slots }) =>
    () =>
      h("div", { class: "stub-item" }, slots.default?.()),
});

// ElIcon stub（避免 @element-plus/icons-vue 渲染开销）
const ElIconStub = defineComponent({
  name: "ElIcon",
  setup:
    (_, { slots }) =>
    () =>
      h("span", { class: "stub-icon" }, slots.default?.()),
});

const freshPinia = () => {
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  createApp({ render: () => null }).use(pinia);
  setActivePinia(pinia);
  return pinia;
};

function mountSwitcher() {
  return mount(AppSwitcher, {
    global: {
      stubs: {
        ElDropdown: ElDropdownStub,
        ElDropdownMenu: ElDropdownMenuStub,
        ElDropdownItem: ElDropdownItemStub,
        ElIcon: ElIconStub,
      },
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  freshPinia();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppSwitcher 零租户受限态门控（UF-2 受限视图）", () => {
  it("非 admin + 无租户 → 隐藏（不渲染）", () => {
    const userStore = useUserStore();
    userStore.isAdmin = false;
    (userStore as unknown as { tenants: unknown[] }).tenants = [];
    const wrapper = mountSwitcher();
    expect(wrapper.find(".app-switcher").exists()).toBe(false);
  });

  it("平台管理员（零租户豁免）→ 可见", () => {
    const userStore = useUserStore();
    userStore.isAdmin = true;
    (userStore as unknown as { tenants: unknown[] }).tenants = [];
    const wrapper = mountSwitcher();
    expect(wrapper.find(".app-switcher").exists()).toBe(true);
  });

  it("非 admin + 有租户 → 可见", () => {
    const userStore = useUserStore();
    userStore.isAdmin = false;
    (userStore as unknown as { tenants: unknown[] }).tenants = [
      { id: 1, name: "t", code: "", domain: "" },
    ];
    const wrapper = mountSwitcher();
    expect(wrapper.find(".app-switcher").exists()).toBe(true);
  });
});

describe("AppSwitcher 穷举本地枚举 + 新标签打开", () => {
  it("v1 渲染「云管」一项（穷举本地枚举）", () => {
    const userStore = useUserStore();
    userStore.isAdmin = true;
    (userStore as unknown as { tenants: unknown[] }).tenants = [];
    const wrapper = mountSwitcher();
    expect(wrapper.findAll(".stub-item")).toHaveLength(1);
    expect(wrapper.text()).toContain("云管");
  });

  it("trigger 点击 → window.open(e-cam-web base, _blank, noopener) SSO 共享 cookie", async () => {
    const userStore = useUserStore();
    userStore.isAdmin = true;
    (userStore as unknown as { tenants: unknown[] }).tenants = [];
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    const wrapper = mountSwitcher();
    // el-dropdown command 经 stub trigger 点击派发——直接模拟 el-dropdown 派 command
    // stub trigger onClick emit('command', slots.default?.()) → command = undefined（slot vnode）
    // 故改为直接触发组件内 onOpen：通过 findComponent(ElDropdown).vm.$emit('command', app)
    const dropdown = wrapper.findComponent(ElDropdownStub);
    // 构造一个 AppEntry 等价载荷（与组件 APPS[0] 同形）
    const appEntry = { key: "cam", label: "云管", url: "/cam/" };
    dropdown.vm.$emit("command", appEntry);
    await Promise.resolve();
    expect(openSpy).toHaveBeenCalledWith("/cam/", "_blank", "noopener");
  });
});
