import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { useThemeStore } from './stores/theme'

// 主题令牌（Linear 靛紫，深色默认 + 浅色双主题；拷贝自 e-cam-web 同名文件，
// sha256 × 源 commit 登记于 shared-hashes.json，CI 漂移对比由 2.11 承接）
import './assets/styles/theme-variables.scss'
import './assets/styles/element-theme.scss'

// 装配：Vue / Router / Pinia 三件基础设施 + 主题恢复。
// 数据流单向闭环 view → stores → api/eiamAxios 自 2.4（请求层）/ 2.6（守卫）/
// 2.7（全局 stores）起逐层接入。
const app = createApp(App)

const pinia = createPinia()
// persistedstate 全局挂载：仅 theme store 声明 persist（key hc_theme），
// 其余任何 store 不得声明 persist（tech-design Architecture 持久化口径）
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)

// 挂载前实例化 theme store：persist 水合 + html.light 应用先行，避免主题闪烁
useThemeStore()

app.mount('#app')
