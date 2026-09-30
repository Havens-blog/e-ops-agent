import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

// 骨架装配：仅接线 Vue / Router / Pinia 三件基础设施，不含任何业务实现。
// 数据流单向闭环 view → stores → api/eiamAxios 自 2.4（请求层）/ 2.6（守卫）/
// 2.7（全局 stores）起逐层接入；主题样式（theme-variables / element-theme）
// 由 2.2 主题令牌任务从 e-cam-web 拷贝接入。
createApp(App).use(createPinia()).use(router).mount('#app')
