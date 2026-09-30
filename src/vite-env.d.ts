/// <reference types="vite/client" />

/**
 * 控制台 build 期 env 注入变量（task 3.1）。
 * 与 e-cam-web RC#2 拆变量同款语义：build 期 env 注入，不散落硬编码。
 */
interface ImportMetaEnv {
  /**
   * e-cam-web 站点基址（应用切换器新标签打开目标）。
   * 默认 /cam/ —— nginx 同域反代形态下 e-cam-web 入口（tech-design §Architecture 拓扑）。
   */
  readonly VITE_APP_CAM_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * E2E 调试钩子（localhost 限定，main.ts 挂载；非 localhost 零暴露）。
 * 任务 3.4 S-M2-06 写前守卫负向场景在真实浏览器中调用 enforceWriteGuard 验证。
 */
interface HcDebugHooks {
  enforceWriteGuard: () => boolean;
  getPageEnterTenantSnapshot: () => number;
  __resetPageEnterTenantSnapshot: () => void;
  fetchProfile: () => Promise<boolean>;
  currentTenantId: () => number;
}

interface Window {
  __hcDebug?: HcDebugHooks;
}
