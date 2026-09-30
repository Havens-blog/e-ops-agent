<script setup lang="ts">
// 应用切换器（task 3.1，tech-design §Integration Specs 2 SSO / 应用切换）。
// 新标签打开 e-cam-web（共享 cookie 免重复登录）。
//
// v1 仅「云管」一项，**穷举本地枚举**（APPS const 逐条登记；后续应用增列在此扩展）。
//
// 零租户受限态（!isAdmin && tenants.length===0）隐藏（UF-2 受限视图）；
// 平台管理员零租户豁免（isAdmin → 仍可切换应用）。
import { computed } from "vue";
import { ArrowDown } from "@element-plus/icons-vue";
import { useUserStore } from "@/stores/user";

interface AppEntry {
  /** 唯一 key（穷举枚举标识） */
  key: string;
  /** 展示文案 */
  label: string;
  /** 打开 URL（build 期 env 注入，默认 /cam/ —— nginx 同域 e-cam-web 入口） */
  url: string;
}

/**
 * v1 穷举本地枚举：仅「云管」（e-cam-web）。
 * 后续应用增列在此常量逐条登记；tech-design §Integration Specs 2「控制台与 e-cam-web
 * 同登录域共享 cookie；应用切换器新标签打开 e-cam-web（共享会话，不重复登录）」。
 */
const APPS: readonly AppEntry[] = [
  {
    key: "cam",
    label: "云管",
    url: import.meta.env.VITE_APP_CAM_BASE ?? "/cam/",
  },
];

const userStore = useUserStore();

/** 零租户受限态（与 AppHeader UF-2 受限视图同口径）：非 admin 且无租户 → 隐藏 */
const isRestricted = computed(
  () => !userStore.isAdmin && userStore.tenants.length === 0,
);

function onOpen(command: AppEntry): void {
  // 新标签打开；共享 cookie 免重复登录（Integration 2 SSO）
  // noopener 防新标签操作旧页面（target=_blank 反劫持）
  window.open(command.url, "_blank", "noopener");
}
</script>

<template>
  <div v-if="!isRestricted" class="app-switcher">
    <el-dropdown trigger="click" placement="bottom-end" @command="onOpen">
      <button
        type="button"
        class="app-switcher-trigger"
        aria-label="应用切换"
        aria-haspopup="menu"
      >
        <span class="app-switcher-label">应用切换</span>
        <el-icon :size="12" aria-hidden="true">
          <ArrowDown />
        </el-icon>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-for="app in APPS" :key="app.key" :command="app">
            {{ app.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped lang="scss">
.app-switcher {
  display: inline-flex;
  align-items: center;
}

.app-switcher-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: transparent;
  color: var(--text-regular);
  font-size: 13px;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.app-switcher-trigger:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.app-switcher-trigger:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 1px;
}
</style>
