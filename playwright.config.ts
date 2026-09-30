import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright 配置（任务 2.12，M1 E2E）。
 *
 * Hard Rule（任务 2.12 + tech-design §Testing）：验收宿主必为 nginx 同域形态
 * （:8888/console，任务 2.10 haven-console.conf），禁止以独立端口 vite dev server
 * 判定通过。本配置 baseURL 指向 nginx 同域入口；webServer 不启动 dev server——
 * 验收依赖 nginx 已在运行并托管 haven-console/dist（生产构建产物）。
 *
 * 浏览器矩阵仅 chromium（tech-design §Testing：与内网统一浏览器一致）。
 *
 * 证据形态（acceptance.md §0.2）：Playwright 用例链接 e2e/*.spec.ts::test，
 * 逐条回填 acceptance.md M1 行。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 登录场景共享 eiam 会话/锁定计数，串行避免互相污染
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:8888',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
